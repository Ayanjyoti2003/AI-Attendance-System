# Production Runtime Packaging Architecture

This document describes the runtime directory structure, development mode vs. production mode detection, and the path resolution rules for the AI Attendance System application packaging.

## 1. Packaged Runtime Directory Structure

The final production installation layout has the following structure inside the application directory:

```
AI Attendance System/
    AI Attendance System.exe
    resources/
        app.asar                <-- Packaged Electron main/renderer code
        runtime/
            backend/
                backend/        <-- Fast API codebase (excluding dev files)
                face_service/   <-- Face Recognition system
                alembic.ini     <-- Database migration configuration
                requirements.txt <-- Bundling requirements list
            python/             <-- Bundled Python virtual environment
            models/
                torch/
                    checkpoints/
                        20180402-114759-vggface2.pt <-- FaceNet model weights
            tools/              <-- System diagnostic tools and installers
                VC_redist.x64.exe   <-- Microsoft Visual C++ Redistributable (2015-2022 x64)
```

## 2. Runtime Mode Detection & Simulation

Mode detection is explicitly decoupled from directory layouts or file heuristics (like checking if the `venv` folder exists) to prevent false positives in developer configurations.

Mode detection is driven by the environment variable:

```bash
AI_ATTENDANCE_PACKAGED
```

* **Development Mode (`AI_ATTENDANCE_PACKAGED=0`)**: Spawns Python using standard Virtual Environment interpreters (`venv/Scripts/python.exe` or `venv/bin/python`).
* **Production Mode (`AI_ATTENDANCE_PACKAGED=1`)**: Spawns python using the bundled Python installation path under `resources/runtime/python/python.exe`.

This variable is injected by Electron's `main.js` when spawning backend or camera manager processes.

### Packaged Runtime Simulation Mode

To test the bundled Python runtime behavior in a development environment without building the final installer:

```bash
# On Windows PowerShell
$env:AI_FORCE_RUNTIME="1"
npm run electron
```

When `AI_FORCE_RUNTIME=1` is set:
* Electron spawns the backend and camera manager using `electron/runtime-build/python/python.exe` instead of the standard `venv` Python.
* Path isolation settings are applied.
* The backend CWD is simulated at `electron/runtime-build/backend`.

---

## 3. Python Runtime Bundling & Dependency Optimization

The Python runtime builder script (`electron/scripts/build-python-runtime.js`) packages the Python environment.

### Bundling Steps:
1. Locates the active virtual environment (`venv/`) and automatically resolves the base Python installation directory (from `venv/pyvenv.cfg` or fallback `sys.base_prefix`).
2. Copies core Python interpreter binaries (`python.exe`, `python311.dll`, etc.) and system DLLs.
3. Copies core Python libraries (`Lib/`) and `site-packages` from the venv.
4. Performs size optimization by filtering out non-essential files.

### Optimization & Cleanup Rules:
* **Excluded**: `__pycache__/`, `*.pyc`, `*.pyo`, and `test/`/`tests/`/`testing/` directories.
* **Kept Intact**: Python package metadata (like `*.dist-info/` and `*.egg-info/` directories and their `RECORD` files) is preserved to keep imports functional.
* **Special Cases**: Directories named `testing` inside `torch` and `numpy` (such as `torch/testing` and `numpy/testing`) are retained because they are imported at runtime by the packages' autograd/core modules.

The script produces a size report in `runtime-size-report.txt` showing the overall bundle size and a breakdown of the largest packages.

---

## 4. Python Path Isolation

To prevent the bundled Python runtime from loading libraries from the host system's global Python installation or user-local packages, the spawned processes are isolated at startup in `main.js` (under production or simulation mode):

* `PYTHONNOUSERSITE=1` is injected into the environment (instructs Python to ignore user-level site-packages).
* `PYTHONPATH` is explicitly overridden to point to the backend runtime location (e.g. `resources/runtime/backend` in production, or `electron/runtime-build/backend` in simulation).
* `PYTHONPATH` in the parent environment is cleared/isolated.

