/**
 * package-prerequisites.js
 *
 * Downloads the official Microsoft Visual C++ Redistributable (2015–2022 x64)
 * installer and places it in the runtime-build/tools/ directory for inclusion
 * in the production installer.
 *
 * The VC++ runtime is required by bundled PostgreSQL binaries.
 *
 * Usage:
 *   npm run package:prerequisites
 *
 * This script:
 *   1. Checks if VC_redist.x64.exe already exists in electron/prerequisites/
 *   2. Validates the cached file (PE header, size, Authenticode digital signature)
 *   3. If invalid or missing, downloads from the official Microsoft URL
 *   4. Validates the downloaded file (PE header, size, Authenticode)
 *   5. Copies the validated installer to electron/runtime-build/tools/
 *
 * Offline-friendly: Once the redistributable is cached locally in
 * electron/prerequisites/, subsequent builds will reuse it without
 * downloading again, enabling fully offline release builds.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const PREREQUISITES_DIR = path.join(PROJECT_ROOT, 'electron', 'prerequisites');
const RUNTIME_TOOLS_DIR = path.join(PROJECT_ROOT, 'electron', 'runtime-build', 'tools');

const VC_REDIST_FILENAME = 'VC_redist.x64.exe';
const VC_REDIST_LOCAL_PATH = path.join(PREREQUISITES_DIR, VC_REDIST_FILENAME);
const VC_REDIST_LOCAL_HASH_PATH = VC_REDIST_LOCAL_PATH + '.sha256';
const VC_REDIST_DEST_PATH = path.join(RUNTIME_TOOLS_DIR, VC_REDIST_FILENAME);
const VC_REDIST_DEST_HASH_PATH = VC_REDIST_DEST_PATH + '.sha256';

// Official Microsoft download URL for VC++ 2015-2022 x64 Redistributable
const VC_REDIST_URL = 'https://aka.ms/vs/17/release/vc_redist.x64.exe';

// Minimum expected file size (the real installer is ~24 MB)
const MIN_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

console.log('--- Prerequisite Packaging: Microsoft Visual C++ Redistributable ---');

// ─── Validation Helpers ─────────────────────────────────────────

/**
 * Compute the SHA-256 hash of a file.
 */
function computeFileSha256(filePath) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  } catch (err) {
    console.log(`  WARNING: Failed to compute SHA-256 hash: ${err.message}`);
    return '';
  }
}

/**
 * Validate that a file is a valid Windows PE executable (MZ header).
 */
function validatePEHeader(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(2);
    fs.readSync(fd, buffer, 0, 2, 0);
    fs.closeSync(fd);
    return buffer[0] === 0x4D && buffer[1] === 0x5A; // 'MZ'
  } catch (err) {
    console.log(`  WARNING: PE header check failed: ${err.message}`);
    return false;
  }
}

/**
 * Validate the Authenticode digital signature of an executable using
 * PowerShell's Get-AuthenticodeSignature cmdlet.
 *
 * Verifies:
 *   1. Signature status is "Valid"
 *   2. Signer certificate Subject contains "Microsoft Corporation"
 *
 * @param {string} filePath - Absolute path to the executable
 * @returns {{ valid: boolean, status: string, signer: string, detail: string }}
 */
function validateAuthenticodeSignature(filePath) {
  try {
    // Use PowerShell to check Authenticode signature
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
        signer: '',
        detail: `PowerShell exited with code ${result.status}: ${(result.stderr || '').trim()}`,
      };
    }

    const output = (result.stdout || '').trim();
    let sigInfo;
    try {
      sigInfo = JSON.parse(output);
    } catch (parseErr) {
      return {
        valid: false,
        status: 'ParseError',
        signer: '',
        detail: `Failed to parse PowerShell output: ${output.substring(0, 200)}`,
      };
    }

    const status = sigInfo.Status || 'Unknown';
    const subject = sigInfo.Subject || '';
    const issuer = sigInfo.Issuer || '';

    // Check signature is valid
    if (status !== 'Valid') {
      return {
        valid: false,
        status,
        signer: subject,
        detail: `Authenticode signature status is "${status}" (expected "Valid").`,
      };
    }

    // Check signer is Microsoft Corporation
    if (!subject.includes('Microsoft Corporation')) {
      return {
        valid: false,
        status,
        signer: subject,
        detail: `Signer is not Microsoft Corporation. Subject: ${subject}`,
      };
    }

    return {
      valid: true,
      status,
      signer: subject,
      detail: `Signed by Microsoft Corporation. Issuer: ${issuer}`,
    };
  } catch (err) {
    return {
      valid: false,
      status: 'Exception',
      signer: '',
      detail: `Authenticode check threw: ${err.message}`,
    };
  }
}

