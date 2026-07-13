const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const packageJsonPath = path.join(PROJECT_ROOT, 'package.json');
const buildInfoDir = path.join(PROJECT_ROOT, 'electron', 'runtime-build');
const buildInfoPath = path.join(buildInfoDir, 'build-info.json');

console.log('Generating build-info.json...');

if (!fs.existsSync(packageJsonPath)) {
  console.error('CRITICAL ERROR: package.json not found at:', packageJsonPath);
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const buildInfo = {
  version: packageJson.version,
  buildDate: new Date().toISOString(),
  platform: process.platform,
  bundledPython: true,
  bundledPostgreSQL: true,
  bundledAIModels: true
};

if (!fs.existsSync(buildInfoDir)) {
  fs.mkdirSync(buildInfoDir, { recursive: true });
}

fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2), 'utf8');
console.log('Generated build-info.json successfully at:', buildInfoPath);
