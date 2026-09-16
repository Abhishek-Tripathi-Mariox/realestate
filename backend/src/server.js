const path = require('path');
const fs = require('fs');

// Load backend .env manually so a process-supervisor PORT can't override it.
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const envVars = {};
// Strip surrounding "double" or 'single' quotes and any trailing comment.
// Matches what dotenv itself does, so a value like `S3_BACKUP_PREFIX="x-"`
// arrives as `x-`, not the literal `"x-"` that breaks downstream paths.
const cleanEnvValue = (raw) => {
  let v = (raw || '').trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v;
};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length) {
    envVars[key.trim()] = cleanEnvValue(valueParts.join('='));
  }
});
Object.keys(envVars).forEach(key => {
  process.env[key] = envVars[key];
});

const app = require('./app');
const { connectDB } = require('./config/database');
const { initializeDatabase } = require('./initDb');
const { startScheduler } = require('./jobs/scheduler');

const PORT = envVars.PORT || envVars.BACKEND_PORT || process.env.BACKEND_PORT || 8001;

const startServer = async () => {
  try {
    await connectDB();
    await initializeDatabase();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Backend server running on port ${PORT}`);
    });

    // Register recurring background jobs (S3 backup, etc.) after the HTTP
    // listener binds so a scheduler config error can't stop the API from
    // coming up.
    startScheduler();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
