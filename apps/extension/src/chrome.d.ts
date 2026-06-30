interface ChromeStorageArea {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

interface ChromeRuntime {
  onInstalled: {
    addListener(callback: () => void): void;
  };
  onMessage: {
    addListener(callback: (
      message: unknown,
      sender: ChromeMessageSender,
      sendResponse: (response?: unknown) => void,
    ) => boolean | void): void;
  };
  sendMessage?(message: unknown): Promise<unknown>;
  getURL?(path: string): string;
  lastError?: {
    message?: string;
  };
}

interface ChromeMessageSender {
  tab?: {
    id?: number;
    windowId?: number;
    url?: string;
  };
}

interface ChromeTabs {
  query(queryInfo: { active?: boolean; currentWindow?: boolean }): Promise<Array<{ id?: number; windowId?: number; url?: string }>>;
}

interface ChromeDebuggee {
  tabId?: number;
  extensionId?: string;
  targetId?: string;
}

interface ChromeDebugger {
  attach(target: ChromeDebuggee, requiredVersion: string, callback?: () => void): void | Promise<void>;
  detach(target: ChromeDebuggee, callback?: () => void): void | Promise<void>;
  sendCommand<T = unknown>(
    target: ChromeDebuggee,
    method: string,
    commandParams?: Record<string, unknown>,
    callback?: (result: T) => void,
  ): void | Promise<T>;
  onEvent: {
    addListener(callback: (
      source: ChromeDebuggee,
      method: string,
      params?: Record<string, unknown>,
    ) => void): void;
  };
  onDetach: {
    addListener(callback: (
      source: ChromeDebuggee,
      reason: string,
    ) => void): void;
  };
}

interface ChromeScriptingInjectionTarget {
  tabId: number;
}

interface ChromeScriptingResult<T> {
  frameId: number;
  result?: T;
}

interface ChromeScripting {
  executeScript<Args extends unknown[], Result>(injection: {
    target: ChromeScriptingInjectionTarget;
    func: (...args: Args) => Result;
    args?: Args;
  }): Promise<Array<ChromeScriptingResult<Result>>>;
}

interface ChromeSidePanel {
  open(options: { tabId?: number; windowId?: number }): Promise<void>;
  setPanelBehavior(options: { openPanelOnActionClick: boolean }): Promise<void>;
}

interface ChromeApi {
  debugger?: ChromeDebugger;
  runtime?: ChromeRuntime;
  scripting?: ChromeScripting;
  sidePanel?: ChromeSidePanel;
  storage?: {
    session?: ChromeStorageArea;
  };
  tabs?: ChromeTabs;
}

declare const chrome: ChromeApi;
