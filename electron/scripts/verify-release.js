const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const RUNTIME_BUILD_DIR = path.join(PROJECT_ROOT, 'electron', 'runtime-build');

console.log('--- Final Release Verification ---');

// Helper to recursively walk a directory
function getFilesRecursive(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results.push({ path: fullPath, isDir: true });
      results = results.concat(getFilesRecursive(fullPath));
    } else {
      results.push({ path: fullPath, isDir: false });
    }
  });
  return results;
}

let failed = false;
const errors = [];
const warnings = [];

/**
 * Verify the Authenticode digital signature of a Windows executable.
 * Uses PowerShell Get-AuthenticodeSignature to check:
 *   1. Signature status is "Valid"
 *   2. Signer certificate Subject contains "Microsoft Corporation"
 *
 * @param {string} filePath - Absolute path to the executable
 * @returns {{ valid: boolean, status: string, detail: string }}
 */
function verifyAuthenticodeSignature(filePath) {
  try {
    const psScript = `
      $sig = Get-AuthenticodeSignature -LiteralPath '${filePath.replace(/'/g, "''")}'
      $obj = @{
        Status = $sig.Status.ToString()
        Subject = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { '' }
        Issuer = if ($sig.SignerCertificate) { $sig.SignerCertificate.Issuer } else { '' }
      }
      $obj | ConvertTo-Json -Compress
    `;

    const result = spawnSync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command', psScript
    ], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
    });

    if (result.status !== 0) {
      return {
        valid: false,
        status: 'CheckFailed',
        detail: `PowerShell exited with code ${result.status}: ${(result.stderr || '').trim().substring(0, 200)}`,
      };
    }

    let sigInfo;
    try {
      sigInfo = JSON.parse((result.stdout || '').trim());
    } catch (parseErr) {
      return {
        valid: false,
        status: 'ParseError',
        detail: `Failed to parse PowerShell output: ${(result.stdout || '').substring(0, 200)}`,
      };
    }

    const status = sigInfo.Status || 'Unknown';
    const subject = sigInfo.Subject || '';

    if (status !== 'Valid') {
      return { valid: false, status, detail: `Authenticode status is "${status}" (expected "Valid").` };
    }

    if (!subject.includes('Microsoft Corporation')) {
      return { valid: false, status, detail: `Signer is not Microsoft Corporation. Subject: ${subject}` };
    }

    return { valid: true, status, detail: `Signed by Microsoft Corporation.` };
  } catch (err) {
    return { valid: false, status: 'Exception', detail: `Authenticode check threw: ${err.message}` };
  }
}

// 1. Check directories
const requiredDirs = [
  path.join(RUNTIME_BUILD_DIR, 'python'),
  path.join(RUNTIME_BUILD_DIR, 'postgresql'),
  path.join(RUNTIME_BUILD_DIR, 'backend'),
  path.join(RUNTIME_BUILD_DIR, 'models'),
];

for (const dir of requiredDirs) {
  if (!fs.existsSync(dir)) {
    errors.push(`Directory missing: ${path.relative(PROJECT_ROOT, dir)}`);
    failed = true;
  }
}

// 2. Required binaries
const requiredBinaries = [
  path.join(RUNTIME_BUILD_DIR, 'python', 'python.exe'),
  path.join(RUNTIME_BUILD_DIR, 'postgresql', 'bin', 'postgres.exe'),
  path.join(RUNTIME_BUILD_DIR, 'postgresql', 'bin', 'initdb.exe'),
  path.join(RUNTIME_BUILD_DIR, 'postgresql', 'bin', 'pg_ctl.exe'),
  path.join(RUNTIME_BUILD_DIR, 'postgresql', 'bin', 'pg_dump.exe'),
  path.join(RUNTIME_BUILD_DIR, 'postgresql', 'bin', 'createdb.exe'),
  path.join(RUNTIME_BUILD_DIR, 'postgresql', 'bin', 'psql.exe'),
  path.join(RUNTIME_BUILD_DIR, 'postgresql', 'bin', 'pg_isready.exe'),
];

for (const binary of requiredBinaries) {
  if (!fs.existsSync(binary)) {
    errors.push(`Binary missing: ${path.relative(PROJECT_ROOT, binary)}`);
    failed = true;
  }
}

// 3. AI model check
const modelPath = path.join(RUNTIME_BUILD_DIR, 'models', 'torch', 'checkpoints', '20180402-114759-vggface2.pt');
if (!fs.existsSync(modelPath)) {
  errors.push(`AI model missing: ${path.relative(PROJECT_ROOT, modelPath)}`);
  failed = true;
} else {
  const stats = fs.statSync(modelPath);
  if (stats.size <= 50 * 1024 * 1024) {
    errors.push(`AI model is incomplete. Size is only ${(stats.size / 1024 / 1024).toFixed(2)} MB (expected > 50 MB)`);
    failed = true;
  }
}

