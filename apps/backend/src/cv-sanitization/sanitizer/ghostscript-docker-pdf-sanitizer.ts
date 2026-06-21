import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import * as path from 'path';
import {
  CleanCvSanitizer,
  CleanCvSanitizeInput,
  CleanCvSanitizeResult,
  CleanCvSanitizeStatus,
} from './clean-cv-sanitizer.interface';

const SANITIZER_NAME = 'ghostscript-docker-pdf-sanitizer';
const PDF_MIME_TYPE = 'application/pdf';
const DEFAULT_GHOSTSCRIPT_TIMEOUT_MS = 60_000;

@Injectable()
export class GhostscriptDockerPdfSanitizer implements CleanCvSanitizer {
  async sanitize(input: CleanCvSanitizeInput): Promise<CleanCvSanitizeResult> {
    const startedAt = Date.now();

    if (input.sourceMimeType !== PDF_MIME_TYPE) {
      return this.failed(startedAt, 'UNSUPPORTED_SANITIZER_INPUT');
    }

    if (!this.isDockerModeEnabled()) {
      return this.failed(startedAt, 'SANITIZER_NOT_CONFIGURED');
    }

    const image = this.getDockerImage();
    if (!image) {
      return this.failed(startedAt, 'SANITIZER_IMAGE_NOT_CONFIGURED');
    }

    try {
      await this.runGhostscriptDocker(input, image);
      return {
        status: CleanCvSanitizeStatus.SANITIZED,
        sanitizer: SANITIZER_NAME,
        sanitizedAt: new Date(),
        durationMs: Date.now() - startedAt,
        outputFilePath: input.outputFilePath,
        outputMimeType: PDF_MIME_TYPE,
        reasonCode: null,
      };
    } catch {
      return this.failed(startedAt, 'GHOSTSCRIPT_SANITIZE_FAILED');
    }
  }

  private isDockerModeEnabled() {
    return (process.env.CV_PDF_SANITIZER_MODE || 'GHOSTSCRIPT_DOCKER')
      .trim()
      .toUpperCase() === 'GHOSTSCRIPT_DOCKER';
  }

  private runGhostscriptDocker(input: CleanCvSanitizeInput, image: string) {
    const sourceDir = path.dirname(input.sourceFilePath);
    const sourceFileName = path.basename(input.sourceFilePath);
    const outputDir = path.dirname(input.outputFilePath);
    const outputFileName = path.basename(input.outputFilePath);
    const timeoutMs = this.getTimeoutMs();

    const args = [
      'run',
      '--rm',
      '--network',
      'none',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--pids-limit',
      '128',
      '--memory',
      '512m',
      '--cpus',
      '1',
      '--read-only',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,size=64m',
      '--user',
      '65534:65534',
      '-v',
      `${sourceDir}:/input:ro`,
      '-v',
      `${outputDir}:/output:rw`,
      image,
      'gs',
      '-dSAFER',
      '-dBATCH',
      '-dNOPAUSE',
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.7',
      '-dPDFSETTINGS=/printer',
      '-dDetectDuplicateImages=true',
      '-dCompressFonts=true',
      `-sOutputFile=/output/${outputFileName}`,
      `/input/${sourceFileName}`,
    ];

    return this.spawnWithTimeout('docker', args, timeoutMs);
  }

  private spawnWithTimeout(command: string, args: string[], timeoutMs: number) {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ['ignore', 'ignore', 'ignore'],
        windowsHide: true,
      });
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('GHOSTSCRIPT_TIMEOUT'));
      }, timeoutMs);

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`GHOSTSCRIPT_EXIT_${code ?? 'UNKNOWN'}`));
      });
    });
  }

  private getTimeoutMs() {
    const parsed = Number(process.env.CV_GHOSTSCRIPT_TIMEOUT_MS);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(parsed, 300_000);
    }
    return DEFAULT_GHOSTSCRIPT_TIMEOUT_MS;
  }

  private getDockerImage() {
    return process.env.CV_GHOSTSCRIPT_DOCKER_IMAGE?.trim() || null;
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
