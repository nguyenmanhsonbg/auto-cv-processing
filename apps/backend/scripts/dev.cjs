const { spawn, spawnSync } = require('node:child_process');

const useShell = process.platform === 'win32';
const dryRun = process.argv.includes('--dry-run');
const seedOnly = process.argv.includes('--seed-only');

const commands = [
  useShell
    ? { command: 'pnpm seed:test-jds', args: [] }
    : { command: 'pnpm', args: ['seed:test-jds'] },
  useShell
    ? { command: 'pnpm exec nest start --watch', args: [] }
    : { command: 'pnpm', args: ['exec', 'nest', 'start', '--watch'] },
];

if (dryRun) {
  for (const { command, args } of commands) {
    console.log([command, ...args].join(' '));
  }
  process.exit(0);
}

console.log(`[dev] running ${[commands[0].command, ...commands[0].args].join(' ')}`);
const seedResult = spawnSync(commands[0].command, commands[0].args, {
  shell: useShell,
  stdio: 'inherit',
});

if (seedResult.error || seedResult.status !== 0) {
  if (seedResult.error) {
    console.error(`[dev] seed:test-jds failed to start: ${seedResult.error.message}`);
  }
  console.error(`[dev] seed:test-jds failed with exit code ${seedResult.status ?? 1}`);
  process.exit(seedResult.status ?? 1);
}

if (seedOnly) {
  process.exit(0);
}

console.log(`[dev] running ${[commands[1].command, ...commands[1].args].join(' ')}`);
const server = spawn(commands[1].command, commands[1].args, {
  shell: useShell,
  stdio: 'inherit',
});

server.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[dev] nest process exited from signal ${signal}`);
    process.kill(process.pid, signal);
    return;
  }

  if (code && code !== 0) {
    console.error(`[dev] nest process exited with code ${code}`);
  }
  process.exit(code ?? 0);
});

server.on('error', (error) => {
  console.error(`[dev] failed to start nest process: ${error.message}`);
  process.exit(1);
});
