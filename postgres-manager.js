/**
 * postgres-manager.js
 *
 * Manages the lifecycle of a bundled PostgreSQL instance:
 *   - Detect if LOCAL_POSTGRES is needed
 *   - Initialize database (initdb) on first launch
 *   - Start / health-check / stop PostgreSQL
 *   - Create the application database if missing
 *
 * Never writes app_config.json directly — delegates to
 * backend.config_cli via the bundled Python runtime.
 */

const { spawn, spawnSync, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const net = require("net");

// ─── Constants (Correction #4) ──────────────────────────────────

const PG_DEFAULT_PORT = 54329;
const PG_DEFAULT_DATABASE = "attendance";
const PG_DEFAULT_USERNAME = "attendance_admin";
const PG_DATA_DIR_NAME = "postgres-data";
const PG_HEALTH_CHECK_INTERVAL = 500;  // ms
const PG_HEALTH_CHECK_TIMEOUT = 30000; // 30 seconds
const PG_STOP_TIMEOUT = 15000;         // 15 seconds
const PG_INITDB_IDLE_TIMEOUT = 30000;  // 30 seconds
const PG_INITDB_HARD_TIMEOUT = 300000; // 5 minutes (300 seconds)

// ─── Bounded Ring Buffer for logs ───────────────────────────────
class BoundedBuffer {
  constructor(limit = 100) {
    this.limit = limit;
    this.buffer = [];
  }

  push(text) {
    const lines = text.split(/[\r\n]+/);
    for (const line of lines) {
      if (line.trim()) {
        this.buffer.push(line);
        if (this.buffer.length > this.limit) {
          this.buffer.shift();
        }
      }
    }
  }

  getLogs() {
    return this.buffer.join("\n");
  }

  clear() {
    this.buffer = [];
  }
}

// ─── Module state ───────────────────────────────────────────────

let postgresProcess = null;
let logFn = console.log; // Replaced by main.js logMessage
const postgresStartupLogs = new BoundedBuffer(100);
let isStarted = false;
let expectingShutdown = false;
let hasNotifiedCrash = false;

// ─── Helpers ────────────────────────────────────────────────────

function setLogger(fn) {
  logFn = fn;
}

function log(message) {
  logFn("PostgreSQL", message);
}

/**
 * Windows-native check if a PID is running using tasklist
 */
function isPidRunning(pid) {
  try {
    const cmd = `tasklist /FI "PID eq ${pid}" /FO CSV /NH`;
    const output = execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
    return output.includes(`"${pid}"`);
  } catch (err) {
    log(`WARNING: tasklist check failed: ${err.message}. Falling back to process.kill.`);
    try {
      process.kill(pid, 0);
      return true;
    } catch (e) {
      return e.code === "EPERM";
    }
  }
}

/**
 * Get process image name by PID using tasklist
 */
function getProcessNameByPid(pid) {
  try {
    const cmd = `tasklist /FI "PID eq ${pid}" /FO CSV /NH`;
    const output = execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
    const match = output.match(/^"([^"]+)"/);
    if (match) {
      return match[1];
    }
  } catch (err) {
    // Ignore
  }
  return "Unknown";
}

/**
 * Check if the port is occupied, and if so, return conflict details
 */
function checkPortOccupancy(port) {
  try {
    const output = execSync("netstat -ano", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
    const lines = output.split(/[\r\n]+/);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5 && parts[0].toUpperCase() === "TCP") {
        const localAddress = parts[1];
        const lastColonIdx = localAddress.lastIndexOf(":");
        if (lastColonIdx !== -1) {
          const p = parseInt(localAddress.substring(lastColonIdx + 1), 10);
          if (p === port) {
            const pidStr = parts[parts.length - 1];
            const pid = parseInt(pidStr, 10);
            const processName = !isNaN(pid) ? getProcessNameByPid(pid) : "Unknown";
            return { occupied: true, pid, processName };
          }
        }
      }
    }
  } catch (err) {
    log(`WARNING: Failed to run netstat for port check: ${err.message}`);
  }
  return { occupied: false };
}

/**
 * Retrieve PostgreSQL version dynamically
 */
function getPgVersion(pgBinDir) {
  try {
    const exe = getPgBinary(pgBinDir, "postgres");
    const opts = pgSpawnOptions(pgBinDir, {}, { encoding: "utf8", timeout: 5000 });
    const result = spawnSync(exe, ["--version"], opts);
    if (result.status === 0) {
      return result.stdout.trim();
    }
  } catch (err) {
    // Ignore
  }
  return "Unknown Version";
}

/**
 * Determine paths to PostgreSQL binaries and data directory
 * based on whether we are in production, simulation, or development.
 */
function resolvePaths(appRef) {
  const isForceRuntime = process.env.AI_FORCE_RUNTIME === "1";
  const isPackaged = (appRef && appRef.isPackaged) || isForceRuntime;

  let pgBinDir;
  let projectRoot;

  if (isForceRuntime) {
    projectRoot = path.join(__dirname, "..");
    pgBinDir = path.join(projectRoot, "electron", "runtime-build", "postgresql", "bin");
  } else if (isPackaged) {
    pgBinDir = path.join(process.resourcesPath, "runtime", "postgresql", "bin");
    projectRoot = null; // Not used in production
  } else {
    // Development — use system PATH (developer's own PostgreSQL)
    pgBinDir = null;
    projectRoot = path.join(__dirname, "..");
  }

  // Data directory — only use ProgramData if packaged/simulation production
  let dataDir;
  if (isPackaged) {
    const base = process.env.PROGRAMDATA || "C:\\ProgramData";
    dataDir = path.join(base, "AI Attendance System", "database", PG_DATA_DIR_NAME);
  } else {
    dataDir = path.join(projectRoot, "data", "database", PG_DATA_DIR_NAME);
  }

  return { pgBinDir, dataDir, projectRoot, isPackaged };
}

