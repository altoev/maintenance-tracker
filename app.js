const express = require('express');
const mongoose = require('mongoose');
const cron = require('node-cron');
const {
  getAuthUrl,
  exchangeCode,
  getVehicles,
  getVehicleInfo,
  getVehicleOdometer,
} = require('./services/smartcar');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');

// MongoDB Connection
mongoose.connect(process.env.MONGO_DB_URI)
  .then(() => console.log('MongoDB connected successfully!'))
  .catch(err => console.error('MongoDB connection error:', err));

// Vehicle Schema
const vehicleSchema = new mongoose.Schema({
  vehicleId: { type: String, required: true, unique: true },
  make: String,
  model: String,
  year: Number,
  vin: String,
  mileage: Number,
  lastUpdated: { type: Date, default: Date.now },
});

const Vehicle = mongoose.model('Vehicle', vehicleSchema);

// OAuth Login
app.get('/login', async (req, res) => res.redirect(await getAuthUrl()));

// OAuth Callback
app.get('/callback', async (req, res) => {
  try {
    const accessToken = await exchangeCode(req.query.code);
    const vehicleIds = await getVehicles(accessToken);

    for (const id of vehicleIds) {
      const info = await getVehicleInfo(id);
      const mileage = await getVehicleOdometer(id);

      await Vehicle.findOneAndUpdate(
        { vehicleId: id },
        {
          vehicleId: id,
          make: info.make,
          model: info.model,
          year: info.year,
          vin: info.vin || 'N/A',
          mileage: mileage,
          lastUpdated: new Date(),
        },
        { upsert: true, new: true }
      );
    }
    res.send('Vehicles and mileage updated successfully!');
  } catch (error) {
    console.error('Error during callback:', error.message);
    res.status(500).send('Failed to fetch and save vehicles.');
  }
});

// Refresh Vehicles Every 12 Hours
cron.schedule('0 */12 * * *', async () => {
  console.log('Running scheduled vehicle update...');
  try {
    const vehicles = await Vehicle.find();
    for (const vehicle of vehicles) {
      const mileage = await getVehicleOdometer(vehicle.vehicleId);
      const info = await getVehicleInfo(vehicle.vehicleId);

      await Vehicle.findOneAndUpdate(
        { vehicleId: vehicle.vehicleId },
        {
          mileage: mileage,
          vin: info.vin || 'N/A',
          lastUpdated: new Date(),
        },
        { new: true }
      );
      console.log(`Updated vehicle ${vehicle.vehicleId}`);
    }
  } catch (error) {
    console.error('Error during scheduled update:', error.message);
  }
});

// View All Vehicles
app.get('/vehicles', async (req, res) => {
  try {
    const vehicles = await Vehicle.find();
    res.render('vehicles', { vehicles });
  } catch (error) {
    res.status(500).send('Failed to load vehicles.');
  }
});

// Vehicle Details
app.get('/vehicles/:id', async (req, res) => {
  const vehicle = await Vehicle.findOne({ vehicleId: req.params.id });
  if (!vehicle) return res.status(404).send('Vehicle not found.');

  const timeAgo = Math.round((Date.now() - vehicle.lastUpdated) / 60000);
  res.render('vehicleDetails', {
    vehicle,
    timeAgo: timeAgo > 0 ? `${timeAgo} minutes ago` : 'just now',
  });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