/**
 * Run all validation checks on a VC_redist.x64.exe file.
 *
 * @param {string} filePath - Path to the executable
 * @param {string} label - Label for log messages (e.g. "Cached", "Downloaded")
 * @returns {{ valid: boolean, reasons: string[] }}
 */
function validateVCRedist(filePath, label) {
  const reasons = [];

  // 1. File exists
  if (!fs.existsSync(filePath)) {
    return { valid: false, reasons: [`${label} file does not exist: ${filePath}`] };
  }

  // 2. Minimum size
  const stats = fs.statSync(filePath);
  const sizeMB = stats.size / (1024 * 1024);
  if (stats.size < MIN_FILE_SIZE_BYTES) {
    reasons.push(`${label} file is too small (${sizeMB.toFixed(2)} MB). Expected at least ${MIN_FILE_SIZE_BYTES / (1024 * 1024)} MB.`);
  } else {
    console.log(`  ${label} file size: ${sizeMB.toFixed(2)} MB ✓`);
  }

  // 3. PE header
  if (!validatePEHeader(filePath)) {
    reasons.push(`${label} file is not a valid Windows executable (missing MZ header).`);
  } else {
    console.log(`  ${label} PE header: valid ✓`);
  }

  // 4. Authenticode digital signature
  console.log(`  Verifying Authenticode digital signature...`);
  const sigResult = validateAuthenticodeSignature(filePath);
  if (sigResult.valid) {
    console.log(`  ${label} Authenticode signature: ${sigResult.status} ✓`);
    console.log(`  ${label} signer: Microsoft Corporation ✓`);
  } else {
    reasons.push(`${label} Authenticode signature validation failed: ${sigResult.detail}`);
  }

  return { valid: reasons.length === 0, reasons };
}

// ─── Download ───────────────────────────────────────────────────

/**
 * Follow redirects and download a file from a URL.
 */
