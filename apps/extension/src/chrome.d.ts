interface ChromeStorageArea {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

interface ChromeRuntime {
  onInstalled: {
    addListener(callback: () => void): void;
  };
  onConnect?: {
    addListener(callback: (port: ChromePort) => void): void;
  };
  onMessage: {
    addListener(callback: (
      message: unknown,
      sender: ChromeMessageSender,
      sendResponse: (response?: unknown) => void,
    ) => boolean | void): void;
  };
  connect?(connectInfo?: { name?: string }): ChromePort;
  sendMessage?(message: unknown): Promise<unknown>;
  getURL?(path: string): string;
  lastError?: {
    message?: string;
  };
}

interface ChromePort {
  name: string;
  onDisconnect: {
    addListener(callback: () => void): void;
  };
  onMessage: {
    addListener(callback: (message: unknown) => void): void;
  };
  postMessage(message: unknown): void;
  disconnect(): void;
}

interface ChromeMessageSender {
  tab?: {
    id?: number;
    windowId?: number;
    url?: string;
  };
}

interface ChromeTab {
  id?: number;
  windowId?: number;
  url?: string;
  status?: string;
}

interface ChromeTabs {
  query(queryInfo: { active?: boolean; currentWindow?: boolean; url?: string | string[] }): Promise<ChromeTab[]>;
  create(createProperties: { url?: string; active?: boolean }): Promise<ChromeTab>;
  update(tabId: number, updateProperties: { url?: string; active?: boolean }): Promise<ChromeTab>;
  get(tabId: number): Promise<ChromeTab>;
  remove(tabId: number): Promise<void>;
  sendMessage?(tabId: number, message: unknown): Promise<unknown>;
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
  allFrames?: boolean;
}

interface ChromeScriptingResult<T> {
  frameId: number;
  result?: T;
}

interface ChromeScripting {
  executeScript<Args extends unknown[], Result>(injection: {
    target: ChromeScriptingInjectionTarget;
    func?: (...args: Args) => Result | Promise<Result>;
    args?: Args;
    files?: string[];
    world?: 'ISOLATED' | 'MAIN';
  }): Promise<Array<ChromeScriptingResult<Awaited<Result>>>>;
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