---

## 5. Verification

The runtime verification script (`electron/scripts/test-python-runtime.js`) ensures the packaged environment is fully functional.

### Test Coverage:
1. **Verification Command**: Runs `python.exe -m uvicorn --help` using the bundled python to ensure console module execution functions.
2. **Native Dependency Imports**: Spawns the bundled interpreter under isolated environment conditions and verifies that all core packages import successfully:
   * `fastapi`
   * `sqlalchemy`
   * `cv2`
   * `torch`
   * `torchvision`
   * `facenet_pytorch`
   * `numpy`
   * `multiprocessing`
3. **OpenCV Native Check**: Instantiates a native image object matrix using `cv2.rectangle` and `numpy.zeros`.
4. **Torch Tensor Check**: Runs a tensor multiplication operation.
5. **Multiprocessing Check**: Checks CPU cores availability.

### How to Run:
```bash
# Build the Python runtime folder
npm run build:python-runtime

# Verify imports and console execution
npm run verify:python-runtime
```
Expected output upon success: `PYTHON_RUNTIME_OK`.

---

## 6. Separation of User Data

No user-generated files or configuration databases are stored in the installation directory. This prevents permission errors on Windows (where `Program Files` is read-only).

* **ProgramData / Data Root**:
  * Development: `<project_root>/data/`
  * Production: `C:\ProgramData\AI Attendance System\`
* **Config Location**: `<data_root>\config\app_config.json`
* **Embeddings Location**: `<data_root>\employees\*.npy`
* **Logs Location**: `<data_root>\logs\*.log`
* **Backups Location**: `<data_root>\backups\*.zip`

---

## 7. Offline Face Recognition Model Packaging & Validation

To enable the application to run completely offline without requiring internet access or looking up models in host-level developer folders, the FaceNet weights model is packaged directly as an application asset.

### AI Model Location:
In production, the FaceNet model weights (`20180402-114759-vggface2.pt`) are loaded from:
```
resources/runtime/models/torch/checkpoints/20180402-114759-vggface2.pt
```

### Packaging Process:
1. Run face recognition at least once in development mode so that the weight file is downloaded from the internet to your local user cache (`%USERPROFILE%/.cache/torch/checkpoints` on Windows, or `~/.cache/torch/checkpoints` on Linux/macOS).
2. Run the packaging command:
   ```bash
   npm run package:models
   ```
   This executes `electron/scripts/package-ai-models.js`, which locates the weights file, validates it (must be exactly `20180402-114759-vggface2.pt`, not `.partial`, and size > 50 MB), and copies it to `electron/runtime-build/models/torch/checkpoints/`.

### Offline Safety & Load Enforcement:
- The centralized helper `backend.runtime.validate_ai_model()` is called before `facenet_pytorch` or `torch` is imported or initialized in `face_service/camera_worker.py` and `face_service/embedding_utils.py`.
- If `AI_ATTENDANCE_PACKAGED=1` and the model file does not exist under `TORCH_HOME/checkpoints/`, a `RuntimeError` is raised immediately:
  `"Bundled FaceNet model missing. Runtime installation corrupted."`
  This prevents the library from attempting to make internet requests to download the missing weights.

### Troubleshooting Missing Models:
If the application crashes at startup or during face recognition with the corruption error:
- Verify that `npm run package:models` was successfully run before packaging.
- Check that `resources/runtime/models/torch/checkpoints/20180402-114759-vggface2.pt` exists and is over 50 MB.
- In development, run face recognition once with internet access to allow `facenet_pytorch` to download the model into the default user cache.

---

## 8. PostgreSQL Runtime Bundling & Lifecycle

To enable the application to run completely offline without requiring the customer to install PostgreSQL separately, the PostgreSQL database engine binaries are packaged and managed directly by the desktop application.

### PostgreSQL Binary Location
In production, the PostgreSQL binaries are located at:
```
resources/runtime/postgresql/
```
This directory contains `bin/`, `lib/`, and `share/` subdirectories. Specifically, the following required binaries are verified during packaging and runtime:
- `postgres.exe` (main server process)
- `initdb.exe` (database cluster initialization)
- `pg_ctl.exe` (lifecycle controller: starts/stops the server)
- `createdb.exe` (utility to create new databases)
- `pg_dump.exe` (backup utility)
- `psql.exe` (interactive terminal and restore utility)
- `pg_isready.exe` (connection check utility)

### Database Storage Location
User data is stored outside the application installation folder to ensure compliance with Windows write permissions:
```
C:\ProgramData\AI Attendance System\database\postgres-data\
```
> [!WARNING]
> Uninstalling the application does not automatically delete this directory to prevent accidental data loss.

### First-Launch Initialization
On the first application launch with the `local_postgres` provider:
1. Electron detects that the `postgres-data` directory is missing.
2. It executes `initdb.exe` to create the database cluster using `attendance_admin` as the superuser.
3. A cryptographically secure random 24-character password is generated for the superuser.
4. Electron calls `backend.config_cli` using the bundled Python runtime to validate and encrypt these credentials, updating `app_config.json`.
5. Access configuration (`pg_hba.conf` and `postgresql.conf`) is updated to listen only on localhost (`127.0.0.1`) and enforce password authentication.
6. The database `attendance` is created using `createdb.exe`.

### Port Assignment
Bundled PostgreSQL runs on port `54329` by default. This avoids port conflicts if the target computer already has a system-level PostgreSQL instance running on the standard port `5432`.

### Lifecycle Management
The startup and shutdown sequence is fully managed by Electron:
* **Startup**: Splash Screen → PostgreSQL Ready (`pg_isready` health check) → Backend Server Start → Alembic Migrations Apply → Camera Manager Start → Frontend Load.
* **Shutdown**: Camera Manager Stop → FastAPI Backend Stop → Graceful PostgreSQL Shutdown (`pg_ctl stop -m fast`). A fallback process termination (PID tree kill) is executed if shutdown takes longer than 15 seconds.

### Troubleshooting & Diagnostics
* **Corrupted Data Directory**: If the `postgres-data` directory exists but `PG_VERSION` is missing, the manager automatically renames the directory to `postgres-data-corrupted-<timestamp>` and initializes a clean database to prevent startup hangs.
* **Port Conflict**: If port `54329` is already in use, the server will fail to start. Resolve by identifying and terminating the conflicting process or changing the database port in `app_config.json`.
* **Manual Access**: To connect to the database manually using the bundled client tools, retrieve the generated credentials from `app_config.json` and run:
  ```cmd
  resources\runtime\postgresql\bin\psql.exe -h 127.0.0.1 -p 54329 -U attendance_admin -d attendance
  ```

---

## 9. Microsoft Visual C++ Redistributable Prerequisite

The bundled PostgreSQL binaries require the Microsoft Visual C++ Redistributable (2015–2022 x64) runtime. The installer automatically detects whether this runtime is present and installs it silently when necessary.

### Bundled Prerequisite Location
The official Microsoft `VC_redist.x64.exe` installer is packaged at:
```
resources/runtime/tools/VC_redist.x64.exe
```

### Packaging Process
1. Run the prerequisite packaging command:
   ```bash
   npm run package:prerequisites
   ```
   This executes `electron/scripts/package-prerequisites.js`, which:
   - Checks if `electron/prerequisites/VC_redist.x64.exe` already exists locally
   - Validates the cached file (minimum size >10 MB, valid PE header, Authenticode digital signature)
   - If cached file passes all validation, reuses it without downloading (enables offline release builds)
   - Downloads the official Microsoft redistributable from `https://aka.ms/vs/17/release/vc_redist.x64.exe` only if the cached file is missing or fails validation
   - Validates the downloaded file (PE header, size, Authenticode signature — must be signed by Microsoft Corporation)
   - Copies the validated installer to `electron/runtime-build/tools/VC_redist.x64.exe`

