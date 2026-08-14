export interface ChromeDebuggerResponseBody {
  body?: string;
  base64Encoded?: boolean;
}

export function decodeChromeDebuggerResponseBody(response: ChromeDebuggerResponseBody) {
  const body = response.body ?? '';
  if (!response.base64Encoded) return body;

  const binary = globalThis.atob(body);
  const bytes = Uint8Array.from(binary, (character) => character.codePointAt(0) ?? 0);
  return new TextDecoder().decode(bytes);
}

export function attachChromeDebugger(target: ChromeDebuggee, requiredVersion: string) {
  return new Promise<void>((resolve, reject) => {
    try {
      chrome.debugger?.attach(target, requiredVersion, () => {
        const lastError = chrome.runtime?.lastError;
        if (lastError?.message) reject(new Error(lastError.message));
        else resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

export function sendChromeDebuggerCommand<T>(
  target: ChromeDebuggee,
  method: string,
  params?: Record<string, unknown>,
) {
  return new Promise<T>((resolve, reject) => {
    try {
      chrome.debugger?.sendCommand<T>(target, method, params, (result) => {
        const lastError = chrome.runtime?.lastError;
        if (lastError?.message) reject(new Error(lastError.message));
        else resolve(result);
      });
    } catch (error) {
      reject(error);
    }
  });
}

export function detachChromeDebugger(target: ChromeDebuggee) {
  return new Promise<void>((resolve, reject) => {
    try {
      chrome.debugger?.detach(target, () => {
        const lastError = chrome.runtime?.lastError;
        if (lastError?.message) reject(new Error(lastError.message));
        else resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}
