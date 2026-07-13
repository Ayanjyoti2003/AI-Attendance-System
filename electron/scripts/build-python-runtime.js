const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const VENV_DIR = path.join(PROJECT_ROOT, 'venv');
const RUNTIME_BUILD_DIR = path.join(PROJECT_ROOT, 'electron', 'runtime-build');
const PYTHON_DEST_DIR = path.join(RUNTIME_BUILD_DIR, 'python');

console.log('--- Python Runtime Builder ---');

// 1. Locate current working venv and base Python
let pythonHome = null;
const pyvenvCfgPath = path.join(VENV_DIR, 'pyvenv.cfg');
if (fs.existsSync(pyvenvCfgPath)) {
  const content = fs.readFileSync(pyvenvCfgPath, 'utf8');
  const match = content.match(/^home\s*=\s*(.+)$/m);
  if (match) {
    pythonHome = match[1].trim();
    console.log(`Found Python home from pyvenv.cfg: ${pythonHome}`);
  }
}

if (!pythonHome || !fs.existsSync(pythonHome)) {
  console.log('Could not resolve Python home from pyvenv.cfg. Trying fallback using sys.base_prefix...');
  try {
    const pythonVenvExe = process.platform === 'win32'
      ? path.join(VENV_DIR, 'Scripts', 'python.exe')
      : path.join(VENV_DIR, 'bin', 'python');
    if (fs.existsSync(pythonVenvExe)) {
      const basePrefix = execSync(`"${pythonVenvExe}" -c "import sys; print(sys.base_prefix)"`, { encoding: 'utf8' }).trim();
      if (fs.existsSync(basePrefix)) {
        pythonHome = basePrefix;
        console.log(`Found Python home via sys.base_prefix: ${pythonHome}`);
      }
    }
  } catch (err) {
    console.error('Failed to run fallback Python venv command:', err.message);
  }
}

if (!pythonHome || !fs.existsSync(pythonHome)) {
  console.error('CRITICAL ERROR: Python base installation directory not found.');
  process.exit(1);
}

// 2. Reset the python build target directory
if (fs.existsSync(PYTHON_DEST_DIR)) {
  console.log(`Cleaning existing directory: ${PYTHON_DEST_DIR}...`);
  fs.rmSync(PYTHON_DEST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(PYTHON_DEST_DIR, { recursive: true });

// Helper to copy recursively with filter
function copyRecursive(src, dest, filterFn) {
  const stats = fs.statSync(src);
  if (filterFn && !filterFn(src, stats)) {
    return;
  }
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const files = fs.readdirSync(src);
    for (const file of files) {
      copyRecursive(path.join(src, file), path.join(dest, file), filterFn);
    }
  } else if (stats.isFile()) {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
}

// 3. Copy Python binaries from base Python
console.log('Copying base Python binaries...');
// Ensure python.exe exists
const pythonExeSrc = path.join(pythonHome, 'python.exe');
if (!fs.existsSync(pythonExeSrc)) {
  console.error(`CRITICAL ERROR: Required file python.exe not found in ${pythonHome}`);
  process.exit(1);
}
fs.copyFileSync(pythonExeSrc, path.join(PYTHON_DEST_DIR, 'python.exe'));

// Dynamically detect python3XY.dll
const filesInHome = fs.readdirSync(pythonHome);
const python3XYDlls = filesInHome.filter(file => /^python3\d+\.dll$/i.test(file));

if (python3XYDlls.length === 0) {
  console.error(`CRITICAL ERROR: No python3XY.dll (e.g. python311.dll) found in ${pythonHome}`);
  process.exit(1);
}

for (const dll of python3XYDlls) {
  console.log(`Found and copying dynamic Python DLL: ${dll}`);
  fs.copyFileSync(path.join(pythonHome, dll), path.join(PYTHON_DEST_DIR, dll));
}

// Optional files (copy if present)
const optionalFiles = [
  'python3.dll',
  'vcruntime140.dll',
  'vcruntime140_1.dll'
];
for (const file of optionalFiles) {
  const srcFile = path.join(pythonHome, file);
  if (fs.existsSync(srcFile)) {
    console.log(`Copying optional base binary: ${file}`);
    fs.copyFileSync(srcFile, path.join(PYTHON_DEST_DIR, file));
  }
}

// 4. Copy DLLs directory
console.log('Copying DLLs folder...');
const srcDLLs = path.join(pythonHome, 'DLLs');
const destDLLs = path.join(PYTHON_DEST_DIR, 'DLLs');
if (fs.existsSync(srcDLLs)) {
  copyRecursive(srcDLLs, destDLLs, (srcPath, stats) => {
    const name = path.basename(srcPath).toLowerCase();
    if (name === '__pycache__') return false;
    if (stats.isFile() && (name.endsWith('.pyc') || name.endsWith('.pyo'))) return false;
    return true;
  });
}

// 5. Copy Lib directory (excluding site-packages and test suites)
console.log('Copying core Lib folder...');
const srcLib = path.join(pythonHome, 'Lib');
const destLib = path.join(PYTHON_DEST_DIR, 'Lib');
if (fs.existsSync(srcLib)) {
  copyRecursive(srcLib, destLib, (srcPath, stats) => {
    const relative = path.relative(srcLib, srcPath);
    const relativeParts = relative.split(path.sep).map(p => p.toLowerCase());
    
    // Exclude site-packages
    if (relativeParts.includes('site-packages')) {
      return false;
    }
    
    // Exclude tests/test/testing folders, but keep torch/testing and numpy/testing since they are required for imports
    const isRequiredTesting = relativeParts.includes('testing') && (relativeParts.includes('torch') || relativeParts.includes('numpy'));
    if ((relativeParts.includes('test') || relativeParts.includes('tests') || relativeParts.includes('testing')) && !isRequiredTesting) {
      return false;
    }

    // Exclude __pycache__
    if (relativeParts.includes('__pycache__')) {
      return false;
    }

    const name = path.basename(srcPath).toLowerCase();
    // Exclude pyc and pyo files
    if (stats.isFile() && (name.endsWith('.pyc') || name.endsWith('.pyo'))) {
      return false;
    }

    return true;
  });
}

// 6. Copy site-packages from current venv
console.log('Copying site-packages dependencies...');
const srcSitePackages = path.join(VENV_DIR, 'Lib', 'site-packages');
const destSitePackages = path.join(PYTHON_DEST_DIR, 'Lib', 'site-packages');

if (!fs.existsSync(srcSitePackages)) {
  console.error(`CRITICAL ERROR: site-packages directory not found at ${srcSitePackages}`);
  process.exit(1);
}

const sitePackagesFiles = fs.readdirSync(srcSitePackages);
if (sitePackagesFiles.length === 0) {
  console.error(`CRITICAL ERROR: site-packages directory at ${srcSitePackages} is empty.`);
  process.exit(1);
}

copyRecursive(srcSitePackages, destSitePackages, (srcPath, stats) => {
  const relative = path.relative(srcSitePackages, srcPath);
  const relativeParts = relative.split(path.sep).map(p => p.toLowerCase());

  // Exclude tests/test/testing folders, but keep torch/testing and numpy/testing since they are required for imports
  const isRequiredTesting = relativeParts.includes('testing') && (relativeParts.includes('torch') || relativeParts.includes('numpy'));
  if ((relativeParts.includes('test') || relativeParts.includes('tests') || relativeParts.includes('testing')) && !isRequiredTesting) {
    return false;
  }

  // Exclude __pycache__
  if (relativeParts.includes('__pycache__')) {
    return false;
  }

  const name = path.basename(srcPath).toLowerCase();
  // Exclude pyc and pyo files
  if (stats.isFile() && (name.endsWith('.pyc') || name.endsWith('.pyo'))) {
    return false;
  }

  // Note: Do NOT delete *.dist-info RECORD files (Correction 1)
  // So we don't have to filter out RECORD files.

  return true;
});

// 7. Cleanup confirmation pass (double checks the destination)
console.log('Running cleanup optimization pass...');
function cleanupDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stats = fs.statSync(fullPath);
    const lowercaseName = file.toLowerCase();

    if (stats.isDirectory()) {
      const relative = path.relative(PYTHON_DEST_DIR, fullPath);
      const relativeParts = relative.split(path.sep).map(p => p.toLowerCase());
      const isRequiredTesting = lowercaseName === 'testing' && (relativeParts.includes('torch') || relativeParts.includes('numpy'));
      
      if ((lowercaseName === '__pycache__' || lowercaseName === 'test' || lowercaseName === 'tests' || lowercaseName === 'testing') && !isRequiredTesting) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        cleanupDir(fullPath);
      }
    } else if (stats.isFile()) {
      if (lowercaseName.endsWith('.pyc') || lowercaseName.endsWith('.pyo')) {
        fs.rmSync(fullPath, { force: true });
      }
    }
  }
}
cleanupDir(PYTHON_DEST_DIR);

