export const CLEAN_CV_SANITIZER = 'CLEAN_CV_SANITIZER';

export enum CleanCvSanitizeStatus {
  SANITIZED = 'SANITIZED',
  FAILED = 'FAILED',
}

export interface CleanCvSanitizeInput {
  applicationId: string;
  cvDocumentId: string;
  originalFileHash: string;
  sourceFilePath: string;
  sourceStoragePath: string;
  sourceMimeType: string;
  outputFilePath: string;
  outputStoragePath: string;
}

export interface CleanCvSanitizeResult {
  status: CleanCvSanitizeStatus;
  sanitizer: string;
  sanitizedAt: Date;
  durationMs: number;
  outputFilePath?: string | null;
  outputMimeType?: string | null;
  reasonCode?: string | null;
}

export interface CleanCvSanitizer {
  sanitize(input: CleanCvSanitizeInput): Promise<CleanCvSanitizeResult>;
}
