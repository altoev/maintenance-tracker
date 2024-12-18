const express = require('express');
const mongoose = require('mongoose');
const { getAuthUrl, exchangeCode, getVehicles, getVehicleInfo, getVehicleOdometer } = require('./services/smartcar');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true })); // Parse form data
app.set('view engine', 'ejs'); // Use EJS for templating

// MongoDB Connection
mongoose.connect(process.env.MONGO_DB_URI)
  .then(() => console.log('MongoDB connected successfully!'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Vehicle Schema
const vehicleSchema = new mongoose.Schema({
  vehicleId: { type: String, required: true, unique: true },
  make: String,
  model: String,
  year: Number,
  vin: String,
  mileage: Number,
  lastUpdated: { type: Date, default: Date.now },
  maintenanceRecords: [
    {
      _id: mongoose.Schema.Types.ObjectId,
      date: { type: Date, required: true },
      mileage: { type: Number, required: true },
      type: { type: [String], required: true },
      shop: { type: String, required: true },
    },
  ],
});

const Vehicle = mongoose.model('Vehicle', vehicleSchema);

// OAuth Login Route
app.get('/login', async (req, res) => {
  res.redirect(await getAuthUrl());
});

// OAuth Callback Route - Save Vehicle Data
app.get('/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) return res.status(400).send('Missing authorization code.');

  try {
    const accessToken = await exchangeCode(code);
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

    console.log('Vehicles and mileage updated successfully!');
    res.redirect('/vehicles');
  } catch (error) {
    console.error('Error during callback:', error.message);
    res.status(500).send('Failed to fetch and save vehicles.');
  }
});

// Display All Vehicles
app.get('/vehicles', async (req, res) => {
  try {
    const vehicles = await Vehicle.find();
    res.render('vehicles', { vehicles });
  } catch (error) {
    console.error('Error fetching vehicles:', error.message);
    res.status(500).send('Failed to load vehicles.');
  }
});

// Display Vehicle Details
app.get('/vehicles/:id', async (req, res) => {
  try {
    const vehicle = await Vehicle.findOne({ vehicleId: req.params.id });
    if (!vehicle) return res.status(404).send('Vehicle not found.');

    res.render('vehicleDetails', { vehicle });
  } catch (error) {
    console.error('Error fetching vehicle details:', error.message);
    res.status(500).send('Failed to fetch vehicle details.');
  }
});

// Save Maintenance Record
app.post('/vehicles/:id/maintenance', async (req, res) => {
  const { date, mileage, type, shop } = req.body;

  try {
    const vehicle = await Vehicle.findOne({ vehicleId: req.params.id });
    if (!vehicle) return res.status(404).send('Vehicle not found.');

    const maintenanceTypes = Array.isArray(type) ? type : [type];
    const newRecord = {
      _id: new mongoose.Types.ObjectId(),
      date: new Date(date),
      mileage: parseInt(mileage),
      type: maintenanceTypes,
      shop,
    };

    vehicle.maintenanceRecords.push(newRecord);
    await vehicle.save();

    console.log('Maintenance record added:', newRecord);
    res.redirect(`/vehicles/${req.params.id}`);
  } catch (error) {
    console.error('Error saving maintenance record:', error.message);
    res.status(500).send('Failed to save maintenance record.');
  }
});

// Edit Maintenance Record
app.post('/vehicles/:id/maintenance/:recordId/edit', async (req, res) => {
  const { date, mileage, type, shop } = req.body;

  try {
    const maintenanceTypes = Array.isArray(type) ? type : [type];

    await Vehicle.updateOne(
      { vehicleId: req.params.id, 'maintenanceRecords._id': req.params.recordId },
      {
        $set: {
          'maintenanceRecords.$.date': new Date(date),
          'maintenanceRecords.$.mileage': parseInt(mileage),
          'maintenanceRecords.$.type': maintenanceTypes,
          'maintenanceRecords.$.shop': shop,
        },
      }
    );

    console.log(`Maintenance record updated for vehicle ${req.params.id}`);
    res.redirect(`/vehicles/${req.params.id}`);
  } catch (error) {
    console.error('Error editing maintenance record:', error.message);
    res.status(500).send('Failed to edit maintenance record.');
  }
});

// Delete Maintenance Record
app.post('/vehicles/:id/maintenance/:recordId/delete', async (req, res) => {
  try {
    await Vehicle.updateOne(
      { vehicleId: req.params.id },
      { $pull: { maintenanceRecords: { _id: req.params.recordId } } }
    );

    console.log(`Maintenance record deleted for vehicle ${req.params.id}`);
    res.redirect(`/vehicles/${req.params.id}`);
  } catch (error) {
    console.error('Error deleting maintenance record:', error.message);
    res.status(500).send('Failed to delete maintenance record.');
  }
});

// Start Server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
