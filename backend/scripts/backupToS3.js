#!/usr/bin/env node
// Manual trigger for the S3 backup job. Useful for testing the setup
// without waiting for the daily cron.
//
//   node scripts/backupToS3.js

const path = require('path');
const fs = require('fs');

// Load .env the same way server.js does — the app doesn't use dotenv, so
// mirror that behavior instead of introducing a new dependency here.
// Strips surrounding quotes so a value like S3_BACKUP_PREFIX="x-" arrives
// as `x-`, not the literal `"x-"` that breaks downstream paths.
const cleanEnvValue = (raw) => {
  let v = (raw || '').trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v;
};
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [key, ...rest] = line.split('=');
    if (key && rest.length) {
      process.env[key.trim()] = cleanEnvValue(rest.join('='));
    }
  });
}

const { runBackup } = require('../src/jobs/backupToS3');

(async () => {
  try {
    await runBackup();
    process.exit(0);
  } catch (err) {
    console.error('BACKUP FAILED:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
})();