2. The `electron/prerequisites/` directory also contains the NSIS installer scripts:
   - `installer.nsh` — Hooks into electron-builder's NSIS customInit macro
   - `vcredist-prerequisites.nsh` — VC++ detection and silent installation logic

> [!TIP]
> Once `electron/prerequisites/VC_redist.x64.exe` is cached after the first download, subsequent `npm run release` invocations will reuse the cached file, enabling completely offline release builds.

### Installer Behavior

#### Detection (Registry-Based)
The NSIS installer checks the Windows registry key:
```
HKLM\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64
```
Value: `Installed` (DWORD) = `1`
This is more reliable than checking for individual DLL files and verifies the official installed runtime.

On 64-bit Windows, `SetRegView 64` is applied to read the native 64-bit registry view. This is critical because NSIS is a 32-bit installer — without this, Windows WOW64 redirection would cause reads from `WOW6432Node`, producing false negatives (runtime appears missing when it is actually installed). Compatible with Windows 10 and Windows 11.

#### Already Installed
If the VC++ runtime is detected:
- The installer logs "Visual C++ Runtime detected" with the version number
- Prerequisite installation is skipped
- Normal application installation continues immediately
- No user interaction required

#### Not Installed
If the VC++ runtime is missing:
1. The bundled `VC_redist.x64.exe` is extracted to a temporary directory
2. It is executed silently with `/install /quiet /norestart` switches
3. The installer waits for completion
4. On success (exit code 0 or 3010): installation continues
5. On failure: installation aborts with a clear error message directing the user to install the runtime manually

