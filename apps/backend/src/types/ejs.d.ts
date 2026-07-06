declare module 'ejs' {
  export function renderFile(
    filename: string,
    data?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<string>;
}