// 3b. AI model SHA-256 integrity check
const modelHashPath = modelPath + '.sha256';
if (fs.existsSync(modelPath) && fs.existsSync(modelHashPath)) {
  const expectedHash = fs.readFileSync(modelHashPath, 'utf8').trim();
  const actualHash = crypto.createHash('sha256').update(fs.readFileSync(modelPath)).digest('hex');
  if (actualHash !== expectedHash) {
    errors.push(`AI model SHA-256 mismatch! Expected: ${expectedHash}, Got: ${actualHash}`);
    failed = true;
  } else {
    console.log(`AI model SHA-256 verified: ${actualHash.substring(0, 16)}...`);
  }
} else if (fs.existsSync(modelPath) && !fs.existsSync(modelHashPath)) {
  warnings.push(`AI model SHA-256 hash file missing: ${path.relative(PROJECT_ROOT, modelHashPath)}. Integrity cannot be verified.`);
}

// 4 & 5. Walk the directory to perform security and leakage checks
const allItems = getFilesRecursive(RUNTIME_BUILD_DIR);
const ignoredExtensions = ['.exe', '.dll', '.pyd', '.pt', '.db', '.png', '.ico', '.zip', '.pyc'];

for (const item of allItems) {
  const relPath = path.relative(RUNTIME_BUILD_DIR, item.path);
  const normalizedRelPath = relPath.replace(/\\/g, '/');

  // A. Security Check: .env files
  if (path.basename(item.path) === '.env') {
    errors.push(`Security check failed: .env file found at ${relPath}`);
    failed = true;
  }

  // B. Security Check: __pycache__ folders or files
  if (normalizedRelPath.includes('__pycache__')) {
    errors.push(`Security check failed: __pycache__ directory/file found at ${relPath}`);
    failed = true;
  }

  // C. Security Check: *.pyc files
  if (item.path.endsWith('.pyc')) {
    if (normalizedRelPath.startsWith('backend/')) {
      errors.push(`Security check failed: .pyc file found in backend at ${relPath}`);
      failed = true;
    } else if (normalizedRelPath.startsWith('python/')) {
      warnings.push(`Warning: .pyc file found in Python runtime: ${relPath}`);
    }
  }

  // D. Leakage Check
  if (!item.isDir && (normalizedRelPath.startsWith('backend/') || normalizedRelPath === 'build-info.json')) {
    const ext = path.extname(item.path).toLowerCase();
    if (!ignoredExtensions.includes(ext)) {
      try {
        const content = fs.readFileSync(item.path, 'utf8');
        const normalizedContent = content.replace(/\\/g, '/').toLowerCase();

        if (normalizedContent.includes('c:/users/')) {
          errors.push(`Leakage check failed: "C:\\Users\\" path pattern found in ${relPath}`);
          failed = true;
        }
        if (normalizedContent.includes('attendance-system/venv')) {
          errors.push(`Leakage check failed: "attendance-system\\venv" path pattern found in ${relPath}`);
          failed = true;
        }
        if (normalizedContent.includes('program files/postgresql')) {
          errors.push(`Leakage check failed: "Program Files\\PostgreSQL" path pattern found in ${relPath}`);
          failed = true;
        }
      } catch (err) {
        // Skip files that cannot be decoded as utf8 text (e.g. non-ascii binaries with non-standard extensions)
      }
    }
  }
}

// 6. Build info existence check
const buildInfoPath = path.join(RUNTIME_BUILD_DIR, 'build-info.json');
if (!fs.existsSync(buildInfoPath)) {
  errors.push(`Build info file missing: ${path.relative(PROJECT_ROOT, buildInfoPath)}`);
  failed = true;
}

