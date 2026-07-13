const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const BUILD_ROOT = path.join(PROJECT_ROOT, 'electron', 'runtime-build');
const DEST_DIR = path.join(BUILD_ROOT, 'models', 'torch', 'checkpoints');
const MODEL_NAME = '20180402-114759-vggface2.pt';

console.log('--- Packaging AI Models ---');

// Define search locations
const searchPaths = [];

// 1. Check TORCH_HOME environment variable if set
if (process.env.TORCH_HOME) {
  searchPaths.push(path.join(process.env.TORCH_HOME, 'checkpoints', MODEL_NAME));
  searchPaths.push(path.join(process.env.TORCH_HOME, MODEL_NAME));
}

// 2. Check standard cache locations
searchPaths.push(path.join(os.homedir(), '.cache', 'torch', 'checkpoints', MODEL_NAME));

// 3. Check <project-root>/models/torch/checkpoints if applicable
searchPaths.push(path.join(PROJECT_ROOT, 'models', 'torch', 'checkpoints', MODEL_NAME));

// 4. Check <project-root>/../models/torch/checkpoints (current actual location)
searchPaths.push(path.join(PROJECT_ROOT, '..', 'models', 'torch', 'checkpoints', MODEL_NAME));

// Resolve search paths for cleaner output
const resolvedSearchPaths = searchPaths.map(p => path.resolve(p));

console.log('Searched paths:');
resolvedSearchPaths.forEach((p, idx) => {
  console.log(`  [${idx + 1}] ${p}`);
});

let foundPath = null;
for (const p of resolvedSearchPaths) {
  if (fs.existsSync(p)) {
    // Ignore incomplete/partial downloads explicitly
    if (p.endsWith('.partial') || p.includes('.partial')) {
      console.log(`Skipping partial file: ${p}`);
      continue;
    }

    const stats = fs.statSync(p);
    // Ensure it's a file, matches exact model name, and size > 50MB
    if (stats.isFile() && stats.size > 50 * 1024 * 1024 && path.basename(p) === MODEL_NAME) {
      foundPath = p;
      break;
    } else {
      console.log(`Ignoring invalid/incomplete file: ${p} (isFile: ${stats.isFile()}, size: ${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    }
  }
}

if (!foundPath) {
  console.error('\nCRITICAL ERROR: Run face recognition once to download model before packaging.\n');
  process.exit(1);
}

console.log(`\nDiscovered source path: ${foundPath}`);

// Ensure destination directory exists
if (!fs.existsSync(DEST_DIR)) {
  fs.mkdirSync(DEST_DIR, { recursive: true });
}

const destPath = path.resolve(path.join(DEST_DIR, MODEL_NAME));
console.log(`Destination path: ${destPath}`);
console.log(`Copying model...`);
fs.copyFileSync(foundPath, destPath);

// Verify destination file
if (fs.existsSync(destPath)) {
  const destStats = fs.statSync(destPath);
  console.log(`Successfully packaged model: ${MODEL_NAME} (${(destStats.size / 1024 / 1024).toFixed(2)} MB)`);

  // Compute and save SHA-256 hash for integrity verification during release
  const fileBuffer = fs.readFileSync(destPath);
  const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const hashFilePath = destPath + '.sha256';
  fs.writeFileSync(hashFilePath, hash, 'utf8');
  console.log(`SHA-256 hash saved: ${hash.substring(0, 16)}... \u2192 ${path.basename(hashFilePath)}`);
} else {
  console.error('Error: Failed to verify copied model.');
  process.exit(1);
}
