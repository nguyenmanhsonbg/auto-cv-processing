import { spawn } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_OUTPUT_LENGTH = 64 * 1024;

const NODE_SANDBOX_FLAGS = [
  '--permission',
  '--disallow-code-generation-from-strings',
  '--disable-proto=throw',
  '--max-old-space-size=64',
  '--input-type=commonjs',
];

function buildSandboxSource(code: string, input: string): string {
  const inputLiteral = JSON.stringify(input);

  return `
'use strict';

const __sandboxProcess = globalThis.process;
const __capturedOutput = [];
let __capturedOutputLength = 0;

const __appendOutput = (...args) => {
  const line = args.map(String).join(' ');
  __capturedOutputLength += line.length + 1;
  if (__capturedOutputLength > ${MAX_OUTPUT_LENGTH}) {
    throw new Error('Sandbox output limit exceeded');
  }
  __capturedOutput.push(line);
};

const __sandboxConsole = Object.freeze({
  log: __appendOutput,
  error: __appendOutput,
  warn: __appendOutput,
});

const __hideGlobal = (name, value) => {
  try {
    Object.defineProperty(globalThis, name, {
      value,
      configurable: false,
      enumerable: false,
      writable: false,
    });
  } catch {
    try {
      globalThis[name] = value;
    } catch {
      // The permission model remains the final guard if a runtime refuses the override.
    }
  }
};

__hideGlobal('process', undefined);
__hideGlobal('console', __sandboxConsole);
__hideGlobal('fetch', undefined);
__hideGlobal('WebSocket', undefined);
__hideGlobal('Buffer', undefined);

const INPUT = ${inputLiteral};
const process = undefined;
const require = undefined;
const module = undefined;
const exports = undefined;
const __filename = undefined;
const __dirname = undefined;
const Buffer = undefined;
const fetch = undefined;
const WebSocket = undefined;
const console = __sandboxConsole;

try {
${code}
  __sandboxProcess.stdout.write(JSON.stringify({
    status: 'ok',
    output: __capturedOutput.join('\\n').trim(),
  }));
} catch (error) {
  __sandboxProcess.stderr.write(JSON.stringify({
    status: 'error',
    message: error instanceof Error ? error.message : String(error),
  }));
  __sandboxProcess.exitCode = 1;
}
`;
}

export function runInSandbox(
  code: string,
  input: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, NODE_SANDBOX_FLAGS, {
      env: { NODE_ENV: 'sandbox' },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      callback();
    };

    const terminate = () => {
      if (!child.killed) child.kill();
    };

    const timeout = setTimeout(() => {
      finish(() => {
        terminate();
        reject(new Error(`Sandbox execution timed out after ${timeoutMs}ms`));
      });
    }, Math.max(1, timeoutMs));

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, 'utf8') > MAX_OUTPUT_LENGTH) {
        finish(() => {
          terminate();
          clearTimeout(timeout);
          reject(new Error('Sandbox output limit exceeded'));
        });
      }
    });

    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      if (Buffer.byteLength(stderr, 'utf8') > MAX_OUTPUT_LENGTH) {
        stderr = stderr.slice(-MAX_OUTPUT_LENGTH);
      }
    });

    child.on('error', (error) => {
      finish(() => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    child.stdin.on('error', (error) => {
      finish(() => {
        clearTimeout(timeout);
        terminate();
        reject(error);
      });
    });

    child.on('close', (exitCode) => {
      finish(() => {
        clearTimeout(timeout);

        let result: { status?: string; output?: string; message?: string };
        try {
          result = JSON.parse(stdout) as typeof result;
        } catch {
          reject(new Error(stderr.trim() || `Sandbox exited with code ${exitCode ?? 'unknown'}`));
          return;
        }

        if (result.status === 'ok' && exitCode === 0) {
          resolve(result.output ?? '');
          return;
        }

        reject(new Error(result.message || stderr.trim() || `Sandbox exited with code ${exitCode ?? 'unknown'}`));
      });
    });

    child.stdin.end(buildSandboxSource(code, input));
  });
}