// 7. VC++ Redistributable prerequisite check
const vcRedistPath = path.join(RUNTIME_BUILD_DIR, 'tools', 'VC_redist.x64.exe');
if (!fs.existsSync(vcRedistPath)) {
  errors.push(`VC++ Redistributable missing: ${path.relative(PROJECT_ROOT, vcRedistPath)}`);
  errors.push('Run "npm run package:prerequisites" to download and bundle the Microsoft Visual C++ Redistributable.');
  failed = true;
} else {
  const vcRedistStats = fs.statSync(vcRedistPath);
  const vcRedistSizeMB = vcRedistStats.size / (1024 * 1024);

  // 7a. Minimum size check — the real installer is ~24 MB
  if (vcRedistStats.size < 10 * 1024 * 1024) {
    errors.push(`VC++ Redistributable is too small (${vcRedistSizeMB.toFixed(2)} MB). Expected at least 10 MB. File may be corrupted or incomplete.`);
    failed = true;
  } else {
    console.log(`VC++ Redistributable size: ${vcRedistSizeMB.toFixed(2)} MB`);
  }

  // 7b. Validate PE header (MZ magic bytes)
  try {
    const fd = fs.openSync(vcRedistPath, 'r');
    const headerBuf = Buffer.alloc(2);
    fs.readSync(fd, headerBuf, 0, 2, 0);
    fs.closeSync(fd);
    if (headerBuf[0] !== 0x4D || headerBuf[1] !== 0x5A) {
      errors.push(`VC++ Redistributable is not a valid Windows executable (missing MZ header).`);
      failed = true;
    } else {
      console.log(`VC++ Redistributable PE header: valid`);
    }
  } catch (readErr) {
    errors.push(`Failed to read VC++ Redistributable for validation: ${readErr.message}`);
    failed = true;
  }

  // 7c. Authenticode digital signature verification
  const sigResult = verifyAuthenticodeSignature(vcRedistPath);
  if (sigResult.valid) {
    console.log(`VC++ Redistributable Authenticode: ${sigResult.status} (Microsoft Corporation)`);
  } else {
    errors.push(`VC++ Redistributable Authenticode signature verification failed: ${sigResult.detail}`);
    failed = true;
  }

  // 7d. SHA-256 integrity check
  const vcRedistHashPath = vcRedistPath + '.sha256';
  if (fs.existsSync(vcRedistPath) && fs.existsSync(vcRedistHashPath)) {
    const expectedHash = fs.readFileSync(vcRedistHashPath, 'utf8').trim();
    const actualHash = crypto.createHash('sha256').update(fs.readFileSync(vcRedistPath)).digest('hex');
    if (actualHash !== expectedHash) {
      errors.push(`VC++ Redistributable SHA-256 mismatch! Expected: ${expectedHash}, Got: ${actualHash}`);
      failed = true;
    } else {
      console.log(`VC++ Redistributable SHA-256 verified: ${actualHash.substring(0, 16)}...`);
    }
  } else if (fs.existsSync(vcRedistPath) && !fs.existsSync(vcRedistHashPath)) {
    errors.push(`VC++ Redistributable SHA-256 hash file missing: ${path.relative(PROJECT_ROOT, vcRedistHashPath)}`);
    failed = true;
  }
}

// 7b. NSIS installer script check
const nsisInstallerPath = path.join(PROJECT_ROOT, 'electron', 'prerequisites', 'installer.nsh');
const nsisVcredistPath = path.join(PROJECT_ROOT, 'electron', 'prerequisites', 'vcredist-prerequisites.nsh');
if (!fs.existsSync(nsisInstallerPath)) {
  errors.push(`NSIS installer hook missing: electron/prerequisites/installer.nsh`);
  failed = true;
}
if (!fs.existsSync(nsisVcredistPath)) {
  errors.push(`NSIS VC++ prerequisite script missing: electron/prerequisites/vcredist-prerequisites.nsh`);
  failed = true;
}

// 8. Frontend build output validation
const frontendDistDir = path.join(PROJECT_ROOT, 'frontend', 'dist');
const frontendIndexPath = path.join(frontendDistDir, 'index.html');
if (!fs.existsSync(frontendDistDir)) {
  errors.push('Frontend dist/ directory does not exist. Run "npm run build:frontend" first.');
  failed = true;
} else if (!fs.existsSync(frontendIndexPath)) {
  errors.push('Frontend dist/index.html is missing. Frontend build may have failed.');
  failed = true;
} else {
  const indexStats = fs.statSync(frontendIndexPath);
  if (indexStats.size < 100) {
    errors.push(`Frontend dist/index.html is suspiciously small (${indexStats.size} bytes). Build may be incomplete.`);
    failed = true;
  } else {
    console.log(`Frontend dist/index.html verified (${(indexStats.size / 1024).toFixed(1)} KB).`);
  }
}

// Print results
if (warnings.length > 0) {
  console.log('\n--- Warnings ---');
  warnings.forEach(w => console.log(w));
}

if (failed) {
  console.error('\n--- Verification Failed ---');
  errors.forEach(e => console.error(`[ERROR] ${e}`));
  process.exit(1);
} else {
  console.log('\nRELEASE_OK');
  process.exit(0);
}
