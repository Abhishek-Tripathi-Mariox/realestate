const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
  if (isConnected) {
    return mongoose.connection.db;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGO_URL, {
      dbName: process.env.DB_NAME || 'realestate_mgmt'
    });
    
    isConnected = true;
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn.connection.db;
  } catch (error) {
    console.error('Database connection error:', error.message);
    process.exit(1);
  }
};

const getDB = () => mongoose.connection.db;

module.exports = { connectDB, getDB, mongoose };
