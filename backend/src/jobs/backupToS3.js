// Daily MongoDB → S3 backup.
//
// One backup lives in the bucket at any time:
//   1. mongodump the DB into a temp dir
//   2. tar+gzip that dir into a single .tar.gz file
//   3. list existing backup objects in the bucket (prefix match)
//   4. multipart upload the new tarball with today's timestamped key
//   5. ONLY on upload success, delete every backup object EXCEPT today's
//
// Step 5 is deliberately last — if any prior step fails, the previous
// backup stays intact and the bucket is never left without a valid dump.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  S3Client, ListObjectsV2Command, DeleteObjectsCommand,
} = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { log } = require('./backupLogger');

const BACKUP_PREFIX = process.env.S3_BACKUP_PREFIX || 'mongo-backup-';
const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const LOCAL_BACKUP_ROOT = path.resolve(BACKEND_DIR, 'backups');

const ts = () => new Date().toISOString().replace(/[:.]/g, '-');

// Read env each run (not at import time) so config changes on server restart
// are picked up without needing to touch this file.
const readConfig = () => ({
  mongoUrl: process.env.MONGO_URL || 'mongodb://localhost:27017',
  dbName: process.env.DB_NAME,
  bucket: (process.env.BUCKET || '').replace(/^["']|["']$/g, '').trim(),
  region: (process.env.REGION || '').replace(/^["']|["']$/g, '').trim(),
  accessKey: (process.env.ACCESSKEY || '').replace(/^["']|["']$/g, '').trim(),
  secretKey: (process.env.SECRETACCESSKEY || '').replace(/^["']|["']$/g, '').trim(),
});

// Spawn mongodump into a fresh temp dir. Uses --gzip so the resulting BSON
// files land already-compressed; the outer tar then just bundles them.
const runMongodump = (mongoUrl, dbName) => {
  const stamp = ts();
  const outDir = path.join(LOCAL_BACKUP_ROOT, `${BACKUP_PREFIX}${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });
  log('mongodump →', outDir);
  execFileSync(
    'mongodump',
    ['--uri', mongoUrl, '--db', dbName, '--out', outDir, '--gzip'],
    { stdio: 'inherit' }
  );
  return { outDir, stamp };
};

// tar+gzip the dump dir into a single archive. One file = one atomic upload
// and one atomic delete, which keeps the S3-side rotation simple.
const makeTarball = (dumpDir, stamp) => {
  const tarPath = path.join(LOCAL_BACKUP_ROOT, `${BACKUP_PREFIX}${stamp}.tar.gz`);
  log('tar →', tarPath);
  execFileSync(
    'tar',
    ['-czf', tarPath, '-C', path.dirname(dumpDir), path.basename(dumpDir)],
    { stdio: 'inherit' }
  );
  return tarPath;
};

const s3Client = ({ region, accessKey, secretKey }) => new S3Client({
  region,
  credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
});

// Multipart upload — handles large dumps without loading the whole file
// into memory.
const uploadToS3 = async (client, bucket, key, filePath) => {
  const body = fs.createReadStream(filePath);
  const uploader = new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'application/gzip',
    },
    queueSize: 4,
    partSize: 8 * 1024 * 1024,
  });
  uploader.on('httpUploadProgress', (p) => {
    if (p.total) log(`upload ${(100 * p.loaded / p.total).toFixed(1)}%`);
  });
  await uploader.done();
};

// Every existing tar.gz backup under the prefix, so we know what to prune
// after today's upload succeeds. Keys are returned as-is.
const listBackupObjects = async (client, bucket) => {
  const keys = [];
  let ContinuationToken;
  do {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: BACKUP_PREFIX,
      ContinuationToken,
    }));
    for (const obj of res.Contents || []) {
      if (obj.Key) keys.push(obj.Key);
    }
    ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return keys;
};

// DeleteObjects handles up to 1000 keys per call. We chunk defensively so
// even a runaway retention list clears in one job run.
const deleteBackupObjects = async (client, bucket, keys) => {
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    if (chunk.length === 0) continue;
    await client.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: chunk.map((k) => ({ Key: k })), Quiet: true },
    }));
    log(`deleted ${chunk.length} old backup object(s)`);
  }
};

// Wipe every temp artifact this run created so the disk doesn't fill up on
// repeated runs. Failures here are logged but don't fail the job — the S3
// backup is already safe at this point.
const cleanupLocal = (paths) => {
  for (const p of paths) {
    try {
      fs.rmSync(p, { recursive: true, force: true });
    } catch (err) {
      log(`cleanup warn ${p}:`, err.message);
    }
  }
};

const runBackup = async () => {
  const cfg = readConfig();
  if (!cfg.dbName) throw new Error('DB_NAME missing in env');
  if (!cfg.bucket) throw new Error('BUCKET missing in env');
  if (!cfg.region) throw new Error('REGION missing in env');
  if (!cfg.accessKey || !cfg.secretKey) throw new Error('ACCESSKEY / SECRETACCESSKEY missing in env');

  fs.mkdirSync(LOCAL_BACKUP_ROOT, { recursive: true });

  const started = Date.now();
  log('=== backup started ===');
  const { outDir, stamp } = runMongodump(cfg.mongoUrl, cfg.dbName);
  const tarPath = makeTarball(outDir, stamp);
  const key = `${BACKUP_PREFIX}${stamp}.tar.gz`;

  const client = s3Client(cfg);
  const existingKeys = await listBackupObjects(client, cfg.bucket);

  log(`upload → s3://${cfg.bucket}/${key}`);
  await uploadToS3(client, cfg.bucket, key, tarPath);
  log('upload done');

  // Delete every backup that isn't the one we just wrote. Guard against
  // the S3 list somehow having returned today's key too (in case of a
  // resumed run, or a clock-second collision).
  const toDelete = existingKeys.filter((k) => k !== key);
  if (toDelete.length === 0) {
    log('no older backup to delete');
  } else {
    log(`pruning ${toDelete.length} older backup object(s)`);
    await deleteBackupObjects(client, cfg.bucket, toDelete);
  }

  cleanupLocal([outDir, tarPath]);
  log(`=== backup finished in ${((Date.now() - started) / 1000).toFixed(1)}s ===`);
};

module.exports = { runBackup };