/**
 * Get the full path to a PostgreSQL binary.
 * In development without bundled binaries, returns just the name (relies on PATH).
 */
function getPgBinary(pgBinDir, name) {
  if (pgBinDir) {
    return path.join(pgBinDir, `${name}.exe`);
  }
  return `${name}.exe`;
}

// ─── PostgreSQL Process Spawn Helpers ───────────────────────────
//
// All PostgreSQL binaries (initdb, postgres, pg_ctl, pg_isready,
// createdb, psql) MUST be launched through these helpers.
//
// On Windows, PostgreSQL executables depend on sibling DLLs
// (libpq.dll, libintl-9.dll, libcrypto-3-x64.dll, etc.) that live
// in the same bin/ directory. Without setting cwd and PATH to that
// directory, Windows cannot resolve them → STATUS_DLL_NOT_FOUND
// (exit code 0xC0000135 / 3221225781).

/**
 * Build spawn options for any PostgreSQL binary.
 * Ensures cwd = pgBinDir and PATH prepends pgBinDir,
 * so Windows can resolve sibling DLLs.
 *
 * @param {string|null} pgBinDir - Absolute path to PostgreSQL bin directory
 * @param {Object} extraEnv - Additional environment variables to merge
 * @param {Object} extraOpts - Additional spawn options to merge
 */
function pgSpawnOptions(pgBinDir, extraEnv = {}, extraOpts = {}) {
  const env = { ...process.env, ...extraEnv };
  if (pgBinDir) {
    const resolvedBinDir = path.resolve(pgBinDir);
    env.PATH = resolvedBinDir + path.delimiter + (env.PATH || "");
    return {
      cwd: resolvedBinDir,
      env,
      windowsHide: true,
      ...extraOpts,
    };
  }
  // Development mode — no bundled binaries, rely on system PATH
  return {
    env,
    windowsHide: true,
    ...extraOpts,
  };
}

/**
 * Synchronously spawn a PostgreSQL binary with correct cwd/PATH.
 * Use for: initdb, pg_isready, createdb, psql, pg_ctl.
 */
function spawnPostgresSync(pgBinDir, name, args, extraEnv = {}, extraOpts = {}) {
  const exe = getPgBinary(pgBinDir, name);
  const opts = pgSpawnOptions(pgBinDir, extraEnv, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...extraOpts,
  });
  log(`Spawning (sync): ${name} — cwd: ${opts.cwd || "(system)"}, exe: ${exe}`);
  return spawnSync(exe, args, opts);
}

/**
 * Asynchronously spawn a PostgreSQL binary with correct cwd/PATH.
 * Use for: postgres (long-running server process).
 */
function spawnPostgresProcess(pgBinDir, name, args, extraEnv = {}, extraOpts = {}) {
  const exe = getPgBinary(pgBinDir, name);
  const opts = pgSpawnOptions(pgBinDir, extraEnv, extraOpts);
  log(`Spawning (async): ${name} — cwd: ${opts.cwd || "(system)"}, exe: ${exe}`);
  return spawn(exe, args, opts);
}

/**
 * Get the path to the Python executable matching the current mode.
 */
function getPythonExe(appRef) {
  const isForceRuntime = process.env.AI_FORCE_RUNTIME === "1";
  const isPackaged = appRef && appRef.isPackaged;
  const projectRoot = path.join(__dirname, "..");

  if (isForceRuntime) {
    return path.join(projectRoot, "electron", "runtime-build", "python", "python.exe");
  }
  if (isPackaged) {
    return path.join(process.resourcesPath, "runtime", "python", "python.exe");
  }

  // Development — venv
  const venvPython = path.join(projectRoot, "venv", "Scripts", "python.exe");
  if (fs.existsSync(venvPython)) return venvPython;
  return "python";
}

/**
 * Get the backend CWD matching the current mode (for config_cli).
 */
function getBackendCwd(appRef) {
  const isForceRuntime = process.env.AI_FORCE_RUNTIME === "1";
  const isPackaged = appRef && appRef.isPackaged;
  const projectRoot = path.join(__dirname, "..");

  if (isForceRuntime) {
    return path.join(projectRoot, "electron", "runtime-build", "backend");
  }
  if (isPackaged) {
    return path.join(process.resourcesPath, "runtime", "backend");
  }
  return projectRoot;
}

/**
 * Build the spawn environment for config_cli calls.
 */
function getConfigCliEnv(appRef) {
  const isPackaged = (appRef && appRef.isPackaged) || process.env.AI_FORCE_RUNTIME === "1";
  const env = { ...process.env, AI_ATTENDANCE_PACKAGED: isPackaged ? "1" : "0" };

  if (isPackaged) {
    env.PYTHONNOUSERSITE = "1";
    env.PYTHONPATH = getBackendCwd(appRef);
  }
  return env;
}

