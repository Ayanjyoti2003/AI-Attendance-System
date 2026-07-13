/**
 * test-app-db-modes.js
 *
 * Automated verification of the Electron database provider modes.
 *
 * For each mode (sqlite, local_postgres, external_postgres):
 *   1. Update data/config/app_config.json with the provider
 *   2. Delete existing electron.log
 *   3. Start Electron in simulation mode (AI_FORCE_RUNTIME=1)
 *   4. Wait a few seconds, then kill the processes
 *   5. Read electron.log and verify the PostgreSQL startup behavior
 */

process.env.AI_FORCE_RUNTIME = '1';

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

function getAppConfigPath() {
  const isForceRuntime = process.env.AI_FORCE_RUNTIME === "1";
  if (process.platform === "win32" && isForceRuntime) {
    const base = process.env.PROGRAMDATA || "C:\\ProgramData";
    return path.join(base, "AI Attendance System", "config", "app_config.json");
  }
  return path.join(PROJECT_ROOT, "data", "config", "app_config.json");
}

const CONFIG_PATH = getAppConfigPath();
const LOG_PATH = process.env.AI_FORCE_RUNTIME === "1"
  ? path.join(process.env.PROGRAMDATA || "C:\\ProgramData", "AI Attendance System", "logs", "electron.log")
  : path.join(PROJECT_ROOT, "data", "logs", "electron.log");

console.log('--- Database Provider Modes Verification ---');
console.log(`Config path: ${CONFIG_PATH}`);
console.log(`Log path: ${LOG_PATH}`);

// Default config to seed if none exists
const DEFAULT_CONFIG = {
  schema_version: 1,
  storage: { provider: "sqlite" },
  database: { host: "localhost", port: 5432, database: "attendance", username: "admin", password: "admin", ssl: false, path: "" },
  backup: { enabled: false, automatic: false, frequency: "daily", keep: 30, destination: "", backup_time: "02:00" },
  cameras: { poll_interval: 15 },
  recognition: { confidence_threshold: 0.6 },
  application: { theme: "dark", first_run_complete: true, setup_complete: true },
  updates: { auto_check: false, channel: "stable" }
};

// Ensure config directory exists and seed if needed
const configDir = path.dirname(CONFIG_PATH);
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}
if (!fs.existsSync(CONFIG_PATH)) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 4), 'utf8');
  console.log('Seeded default app_config.json.');
}

// Backup original config
let originalConfigContent = fs.readFileSync(CONFIG_PATH, 'utf8');
console.log('Original app_config.json backed up.');

function updateProvider(provider) {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  config.storage.provider = provider;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4), 'utf8');
  console.log(`\nUpdated app_config.json provider to: ${provider}`);
}

function clearLog() {
  if (fs.existsSync(LOG_PATH)) {
    fs.unlinkSync(LOG_PATH);
  }
}

function runElectron(durationMs) {
  return new Promise((resolve) => {
    console.log(`Spawning Electron with AI_FORCE_RUNTIME=1 for ${durationMs / 1000} seconds...`);
    
    // We run "npm run electron:dev" to start electron without rebuilding the frontend,
    // which is much faster and doesn't pollute the test with frontend builds.
    const proc = spawn('npm', ['run', 'electron:dev'], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, AI_FORCE_RUNTIME: '1' },
      shell: true,
    });

    let stdoutLog = '';
    proc.stdout.on('data', (d) => { stdoutLog += d.toString(); });

    setTimeout(() => {
      console.log('Stopping Electron processes...');
      // Clean shutdown: kill child processes
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${proc.pid} /f /t`, { stdio: 'ignore' });
      } else {
        proc.kill('SIGKILL');
      }
      resolve(stdoutLog);
    }, durationMs);
  });
}

function analyzeLogs(expectedBehavior) {
  if (!fs.existsSync(LOG_PATH)) {
    console.error('ERROR: electron.log was not generated!');
    return false;
  }

  const logs = fs.readFileSync(LOG_PATH, 'utf8');
  console.log('--- Electron Log Output ---');
  // Print log lines containing [Electron] or [PostgreSQL]
  const lines = logs.split('\n')
    .filter(l => l.includes('[Electron]') || l.includes('[PostgreSQL]'))
    .slice(-25);
  console.log(lines.join('\n'));
  console.log('---------------------------');

  const matches = expectedBehavior.every(term => logs.includes(term));
  if (matches) {
    console.log('✅ TEST PASSED: Behavior matches expectations.');
    return true;
  } else {
    console.error('❌ TEST FAILED: Behavior does NOT match expectations.');
    console.error('Expected terms missing:', expectedBehavior.filter(term => !logs.includes(term)));
    return false;
  }
}

async function runTests() {
  let allPassed = true;

  try {
    // Test 1: SQLite mode
    updateProvider('sqlite');
    clearLog();
    await runElectron(8000);
    const sqlitePassed = analyzeLogs([
      'External PostgreSQL or SQLite provider detected. Skipping bundled PostgreSQL startup.'
    ]);
    if (!sqlitePassed) allPassed = false;

    // Test 2: External PostgreSQL mode
    updateProvider('external_postgres');
    clearLog();
    await runElectron(8000);
    const externalPassed = analyzeLogs([
      'External PostgreSQL or SQLite provider detected. Skipping bundled PostgreSQL startup.'
    ]);
    if (!externalPassed) allPassed = false;

    // Test 3: Local PostgreSQL mode
    // We clean the database folder to test the initdb & createdb lifecycle
    const localPgDataDir = process.env.AI_FORCE_RUNTIME === "1"
      ? path.join(process.env.PROGRAMDATA || "C:\\ProgramData", "AI Attendance System", "database", "postgres-data")
      : path.join(PROJECT_ROOT, 'data', 'database', 'postgres-data');
    if (fs.existsSync(localPgDataDir)) {
      console.log(`Cleaning local PG data directory: ${localPgDataDir}`);
      fs.rmSync(localPgDataDir, { recursive: true, force: true });
    }

    updateProvider('local_postgres');
    clearLog();
    await runElectron(18000); // 18 seconds to allow initdb, start, and createdb
    const localPassed = analyzeLogs([
      'Local PostgreSQL provider detected.',
      'Initializing PostgreSQL data directory...',
      'initdb completed successfully.',
      'Starting PostgreSQL on port 54329...',
      'PostgreSQL is accepting connections.',
      'Creating database \'attendance\'...',
      'Database \'attendance\' created successfully.'
    ]);
    if (!localPassed) allPassed = false;

  } catch (err) {
    console.error('Test execution failed:', err);
    allPassed = false;
  } finally {
    // Restore original config
    if (originalConfigContent !== null) {
      fs.writeFileSync(CONFIG_PATH, originalConfigContent, 'utf8');
      console.log('\nOriginal app_config.json restored.');
    }
  }

  if (allPassed) {
    console.log('\n🎉 ALL DATABASE MODE TESTS PASSED SUCCESSFUL!');
    process.exit(0);
  } else {
    console.error('\n❌ SOME DATABASE MODE TESTS FAILED.');
    process.exit(1);
  }
}

runTests();
