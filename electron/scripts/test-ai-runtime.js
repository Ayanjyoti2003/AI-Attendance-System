const { spawnSync } = require('child_process');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const pythonExe = path.join(PROJECT_ROOT, 'electron', 'runtime-build', 'python', 'python.exe');
const cwd = path.join(PROJECT_ROOT, 'electron', 'runtime-build', 'backend');

console.log('--- AI Runtime Verification ---');
console.log(`Executable: ${pythonExe}`);
console.log(`Working Directory: ${cwd}`);

// Isolation and Packaged environment configuration
const env = {
  ...process.env,
  AI_ATTENDANCE_PACKAGED: '1',
  PYTHONNOUSERSITE: '1',
  PYTHONDONTWRITEBYTECODE: '1',
  PYTHONPATH: cwd
};

const pythonTestScript = `
import os
import sys

# 1. Import backend.runtime to trigger TORCH_HOME configuration and validate
import backend.runtime

try:
    backend.runtime.validate_ai_model()
    print("Model validation check passed!")
except Exception as e:
    print(f"ERROR: Model validation failed: {e}")
    sys.exit(1)

print("TORCH_HOME configured as:", os.environ.get("TORCH_HOME"))

# 2. Load model
import torch
from facenet_pytorch import InceptionResnetV1

print("Loading InceptionResnetV1 (pretrained='vggface2')...")
model = InceptionResnetV1(pretrained="vggface2").eval()
print("Model loaded.")

# 3. Run dummy inference and verify shape is [1, 512]
print("Running dummy inference...")
dummy_input = torch.randn(1, 3, 160, 160)
with torch.no_grad():
    output = model(dummy_input)

print(f"Output shape: {list(output.shape)}")
if list(output.shape) != [1, 512]:
    print(f"ERROR: Expected shape [1, 512], but got {list(output.shape)}")
    sys.exit(1)

print("AI_RUNTIME_OK")
`;

const result = spawnSync(pythonExe, ['-c', pythonTestScript], {
  cwd,
  env,
  encoding: 'utf8'
});

if (result.status !== 0) {
  console.error('AI Runtime Verification failed!');
  console.error('Exit code:', result.status);
  console.error('Stdout:', result.stdout);
  console.error('Stderr:', result.stderr);
  process.exit(1);
}

if (!result.stdout.includes('AI_RUNTIME_OK')) {
  console.error('Verification failed! "AI_RUNTIME_OK" was not found in output.');
  console.error('Stdout:', result.stdout);
  process.exit(1);
}

console.log(result.stdout.trim());
console.log('AI Runtime Verification successful!');
process.exit(0);
