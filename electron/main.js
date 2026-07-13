const { app, BrowserWindow, dialog } = require("electron");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const http = require("http");
const fs = require("fs");
const postgresManager = require("./postgres-manager");

// ─── Configuration ──────────────────────────────────────
const BACKEND_HOST = "127.0.0.1";
const BACKEND_PORT = 8000;
const BACKEND_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
const HEALTH_CHECK_INTERVAL = 500; // ms
const BACKEND_SAFETY_TIMEOUT = 600000; // 10 minutes max wait
const PROJECT_ROOT = path.join(__dirname, "..");

const backendLogs = [];
const MAX_BACKEND_LOGS = 100;

function pushBackendLog(data) {
  const text = data.toString();
  const lines = text.split(/[\r\n]+/);
  for (const line of lines) {
    if (line.trim()) {
      backendLogs.push(line.trim());
      if (backendLogs.length > MAX_BACKEND_LOGS) {
        backendLogs.shift();
      }
    }
  }
}

let mainWindow = null;
let backendProcess = null;
let cameraManagerProcess = null;
let splashWindow = null;

// Helper to resolve application data directory
function getAppDataDir() {
  const isPackaged = app.isPackaged || process.env.AI_FORCE_RUNTIME === "1";
  if (process.platform === "win32" && isPackaged) {
    const base = process.env.PROGRAMDATA || "C:\\ProgramData";
    return path.join(base, "AI Attendance System");
  }
  const fallbackPath = path.join(PROJECT_ROOT, "data");
  if (process.platform === "win32") {
    const norm = path.resolve(fallbackPath).toLowerCase();
    if (norm.includes("program files") || norm.includes("system32")) {
      const base = process.env.PROGRAMDATA || "C:\\ProgramData";
      return path.join(base, "AI Attendance System");
    }
  }
  return fallbackPath;
}

// Log utility that writes to electron.log with rotation
function logMessage(prefix, message) {
  const cleanMsg = message.toString().trim();
  if (!cleanMsg) return;

  const timestamp = new Date().toISOString();
  const formattedLine = `[${timestamp}] [${prefix}] ${cleanMsg}`;

  // Print to stdout
  console.log(formattedLine);

  // Write to log file
  const logDir = path.join(getAppDataDir(), "logs");
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logPath = path.join(logDir, "electron.log");

    // Rotate at 10MB, keep 5 old backups
    if (fs.existsSync(logPath)) {
      const stats = fs.statSync(logPath);
      if (stats.size > 10 * 1024 * 1024) {
        for (let i = 5; i >= 1; i--) {
          const oldPath = path.join(logDir, `electron.log.${i}`);
          const newPath = path.join(logDir, `electron.log.${i + 1}`);
          if (fs.existsSync(oldPath)) {
            if (i === 5) {
              fs.unlinkSync(oldPath);
            } else {
              fs.renameSync(oldPath, newPath);
            }
          }
        }
        fs.renameSync(logPath, path.join(logDir, "electron.log.1"));
      }
    }

    fs.appendFileSync(logPath, formattedLine + "\n");
  } catch (err) {
    console.error("Failed writing to electron.log:", err);
  }
}

// Set up postgres manager logger
postgresManager.setLogger(logMessage);


// Helper to resolve the correct Python executable path (venv vs bundled)
function getPythonExecutable() {
  if (process.env.AI_FORCE_RUNTIME === "1") {
    const simPythonWin = path.join(PROJECT_ROOT, "electron", "runtime-build", "python", "python.exe");
    logMessage("Electron", `Forcing bundled runtime Python via AI_FORCE_RUNTIME: ${simPythonWin}`);
    return simPythonWin;
  }

  if (app.isPackaged) {
    const prodPythonWin = path.join(process.resourcesPath, "runtime", "python", "python.exe");
    logMessage("Electron", `Using bundled production Python: ${prodPythonWin}`);
    return prodPythonWin;
  }

  const venvPythonWin = path.join(PROJECT_ROOT, "venv", "Scripts", "python.exe");
  const venvPythonUnix = path.join(PROJECT_ROOT, "venv", "bin", "python");
  if (process.platform === "win32" && fs.existsSync(venvPythonWin)) {
    logMessage("Electron", `Using Windows virtual environment Python: ${venvPythonWin}`);
    return venvPythonWin;
  } else if (fs.existsSync(venvPythonUnix)) {
    logMessage("Electron", `Using Unix virtual environment Python: ${venvPythonUnix}`);
    return venvPythonUnix;
  }
  logMessage("Electron", "Virtual environment Python not found. Falling back to system 'python'.");
  return "python";
}