function downloadFile(url, destPath, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Too many redirects'));
    }

    const protocol = url.startsWith('https') ? https : http;

    protocol.get(url, { headers: { 'User-Agent': 'AI-Attendance-Builder/1.0' } }, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        const redirectUrl = response.headers.location;
        console.log(`  Redirecting to: ${redirectUrl.substring(0, 80)}...`);
        response.resume(); // Consume the response to free up memory
        return downloadFile(redirectUrl, destPath, maxRedirects - 1).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error(`HTTP ${response.statusCode} downloading ${url}`));
      }

      const contentLength = parseInt(response.headers['content-length'], 10);
      if (contentLength) {
        console.log(`  Download size: ${(contentLength / 1024 / 1024).toFixed(2)} MB`);
      }

      const file = fs.createWriteStream(destPath);
      let downloadedBytes = 0;
      let lastProgressLog = 0;

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (contentLength) {
          const pct = Math.floor((downloadedBytes / contentLength) * 100);
          if (pct >= lastProgressLog + 10) {
            lastProgressLog = pct;
            process.stdout.write(`  ${pct}%`);
          }
        }
      });

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        if (contentLength) console.log('  100%');
        console.log(`  Downloaded ${(downloadedBytes / 1024 / 1024).toFixed(2)} MB`);
        resolve();
      });
      file.on('error', (err) => {
        fs.unlink(destPath, () => {}); // Clean up partial file
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  // Ensure directories exist
  if (!fs.existsSync(PREREQUISITES_DIR)) {
    fs.mkdirSync(PREREQUISITES_DIR, { recursive: true });
  }
  if (!fs.existsSync(RUNTIME_TOOLS_DIR)) {
    fs.mkdirSync(RUNTIME_TOOLS_DIR, { recursive: true });
  }

  // Step 1: Check if VC_redist.x64.exe already exists locally and is valid
  let needsDownload = true;
  if (fs.existsSync(VC_REDIST_LOCAL_PATH)) {
    console.log(`\nValidating cached ${VC_REDIST_FILENAME}...`);
    const validation = validateVCRedist(VC_REDIST_LOCAL_PATH, 'Cached');
    
    let hashValid = false;
    if (validation.valid) {
      if (fs.existsSync(VC_REDIST_LOCAL_HASH_PATH)) {
        console.log(`  Checking cached SHA-256 signature...`);
        const expectedHash = fs.readFileSync(VC_REDIST_LOCAL_HASH_PATH, 'utf8').trim();
        const actualHash = computeFileSha256(VC_REDIST_LOCAL_PATH);
        if (actualHash === expectedHash) {
          console.log(`  Cached SHA-256 verified: ${actualHash.substring(0, 16)}... ✓`);
          hashValid = true;
        } else {
          console.log(`  WARNING: Cached SHA-256 mismatch! Expected: ${expectedHash}, Got: ${actualHash}`);
        }
      } else {
        console.log(`  WARNING: Cached SHA-256 signature file missing.`);
      }
    }

    if (validation.valid && hashValid) {
      console.log(`\nCached ${VC_REDIST_FILENAME} passed all validation and integrity checks. Skipping download.`);
      needsDownload = false;
    } else {
      console.log(`\nCached ${VC_REDIST_FILENAME} failed validation or integrity checks.`);
      for (const reason of validation.reasons) {
        console.log(`  - ${reason}`);
      }
      console.log(`Removing invalid cached files and re-downloading.`);
      try { fs.unlinkSync(VC_REDIST_LOCAL_PATH); } catch (e) {}
      try { fs.unlinkSync(VC_REDIST_LOCAL_HASH_PATH); } catch (e) {}
    }
  }

  // Step 2: Download if needed
  if (needsDownload) {
    console.log(`\nDownloading Microsoft Visual C++ Redistributable from:`);
    console.log(`  ${VC_REDIST_URL}`);
    await downloadFile(VC_REDIST_URL, VC_REDIST_LOCAL_PATH);

    // Validate downloaded file
    console.log(`\nValidating downloaded ${VC_REDIST_FILENAME}...`);
    const validation = validateVCRedist(VC_REDIST_LOCAL_PATH, 'Downloaded');
    if (!validation.valid) {
      // Clean up invalid download
      try { fs.unlinkSync(VC_REDIST_LOCAL_PATH); } catch { /* ignore */ }
      const reasons = validation.reasons.join('\n  - ');
      throw new Error(`Downloaded file failed validation:\n  - ${reasons}`);
    }
    
    // Write new SHA-256 signature file
    const fileHash = computeFileSha256(VC_REDIST_LOCAL_PATH);
    fs.writeFileSync(VC_REDIST_LOCAL_HASH_PATH, fileHash, 'utf8');
    console.log(`Generated SHA-256 hash file: ${fileHash.substring(0, 16)}...`);
    console.log(`Download validated successfully.`);
  }

  // Step 3: Copy to runtime-build/tools/
  console.log(`\nCopying to: ${path.relative(PROJECT_ROOT, VC_REDIST_DEST_PATH)}`);
  fs.copyFileSync(VC_REDIST_LOCAL_PATH, VC_REDIST_DEST_PATH);
  fs.copyFileSync(VC_REDIST_LOCAL_HASH_PATH, VC_REDIST_DEST_HASH_PATH);

  // Final validation of the copied file (size sanity check)
  const destStats = fs.statSync(VC_REDIST_DEST_PATH);
  const srcStats = fs.statSync(VC_REDIST_LOCAL_PATH);
  if (destStats.size !== srcStats.size) {
    throw new Error(`Copy verification failed: source (${srcStats.size} bytes) != destination (${destStats.size} bytes)`);
  }

  // Verify copied hash file
  const destHash = fs.readFileSync(VC_REDIST_DEST_HASH_PATH, 'utf8').trim();
  const srcHash = fs.readFileSync(VC_REDIST_LOCAL_HASH_PATH, 'utf8').trim();
  if (destHash !== srcHash) {
    throw new Error(`Copy verification failed: hash mismatch between source and destination`);
  }

  console.log(`\n${VC_REDIST_FILENAME} packaged successfully (${(destStats.size / 1024 / 1024).toFixed(2)} MB).`);
  console.log('PREREQUISITES_OK');
}

main().catch((err) => {
  console.error(`\nFATAL: ${err.message}`);
  process.exit(1);
});
