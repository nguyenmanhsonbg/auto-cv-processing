const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(backendRoot, '..', '..');
const coverageDirectory = path.join(backendRoot, 'coverage');
const jestReportPath = path.join(coverageDirectory, 'lcov.info');
const sonarReportPath = path.join(coverageDirectory, 'sonar-lcov.info');

function toRepositoryRelativePath(sourcePath) {
  const slashPath = sourcePath.trim().replaceAll('\\', '/');

  if (slashPath.startsWith('apps/backend/')) {
    return slashPath;
  }

  if (path.isAbsolute(sourcePath)) {
    const relativePath = path
      .relative(repositoryRoot, sourcePath)
      .replaceAll('\\', '/');

    if (!relativePath.startsWith('../') && relativePath !== '..') {
      return relativePath;
    }
  }

  const relativePath = slashPath.replace(/^\.\//, '');
  return relativePath.startsWith('src/')
    ? `apps/backend/${relativePath}`
    : relativePath;
}

function writeSonarReport() {
  if (!fs.existsSync(jestReportPath)) {
    console.error(`Jest coverage report was not found: ${jestReportPath}`);
    return false;
  }

  const report = fs.readFileSync(jestReportPath, 'utf8');
  const normalizedReport = report
    .split(/\r?\n/)
    .map((line) =>
      line.startsWith('SF:')
        ? `SF:${toRepositoryRelativePath(line.slice(3))}`
        : line,
    )
    .join('\n');

  fs.writeFileSync(sonarReportPath, normalizedReport, 'utf8');
  const sourceFileCount = (normalizedReport.match(/^SF:/gm) || []).length;
  console.log(
    `SonarQube LCOV report written: ${sonarReportPath} (${sourceFileCount} source files)`,
  );
  return true;
}

const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const testResult = spawnSync(
  packageManager,
  ['exec', 'jest', '--coverage', ...process.argv.slice(2)],
  {
    cwd: backendRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);

const reportCreated = writeSonarReport();

if (!reportCreated && testResult.status === 0) {
  process.exitCode = 1;
} else if (testResult.error) {
  console.error(testResult.error.message);
  process.exitCode = 1;
} else {
  process.exitCode = testResult.status ?? 1;
}