// Helper to resolve backend execution path
function getBackendCwd() {
  if (process.env.AI_FORCE_RUNTIME === "1") {
    return path.join(PROJECT_ROOT, "electron", "runtime-build", "backend");
  }

  if (app.isPackaged) {
    return path.join(process.resourcesPath, "runtime", "backend");
  }
  return PROJECT_ROOT;
}

// Helper to construct spawn environment
function getSpawnEnv() {
  const isPackaged = app.isPackaged || process.env.AI_FORCE_RUNTIME === "1";
  const env = { 
    ...process.env, 
    AI_ATTENDANCE_PACKAGED: isPackaged ? "1" : "0",
    PYTHONUNBUFFERED: "1"
  };

  if (isPackaged) {
    env.PYTHONNOUSERSITE = "1";
    if (app.isPackaged) {
      env.PYTHONPATH = path.join(process.resourcesPath, "runtime", "backend");
    } else {
      env.PYTHONPATH = path.join(PROJECT_ROOT, "electron", "runtime-build", "backend");
    }
  }
  return env;
}

// ─── Spawn Backend ──────────────────────────────────────
function startBackend() {
  logMessage("Electron", "Starting FastAPI backend...");
  const pythonPath = getPythonExecutable();
  const cwdPath = getBackendCwd();
  const env = getSpawnEnv();

  backendProcess = spawn(
    pythonPath,
    ["-m", "uvicorn", "backend.main:app", "--host", BACKEND_HOST, "--port", String(BACKEND_PORT)],
    {
      cwd: cwdPath,
      env: env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }
  );

  backendProcess.stdout.on("data", (data) => {
    pushBackendLog(data);
    logMessage("Backend", data);
  });

  backendProcess.stderr.on("data", (data) => {
    pushBackendLog(data);
    logMessage("Backend", data);
  });

  backendProcess.on("error", (err) => {
    logMessage("Electron", `Failed to start backend: ${err.message}`);
  });

  backendProcess.on("close", (code) => {
    logMessage("Electron", `Backend exited with code ${code}`);
    backendProcess = null;
  });
}

// ─── Spawn Camera Manager ───────────────────────────────
function startCameraManager() {
  logMessage("Electron", "Starting Camera Manager...");
  const pythonPath = getPythonExecutable();
  const cwdPath = getBackendCwd();
  const env = getSpawnEnv();

  cameraManagerProcess = spawn(
    pythonPath,
    ["-m", "face_service.camera_manager"],
    {
      cwd: cwdPath,
      env: env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }
  );

  cameraManagerProcess.stdout.on("data", (data) => {
    logMessage("CameraManager", data);
  });

  cameraManagerProcess.stderr.on("data", (data) => {
    logMessage("CameraManager", data);
  });

  cameraManagerProcess.on("error", (err) => {
    logMessage("Electron", `Failed to start Camera Manager: ${err.message}`);
  });

  cameraManagerProcess.on("close", (code) => {
    logMessage("Electron", `Camera Manager exited with code ${code}`);
    cameraManagerProcess = null;
  });
}

