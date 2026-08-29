// Android Device & Phone Call Bridge
// Integrates with the ndroid CLI and db platform tools to detect connected
// devices, capture phone screens during live phone interviews/calls, and bridge
// mobile workflows into cue.

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

function findAdbPath() {
  const isWindows = process.platform === 'win32';
  const localAppData = process.env.LOCALAPPDATA || (isWindows ? path.join(os.homedir(), 'AppData', 'Local') : '');
  const winSdkAdb = localAppData ? path.join(localAppData, 'Android', 'Sdk', 'platform-tools', 'adb.exe') : null;
  if (winSdkAdb && fs.existsSync(winSdkAdb)) return winSdkAdb;

  const macSdkAdb = path.join(os.homedir(), 'Library', 'Android', 'sdk', 'platform-tools', 'adb');
  if (fs.existsSync(macSdkAdb)) return macSdkAdb;

  const linuxSdkAdb = path.join(os.homedir(), 'Android', 'Sdk', 'platform-tools', 'adb');
  if (fs.existsSync(linuxSdkAdb)) return linuxSdkAdb;

  return 'adb';
}

function findAndroidCliPath() {
  const isWindows = process.platform === 'win32';
  const candidates = [
    isWindows ? 'C:\\ProgramData\\AndroidCLI\\android.exe' : null,
    path.join(os.homedir(), '.android-cli', isWindows ? 'android.cmd' : 'android'),
    'android'
  ].filter(Boolean);

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'android';
}

function execPromise(cmd, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 10 * 1024 * 1024, ...options }, (err, stdout, stderr) => {
      if (err) return reject({ err, stdout, stderr });
      resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
    });
  });
}

async function getAndroidInfo() {
  const adbPath = findAdbPath();
  const cliPath = findAndroidCliPath();
  let cliVersion = null;
  let adbAvailable = false;
  let devices = [];

  try {
    const { stdout } = await execPromise(adbPath, ['version']);
    if (stdout.includes('Android Debug Bridge')) {
      adbAvailable = true;
    }
  } catch (_) {
    adbAvailable = false;
  }

  try {
    const { stdout } = await execPromise(cliPath, ['info']);
    cliVersion = stdout.trim();
  } catch (_) {}

  if (adbAvailable) {
    devices = await listDevices();
  }

  return {
    available: adbAvailable,
    adbPath,
    cliPath,
    cliInfo: cliVersion,
    devices
  };
}

async function listDevices() {
  const adbPath = findAdbPath();
  try {
    const { stdout } = await execPromise(adbPath, ['devices', '-l']);
    const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    const devices = [];

    for (const line of lines) {
      if (line.startsWith('List of devices')) continue;
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;
      const serial = parts[0];
      const state = parts[1];
      
      let model = 'Android Device';
      let product = '';
      for (const p of parts.slice(2)) {
        if (p.startsWith('model:')) model = p.replace('model:', '').replace(/_/g, ' ');
        if (p.startsWith('product:')) product = p.replace('product:', '');
      }

      devices.push({ serial, state, model, product });
    }
    return devices;
  } catch (_) {
    return [];
  }
}

async function captureAndroidScreen(serial) {
  const adbPath = findAdbPath();
  const args = serial ? ['-s', serial, 'exec-out', 'screencap', '-p'] : ['exec-out', 'screencap', '-p'];
  
  return new Promise((resolve) => {
    execFile(adbPath, args, { encoding: 'buffer', maxBuffer: 15 * 1024 * 1024 }, (err, stdout) => {
      if (err || !stdout || stdout.length < 100) {
        return resolve(null);
      }
      const b64 = stdout.toString('base64');
      resolve('data:image/png;base64,' + b64);
    });
  });
}

module.exports = {
  findAdbPath,
  findAndroidCliPath,
  getAndroidInfo,
  listDevices,
  captureAndroidScreen,
};
