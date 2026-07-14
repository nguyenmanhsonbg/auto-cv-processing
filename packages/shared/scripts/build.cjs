const { spawnSync } = require('child_process');

const tscScript = require.resolve('typescript/bin/tsc');
const projects = ['tsconfig.json', 'tsconfig.esm.json'];

for (const project of projects) {
  const result = spawnSync(process.execPath, [tscScript, '-p', project], {
    cwd: __dirname + '/..',
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