// ─── Health Check (wait for backend + migrations) ──────
//
// FastAPI startup events (including Alembic migrations) run
// BEFORE uvicorn begins accepting connections. Therefore,
// once this health check succeeds, migrations are guaranteed
// to have completed. If migrations fail, the backend process
// exits immediately and this function rejects fast.
//
function waitForBackend() {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let settled = false;
    let lastWaitLogTime = 0;

    // Detect early backend crash (e.g., migration failure → sys.exit(1))
    // so we fail fast instead of waiting for the full safety timeout.
    const onBackendExit = (code) => {
      if (!settled) {
        settled = true;
        reject(new Error(
          `Backend process exited with code ${code} during startup. ` +
          `This usually means database migrations failed. Check logs for [MIGRATIONS] [CRITICAL] messages.`
        ));
      }
    };

    if (backendProcess) {
      backendProcess.once("close", onBackendExit);
    }

    const check = () => {
      if (settled) return;

      const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
      if (Date.now() - lastWaitLogTime > 5000) {
        logMessage("Electron", `Waiting for backend... (${elapsedSec}s elapsed)`);
        lastWaitLogTime = Date.now();
      }

      const req = http.get(`${BACKEND_URL}/`, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (settled) return;
          try {
            const json = JSON.parse(body);
            if (json.status === "backend running") {
              settled = true;
              if (backendProcess) backendProcess.removeListener("close", onBackendExit);
              logMessage("Electron", "Backend is ready (migrations completed successfully).");
              resolve();
              return;
            }
          } catch {
            // not yet
          }
          retryOrFail();
        });
      });

      req.on("error", () => retryOrFail());
      req.setTimeout(2000, () => {
        req.destroy();
        retryOrFail();
      });
    };

    const retryOrFail = () => {
      if (settled) return;
      if (Date.now() - startTime > BACKEND_SAFETY_TIMEOUT) {
        settled = true;
        if (backendProcess) backendProcess.removeListener("close", onBackendExit);
        reject(new Error(`Backend did not start within ${BACKEND_SAFETY_TIMEOUT / 60000} minutes.`));
      } else {
        setTimeout(check, HEALTH_CHECK_INTERVAL);
      }
    };

    check();
  });
}

/**
 * Compile detailed backend and system diagnostics when startup fails.
 */
function getBackendCrashDiagnostics(reason) {
  let report = `Backend startup failed: ${reason}\n\n`;

  report += `=== EXACT REASON ===\n${reason}\n\n`;

  report += `=== LAST BACKEND LOGS ===\n`;
  if (backendLogs.length > 0) {
    report += backendLogs.join("\n") + "\n";
  } else {
    report += "No backend logs captured.\n";
  }
  report += "\n";

  // PostgreSQL status
  report += `=== POSTGRESQL STATUS ===\n`;
  try {
    const pgDiag = postgresManager.getPostgresDiagnostics(app);
    report += `Port: ${pgDiag.port}\n`;
    report += `Data Directory: ${pgDiag.dataDir}\n`;
    report += `Process Status: ${pgDiag.processStatus}\n`;
    report += `Port Occupancy: ${pgDiag.portOccupied}\n`;
    report += `pg_isready Check: ${pgDiag.pgIsReadyStatus}\n`;
    report += `PostgreSQL Startup Logs:\n${pgDiag.startupLogs}\n`;
  } catch (err) {
    report += `Failed to retrieve PostgreSQL status: ${err.message}\n`;
  }
  report += "\n";

  // Migration status
  report += `=== MIGRATION STATUS ===\n`;
  const migrationLogs = backendLogs.filter(line => line.includes("[MIGRATIONS]") || line.includes("[STARTUP]"));
  if (migrationLogs.length > 0) {
    report += migrationLogs.join("\n") + "\n";
  } else {
    report += "No migration or startup logs found in backend output.\n";
  }

  // Check if migration lock file exists
  try {
    const lockPath = path.join(getAppDataDir(), "migration.lock");
    if (fs.existsSync(lockPath)) {
      const lockPid = fs.readFileSync(lockPath, "utf8").trim();
      report += `\nMigration lock file exists at: ${lockPath} (PID holding lock: ${lockPid})\n`;
    } else {
      report += `\nNo migration lock file found.\n`;
    }
  } catch (err) {
    report += `\nError checking migration lock: ${err.message}\n`;
  }

  return report;
}

