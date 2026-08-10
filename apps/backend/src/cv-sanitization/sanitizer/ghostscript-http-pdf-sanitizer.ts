import { Injectable } from '@nestjs/common';
import {
  CleanCvSanitizer,
  CleanCvSanitizeInput,
  CleanCvSanitizeResult,
  CleanCvSanitizeStatus,
} from './clean-cv-sanitizer.interface';

const SANITIZER_NAME = 'ghostscript-http-pdf-sanitizer';
const PDF_MIME_TYPE = 'application/pdf';
const DEFAULT_GHOSTSCRIPT_TIMEOUT_MS = 60_000;

interface SanitizeServiceResponse {
  status?: string;
  sanitizer?: string;
  sanitizedAt?: string;
  durationMs?: number;
  outputFilePath?: string | null;
  outputStoragePath?: string | null;
  outputMimeType?: string | null;
  reasonCode?: string | null;
}

@Injectable()
export class GhostscriptHttpPdfSanitizer implements CleanCvSanitizer {
  async sanitize(input: CleanCvSanitizeInput): Promise<CleanCvSanitizeResult> {
    const startedAt = Date.now();

    if (input.sourceMimeType !== PDF_MIME_TYPE) {
      return this.failed(startedAt, 'UNSUPPORTED_SANITIZER_INPUT');
    }

    const serviceUrl = this.getServiceUrl();
    if (!serviceUrl) {
      return this.failed(startedAt, 'SANITIZER_SERVICE_NOT_CONFIGURED');
    }

    try {
      const response = await this.callService(serviceUrl, input);
      const outputFilePath = this.resolveBackendOutputFilePath(input, response);
      if (response.status !== CleanCvSanitizeStatus.SANITIZED || !outputFilePath) {
        return this.failed(startedAt, response.reasonCode || 'SANITIZER_SERVICE_FAILED');
      }

      return {
        status: CleanCvSanitizeStatus.SANITIZED,
        sanitizer: response.sanitizer || SANITIZER_NAME,
        sanitizedAt: response.sanitizedAt ? new Date(response.sanitizedAt) : new Date(),
        durationMs: response.durationMs ?? Date.now() - startedAt,
        outputFilePath,
        outputMimeType: response.outputMimeType || PDF_MIME_TYPE,
        reasonCode: response.reasonCode ?? null,
      };
    } catch {
      return this.failed(startedAt, 'SANITIZER_SERVICE_UNAVAILABLE');
    }
  }

  private async callService(
    serviceUrl: string,
    input: CleanCvSanitizeInput,
  ): Promise<SanitizeServiceResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.getTimeoutMs());

    try {
      const response = await fetch(`${serviceUrl}/sanitize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          applicationId: input.applicationId,
          cvDocumentId: input.cvDocumentId,
          originalFileHash: input.originalFileHash,
          sourceFilePath: input.sourceFilePath,
          sourceStoragePath: input.sourceStoragePath,
          sourceMimeType: input.sourceMimeType,
          outputFilePath: input.outputFilePath,
          outputStoragePath: input.outputStoragePath,
        }),
        signal: controller.signal,
      });

      const payload = await response.json() as SanitizeServiceResponse;
      if (!response.ok) {
        return {
          status: CleanCvSanitizeStatus.FAILED,
          reasonCode: payload.reasonCode || `SANITIZER_SERVICE_HTTP_${response.status}`,
        };
      }

      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }

  private resolveBackendOutputFilePath(
    input: CleanCvSanitizeInput,
    response: SanitizeServiceResponse,
  ) {
    if (response.outputStoragePath) {
      return response.outputStoragePath === input.outputStoragePath
        ? input.outputFilePath
        : null;
    }

    return response.outputFilePath ?? null;
  }

  private getServiceUrl(): string | null {
    const configuredUrl = process.env.CV_SANITIZER_SERVICE_URL?.trim();
    if (!configuredUrl) {
      return null;
    }

    try {
      const parsedUrl = new URL(configuredUrl);
      const allowedProtocols = new Set(['http:', 'https:']);
      if (!allowedProtocols.has(parsedUrl.protocol)) {
        return null;
      }

      const isProduction = process.env.NODE_ENV?.trim().toLowerCase() === 'production';
      if (isProduction && parsedUrl.protocol !== 'https:') {
        return null;
      }

      let normalizedUrl = configuredUrl;
      while (normalizedUrl.endsWith('/')) normalizedUrl = normalizedUrl.slice(0, -1);
      return normalizedUrl;
    } catch {
      return null;
    }
  }

  private getTimeoutMs() {
    const parsed = Number(process.env.CV_GHOSTSCRIPT_TIMEOUT_MS);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(parsed, 300_000);
    }
    return DEFAULT_GHOSTSCRIPT_TIMEOUT_MS;
  }

  private failed(startedAt: number, reasonCode: string): CleanCvSanitizeResult {
    return {
      status: CleanCvSanitizeStatus.FAILED,
      sanitizer: SANITIZER_NAME,
      sanitizedAt: new Date(),
      durationMs: Date.now() - startedAt,
      outputFilePath: null,
      outputMimeType: null,
      reasonCode,
    };
  }
}
