declare module 'ejs' {
  export function renderFile(path: string, data?: Record<string, unknown>): Promise<string>;
}