// ─── Splash Window (shown while backend starts) ────────
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const splashHTML = `
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          background: linear-gradient(145deg, #0f172a, #1e293b);
          color: #e2e8f0;
          border-radius: 16px;
          overflow: hidden;
        }
        .container {
          text-align: center;
          padding: 40px;
        }
        .logo {
          width: 64px;
          height: 64px;
          border-radius: 16px;
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
          font-size: 28px;
          font-weight: 900;
          color: white;
        }
        h1 { font-size: 20px; font-weight: 800; margin-bottom: 8px; }
        p { font-size: 13px; color: #94a3b8; margin-bottom: 24px; }
        .spinner {
          width: 32px; height: 32px;
          border: 3px solid #334155;
          border-top: 3px solid #3b82f6;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">A</div>
        <h1>AI Attendance System</h1>
        <p>Starting services...</p>
        <div class="spinner"></div>
      </div>
    </body>
    </html>
  `;

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHTML)}`);
}

// ─── Main Window ────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "AI Attendance System",
    icon: path.join(__dirname, "icon.ico"),
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Load frontend build explicitly distinguishing packaged and development mode
  let frontendPath;
  if (app.isPackaged) {
    frontendPath = path.join(app.getAppPath(), "frontend", "dist", "index.html");
  } else {
    frontendPath = path.join(PROJECT_ROOT, "frontend", "dist", "index.html");
  }
  logMessage("Electron", `Loading frontend from: ${frontendPath}`);
  mainWindow.loadFile(frontendPath);

  // Intercept invalid local file:// navigations (e.g. from window.location manipulation or corrupt relative routing fallback)
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file://")) {
      const cleanUrl = url.split("#")[0].split("?")[0];
      const normalizedUrl = path.normalize(cleanUrl.replace(/^file:\/\/\/?/, ""));
      const normalizedIndex = path.normalize(frontendPath);
      if (normalizedUrl !== normalizedIndex) {
        event.preventDefault();
        logMessage("Electron", `Intercepted invalid local file navigation to: ${url}`);
        mainWindow.loadFile(frontendPath);
      }
    }
  });

  mainWindow.once("ready-to-show", () => {
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── Kill Child Processes ───────────────────────────────
function killProcesses() {
  if (backendProcess) {
    logMessage("Electron", "Killing backend process...");
    try {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(backendProcess.pid), "/f", "/t"], { windowsHide: true });
      } else {
        backendProcess.kill("SIGTERM");
      }
    } catch (e) {
      console.error("[Electron] Error killing backend:", e.message);
    }
    backendProcess = null;
  }

  if (cameraManagerProcess) {
    logMessage("Electron", "Killing camera manager process...");
    try {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(cameraManagerProcess.pid), "/f", "/t"], { windowsHide: true });
      } else {
        cameraManagerProcess.kill("SIGTERM");
      }
    } catch (e) {
      console.error("[Electron] Error killing camera manager:", e.message);
    }
    cameraManagerProcess = null;
  }
}

// ─── Graceful Shutdown ──────────────────────────────────
let isQuitting = false;
async function gracefulShutdown() {
  if (isQuitting) return;
  isQuitting = true;

  logMessage("Electron", "Initiating graceful shutdown...");

  // 1. Kill camera manager
  if (cameraManagerProcess) {
    logMessage("Electron", "Stopping camera manager process...");
    try {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(cameraManagerProcess.pid), "/f", "/t"], { windowsHide: true });
      } else {
        cameraManagerProcess.kill("SIGTERM");
      }
    } catch (e) {
      logMessage("Electron", `Error stopping camera manager: ${e.message}`);
    }
    cameraManagerProcess = null;
  }

  // 2. Kill backend
  if (backendProcess) {
    logMessage("Electron", "Stopping backend process...");
    try {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(backendProcess.pid), "/f", "/t"], { windowsHide: true });
      } else {
        backendProcess.kill("SIGTERM");
      }
    } catch (e) {
      logMessage("Electron", `Error stopping backend: ${e.message}`);
    }
    backendProcess = null;
  }

  // 3. Stop PostgreSQL
  try {
    await postgresManager.stopPostgres(app);
  } catch (e) {
    logMessage("Electron", `Error stopping PostgreSQL: ${e.message}`);
  }

  app.quit();
}

// ─── Startup Prerequisite Validation ────────────────────
//
// Performs lightweight checks before launching bundled services.
// Verifies all required runtime components exist. This prevents
// confusing downstream failures (e.g. PostgreSQL STATUS_DLL_NOT_FOUND)
// by catching missing prerequisites early with clear messages.
//
function validatePrerequisites() {
  const isPackaged = app.isPackaged || process.env.AI_FORCE_RUNTIME === "1";
  if (!isPackaged) {
    logMessage("Electron", "Development mode — skipping prerequisite validation.");
    return { valid: true, errors: [] };
  }

  const errors = [];

  // Resolve runtime root
  let runtimeRoot;
  if (process.env.AI_FORCE_RUNTIME === "1") {
    runtimeRoot = path.join(PROJECT_ROOT, "electron", "runtime-build");
  } else {
    runtimeRoot = path.join(process.resourcesPath, "runtime");
  }

  logMessage("Electron", `Validating prerequisites (runtime: ${runtimeRoot})...`);

  // 1. Runtime folder exists
  if (!fs.existsSync(runtimeRoot)) {
    errors.push(`Runtime folder missing: ${runtimeRoot}`);
  }

  // 2. Python runtime
  const pythonExe = path.join(runtimeRoot, "python", "python.exe");
  if (!fs.existsSync(pythonExe)) {
    errors.push(`Python runtime missing: ${pythonExe}`);
  }

  // 3. PostgreSQL runtime
  const pgBinDir = path.join(runtimeRoot, "postgresql", "bin");
  const pgBinaries = ["postgres.exe", "initdb.exe", "pg_ctl.exe", "pg_isready.exe", "createdb.exe", "psql.exe"];
  if (!fs.existsSync(pgBinDir)) {
    errors.push(`PostgreSQL runtime directory missing: ${pgBinDir}`);
  } else {
    for (const bin of pgBinaries) {
      const binPath = path.join(pgBinDir, bin);
      if (!fs.existsSync(binPath)) {
        errors.push(`PostgreSQL binary missing: ${bin}`);
      }
    }
  }

  // 4. AI model
  const modelPath = path.join(runtimeRoot, "models", "torch", "checkpoints", "20180402-114759-vggface2.pt");
  if (!fs.existsSync(modelPath)) {
    errors.push(`AI model weights missing: ${path.basename(modelPath)}`);
  }

  // 5. Build info metadata
  const buildInfoPath = path.join(runtimeRoot, "build-info.json");
  if (!fs.existsSync(buildInfoPath)) {
    errors.push(`Build info metadata missing: build-info.json. Installation may be corrupted.`);
  } else {
    try {
      const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, "utf8"));
      logMessage("Electron", `Build info: version ${buildInfo.version || "unknown"}, platform ${buildInfo.platform || "unknown"}`);
    } catch (parseErr) {
      errors.push(`Build info metadata is invalid JSON: ${parseErr.message}`);
    }
  }

  // 6. VC++ runtime prerequisite (registry check — fast, no spawning)
  const vcRedistCheck = checkVCRedistInstalled();
  if (!vcRedistCheck.installed) {
    errors.push(
      `Microsoft Visual C++ Redistributable (2015–2022 x64) is not installed.\n` +
      `PostgreSQL requires this runtime to function.\n` +
      `Please reinstall AI Attendance System or install the runtime manually from:\n` +
      `https://aka.ms/vs/17/release/vc_redist.x64.exe`
    );
  } else {
    logMessage("Electron", `VC++ Runtime detected: version ${vcRedistCheck.version}`);
  }

  if (errors.length > 0) {
    logMessage("Electron", `Prerequisite validation FAILED with ${errors.length} error(s).`);
    for (const err of errors) {
      logMessage("Electron", `  MISSING: ${err}`);
    }
    return { valid: false, errors };
  }

  logMessage("Electron", "All prerequisites validated successfully.");
  return { valid: true, errors: [] };
}

