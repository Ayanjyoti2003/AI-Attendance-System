/**
 * package-postgres-runtime.js
 *
 * Copies PostgreSQL binaries from the developer's local installation
 * into electron/runtime-build/postgresql/ for bundling with the app.
 *
 * Discovery order:
 *   1. POSTGRES_HOME environment variable
 *   2. C:\Program Files\PostgreSQL\*\ (highest version first)
 *
 * Required binaries (Correction #2):
 *   postgres.exe, initdb.exe, pg_ctl.exe, createdb.exe,
 *   pg_dump.exe, psql.exe, pg_isready.exe
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const RUNTIME_BUILD_DIR = path.join(PROJECT_ROOT, 'electron', 'runtime-build');
const PG_DEST_DIR = path.join(RUNTIME_BUILD_DIR, 'postgresql');

const REQUIRED_BINARIES = [
  'postgres.exe',
  'initdb.exe',
  'pg_ctl.exe',
  'createdb.exe',
  'pg_dump.exe',
  'psql.exe',
  'pg_isready.exe',
];

console.log('--- PostgreSQL Runtime Packager ---');

// ── 1. Locate PostgreSQL installation ──────────────────────────

function findPostgresHome() {
  // Check POSTGRES_HOME environment variable first
  const envHome = process.env.POSTGRES_HOME;
  if (envHome && fs.existsSync(envHome)) {
    console.log(`Found PostgreSQL via POSTGRES_HOME: ${envHome}`);
    return envHome;
  }

  // Scan common Windows PostgreSQL installation directories
  const searchBase = 'C:\\Program Files\\PostgreSQL';
  if (!fs.existsSync(searchBase)) {
    return null;
  }

  const versions = fs.readdirSync(searchBase)
    .filter(entry => {
      const fullPath = path.join(searchBase, entry);
      return fs.statSync(fullPath).isDirectory();
    })
    .sort((a, b) => {
      // Sort by version number descending (highest first)
      const numA = parseFloat(a) || 0;
      const numB = parseFloat(b) || 0;
      return numB - numA;
    });

  for (const version of versions) {
    const candidate = path.join(searchBase, version);
    const binDir = path.join(candidate, 'bin');
    if (fs.existsSync(binDir) && fs.existsSync(path.join(binDir, 'postgres.exe'))) {
      console.log(`Found PostgreSQL installation: ${candidate} (version directory: ${version})`);
      return candidate;
    }
  }

  return null;
}

const pgHome = findPostgresHome();
if (!pgHome) {
  console.error('CRITICAL ERROR: PostgreSQL installation not found.');
  console.error('Set POSTGRES_HOME environment variable or install PostgreSQL to C:\\Program Files\\PostgreSQL\\');
  process.exit(1);
}

// ── 2. Reset destination directory ─────────────────────────────

if (fs.existsSync(PG_DEST_DIR)) {
  console.log(`Cleaning existing directory: ${PG_DEST_DIR}...`);
  fs.rmSync(PG_DEST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(PG_DEST_DIR, { recursive: true });

// ── 3. Copy bin/, lib/, share/ ─────────────────────────────────

const dirsToCopy = ['bin', 'lib', 'share'];

for (const dir of dirsToCopy) {
  const srcDir = path.join(pgHome, dir);
  const destDir = path.join(PG_DEST_DIR, dir);

  if (!fs.existsSync(srcDir)) {
    console.warn(`WARNING: Directory '${dir}' not found in ${pgHome}. Skipping.`);
    continue;
  }

  console.log(`Copying ${dir}/ ...`);
  fs.cpSync(srcDir, destDir, { recursive: true });
}

// ── 4. Validate required binaries ──────────────────────────────

console.log('Validating required binaries...');
const missingBinaries = [];

for (const binary of REQUIRED_BINARIES) {
  const binaryPath = path.join(PG_DEST_DIR, 'bin', binary);
  if (!fs.existsSync(binaryPath)) {
    missingBinaries.push(binary);
    console.error(`  MISSING: ${binary}`);
  } else {
    console.log(`  OK: ${binary}`);
  }
}

if (missingBinaries.length > 0) {
  console.error(`CRITICAL ERROR: ${missingBinaries.length} required binaries are missing.`);
  console.error(`Missing: ${missingBinaries.join(', ')}`);
  process.exit(1);
}

// ── 5. Get PostgreSQL version ──────────────────────────────────

let pgVersion = 'unknown';
try {
  const postgresExe = path.join(PG_DEST_DIR, 'bin', 'postgres.exe');
  pgVersion = execSync(`"${postgresExe}" --version`, { encoding: 'utf8' }).trim();
  console.log(`PostgreSQL version: ${pgVersion}`);
} catch (err) {
  console.warn(`WARNING: Could not determine PostgreSQL version: ${err.message}`);
}

// ── 6. Calculate size and generate report ──────────────────────

function getFolderSize(dirPath) {
  let size = 0;
  if (!fs.existsSync(dirPath)) return 0;
  const stats = fs.statSync(dirPath);
  if (stats.isFile()) return stats.size;
  if (stats.isDirectory()) {
    for (const file of fs.readdirSync(dirPath)) {
      size += getFolderSize(path.join(dirPath, file));
    }
  }
  return size;
}

const binSize = getFolderSize(path.join(PG_DEST_DIR, 'bin'));
const libSize = getFolderSize(path.join(PG_DEST_DIR, 'lib'));
const shareSize = getFolderSize(path.join(PG_DEST_DIR, 'share'));
const totalSize = binSize + libSize + shareSize;

const reportLines = [
  '=========================================',
  'POSTGRESQL RUNTIME BUNDLE REPORT',
  '=========================================',
  `Version: ${pgVersion}`,
  `Source: ${pgHome}`,
  ``,
  `Total Size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`,
  `  bin/: ${(binSize / 1024 / 1024).toFixed(2)} MB`,
  `  lib/: ${(libSize / 1024 / 1024).toFixed(2)} MB`,
  `  share/: ${(shareSize / 1024 / 1024).toFixed(2)} MB`,
  ``,
  `Required Binaries:`,
];

for (const binary of REQUIRED_BINARIES) {
  const binaryPath = path.join(PG_DEST_DIR, 'bin', binary);
  const binarySize = fs.statSync(binaryPath).size;
  reportLines.push(`  ${binary}: ${(binarySize / 1024).toFixed(0)} KB`);
}

const reportContent = reportLines.join('\n');
const reportPath = path.join(PROJECT_ROOT, 'postgres-runtime-report.txt');

console.log('');
console.log(reportContent);
fs.writeFileSync(reportPath, reportContent, 'utf8');

console.log('');
console.log(`Report saved to: ${reportPath}`);
console.log('PostgreSQL runtime packaged successfully.');
