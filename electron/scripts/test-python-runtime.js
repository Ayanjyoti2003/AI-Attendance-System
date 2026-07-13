const { spawnSync } = require('child_process');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const pythonExe = path.join(PROJECT_ROOT, 'electron', 'runtime-build', 'python', 'python.exe');

console.log('--- Python Runtime Verification ---');
console.log(`Executable: ${pythonExe}`);

// Isolation environment configuration
const env = {
  ...process.env,
  PYTHONNOUSERSITE: '1',
  PYTHONDONTWRITEBYTECODE: '1',
  PYTHONPATH: ''
};

// 1. Run Python import and native operations test
console.log('Testing package imports and native operations (OpenCV, Torch, Multiprocessing)...');
const pythonTestScript = `
import sys
import fastapi
import sqlalchemy
import cv2
import torch
import torchvision
import facenet_pytorch
import numpy as np
import multiprocessing

print("Imports successful!")

# OpenCV native check
img = np.zeros((100, 100, 3), dtype=np.uint8)
cv2.rectangle(img, (10, 10), (90, 90), (0, 255, 0), -1)
print(f"OpenCV check passed! Image shape: {img.shape}")

# Torch native check
t = torch.tensor([1, 2, 3]) * 2
print(f"Torch check passed! Tensor: {t.tolist()}")

# Multiprocessing check
print(f"Multiprocessing check passed! CPU count: {multiprocessing.cpu_count()}")

print("PYTHON_RUNTIME_OK")
`;

const importResult = spawnSync(pythonExe, ['-c', pythonTestScript], {
  env,
  encoding: 'utf8'
});

if (importResult.status !== 0) {
  console.error('Python import and native execution test failed!');
  console.error('Exit code:', importResult.status);
  console.error('Stdout:', importResult.stdout);
  console.error('Stderr:', importResult.stderr);
  process.exit(1);
}

if (!importResult.stdout.includes('PYTHON_RUNTIME_OK')) {
  console.error('Verification failed! "PYTHON_RUNTIME_OK" was not found in output.');
  console.error('Stdout:', importResult.stdout);
  process.exit(1);
}

console.log(importResult.stdout.trim());
console.log('Import and native operations verification successful!');

// 2. Run uvicorn verification command
console.log('Verifying uvicorn console module execution...');
const uvicornResult = spawnSync(pythonExe, ['-m', 'uvicorn', '--help'], {
  env,
  encoding: 'utf8'
});

if (uvicornResult.status !== 0) {
  console.error('Uvicorn console execution check failed!');
  console.error('Exit code:', uvicornResult.status);
  console.error('Stderr:', uvicornResult.stderr);
  process.exit(1);
}

console.log('Uvicorn verification check passed!');
console.log('\nPYTHON_RUNTIME_OK');
process.exit(0);
