const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const RUNTIME_BUILD_DIR = path.join(PROJECT_ROOT, 'electron', 'runtime-build');

console.log('--- Installer Output & Size Validation ---');

// Helper to recursively get total size of a directory
function getFolderSize(dirPath) {
  let size = 0;
  if (!fs.existsSync(dirPath)) return 0;
  const stats = fs.statSync(dirPath);
  if (stats.isFile()) return stats.size;
  if (stats.isDirectory()) {
    try {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        size += getFolderSize(path.join(dirPath, file));
      }
    } catch (e) {
      // ignore
    }
  }
  return size;
}

// 1. Scan and print directory sizes
const totalSize = getFolderSize(RUNTIME_BUILD_DIR);
const pythonSize = getFolderSize(path.join(RUNTIME_BUILD_DIR, 'python'));
const postgresSize = getFolderSize(path.join(RUNTIME_BUILD_DIR, 'postgresql'));
const modelSize = getFolderSize(path.join(RUNTIME_BUILD_DIR, 'models'));

console.log(`Runtime-build Total Size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`Python Runtime Size: ${(pythonSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`PostgreSQL Runtime Size: ${(postgresSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`AI Models Size: ${(modelSize / 1024 / 1024).toFixed(2)} MB`);

// 1b. Enforce minimum size thresholds
const MIN_RUNTIME_SIZE_MB = 200;
const MIN_PYTHON_SIZE_MB = 50;
const MIN_POSTGRES_SIZE_MB = 20;
const MIN_MODEL_SIZE_MB = 50;

let failed = false;

if (totalSize / (1024 * 1024) < MIN_RUNTIME_SIZE_MB) {
  console.error(`CRITICAL ERROR: Runtime-build total size (${(totalSize / (1024 * 1024)).toFixed(2)} MB) below minimum ${MIN_RUNTIME_SIZE_MB} MB.`);
  failed = true;
}
if (pythonSize / (1024 * 1024) < MIN_PYTHON_SIZE_MB) {
  console.error(`CRITICAL ERROR: Python runtime size (${(pythonSize / (1024 * 1024)).toFixed(2)} MB) below minimum ${MIN_PYTHON_SIZE_MB} MB.`);
  failed = true;
}
if (postgresSize / (1024 * 1024) < MIN_POSTGRES_SIZE_MB) {
  console.error(`CRITICAL ERROR: PostgreSQL runtime size (${(postgresSize / (1024 * 1024)).toFixed(2)} MB) below minimum ${MIN_POSTGRES_SIZE_MB} MB.`);
  failed = true;
}
if (modelSize / (1024 * 1024) < MIN_MODEL_SIZE_MB) {
  console.error(`CRITICAL ERROR: AI models size (${(modelSize / (1024 * 1024)).toFixed(2)} MB) below minimum ${MIN_MODEL_SIZE_MB} MB.`);
  failed = true;
}

// 2. Scan and print installer files
if (!fs.existsSync(DIST_DIR)) {
  console.error('CRITICAL ERROR: dist/ directory does not exist.');
  process.exit(1);
}

const files = fs.readdirSync(DIST_DIR);
const installers = files.filter(f => f.endsWith('.exe') && f.startsWith('AI Attendance System Setup'));

if (installers.length === 0) {
  console.error('CRITICAL ERROR: No installer executable found in dist/.');
  process.exit(1);
}

for (const installer of installers) {
  const filePath = path.join(DIST_DIR, installer);
  const stats = fs.statSync(filePath);
  console.log(`Installer Filename: ${installer}`);
  console.log(`Installer Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

// 3. Minimum installer size check
const MIN_INSTALLER_SIZE_MB = 100;
for (const installer of installers) {
  const installerPath = path.join(DIST_DIR, installer);
  const installerStats = fs.statSync(installerPath);
  if (installerStats.size / (1024 * 1024) < MIN_INSTALLER_SIZE_MB) {
    console.error(`CRITICAL ERROR: Installer "${installer}" is only ${(installerStats.size / (1024 * 1024)).toFixed(2)} MB (minimum: ${MIN_INSTALLER_SIZE_MB} MB). Build may be incomplete.`);
    failed = true;
  }
}

// 4. Win-unpacked resources validation
const WIN_UNPACKED_DIR = path.join(DIST_DIR, 'win-unpacked');
const UNPACKED_RUNTIME_DIR = path.join(WIN_UNPACKED_DIR, 'resources', 'runtime');

if (fs.existsSync(WIN_UNPACKED_DIR)) {
  console.log('\n--- Win-Unpacked Resources Validation ---');

  const requiredRuntimeDirs = ['python', 'postgresql', 'backend', 'models'];
  for (const dir of requiredRuntimeDirs) {
    const dirPath = path.join(UNPACKED_RUNTIME_DIR, dir);
    if (!fs.existsSync(dirPath)) {
      console.error(`CRITICAL ERROR: Win-unpacked missing runtime directory: runtime/${dir}/`);
      failed = true;
    } else {
      const dirSize = getFolderSize(dirPath);
      console.log(`  runtime/${dir}/: ${(dirSize / (1024 * 1024)).toFixed(2)} MB`);
    }
  }

  const buildInfoPath = path.join(UNPACKED_RUNTIME_DIR, 'build-info.json');
  if (!fs.existsSync(buildInfoPath)) {
    console.error('CRITICAL ERROR: Win-unpacked missing runtime/build-info.json');
    failed = true;
  } else {
    console.log('  build-info.json: present');
  }

  // Verify VC++ Redistributable is packaged in win-unpacked
  const vcRedistPath = path.join(UNPACKED_RUNTIME_DIR, 'tools', 'VC_redist.x64.exe');
  if (!fs.existsSync(vcRedistPath)) {
    console.error('CRITICAL ERROR: Win-unpacked missing runtime/tools/VC_redist.x64.exe');
    failed = true;
  } else {
    const vcRedistSize = fs.statSync(vcRedistPath).size;
    if (vcRedistSize < 10 * 1024 * 1024) {
      console.error(`CRITICAL ERROR: Win-unpacked VC_redist.x64.exe is too small (${(vcRedistSize / 1024 / 1024).toFixed(2)} MB)`);
      failed = true;
    } else {
      console.log(`  VC_redist.x64.exe: ${(vcRedistSize / (1024 * 1024)).toFixed(2)} MB`);
    }

    // Validate PE header on the packaged copy to catch corruption during packaging
    try {
      const fd = fs.openSync(vcRedistPath, 'r');
      const headerBuf = Buffer.alloc(2);
      fs.readSync(fd, headerBuf, 0, 2, 0);
      fs.closeSync(fd);
      if (headerBuf[0] !== 0x4D || headerBuf[1] !== 0x5A) {
        console.error('CRITICAL ERROR: Win-unpacked VC_redist.x64.exe has invalid PE header (corrupted during packaging?)');
        failed = true;
      }
    } catch (peErr) {
      console.error(`CRITICAL ERROR: Failed to validate PE header of win-unpacked VC_redist.x64.exe: ${peErr.message}`);
      failed = true;
    }

    // Verify packaged copy matches source (size and SHA-256 comparison)
    const srcVcRedistPath = path.join(RUNTIME_BUILD_DIR, 'tools', 'VC_redist.x64.exe');
    if (fs.existsSync(srcVcRedistPath)) {
      const srcSize = fs.statSync(srcVcRedistPath).size;
      if (srcSize !== vcRedistSize) {
        console.error(`CRITICAL ERROR: Win-unpacked VC_redist.x64.exe size (${vcRedistSize}) does not match source (${srcSize}). File may be corrupted.`);
        failed = true;
      }

      // Check SHA-256 hash matches the source hash
      const srcHashPath = srcVcRedistPath + '.sha256';
      const destHashPath = vcRedistPath + '.sha256';
      if (fs.existsSync(srcHashPath) && fs.existsSync(destHashPath)) {
        const srcHash = fs.readFileSync(srcHashPath, 'utf8').trim();
        const destHash = fs.readFileSync(destHashPath, 'utf8').trim();
        if (srcHash !== destHash) {
          console.error(`CRITICAL ERROR: Win-unpacked VC_redist.x64.exe.sha256 content does not match source.`);
          failed = true;
        } else {
          // Re-calculate hash on the unpacked copy
          const actualUnpackedHash = crypto.createHash('sha256').update(fs.readFileSync(vcRedistPath)).digest('hex');
          if (actualUnpackedHash !== srcHash) {
            console.error(`CRITICAL ERROR: Unpacked VC_redist.x64.exe SHA-256 (${actualUnpackedHash.substring(0, 16)}...) does not match expected (${srcHash.substring(0, 16)}...).`);
            failed = true;
          } else {
            console.log(`  VC_redist.x64.exe SHA-256 verified: ${actualUnpackedHash.substring(0, 16)}... ✓`);
          }
        }
      } else {
        console.error(`CRITICAL ERROR: VC++ Redistributable SHA-256 hash file missing in source or destination.`);
        failed = true;
      }
    }
  }

  const appAsarPath = path.join(WIN_UNPACKED_DIR, 'resources', 'app.asar');
  if (!fs.existsSync(appAsarPath)) {
    console.error('CRITICAL ERROR: Win-unpacked missing resources/app.asar');
    failed = true;
  } else {
    const asarSize = fs.statSync(appAsarPath).size;
    console.log(`  app.asar: ${(asarSize / (1024 * 1024)).toFixed(2)} MB`);
  }
} else {
  console.warn('WARNING: Win-unpacked directory not found. Skipping resources validation.');
}

if (failed) {
  console.error('\nINSTALLER VALIDATION FAILED.');
  process.exit(1);
}

console.log('\nInstaller generated and validated successfully.');