// ─── Config Reading ─────────────────────────────────────────────

/**
 * Read app_config.json to determine the storage provider.
 * Returns the parsed config object or null if not found.
 */
function readAppConfig(appRef) {
  const isPackaged = (appRef && appRef.isPackaged) || process.env.AI_FORCE_RUNTIME === "1";

  let configDir;
  if (process.platform === "win32" && isPackaged) {
    const base = process.env.PROGRAMDATA || "C:\\ProgramData";
    configDir = path.join(base, "AI Attendance System", "config");
  } else {
    const projectRoot = path.join(__dirname, "..");
    configDir = path.join(projectRoot, "data", "config");
  }

  const configPath = path.join(configDir, "app_config.json");
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (err) {
    log(`WARNING: Failed to read app_config.json: ${err.message}`);
    return null;
  }
}

/**
 * Check whether bundled PostgreSQL startup is needed.
 */
function needsLocalPostgres(appRef) {
  const config = readAppConfig(appRef);
  if (!config) {
    // No config yet — first launch will use defaults.
    // Default provider is local_postgres, so we need it.
    return true;
  }
  if (!config.storage || !config.storage.provider) {
    return true; // default fallback
  }
  return config.storage.provider === "local_postgres";
}

// ─── Database Initialization ────────────────────────────────────

/**
 * Initialize the PostgreSQL data directory with initdb.
 * Generates a random password and stores credentials via config_cli.
 *
 * Correction #5: If postgres-data exists but PG_VERSION is missing,
 * rename to postgres-data-corrupted-<timestamp> and init fresh.
 */
/**
 * Helper to check if a PostgreSQL cluster directory is complete and healthy.
 */
function isClusterComplete(dataDir) {
  if (!fs.existsSync(dataDir)) {
    return false;
  }
  const requiredFiles = ["PG_VERSION", "postgresql.conf", "pg_hba.conf"];
  const requiredDirs = ["base", "global"];
  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(dataDir, file))) {
      return false;
    }
  }
  for (const dir of requiredDirs) {
    const dirPath = path.join(dataDir, dir);
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      return false;
    }
  }
  return true;
}

/**
 * Optional diagnostics check for Windows Defender, VM detection, disk I/O, etc.
 * Never delays or affects normal startup and never modifies settings.
 */
