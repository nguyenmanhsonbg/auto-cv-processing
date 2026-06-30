import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const backendDir = resolve(scriptDir, '..');
const repoRoot = resolve(backendDir, '..', '..');
const envFile = resolve(backendDir, '.env');
const logFile = resolve(backendDir, 'dev.log');

const port = getBackendPort();
const listener = getListeningProcess(port);

if (listener) {
  const processInfo = getProcessInfo(listener.OwningProcess);
  const commandLine = processInfo?.CommandLine ?? '';

  if (isThisBackendProcess(commandLine)) {
    const attached = watchActiveBackendLog(port, listener.OwningProcess);
    if (!attached) process.exit(0);
  } else {
    console.error(`Port ${port} is already in use by PID ${listener.OwningProcess}.`);
    console.error(`CommandLine: ${commandLine}`);
    process.exit(1);
  }
} else {
  startBackendWatcher();
}

function getBackendPort() {
  if (process.env.PORT) return Number(process.env.PORT);

  if (existsSync(envFile)) {
    const match = readFileSync(envFile, 'utf8').match(/^\s*PORT\s*=\s*(\d+)\s*$/m);
    if (match) return Number(match[1]);
  }

  return 3002;
}

function getListeningProcess(localPort) {
  const command = [
    `$conn = Get-NetTCPConnection -LocalPort ${localPort} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1`,
    'if ($conn) { $conn | Select-Object LocalAddress,LocalPort,State,OwningProcess | ConvertTo-Json -Compress }',
  ].join('; ');

  return runPowershellJson(command);
}

function getProcessInfo(processId) {
  const command = [
    `$process = Get-CimInstance Win32_Process -Filter "ProcessId = ${processId}" -ErrorAction SilentlyContinue`,
    'if ($process) { $process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress }',
  ].join('; ');

  return runPowershellJson(command);
}

function runPowershellJson(command) {
  try {
    const output = execFileSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { encoding: 'utf8' },
    ).trim();

    return output ? JSON.parse(output) : null;
  } catch {
    return null;
  }
}

function isThisBackendProcess(commandLine) {
  if (!commandLine) return false;

  const normalizedCommand = commandLine.toLowerCase();
  const normalizedRoot = repoRoot.toLowerCase();

  return normalizedCommand.includes(normalizedRoot)
    && (
      normalizedCommand.includes('apps\\backend')
      || normalizedCommand.includes('apps/backend')
      || normalizedCommand.includes('dist\\main')
      || normalizedCommand.includes('dist/main')
      || normalizedCommand.includes('nest start')
    );
}

function isEnabledEnv(name, defaultValue) {
  const raw = process.env[name];
  if (!raw) return defaultValue;

  return !['0', 'false', 'no'].includes(raw.toLowerCase());
}

function writeCurrentDevLogStatus(localPort, processId) {
  const timestamp = formatTimestamp(new Date());
  const lines = [
    `[${timestamp}] Backend dev server is already running on port ${localPort} (PID ${processId}).`,
    `[${timestamp}] No new backend process was started, so EADDRINUSE is avoided.`,
    `[${timestamp}] Runtime logs will continue from the active backend dev watcher.`,
  ];

  try {
    writeFileSync(logFile, `${lines.join('\n')}\n`, 'utf8');
  } catch {
    console.log('apps/backend/dev.log is locked by the active backend watcher.');
    console.log('If the tail still shows EADDRINUSE, that entry is from an older duplicate start attempt.');
  }
}

function watchActiveBackendLog(localPort, processId) {
  writeCurrentDevLogStatus(localPort, processId);
  console.log(`Backend dev server is already running on port ${localPort} (PID ${processId}).`);

  if (!isEnabledEnv('BACKEND_DEV_ATTACH_LOGS', true)) {
    console.log('Use apps/backend/dev.log for runtime logs.');
    return false;
  }

  if (!existsSync(logFile)) writeFileSync(logFile, '', 'utf8');

  console.log('Attached to apps/backend/dev.log. Press Ctrl+C to stop watching logs; the backend process keeps running.');
  tailLogFile();
  return true;
}

function startBackendWatcher() {
  process.chdir(backendDir);

  const nestCliPath = require.resolve('@nestjs/cli/bin/nest.js');
  const logStream = createWriteStream(logFile, { flags: 'w', encoding: 'utf8' });
  const child = spawn(process.execPath, [nestCliPath, 'start', '--watch'], {
    cwd: backendDir,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => writeChunk(chunk, logStream, process.stdout));
  child.stderr.on('data', (chunk) => writeChunk(chunk, logStream, process.stderr));
  child.on('exit', (code, signal) => {
    logStream.end();
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
  });

  const forwardSignal = (signal) => {
    child.kill(signal);
  };
  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));
}

function writeChunk(chunk, logStream, outputStream) {
  outputStream.write(chunk);
  logStream.write(chunk);
}

function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + ' ' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join(':');
}

function tailLogFile() {
  let position = 0;

  try {
    const text = readFileSync(logFile, 'utf8');
    const lines = text.split(/\r?\n/);
    const tail = lines.slice(Math.max(lines.length - 51, 0)).join('\n');
    if (tail.trim()) console.log(tail.replace(/\n$/, ''));
    position = statSync(logFile).size;
  } catch {
    position = 0;
  }

  const interval = setInterval(() => {
    try {
      const size = statSync(logFile).size;
      if (size < position) position = 0;
      if (size <= position) return;

      const stream = createReadStream(logFile, {
        start: position,
        end: size - 1,
        encoding: 'utf8',
      });
      stream.pipe(process.stdout, { end: false });
      position = size;
    } catch {
      position = 0;
    }
  }, 1000);

  process.on('SIGINT', () => {
    clearInterval(interval);
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    clearInterval(interval);
    process.exit(0);
  });
}
