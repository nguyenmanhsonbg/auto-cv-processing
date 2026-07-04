const API_BASE = '/api';
const ACCESS_TOKEN_STORAGE_KEY = 'token';
const REFRESH_TOKEN_STORAGE_KEY = 'refreshToken';

export interface ApiRequestOptions {
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

export interface ApiUploadOptions extends ApiRequestOptions {
  extraFields?: Record<string, string | number | boolean | Blob | File | null | undefined>;
}

export interface ApiErrorPayload {
  code?: string;
  message?: string;
  details?: unknown;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

class ApiClient {
  private token: string | null = null;
  private refreshToken: string | null = null;
  private refreshPromise: Promise<boolean> | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  setRefreshToken(token: string | null) {
    this.refreshToken = token;
  }

  setTokens(tokens: { accessToken: string; refreshToken?: string | null }) {
    this.setToken(tokens.accessToken);
    this.setRefreshToken(tokens.refreshToken ?? null);
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, tokens.accessToken);
    if (tokens.refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, tokens.refreshToken);
    }
  }

  clearTokens() {
    this.setToken(null);
    this.setRefreshToken(null);
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  }

  getToken() {
    return this.token;
  }

  getRefreshToken() {
    return this.refreshToken ?? localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  }

  private buildHeaders(options?: ApiRequestOptions, includeJsonContentType = false) {
    const headers: Record<string, string> = {};

    if (includeJsonContentType) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (options?.headers) {
      Object.assign(headers, options.headers);
    }

    if (options?.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    return headers;
  }

  private async parseErrorPayload(res: Response, fallbackMessage: string): Promise<ApiErrorPayload> {
    const raw = await res.json().catch(() => undefined);

    if (isRecord(raw)) {
      if (isRecord(raw.error)) {
        return {
          code: typeof raw.error.code === 'string' ? raw.error.code : undefined,
          message: typeof raw.error.message === 'string' ? raw.error.message : fallbackMessage,
          details: raw.error.details,
        };
      }

      return {
        code: typeof raw.code === 'string' ? raw.code : undefined,
        message: typeof raw.message === 'string' ? raw.message : fallbackMessage,
        details: raw.details,
      };
    }

    return { message: fallbackMessage };
  }

  private async throwApiError(res: Response, fallbackMessage: string): Promise<never> {
    const error = await this.parseErrorPayload(res, fallbackMessage);
    throw new ApiError(
      error.message || fallbackMessage,
      res.status,
      error.code,
      error.details,
    );
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: ApiRequestOptions,
  ): Promise<T> {
    const bodyPayload = body === undefined ? undefined : JSON.stringify(body);
    let headers = this.buildHeaders(options, true);

    let res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: bodyPayload,
    });

    if (res.status === 401 && this.shouldAttemptRefresh(path) && await this.refreshAccessToken()) {
      headers = this.buildHeaders(options, true);
      res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: bodyPayload,
      });
    }

    if (!res.ok) {
      await this.throwApiError(res, `Request failed: ${res.status}`);
    }

    if (res.status === 204) return undefined as T;
    return res.json();
  }

  get<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined | null>,
    options?: ApiRequestOptions,
  ) {
    if (params) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
      }
      const s = qs.toString();
      if (s) path = `${path}?${s}`;
    }
    return this.request<T>('GET', path, undefined, options);
  }

  post<T>(path: string, body?: unknown, options?: ApiRequestOptions) {
    return this.request<T>('POST', path, body, options);
  }

  put<T>(path: string, body?: unknown, options?: ApiRequestOptions) {
    return this.request<T>('PUT', path, body, options);
  }

  patch<T>(path: string, body?: unknown, options?: ApiRequestOptions) {
    return this.request<T>('PATCH', path, body, options);
  }

  delete<T>(path: string, options?: ApiRequestOptions) {
    return this.request<T>('DELETE', path, undefined, options);
  }

  private appendUploadFields(formData: FormData, extraFields?: ApiUploadOptions['extraFields']) {
    if (!extraFields) return;

    for (const [key, value] of Object.entries(extraFields)) {
      if (value === undefined || value === null) continue;
      if (value instanceof Blob) {
        formData.append(key, value);
      } else {
        formData.append(key, String(value));
      }
    }
  }

  async upload<T>(
    path: string,
    file: File,
    fieldName = 'file',
    options?: ApiUploadOptions,
  ): Promise<T> {
    const formData = new FormData();
    this.appendUploadFields(formData, options?.extraFields);
    formData.append(fieldName, file);

    let headers = this.buildHeaders(options);

    let res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (res.status === 401 && this.shouldAttemptRefresh(path) && await this.refreshAccessToken()) {
      headers = this.buildHeaders(options);
      res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers,
        body: formData,
      });
    }

    if (!res.ok) {
      await this.throwApiError(res, `Upload failed: ${res.status}`);
    }

    return res.json();
  }

  async uploadMulti<T>(
    path: string,
    files: File[],
    extraFields?: Record<string, string>,
    options?: ApiRequestOptions,
  ): Promise<T> {
    const formData = new FormData();
    // Text fields must come before file fields so multer parses them before buffering binary data
    if (extraFields) {
      for (const [key, val] of Object.entries(extraFields)) formData.append(key, val);
    }
    for (const file of files) formData.append('files', file);
    let headers = this.buildHeaders(options);
    let res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: formData });
    if (res.status === 401 && this.shouldAttemptRefresh(path) && await this.refreshAccessToken()) {
      headers = this.buildHeaders(options);
      res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: formData });
    }
    if (!res.ok) {
      await this.throwApiError(res, `Upload failed: ${res.status}`);
    }
    return res.json();
  }

  async downloadBlob(path: string, options?: ApiRequestOptions): Promise<Blob> {
    let headers = this.buildHeaders(options);

    let res = await fetch(`${API_BASE}${path}`, { headers });
    if (res.status === 401 && this.shouldAttemptRefresh(path) && await this.refreshAccessToken()) {
      headers = this.buildHeaders(options);
      res = await fetch(`${API_BASE}${path}`, { headers });
    }
    if (!res.ok) await this.throwApiError(res, `Download failed: ${res.status}`);
    return res.blob();
  }

  private async refreshAccessToken() {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = this.doRefreshAccessToken()
      .finally(() => {
        this.refreshPromise = null;
      });
    return this.refreshPromise;
  }

  private shouldAttemptRefresh(path: string) {
    return !path.startsWith('/auth/login')
      && !path.startsWith('/auth/refresh')
      && !path.startsWith('/auth/logout');
  }

  private async doRefreshAccessToken() {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;

    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      this.clearTokens();
      return false;
    }

    const data = await res.json() as { accessToken?: string; refreshToken?: string };
    if (!data.accessToken || !data.refreshToken) {
      this.clearTokens();
      return false;
    }

    this.setTokens({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    });
    return true;
  }
}

export const apiClient = new ApiClient();