/**
 * Check if the Microsoft Visual C++ Redistributable (2015–2022 x64) is installed
 * by reading the Windows registry. This is a lightweight synchronous check.
 *
 * Registry key: HKLM\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64
 * Value: "Installed" (DWORD) = 1
 *
 * Uses /reg:64 flag to explicitly read the native 64-bit registry, avoiding
 * WOW64 redirection if the process runs in a 32-bit context.
 * Compatible with Windows 10 and Windows 11.
 *
 * @returns {{ installed: boolean, version: string }}
 */
function checkVCRedistInstalled() {
  try {
    // Use reg.exe with /reg:64 to query the native 64-bit registry.
    // Without /reg:64, a 32-bit process would read WOW6432Node and miss
    // the VC++ x64 runtime key, causing a false negative.
    const { spawnSync: spSync } = require("child_process");
    const result = spSync("reg", [
      "query",
      "HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\X64",
      "/reg:64"
    ], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 5000,
    });

    if (result.status !== 0) {
      // Key does not exist — runtime not installed
      return { installed: false, version: "" };
    }

    const stdout = result.stdout || "";

    // Check for "Installed" DWORD = 0x1
    const installedMatch = stdout.match(/Installed\s+REG_DWORD\s+0x([0-9a-fA-F]+)/);
    if (!installedMatch || parseInt(installedMatch[1], 16) !== 1) {
      return { installed: false, version: "" };
    }

    // Extract version from the same output (Major, Minor, Bld)
    let version = "unknown";
    const majorMatch = stdout.match(/Major\s+REG_DWORD\s+0x([0-9a-fA-F]+)/);
    const minorMatch = stdout.match(/Minor\s+REG_DWORD\s+0x([0-9a-fA-F]+)/);
    const bldMatch = stdout.match(/Bld\s+REG_DWORD\s+0x([0-9a-fA-F]+)/);
    if (majorMatch && minorMatch) {
      const major = parseInt(majorMatch[1], 16);
      const minor = parseInt(minorMatch[1], 16);
      const bld = bldMatch ? parseInt(bldMatch[1], 16) : 0;
      version = bld ? `${major}.${minor}.${bld}` : `${major}.${minor}`;
    }

    return { installed: true, version };
  } catch (err) {
    logMessage("Electron", `WARNING: VC++ registry check failed: ${err.message}. Assuming installed.`);
    // If we can't check, don't block startup — the actual failure will happen later
    // with proper diagnostics in postgres-manager.js
    return { installed: true, version: "unknown (check failed)" };
  }
}

