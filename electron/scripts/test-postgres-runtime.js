/**
 * test-postgres-runtime.js
 *
 * Verifies that the bundled PostgreSQL binaries exist and are fully functional:
 *   1. Check bundled binaries exist
 *   2. Run postgres.exe --version
 *   3. Run initdb against a temporary directory
 *   4. Start temporary PostgreSQL server on port 54325
 *   5. Connect using psql and run SELECT 1
 *   6. Shut down using pg_ctl
 *   7. Clean up the temporary directory
 *
 * Output: POSTGRES_RUNTIME_OK
 */

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const PG_BIN_DIR = path.join(PROJECT_ROOT, 'electron', 'runtime-build', 'postgresql', 'bin');
const TEMP_DATA_DIR = path.join(PROJECT_ROOT, 'electron', 'runtime-build', 'temp-postgres-test-data');
const TEST_PORT = 54325;
const TEST_USER = 'test_user';

console.log('--- PostgreSQL Runtime Verification ---');
console.log(`Binaries directory: ${PG_BIN_DIR}`);

// ── 1. Verify bundled binaries exist ───────────────────────────

const REQUIRED_BINARIES = [
  'postgres.exe',
  'initdb.exe',
  'pg_ctl.exe',
  'createdb.exe',
  'pg_dump.exe',
  'psql.exe',
  'pg_isready.exe',
];

for (const binary of REQUIRED_BINARIES) {
  const binaryPath = path.join(PG_BIN_DIR, binary);
  if (!fs.existsSync(binaryPath)) {
    console.error(`CRITICAL ERROR: Required binary '${binary}' is missing at: ${binaryPath}`);
    console.error('Please run "npm run package:postgres" first.');
    process.exit(1);
  }
}
console.log('All required binaries present.');

// ── 2. Run postgres --version ──────────────────────────────────

const postgresExe = path.join(PG_BIN_DIR, 'postgres.exe');
const versionResult = spawnSync(postgresExe, ['--version'], { encoding: 'utf8', windowsHide: true });
if (versionResult.status !== 0) {
  console.error('Failed to run postgres --version:', versionResult.stderr);
  process.exit(1);
}
console.log(`Version check: ${versionResult.stdout.trim()}`);

// ── 3. Run initdb ──────────────────────────────────────────────

if (fs.existsSync(TEMP_DATA_DIR)) {
  fs.rmSync(TEMP_DATA_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TEMP_DATA_DIR, { recursive: true });

console.log(`Initializing temporary database at: ${TEMP_DATA_DIR}...`);
const initdbExe = path.join(PG_BIN_DIR, 'initdb.exe');
const initResult = spawnSync(initdbExe, [
  '-D', TEMP_DATA_DIR,
  '-U', TEST_USER,
  '-A', 'trust', // passwordless for local test
  '-E', 'UTF8',
  '--locale=C'
], {
  encoding: 'utf8',
  windowsHide: true,
  timeout: 30000,
});

if (initResult.status !== 0) {
  console.error('initdb failed!');
  console.error(initResult.stderr || initResult.stdout);
  cleanupAndExit(1);
}
console.log('initdb completed.');

// Configure postgresql.conf to listen on localhost only
const confPath = path.join(TEMP_DATA_DIR, 'postgresql.conf');
if (fs.existsSync(confPath)) {
  let conf = fs.readFileSync(confPath, 'utf8');
  conf += "\nlisten_addresses = '127.0.0.1'\n";
  fs.writeFileSync(confPath, conf, 'utf8');
}

// ── 4. Start temporary PostgreSQL server ───────────────────────

console.log(`Starting temporary server on port ${TEST_PORT}...`);
const pgProcess = spawn(postgresExe, [
  '-D', TEMP_DATA_DIR,
  '-p', String(TEST_PORT),
  '-h', '127.0.0.1',
], {
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

let startupLogs = '';
pgProcess.stdout.on('data', (d) => { startupLogs += d.toString(); });
pgProcess.stderr.on('data', (d) => { startupLogs += d.toString(); });

// Wait for pg_isready to report connection accepted
console.log('Waiting for database to accept connections...');
const pgIsReady = path.join(PG_BIN_DIR, 'pg_isready.exe');
let isHealthy = false;
const maxAttempts = 30;
const delayMs = 500;

function pollReady(attempt = 1) {
  if (attempt > maxAttempts) {
    console.error('Timed out waiting for PostgreSQL to start.');
    console.error('Startup logs:\n', startupLogs);
    shutdownAndExit(1);
    return;
  }

  const readyResult = spawnSync(pgIsReady, [
    '-h', '127.0.0.1',
    '-p', String(TEST_PORT),
    '-U', TEST_USER,
  ], { windowsHide: true, timeout: 2000 });

  if (readyResult.status === 0) {
    console.log('PostgreSQL is healthy and accepting connections.');
    runPsqlCheck();
  } else {
    setTimeout(() => pollReady(attempt + 1), delayMs);
  }
}

// Start polling
setTimeout(() => pollReady(), delayMs);

// ── 5. Connect using psql and run query ────────────────────────

function runPsqlCheck() {
  console.log('Running connection test using psql...');
  const psqlExe = path.join(PG_BIN_DIR, 'psql.exe');
  
  const queryResult = spawnSync(psqlExe, [
    '-h', '127.0.0.1',
    '-p', String(TEST_PORT),
    '-U', TEST_USER,
    '-d', 'postgres',
    '-c', 'SELECT 1 AS ok;',
  ], { encoding: 'utf8', windowsHide: true, timeout: 10000 });

  if (queryResult.status !== 0) {
    console.error('psql connection check failed!');
    console.error(queryResult.stderr || queryResult.stdout);
    shutdownAndExit(1);
    return;
  }

  console.log('psql query output:\n', queryResult.stdout.trim());
  console.log('Connection test successful.');
  shutdownAndExit(0);
}

// ── 6. Shutdown and clean up ───────────────────────────────────

function shutdownAndExit(exitCode) {
  console.log('Stopping temporary PostgreSQL server...');
  const pgCtl = path.join(PG_BIN_DIR, 'pg_ctl.exe');
  
  const stopResult = spawnSync(pgCtl, [
    'stop',
    '-D', TEMP_DATA_DIR,
    '-m', 'fast',
    '-w',
  ], { encoding: 'utf8', windowsHide: true, timeout: 15000 });

  if (stopResult.status !== 0) {
    console.warn(`WARNING: pg_ctl stop returned code ${stopResult.status}. Killing process...`);
    try {
      pgProcess.kill('SIGKILL');
    } catch (e) {
      console.error('Failed to kill postgres process:', e.message);
    }
  } else {
    console.log('Server stopped successfully.');
  }

  cleanupAndExit(exitCode);
}

function cleanupAndExit(exitCode) {
  console.log('Cleaning up temporary directory...');
  try {
    if (fs.existsSync(TEMP_DATA_DIR)) {
      fs.rmSync(TEMP_DATA_DIR, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(`WARNING: Failed to remove temporary directory: ${err.message}`);
  }

  if (exitCode === 0) {
    console.log('\nPOSTGRES_RUNTIME_OK');
  } else {
    console.error('\nPOSTGRES_RUNTIME_FAILED');
  }
  process.exit(exitCode);
}