function profileInitEnvironment(dataDir, pgBinDir) {
  try {
    log("=== PostgreSQL initdb Environment Diagnostics ===");
    
    // 1. VM Detection
    let isVm = "Unknown";
    try {
      const regCmd = 'reg query "HKLM\\SOFTWARE\\Microsoft\\Virtual Machine\\Guest\\Parameters" /v VirtualMachineName';
      const regOut = execSync(regCmd, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"], timeout: 2000 });
      if (regOut) {
        isVm = "Yes (Hyper-V / Azure)";
      }
    } catch (e) {
      try {
        const systemInfo = execSync('wmic bios get manufacturer,name', { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"], timeout: 2000 });
        if (systemInfo.toLowerCase().includes("microsoft") || systemInfo.toLowerCase().includes("vmware") || systemInfo.toLowerCase().includes("virtualbox") || systemInfo.toLowerCase().includes("qemu") || systemInfo.toLowerCase().includes("xen")) {
          isVm = "Yes (Virtual Machine)";
        } else {
          isVm = "No / Physical";
        }
      } catch (e2) {
        isVm = "Unknown (checks failed)";
      }
    }
    log(`  VM Detected: ${isVm}`);

    // 2. Disk I/O Probe
    let ioDuration = -1;
    try {
      const parentDir = path.dirname(dataDir);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      const testFile = path.join(parentDir, `io_probe_${Date.now()}.tmp`);
      const start = Date.now();
      fs.writeFileSync(testFile, "a".repeat(1024), "utf8"); // 1KB
      fs.readFileSync(testFile, "utf8");
      fs.unlinkSync(testFile);
      ioDuration = Date.now() - start;
      log(`  Disk I/O Probe (1KB write + read + delete): ${ioDuration}ms`);
    } catch (e) {
      log(`  Disk I/O Probe: FAILED to run (${e.message})`);
    }

    // 3. Windows Defender check
    let defenderRealtime = "Unknown";
    let exclusionListed = "Unknown";
    if (process.platform === "win32") {
      try {
        const psCmd = 'powershell -Command "Get-MpPreference -ErrorAction SilentlyContinue | Select-Object -Property ExclusionPath, DisableRealtimeMonitoring | ConvertTo-Json"';
        const psOut = execSync(psCmd, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"], timeout: 3000 });
        if (psOut) {
          const parsed = JSON.parse(psOut);
          if (parsed) {
            const disableRealtime = parsed.DisableRealtimeMonitoring;
            defenderRealtime = (disableRealtime === true || disableRealtime === 1) ? "DISABLED" : "ENABLED";
            
            const exclusions = [].concat(parsed.ExclusionPath || []);
            const resolvedDataDir = path.resolve(dataDir).toLowerCase();
            const isExcluded = exclusions.some(p => p && path.resolve(p).toLowerCase() === resolvedDataDir);
            exclusionListed = isExcluded ? "Yes" : "No";
          }
        }
      } catch (e) {
        defenderRealtime = "Unknown (query failed)";
        exclusionListed = "Unknown (query failed)";
      }
    }
    log(`  Windows Defender Real-Time Protection: ${defenderRealtime}`);
    log(`  Data directory excluded from Defender: ${exclusionListed}`);

    if (defenderRealtime === "ENABLED" && exclusionListed === "No") {
      log(`  RECOMMENDATION: For optimal performance on Windows VMs, consider adding a Windows Defender exclusion for: ${path.resolve(dataDir)}`);
    }
    log("=== END Environment Diagnostics ===");
  } catch (err) {
    log(`WARNING: Environment profiling encountered an error: ${err.message}`);
  }
}

/**
 * Initialize the PostgreSQL data directory with initdb.
 * Generates a random password and stores credentials via config_cli.
 */
async function initializeDatabase(appRef) {
  const { pgBinDir, dataDir } = resolvePaths(appRef);

  if (pgBinDir) {
    log(`Binary directory: ${path.resolve(pgBinDir)}`);
  }

  // Ensure parent directory exists
  const parentDir = path.dirname(dataDir);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  // Check existing data directory state
  if (fs.existsSync(dataDir)) {
    if (isClusterComplete(dataDir)) {
      log("PostgreSQL data directory already initialized and complete.");
      return;
    }

    // Incomplete or corrupted data directory (e.g. from an interrupted/timed out initdb)
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const corruptedName = `${PG_DATA_DIR_NAME}-corrupted-${timestamp}`;
    const corruptedPath = path.join(parentDir, corruptedName);
    log(`WARNING: Data directory exists at ${dataDir} but is incomplete or corrupted (missing critical files/directories). Renaming to ${corruptedName} to retry initializing fresh.`);
    try {
      fs.renameSync(dataDir, corruptedPath);
    } catch (renameErr) {
      const errorMsg = `Failed to rename corrupted or incomplete data directory from '${dataDir}' to '${corruptedPath}': ${renameErr.message}. The directory may be locked by another process or lack sufficient permissions. Startup aborted.`;
      log(`ERROR: ${errorMsg}`);
      throw new Error(errorMsg);
    }
  }

  // Run optional environmental profiling diagnostics
  profileInitEnvironment(dataDir, pgBinDir);

  log("Initializing PostgreSQL data directory...");

  // Generate random credentials
  const password = crypto.randomBytes(18).toString("base64url"); // 24 chars

  // Write password to a temp file for initdb --pwfile
  const pwFilePath = path.join(parentDir, ".pg_init_pw");
  fs.writeFileSync(pwFilePath, password, "utf8");

  log("Initializing PostgreSQL data directory (async, adaptive timeout)...");

  const exe = getPgBinary(pgBinDir, "initdb");
  const args = [
    "-D", dataDir,
    "-U", PG_DEFAULT_USERNAME,
    "-A", "md5",
    "--pwfile", pwFilePath,
    "-E", "UTF8",
    "--locale=C",
  ];

  // Build spawn options using the existing helper pgSpawnOptions
  const opts = pgSpawnOptions(pgBinDir, {}, { stdio: ["ignore", "pipe", "pipe"] });
  log(`Spawning (async initdb): initdb — cwd: ${opts.cwd || "(system)"}, exe: ${exe}`);

  const startTime = Date.now();
  let lastOutputTime = Date.now();
  let stdoutData = "";
  let stderrData = "";
  const outputChunks = [];

  const initdbProcess = spawn(exe, args, opts);

  // Monitor progress and output in real time
  initdbProcess.stdout.on("data", (chunk) => {
    lastOutputTime = Date.now();
    const str = chunk.toString();
    stdoutData += str;
    outputChunks.push(chunk);
    
    const lines = str.split(/[\r\n]+/);
    for (const line of lines) {
      if (line.trim()) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        log(`[initdb stdout] [+${elapsed}s] ${line.trim()}`);
      }
    }
  });

  initdbProcess.stderr.on("data", (chunk) => {
    lastOutputTime = Date.now();
    const str = chunk.toString();
    stderrData += str;
    outputChunks.push(chunk);
    
    const lines = str.split(/[\r\n]+/);
    for (const line of lines) {
      if (line.trim()) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        log(`[initdb stderr] [+${elapsed}s] ${line.trim()}`);
      }
    }
  });

  const initPromise = new Promise((resolve, reject) => {
    let idleTimer = null;
    let hardTimer = null;
    let closed = false;

    const cleanupTimers = () => {
      if (idleTimer) clearInterval(idleTimer);
      if (hardTimer) clearTimeout(hardTimer);
    };

    // Idle timeout check: check every 1 second if lastOutputTime was more than 30s ago
    idleTimer = setInterval(() => {
      const now = Date.now();
      if (now - lastOutputTime > PG_INITDB_IDLE_TIMEOUT) {
        cleanupTimers();
        if (!closed) {
          closed = true;
          log(`ERROR: initdb idle timeout exceeded (${PG_INITDB_IDLE_TIMEOUT / 1000}s of no output). Killing process.`);
          try {
            if (process.platform === "win32") {
              spawnSync("taskkill", ["/pid", String(initdbProcess.pid), "/f", "/t"], { windowsHide: true });
            } else {
              initdbProcess.kill("SIGKILL");
            }
          } catch (e) {
            log(`Failed to kill timed out initdb: ${e.message}`);
          }
          reject(new Error(`initdb timed out (no output for ${PG_INITDB_IDLE_TIMEOUT / 1000} seconds)`));
        }
      }
    }, 1000);

    // Hard timeout check: kill after PG_INITDB_HARD_TIMEOUT
    hardTimer = setTimeout(() => {
      cleanupTimers();
      if (!closed) {
        closed = true;
        log(`ERROR: initdb hard timeout exceeded (${PG_INITDB_HARD_TIMEOUT / 1000}s max limit). Killing process.`);
        try {
          if (process.platform === "win32") {
            spawnSync("taskkill", ["/pid", String(initdbProcess.pid), "/f", "/t"], { windowsHide: true });
          } else {
            initdbProcess.kill("SIGKILL");
          }
        } catch (e) {
          log(`Failed to kill timed out initdb: ${e.message}`);
        }
        reject(new Error(`initdb timed out (hard limit of ${PG_INITDB_HARD_TIMEOUT / 1000} seconds exceeded)`));
      }
    }, PG_INITDB_HARD_TIMEOUT);

    initdbProcess.on("error", (err) => {
      cleanupTimers();
      if (!closed) {
        closed = true;
        reject(err);
      }
    });

    initdbProcess.on("close", (code, signal) => {
      cleanupTimers();
      if (!closed) {
        closed = true;
        resolve({ code, signal });
      }
    });
  });

  let initResultStatus = null;
  let initResultSignal = null;
  let initResultError = null;

  try {
    const { code, signal } = await initPromise;
    initResultStatus = code;
    initResultSignal = signal;
  } catch (err) {
    initResultError = err;
    initResultStatus = null;
  }

  // Construct a structure matching SpawnSyncReturns to keep existing diagnostics completely intact
  const initResult = {
    status: initResultStatus,
    signal: initResultSignal,
    error: initResultError,
    stdout: stdoutData,
    stderr: stderrData,
    output: [null, stdoutData, stderrData]
  };

  // ── DEBUG: dump full SpawnSyncReturns for initdb ──
  log("===== initdb SpawnSyncReturns =====");
  log(`  result.status  : ${initResult.status}`);
  log(`  result.signal  : ${initResult.signal}`);
  log(`  result.error   : ${initResult.error}`);
  log(`  result.error?.code    : ${initResult.error?.code}`);
  log(`  result.error?.errno   : ${initResult.error?.errno}`);
  log(`  result.error?.message : ${initResult.error?.message}`);
  log(`  result.stdout  : ${initResult.stdout}`);
  log(`  result.stderr  : ${initResult.stderr}`);
  log(`  result.output  : ${JSON.stringify(initResult.output?.map(b => String(b)))}`);
  log("===== END initdb SpawnSyncReturns =====");

  // Clean up password file
  try { fs.unlinkSync(pwFilePath); } catch { /* ignore */ }

  if (initResult.status !== 0 || initResult.error) {
    const errorMsg = initResult.stderr || initResult.stdout || (initResult.error ? initResult.error.message : "Unknown error");
    throw new Error(`initdb failed (exit code ${initResult.status}): ${errorMsg}`);
  }

  log("initdb completed successfully.");

  // Configure pg_hba.conf: restrict to local connections only
  const pgHbaPath = path.join(dataDir, "pg_hba.conf");
  const pgHbaContent = [
    "# TYPE  DATABASE  USER  ADDRESS       METHOD",
    "host    all       all   127.0.0.1/32  md5",
    "host    all       all   ::1/128       md5",
    "",
  ].join("\n");
  fs.writeFileSync(pgHbaPath, pgHbaContent, "utf8");
  log("pg_hba.conf configured for local-only access.");

  // Configure postgresql.conf: listen only on localhost
  const pgConfPath = path.join(dataDir, "postgresql.conf");
  let pgConf = "";
  if (fs.existsSync(pgConfPath)) {
    pgConf = fs.readFileSync(pgConfPath, "utf8");
  }
  const listenDirective = `listen_addresses = '127.0.0.1'`;
  if (!pgConf.includes("listen_addresses")) {
    pgConf += `\n${listenDirective}\n`;
  } else {
    pgConf = pgConf.replace(/^#?\s*listen_addresses\s*=.*/m, listenDirective);
  }
  fs.writeFileSync(pgConfPath, pgConf, "utf8");
  log("postgresql.conf configured for localhost-only listening.");

  // Save credentials via config_cli (Correction #1)
  saveCredentialsViaCli(appRef, password);
}

/**
 * Call backend.config_cli to persist LOCAL_POSTGRES credentials.
 */
function saveCredentialsViaCli(appRef, password) {
  const pythonExe = getPythonExe(appRef);
  const cwd = getBackendCwd(appRef);
  
  // Merge the password into the spawn environment
  const env = { 
    ...getConfigCliEnv(appRef),
    PG_INIT_PASSWORD: password
  };

  const args = [
    "-m", "backend.config_cli", "set-local-postgres",
    "--host", "127.0.0.1",
    "--port", String(PG_DEFAULT_PORT),
    "--username", PG_DEFAULT_USERNAME,
    "--database", PG_DEFAULT_DATABASE,
  ];

  log("Saving PostgreSQL credentials via config_cli...");

  const result = spawnSync(pythonExe, args, {
    cwd,
    env,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 15000,
  });

  log("=== config_cli spawnSync result ===");
  log(`Exit Code: ${result.status}`);
  log(`Signal: ${result.signal}`);
  log(`Error: ${result.error ? result.error.message : "None"}`);
  log(`Error Code: ${result.error ? result.error.code : "None"}`);
  log(`Stdout:\n${result.stdout || "(Empty)"}`);
  log(`Stderr:\n${result.stderr || "(Empty)"}`);
  log("===================================");

  if (result.status !== 0 || result.error) {
    const errorMsg = result.stderr || result.stdout || (result.error ? result.error.message : "Unknown error");
    throw new Error(`config_cli failed (exit code ${result.status}, signal ${result.signal}): ${errorMsg}`);
  }

  try {
    const stdoutStr = result.stdout.trim();
    const jsonMatch = stdoutStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON object found in config_cli stdout");
    }
    const output = JSON.parse(jsonMatch[0]);
    if (!output.success) {
      throw new Error(`config_cli validation errors: ${JSON.stringify(output.errors)}`);
    }
    log("Credentials saved successfully.");
  } catch (parseErr) {
    if (parseErr.message.includes("config_cli validation")) throw parseErr;
    log(`WARNING: Could not parse config_cli output: ${result.stdout}`);
  }
}

// ─── Start PostgreSQL ───────────────────────────────────────────

/**
 * Start the PostgreSQL server process.
 */
function startPostgres(appRef) {
  const { pgBinDir, dataDir } = resolvePaths(appRef);
  const config = readAppConfig(appRef);
  const port = (config && config.database && config.database.port) ? config.database.port : PG_DEFAULT_PORT;

  expectingShutdown = false;
  isStarted = false;
  hasNotifiedCrash = false;

  let shouldSpawn = true;

  // 1. Check for stale postmaster.pid
  const pidPath = path.join(dataDir, "postmaster.pid");
  if (fs.existsSync(pidPath)) {
    try {
      const content = fs.readFileSync(pidPath, "utf8");
      const pidStr = content.split(/[\r\n]+/)[0].trim();
      const pid = parseInt(pidStr, 10);
      if (!isNaN(pid) && pid > 0) {
        log(`Checking if process (PID ${pid}) from postmaster.pid is running...`);
        const isRunning = isPidRunning(pid);
        if (isRunning) {
          log(`PostgreSQL process (PID ${pid}) from postmaster.pid is running. Verifying expected data directory via pg_ctl status...`);
          const statusResult = spawnPostgresSync(pgBinDir, "pg_ctl", ["status", "-D", dataDir], {}, { timeout: 5000 });
          if (statusResult.status === 0) {
            log(`pg_ctl status verified. Checking connections on port ${port} with pg_isready...`);
            const checkResult = spawnPostgresSync(pgBinDir, "pg_isready", [
              "-h", "127.0.0.1",
              "-p", String(port),
              "-U", PG_DEFAULT_USERNAME,
            ], {}, { timeout: 5000 });

            if (checkResult.status === 0) {
              log(`PostgreSQL process (PID ${pid}) is healthy. Reusing existing instance.`);
              shouldSpawn = false;
              isStarted = true;
            } else {
              // pg_isready failed
              const pgVersion = getPgVersion(pgBinDir);
              const exePath = getPgBinary(pgBinDir, "postgres");
              const statusMsg = `pg_ctl status returned exit code ${statusResult.status}.\nStdout: ${(statusResult.stdout || "").trim()}\nStderr: ${(statusResult.stderr || "").trim()}`;
              const checkMsg = `pg_isready returned exit code ${checkResult.status}.\nStdout: ${(checkResult.stdout || "").trim()}\nStderr: ${(checkResult.stderr || "").trim()}`;
              const errMsg = 
                `An existing PostgreSQL process (PID ${pid}) is running but failed pg_isready health check on port ${port}.\n` +
                `Manual intervention is required. Startup aborted.\n\n` +
                `Diagnostics:\n` +
                `- PostgreSQL Version: ${pgVersion}\n` +
                `- Executable Path: ${exePath}\n` +
                `- Configured Port: ${port}\n` +
                `- Data Directory: ${dataDir}\n` +
                `- pg_ctl Status Check:\n${statusMsg}\n` +
                `- pg_isready Health Check:\n${checkMsg}`;
              log(`ERROR: ${errMsg}`);
              throw new Error(errMsg);
            }
          } else {
            // pg_ctl status failed
            const pgVersion = getPgVersion(pgBinDir);
            const exePath = getPgBinary(pgBinDir, "postgres");
            const statusMsg = `pg_ctl status returned exit code ${statusResult.status}.\nStdout: ${(statusResult.stdout || "").trim()}\nStderr: ${(statusResult.stderr || "").trim()}`;
            const errMsg = 
              `An existing PostgreSQL process (PID ${pid}) is running but failed pg_ctl status verification.\n` +
              `Manual intervention is required. Startup aborted.\n\n` +
              `Diagnostics:\n` +
              `- PostgreSQL Version: ${pgVersion}\n` +
              `- Executable Path: ${exePath}\n` +
              `- Configured Port: ${port}\n` +
              `- Data Directory: ${dataDir}\n` +
              `- pg_ctl Status Check:\n${statusMsg}\n` +
              `- pg_isready Health Check:\nNot run because pg_ctl status failed.`;
            log(`ERROR: ${errMsg}`);
            throw new Error(errMsg);
          }
        } else {
          log(`PostgreSQL postmaster.pid exists but process (PID ${pid}) is not running. Removing stale file.`);
          fs.unlinkSync(pidPath);
        }
      } else {
        log(`PostgreSQL postmaster.pid exists but contains invalid PID "${pidStr}". Removing file.`);
        fs.unlinkSync(pidPath);
      }
    } catch (err) {
      log(`WARNING: Error processing postmaster.pid: ${err.message}`);
      throw err;
    }
  }

  // 2. Check if the port is already occupied (only if we intend to spawn)
  if (shouldSpawn) {
    const occupancy = checkPortOccupancy(port);
    if (occupancy.occupied) {
      const errMsg = `Port ${port} is already occupied by process "${occupancy.processName}" (PID: ${occupancy.pid}).`;
      log(`ERROR: ${errMsg}`);
      throw new Error(errMsg);
    }
  }

  if (shouldSpawn) {
    log(`Starting PostgreSQL on port ${port}...`);
    log(`Data directory: ${dataDir}`);

    postgresStartupLogs.clear();

    postgresProcess = spawnPostgresProcess(
      pgBinDir, "postgres",
      ["-D", dataDir, "-p", String(port), "-h", "127.0.0.1"],
      {},
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    postgresProcess.stdout.on("data", (data) => {
      const chunk = data.toString();
      if (!isStarted) {
        postgresStartupLogs.push(chunk);
      }
      log(chunk.trim());
    });

    postgresProcess.stderr.on("data", (data) => {
      const chunk = data.toString();
      if (!isStarted) {
        postgresStartupLogs.push(chunk);
      }
      log(chunk.trim());
    });

    postgresProcess.on("error", (err) => {
      log(`ERROR: Failed to start PostgreSQL: ${err.message}`);
      if (!isStarted) {
        postgresStartupLogs.push(`ERROR: Failed to start PostgreSQL: ${err.message}`);
      }
    });

    postgresProcess.on("close", (code, signal) => {
      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      log(`PostgreSQL process exited with ${reason}`);
      postgresProcess = null;

      if (!expectingShutdown && isStarted && !hasNotifiedCrash) {
        hasNotifiedCrash = true;
        const msg = `ERROR: PostgreSQL process exited unexpectedly via ${reason}.`;
        log(msg);

        // Notify the user via electron dialog
        try {
          const electron = require("electron");
          if (electron && electron.dialog) {
            electron.dialog.showErrorBox(
              "Database Service Stopped",
              "The bundled PostgreSQL database service has stopped unexpectedly.\n\n" +
              `Reason: Exited with ${reason}.\n` +
              "Please restart the application to restore database connectivity."
            );
          }
        } catch (err) {
          log(`WARNING: Failed to display crash notification: ${err.message}`);
        }
      }
    });
  } else {
    log(`PostgreSQL is already running on port ${port}. Skipping launch.`);
  }
}

// ─── Health Check (Correction #3: use pg_isready) ───────────────

/**
 * Wait for PostgreSQL to be ready using pg_isready.
 */
function waitForPostgres(appRef) {
  return new Promise((resolve, reject) => {
    const { pgBinDir, dataDir } = resolvePaths(appRef);
    const config = readAppConfig(appRef);
    const port = (config && config.database && config.database.port) ? config.database.port : PG_DEFAULT_PORT;
    const startTime = Date.now();

    // Listen to postgresProcess exiting early
    let hasExited = false;
    let exitDetails = null;

    const exitHandler = (code, signal) => {
      hasExited = true;
      exitDetails = signal ? `signal ${signal}` : `exit code ${code}`;
    };

    if (postgresProcess) {
      postgresProcess.once("close", exitHandler);
    }

    const check = () => {
      const pgVersion = getPgVersion(pgBinDir);
      const exePath = getPgBinary(pgBinDir, "postgres");

      // 1. If we are supposed to be spawning and the spawned process exited prematurely
      if (hasExited || (isStarted === false && postgresProcess === null && !postgresStartupLogs.getLogs().includes("healthy"))) {
        const logs = postgresStartupLogs.getLogs();
        const details = exitDetails || "process exited";
        if (postgresProcess) {
          postgresProcess.removeListener("close", exitHandler);
        }
        reject(new Error(
          `PostgreSQL process exited prematurely during startup (${details}).\n\n` +
          `Diagnostics:\n` +
          `- PostgreSQL Version: ${pgVersion}\n` +
          `- Executable Path: ${exePath}\n` +
          `- Configured Port: ${port}\n` +
          `- Data Directory: ${dataDir}\n` +
          `- Exit Info: ${details}\n\n` +
          `Startup Logs:\n${logs || "No logs captured."}`
        ));
        return;
      }

      // If already started or reused, we can resolve immediately
      if (isStarted) {
        log("PostgreSQL is verified healthy and ready.");
        if (postgresProcess) {
          postgresProcess.removeListener("close", exitHandler);
        }
        resolve();
        return;
      }

      const result = spawnPostgresSync(pgBinDir, "pg_isready", [
        "-h", "127.0.0.1",
        "-p", String(port),
        "-U", PG_DEFAULT_USERNAME,
      ], {}, { timeout: 5000 });

      if (result.status === 0) {
        log("PostgreSQL is accepting connections.");
        isStarted = true;
        postgresStartupLogs.clear(); // Clear memory
        if (postgresProcess) {
          postgresProcess.removeListener("close", exitHandler);
        }
        resolve();
        return;
      }

      if (Date.now() - startTime > PG_HEALTH_CHECK_TIMEOUT) {
        if (postgresProcess) {
          postgresProcess.removeListener("close", exitHandler);
        }
        const logs = postgresStartupLogs.getLogs();
        const lastCheck = `pg_isready returned exit code ${result.status}.\nStdout: ${(result.stdout || "").trim()}\nStderr: ${(result.stderr || "").trim()}`;
        reject(new Error(
          `PostgreSQL did not become ready within ${PG_HEALTH_CHECK_TIMEOUT / 1000} seconds.\n\n` +
          `Diagnostics:\n` +
          `- PostgreSQL Version: ${pgVersion}\n` +
          `- Executable Path: ${exePath}\n` +
          `- Configured Port: ${port}\n` +
          `- Data Directory: ${dataDir}\n` +
          `- Last pg_isready output:\n${lastCheck}\n\n` +
          `Startup Logs:\n${logs || "No logs captured."}`
        ));
        return;
      }

      setTimeout(check, PG_HEALTH_CHECK_INTERVAL);
    };

    check();
  });
}

// ─── Create Database ────────────────────────────────────────────

/**
 * Create the application database if it doesn't exist.
 */
function createDatabase(appRef) {
  const { pgBinDir } = resolvePaths(appRef);

  // Read password from config
  const config = readAppConfig(appRef);
  const password = config && config.database ? config.database.password : "";
  const port = (config && config.database && config.database.port) ? config.database.port : PG_DEFAULT_PORT;

  const pgEnv = { PGPASSWORD: password };

  // Check if database already exists
  const checkResult = spawnPostgresSync(pgBinDir, "psql", [
    "-h", "127.0.0.1",
    "-p", String(port),
    "-U", PG_DEFAULT_USERNAME,
    "-d", PG_DEFAULT_DATABASE,
    "-c", "SELECT 1",
  ], pgEnv, { timeout: 10000 });

  if (checkResult.status === 0) {
    log(`Database '${PG_DEFAULT_DATABASE}' already exists.`);
    return;
  }

  // Create the database
  log(`Creating database '${PG_DEFAULT_DATABASE}'...`);
  const createResult = spawnPostgresSync(pgBinDir, "createdb", [
    "-h", "127.0.0.1",
    "-p", String(port),
    "-U", PG_DEFAULT_USERNAME,
    PG_DEFAULT_DATABASE,
  ], pgEnv, { timeout: 15000 });

  if (createResult.status !== 0) {
    const errorMsg = createResult.stderr || createResult.stdout || "Unknown error";
    throw new Error(`createdb failed (exit code ${createResult.status}): ${errorMsg}`);
  }

  log(`Database '${PG_DEFAULT_DATABASE}' created successfully.`);
}

// ─── Stop PostgreSQL ────────────────────────────────────────────

/**
 * Gracefully stop PostgreSQL using pg_ctl stop.
 * Falls back to process kill after PG_STOP_TIMEOUT.
 */
function stopPostgres(appRef) {
  return new Promise((resolve) => {
    expectingShutdown = true;
    if (!postgresProcess) {
      resolve();
      return;
    }

    const { pgBinDir, dataDir } = resolvePaths(appRef);

    log("Stopping PostgreSQL gracefully...");

    const stopResult = spawnPostgresSync(pgBinDir, "pg_ctl", [
      "stop",
      "-D", dataDir,
      "-m", "fast",
      "-w", // wait for shutdown
      "-t", String(Math.floor(PG_STOP_TIMEOUT / 1000)),
    ], {}, { timeout: PG_STOP_TIMEOUT + 5000 });

    if (stopResult.status === 0) {
      log("PostgreSQL stopped gracefully.");
      postgresProcess = null;
      resolve();
      return;
    }

    log(`WARNING: pg_ctl stop returned exit code ${stopResult.status}. Falling back to process kill.`);
    log(`pg_ctl stderr: ${(stopResult.stderr || "").trim()}`);

    // Fallback: kill the process
    if (postgresProcess) {
      try {
        if (process.platform === "win32") {
          spawnSync("taskkill", ["/pid", String(postgresProcess.pid), "/f", "/t"], {
            windowsHide: true,
          });
        } else {
          postgresProcess.kill("SIGKILL");
        }
      } catch (e) {
        log(`ERROR: Failed to kill PostgreSQL process: ${e.message}`);
      }
      postgresProcess = null;
    }

    resolve();
  });
}

// ─── Public API ─────────────────────────────────────────────────

module.exports = {
  // Constants (exported for external reference)
  PG_DEFAULT_PORT,
  PG_DEFAULT_DATABASE,
  PG_DEFAULT_USERNAME,

  // Functions
  setLogger,
  needsLocalPostgres,
  initializeDatabase,
  startPostgres,
  waitForPostgres,
  createDatabase,
  stopPostgres,
};
