// Backup logger — writes every message to both the console (so it shows up
// in the running nodemon / pm2 output) AND to a daily rotating log file at
// backend/backups/logs/backup-YYYY-MM-DD.log so failures survive a restart
// and are easy to find by date.
//
// Rotation is by calendar day of the log write itself — no file-size caps,
// no compression. One tiny file per day is more than enough for a single
// nightly job. Failed writes are swallowed (with a console warning) so a
// missing / non-writable log dir never breaks the backup.

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.resolve(__dirname, '..', '..', 'backups', 'logs');

const today = () => new Date().toISOString().split('T')[0]; // YYYY-MM-DD
const logFilePath = () => path.join(LOG_DIR, `backup-${today()}.log`);

let dirReady = false;
const ensureDir = () => {
  if (dirReady) return;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    dirReady = true;
  } catch (err) {
    console.warn('[backup-logger] cannot create log dir:', err.message);
  }
};

const write = (level, args) => {
  const stamp = new Date().toISOString();
  const line = `[${stamp}] [${level}] ${args.map(String).join(' ')}\n`;
  ensureDir();
  try {
    fs.appendFileSync(logFilePath(), line);
  } catch (err) {
    // Only warn once per process — a persistently unwritable log dir would
    // otherwise flood the console with the same message.
    if (!write._warned) {
      console.warn('[backup-logger] append failed:', err.message);
      write._warned = true;
    }
  }
};

const log = (...args) => {
  console.log('[backup]', ...args);
  write('INFO', args);
};

const error = (...args) => {
  console.error('[backup]', ...args);
  write('ERROR', args);
};

module.exports = { log, error, logFilePath };
