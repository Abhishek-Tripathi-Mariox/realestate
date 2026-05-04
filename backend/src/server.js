const path = require('path');
const fs = require('fs');

// Load backend .env manually so a process-supervisor PORT can't override it.
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length) {
    envVars[key.trim()] = valueParts.join('=').trim();
  }
});
Object.keys(envVars).forEach(key => {
  process.env[key] = envVars[key];
});

const app = require('./app');
const { connectDB } = require('./config/database');
const { initializeDatabase } = require('./initDb');

const PORT = envVars.PORT || envVars.BACKEND_PORT || process.env.BACKEND_PORT || 8001;

const startServer = async () => {
  try {
    await connectDB();
    await initializeDatabase();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Backend server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