#### Supported Exit Codes
| Code | Meaning | Action |
|------|---------|--------|
| 0 | Success | Continue |
| 1638 | Another version already installed | Continue (treated as success) |
| 3010 | Success, reboot may be required | Continue |
| 5100 | Newer version already installed | Continue (treated as success) |
| Other | Failure | Abort with error dialog |

### User Experience

**Fresh machine (no VC++ runtime):**
```
Installing AI Attendance System...
Checking prerequisites...
Microsoft Visual C++ Runtime not detected.
Installing Microsoft Visual C++ Redistributable...
Installation successful.
Installing AI Attendance System...
Installation complete.
```

**Existing machine (VC++ already installed):**
```
Installing AI Attendance System...
Checking prerequisites...
Visual C++ Runtime detected (version 14.x).
Skipping prerequisite installation.
Installing AI Attendance System...
Installation complete.
```

> [!IMPORTANT]
> The official Microsoft redistributable installer is used. Individual runtime DLLs (e.g., `VCRUNTIME140.dll`, `MSVCP140.dll`) are NOT manually bundled or copied.

---

## 10. Startup Prerequisite Validation

Before launching any bundled services, the Electron startup sequence performs a lightweight prerequisite validation. This catches missing components early and presents clear error messages instead of allowing confusing downstream failures.

### Validated Components
1. **Runtime folder** — The `resources/runtime/` directory exists
2. **Python runtime** — `python/python.exe` is present
3. **PostgreSQL runtime** — All required binaries exist in `postgresql/bin/`
4. **AI model** — FaceNet weights file exists in `models/torch/checkpoints/`
5. **Build info** — `build-info.json` exists and contains valid JSON
6. **VC++ Runtime** — Registry check confirms the Microsoft Visual C++ Redistributable is installed

### Behavior
- In **development mode**: Validation is skipped entirely
- In **production/simulation mode**: All components are checked before any service starts
- If any component is missing: A descriptive error dialog lists all missing prerequisites
- Validation is designed to be fast (file existence checks + one registry query)

### VC++ Runtime Registry Check
The application uses `reg.exe` with the `/reg:64` flag to query the native 64-bit Windows registry synchronously:
```
reg query "HKLM\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64" /reg:64
```
The `/reg:64` flag is critical: without it, a process running in a 32-bit context would read from `WOW6432Node` instead of the native 64-bit registry, causing a false negative. This check is fast (~5ms) and does not spawn any heavy processes.

