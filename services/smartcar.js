const smartcar = require('smartcar');
require('dotenv').config();

let accessToken = null;

const client = new smartcar.AuthClient({
  clientId: process.env.SMARTCAR_CLIENT_ID,
  clientSecret: process.env.SMARTCAR_CLIENT_SECRET,
  redirectUri: process.env.SMARTCAR_REDIRECT_URI,
});

async function getAuthUrl() {
  return client.getAuthUrl(['read_vehicle_info', 'read_odometer']);
}

async function exchangeCode(code) {
  const response = await client.exchangeCode(code);
  accessToken = response.accessToken;
  console.log('Access token acquired:', accessToken);
  return accessToken;
}

async function getVehicles() {
  if (!accessToken) throw new Error('Access token is not set.');
  const response = await smartcar.getVehicles(accessToken);
  console.log('Fetched Vehicle IDs:', response.vehicles);
  return response.vehicles;
}

async function getVehicleInfo(vehicleId) {
  const vehicle = new smartcar.Vehicle(vehicleId, accessToken);
  const attributes = await vehicle.attributes();
  console.log(`Vehicle ${vehicleId} attributes:`, attributes);
  return attributes;
}

async function getVehicleOdometer(vehicleId) {
  try {
    const vehicle = new smartcar.Vehicle(vehicleId, accessToken);
    const odometer = await vehicle.odometer();
    const kilometers = odometer?.distance || 0;
    const miles = (kilometers * 0.621371).toFixed(2);
    return parseFloat(miles);
  } catch (error) {
    console.warn(`Odometer unavailable for vehicle ${vehicleId}:`, error.message);
    return null;
  }
}

module.exports = {
  getAuthUrl,
  exchangeCode,
  getVehicles,
  getVehicleInfo,
  getVehicleOdometer,
};