// ─── App Lifecycle ──────────────────────────────────────
app.whenReady().then(async () => {
  // Show splash while services start
  createSplashWindow();

  // ── Step 0: Prerequisite Validation ───────────────────────
  const prereqResult = validatePrerequisites();
  if (!prereqResult.valid) {
    const errorList = prereqResult.errors.map((e, i) => `${i + 1}. ${e}`).join("\n\n");
    dialog.showErrorBox(
      "Missing Prerequisites",
      "AI Attendance System cannot start because required components are missing:\n\n" +
      errorList + "\n\n" +
      "Please reinstall the application to restore missing components."
    );
    app.quit();
    return;
  }

  // ── STARTUP ORDER (defensive guarantees) ──────────────────
  //
  // 1. PostgreSQL ready  (initdb + start + health check + createdb)
  // 2. Backend starts     (uvicorn spawned)
  // 3. Migrations complete (alembic upgrade head runs in FastAPI startup event)
  // 4. Backend health ready (waitForBackend succeeds — confirms migrations done)
  // 5. Camera manager starts (ONLY after step 4 succeeds)
  //
  // If any step fails, subsequent steps are NOT executed and the app exits.
  // Camera manager MUST NOT start if migrations fail.

  // ── Step 1: PostgreSQL ────────────────────────────────────
  try {
    if (postgresManager.needsLocalPostgres(app)) {
      logMessage("Electron", "Local PostgreSQL provider detected.");
      await postgresManager.initializeDatabase(app);
      postgresManager.startPostgres(app);
      await postgresManager.waitForPostgres(app);
      postgresManager.createDatabase(app);
    } else {
      logMessage("Electron", "External PostgreSQL or SQLite provider detected. Skipping bundled PostgreSQL startup.");
    }
  } catch (err) {
    logMessage("Electron", `PostgreSQL startup failed: ${err.message}`);
    dialog.showErrorBox(
      "Database Startup Error",
      "Failed to initialize or start local database service.\n\n" + err.message
    );
    await postgresManager.stopPostgres(app);
    app.quit();
    return;
  }

  // ── Step 2-4: Backend + Migrations ────────────────────────
  startBackend();

  // waitForBackend() blocks until FastAPI responds to the health check.
  // FastAPI startup events (including alembic migrations) complete BEFORE
  // the server accepts connections, so success here guarantees schema is ready.
  // If migrations fail, the backend process exits and waitForBackend rejects fast.
  try {
    await waitForBackend();
  } catch (err) {
    const diagnosticMessage = getBackendCrashDiagnostics(err.message);
    logMessage("Electron", `Backend startup failed:\n${diagnosticMessage}`);
    dialog.showErrorBox(
      "Startup Error",
      "The backend server failed to start. Please see troubleshooting details below:\n\n" + diagnosticMessage
    );
    killProcesses();
    await postgresManager.stopPostgres(app);
    app.quit();
    return;
  }

  // ── Step 5: Camera Manager (only after migrations succeeded) ──
  logMessage("Electron", "Backend and migrations ready. Starting Camera Manager...");
  startCameraManager();

  // Backend is ready — open main window
  createMainWindow();
});

app.on("window-all-closed", () => {
  gracefulShutdown();
});

app.on("before-quit", (e) => {
  if (!isQuitting) {
    e.preventDefault();
    gracefulShutdown();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
