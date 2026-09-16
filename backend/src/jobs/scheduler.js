// Cron scheduler kicked off by server startup. Registers every recurring
// background job we want the app process itself to own (no external cron).
//
// Add a job here by:
//   1. importing its runner
//   2. reading its env-driven schedule + enabled flag
//   3. cron.schedule(...) with a wrapper that catches errors so one failing
//      run never crashes the server process
//
// Timezone: honors BACKUP_TZ (default 'Asia/Kolkata') so "midnight" means
// the user's local midnight, not the server's UTC one.

const cron = require('node-cron');
const { runBackup } = require('./backupToS3');
const { log, error: logError } = require('./backupLogger');

const DEFAULT_BACKUP_CRON = '0 0 * * *'; // every day at 00:00
const DEFAULT_TZ = 'Asia/Kolkata';

let backupRunning = false;

// Kick off a backup only if the previous one is still running — protects
// against a slow dump getting run twice on top of itself if the schedule
// fires while an earlier run hasn't finished.
const startBackup = async () => {
  if (backupRunning) {
    log('previous run still in progress — skipping this tick');
    return;
  }
  backupRunning = true;
  try {
    await runBackup();
  } catch (err) {
    logError('FAILED:', err && err.stack ? err.stack : err);
  } finally {
    backupRunning = false;
  }
};

// server.js's hand-rolled .env parser preserves surrounding quotes, so
// `S3_BACKUP_CRON="25 1 * * *"` arrives as the literal string with the
// double-quotes still on it. Trim them before handing to node-cron.
const stripQuotes = (v) => (v || '').replace(/^["']|["']$/g, '').trim();

const startScheduler = () => {
  const enabled = stripQuotes(process.env.S3_BACKUP_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) {
    log('S3 backup disabled via S3_BACKUP_ENABLED=false');
    return;
  }
  const expression = stripQuotes(process.env.S3_BACKUP_CRON) || DEFAULT_BACKUP_CRON;
  const timezone = stripQuotes(process.env.BACKUP_TZ) || DEFAULT_TZ;

  if (!cron.validate(expression)) {
    logError(`invalid S3_BACKUP_CRON="${expression}" — backup NOT scheduled`);
    return;
  }
  cron.schedule(expression, startBackup, { timezone });
  log(`S3 backup scheduled: "${expression}" (${timezone})`);
};

module.exports = { startScheduler, runBackupNow: startBackup };
