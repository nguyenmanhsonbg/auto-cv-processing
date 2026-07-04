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
const DEFAULT_SERVICE_URL = 'http://cv-sanitizer:8080';

interface SanitizeServiceResponse {
  status?: string;
  sanitizer?: string;
  sanitizedAt?: string;
  durationMs?: number;
  outputFilePath?: string | null;
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
      if (response.status !== CleanCvSanitizeStatus.SANITIZED || !response.outputFilePath) {
        return this.failed(startedAt, response.reasonCode || 'SANITIZER_SERVICE_FAILED');
      }

      return {
        status: CleanCvSanitizeStatus.SANITIZED,
        sanitizer: response.sanitizer || SANITIZER_NAME,
        sanitizedAt: response.sanitizedAt ? new Date(response.sanitizedAt) : new Date(),
        durationMs: response.durationMs ?? Date.now() - startedAt,
        outputFilePath: response.outputFilePath,
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
          sourceMimeType: input.sourceMimeType,
          outputFilePath: input.outputFilePath,
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

  private getServiceUrl() {
    return (process.env.CV_SANITIZER_SERVICE_URL || DEFAULT_SERVICE_URL).trim();
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
