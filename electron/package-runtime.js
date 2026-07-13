const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const BUILD_ROOT = path.join(PROJECT_ROOT, 'electron', 'runtime-build');

// Helper to clean and recreate a directory
function resetDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

console.log('Preparing production runtime structure...');

// 1. Reset build directory
resetDir(BUILD_ROOT);

// Create required folder structure
const dirsToCreate = [
  path.join(BUILD_ROOT, 'backend'),
  path.join(BUILD_ROOT, 'python'),
  path.join(BUILD_ROOT, 'models'),
  path.join(BUILD_ROOT, 'models', 'torch'),
  path.join(BUILD_ROOT, 'models', 'torch', 'checkpoints'),
  path.join(BUILD_ROOT, 'tools'),
  path.join(BUILD_ROOT, 'postgresql'),
];

for (const dir of dirsToCreate) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 2. Exclude patterns for copy operations
const excludePatterns = [
  /__pycache__/,
  /\.pyc$/,
  /(?:^|\/)\.git(?:\/|$)/,
  /(?:^|\/)\.env$/,
  /\bvenv\b/,
  /\btests\b/,
  /\bnode_modules\b/
];

function copyFilter(src) {
  const relative = path.relative(PROJECT_ROOT, src);
  const normalized = relative.replace(/\\/g, '/');
  
  const shouldIgnore = excludePatterns.some(pattern => pattern.test(normalized));
  return !shouldIgnore;
}

// 3. Copy backend files
const srcBackend = path.join(PROJECT_ROOT, 'backend');
const destBackend = path.join(BUILD_ROOT, 'backend', 'backend');
console.log(`Copying backend to ${destBackend}...`);
fs.cpSync(srcBackend, destBackend, { recursive: true, filter: copyFilter });

// 4. Copy face_service files
const srcFaceService = path.join(PROJECT_ROOT, 'face_service');
const destFaceService = path.join(BUILD_ROOT, 'backend', 'face_service');
console.log(`Copying face_service to ${destFaceService}...`);
fs.cpSync(srcFaceService, destFaceService, { recursive: true, filter: copyFilter });

// 5. Copy alembic.ini
const srcAlembic = path.join(PROJECT_ROOT, 'alembic.ini');
const destAlembic = path.join(BUILD_ROOT, 'backend', 'alembic.ini');
if (fs.existsSync(srcAlembic)) {
  console.log(`Copying alembic.ini to ${destAlembic}...`);
  fs.copyFileSync(srcAlembic, destAlembic);
}

// 6. Copy requirements.txt
const srcRequirements = path.join(PROJECT_ROOT, 'requirements.txt');
const destRequirements = path.join(BUILD_ROOT, 'backend', 'requirements.txt');
if (fs.existsSync(srcRequirements)) {
  console.log(`Copying requirements.txt to ${destRequirements}...`);
  fs.copyFileSync(srcRequirements, destRequirements);
}

console.log('Production runtime structure prepared successfully at:', BUILD_ROOT);