> [!NOTE]
> If the registry check fails (e.g., permissions issues), the application does NOT block startup. The VC++ runtime absence will be caught later by postgres-manager.js with detailed diagnostics.

---

## 11. Enhanced PostgreSQL Startup Diagnostics

When PostgreSQL fails to start, the application now performs root-cause analysis before reporting the error. This replaces generic error messages with actionable diagnostics.

### Diagnostic Information
Every PostgreSQL startup failure now includes:
- PostgreSQL version
- Executable path
- Configured port
- Data directory
- Exit code and signal
- Buffered startup logs (last 100 lines)
- pg_isready output (if applicable)

### VC++ Runtime Missing Detection
If the failure is consistent with a missing Microsoft Visual C++ Runtime, the diagnostics engine detects this automatically by checking:
1. **Exit code**: `STATUS_DLL_NOT_FOUND` (0xC0000135 / -1073741515)
2. **Error output**: References to known VC++ DLLs (`VCRUNTIME140.dll`, `MSVCP140.dll`, `VCRUNTIME140_1.dll`, etc.)
3. **Generic patterns**: `status_dll_not_found`, `0xc0000135`, `dll was not found`

When detected, the error message explicitly identifies the root cause:
```
════════════════════════════════════════════════════════════════
  MISSING PREREQUISITE: Microsoft Visual C++ Runtime
════════════════════════════════════════════════════════════════

PostgreSQL cannot start because the required Microsoft runtime
libraries are unavailable on this system.

Required: Microsoft Visual C++ Redistributable (2015–2022 x64)

To resolve this issue:
  1. Reinstall AI Attendance System (the installer will
     automatically install the required runtime), or
  2. Download and install the runtime manually from:
     https://aka.ms/vs/17/release/vc_redist.x64.exe
════════════════════════════════════════════════════════════════
```

---

## 12. Final Release Build & Installer Generation

To build and package the production installer, use the final release command pipeline:

```bash
npm run release
```

This single command triggers the complete sequence:
1. **Frontend compilation**: Builds Vite React frontend.
2. **Runtime directory reset**: Cleans and prepares `electron/runtime-build`.
3. **Python runtime packaging**: Copies base interpreter and dynamic DLLs, site-packages, and core libs.
4. **Offline AI model packaging**: Copies FaceNet weights (`20180402-114759-vggface2.pt`).
5. **PostgreSQL runtime packaging**: Copies local PostgreSQL binaries.
6. **Prerequisite packaging**: Downloads and bundles the Microsoft Visual C++ Redistributable.
7. **Metadata generation**: Writes version, platform, and component flags to `electron/runtime-build/build-info.json`.
8. **Release verification**: Validates that all folders, binaries, model weights, VC++ redistributable, NSIS scripts, and build-info files exist, are of correct size, contain no security leaks (`.env` or `__pycache__`), and do not leak developer machine paths.
9. **App packaging**: Bundles Electron using `electron-builder` with maximum compression into a final executable setup. The NSIS installer includes custom prerequisite detection logic.
10. **Installer verification**: Scans output directory and displays file and component sizes, including VC++ redistributable.

### Expected Output Location
The compiled installer is written to the `dist/` directory:
```
dist/
  AI Attendance System Setup <version>.exe
```

### Runtime Layout Inside Installed Application
Inside the installed application directory (resolvable via `process.resourcesPath` inside Electron), the runtime components are located at:
```
resources/runtime/python/
resources/runtime/postgresql/
resources/runtime/backend/
resources/runtime/models/
resources/runtime/tools/VC_redist.x64.exe
```

### Production User Data Location
All application state, user-created settings, configurations, database clusters, embeddings, logs, and backups are stored outside the installation folder to ensure read/write safety:
```
C:\ProgramData\AI Attendance System\
```
The installer/uninstaller does NOT remove this directory to prevent accidental data loss.


