interface ChromeStorageArea {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

interface ChromeStorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

interface ChromeStorageChangeEvent {
  addListener(callback: (changes: Record<string, ChromeStorageChange>, areaName: string) => void): void;
}

interface ChromeRuntime {
  onInstalled: {
    addListener(callback: () => void): void;
  };
  onStartup?: {
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
    removeListener?(callback: (...args: any[]) => unknown): void;
  };
  connect?(connectInfo?: { name?: string }): ChromePort;
  sendMessage?(message: unknown): Promise<unknown>;
  getURL?(path: string): string;
  lastError?: {
    message?: string;
  };
}

interface ChromeAlarm {
  name: string;
  scheduledTime: number;
  periodInMinutes?: number;
}

interface ChromeAlarms {
  create(name: string, alarmInfo: { delayInMinutes?: number; periodInMinutes?: number }): void | Promise<void>;
  onAlarm: {
    addListener(callback: (alarm: ChromeAlarm) => void): void;
  };
}

interface ChromePort {
  name: string;
  onDisconnect: {
    addListener(callback: () => void): void;
  };
  onMessage: {
    addListener(callback: (message: unknown) => void): void;
    removeListener(callback: (message: unknown) => void): void;
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
  openerTabId?: number;
  url?: string;
  status?: string;
}

interface ChromeTabs {
  query(queryInfo: { active?: boolean; currentWindow?: boolean; url?: string | string[]; windowId?: number }): Promise<ChromeTab[]>;
  create(createProperties: { url?: string; active?: boolean }): Promise<ChromeTab>;
  update(tabId: number, updateProperties: { url?: string; active?: boolean }): Promise<ChromeTab>;
  get(tabId: number): Promise<ChromeTab>;
  remove(tabId: number): Promise<void>;
  sendMessage?(
    tabId: number,
    message: unknown,
    options?: { documentId?: string; frameId?: number },
  ): Promise<unknown>;
}

interface ChromeWindow {
  id?: number;
  focused?: boolean;
}

interface ChromeWindows {
  update(windowId: number, updateInfo: { focused?: boolean }): Promise<ChromeWindow>;
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
    removeListener(callback: (
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

interface ChromeCookies {
  get(details: { url: string; name: string }): Promise<{ value?: string } | null>;
}

interface ChromeApi {
  alarms?: ChromeAlarms;
  cookies?: ChromeCookies;
  debugger?: ChromeDebugger;
  runtime?: ChromeRuntime;
  scripting?: ChromeScripting;
  sidePanel?: ChromeSidePanel;
  storage?: {
    local?: ChromeStorageArea;
    onChanged?: ChromeStorageChangeEvent;
    session?: ChromeStorageArea;
  };
  tabs?: ChromeTabs;
  windows?: ChromeWindows;
}

declare const chrome: ChromeApi;