// 8. Size calculation and report generation
console.log('Generating size report...');
function getFolderSize(dirPath) {
  let size = 0;
  if (!fs.existsSync(dirPath)) return 0;
  const stats = fs.statSync(dirPath);
  if (stats.isFile()) {
    return stats.size;
  } else if (stats.isDirectory()) {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      size += getFolderSize(path.join(dirPath, file));
    }
  }
  return size;
}

const sitePackagesSize = getFolderSize(destSitePackages);
const totalPythonSize = getFolderSize(PYTHON_DEST_DIR);
const corePythonSize = totalPythonSize - sitePackagesSize;

const packages = [];
if (fs.existsSync(destSitePackages)) {
  const items = fs.readdirSync(destSitePackages);
  for (const item of items) {
    const itemPath = path.join(destSitePackages, item);
    const itemStats = fs.statSync(itemPath);
    if (itemStats.isDirectory()) {
      const size = getFolderSize(itemPath);
      packages.push({ name: item, size });
    }
  }
}
packages.sort((a, b) => b.size - a.size);

// Format size report
const reportLines = [
  '=========================================',
  'PYTHON RUNTIME BUNDLE SIZE REPORT',
  '=========================================',
  `Total Python Runtime Size: ${(totalPythonSize / 1024 / 1024).toFixed(2)} MB`,
  `Core Python (excl. site-packages): ${(corePythonSize / 1024 / 1024).toFixed(2)} MB`,
  `site-packages Size: ${(sitePackagesSize / 1024 / 1024).toFixed(2)} MB`,
  '',
  'Largest Packages in site-packages:',
];
for (let i = 0; i < Math.min(25, packages.length); i++) {
  const p = packages[i];
  reportLines.push(`${i + 1}. ${p.name}: ${(p.size / 1024 / 1024).toFixed(2)} MB`);
}

const reportContent = reportLines.join('\n');
console.log(reportContent);
fs.writeFileSync(path.join(PROJECT_ROOT, 'runtime-size-report.txt'), reportContent, 'utf8');

console.log('Python runtime build successfully prepared and size report generated.');
