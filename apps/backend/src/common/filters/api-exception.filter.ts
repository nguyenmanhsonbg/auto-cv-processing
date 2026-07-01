import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';

type ApiErrorCode =
  | 'CV_PARSE_FAILED'
  | 'CV_SANITIZE_FAILED'
  | 'CV_SCAN_FAILED'
  | 'DUPLICATE_CV_FILE'
  | 'DUPLICATE_APPLICATION'
  | 'FILE_TOO_LARGE'
  | 'FORBIDDEN'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INTERNAL_SERVER_ERROR'
  | 'INVALID_STATE_TRANSITION'
  | 'MALWARE_DETECTED'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'UPLOAD_RATE_LIMIT_EXCEEDED'
  | 'VALIDATION_ERROR'
  | string;

interface NormalizedApiError {
  status: number;
  code: ApiErrorCode;
  message: string;
  details: unknown[];
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    if (response.headersSent) {
      response.end();
      return;
    }

    const error = this.normalizeException(exception);
    response.status(error.status).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
      meta: {
        requestId: this.resolveRequestId(request),
        timestamp: new Date().toISOString(),
      },
    });
  }

  private normalizeException(exception: unknown): NormalizedApiError {
    const status = this.extractHttpStatus(exception);
    const responseBody = this.extractHttpResponse(exception);
    const explicitCode = this.extractExplicitCode(responseBody, exception);
    const rawMessage = this.extractRawMessage(responseBody, exception);
    const details = this.extractDetails(responseBody, status);

    if (explicitCode) {
      return this.fromExplicitCode(explicitCode, status, rawMessage, details);
    }

    return this.fromStatusAndMessage(status, rawMessage, details, exception);
  }

  private fromExplicitCode(
    code: string,
    status: number,
    rawMessage: string,
    details: unknown[],
  ): NormalizedApiError {
    if (code === 'MALWARE_DETECTED') {
      return this.buildError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        code,
        'CV file does not meet the security policy.',
      );
    }

    if (code === 'CV_SCAN_FAILED') {
      return this.buildError(
        this.isServerErrorStatus(status) ? status : HttpStatus.SERVICE_UNAVAILABLE,
        code,
        'CV security scan could not be completed. Please retry later.',
      );
    }

    if (code === 'CV_SANITIZE_FAILED') {
      return this.buildError(
        this.isServerErrorStatus(status) ? status : HttpStatus.SERVICE_UNAVAILABLE,
        code,
        'CV sanitization failed. Please retry later.',
      );
    }

    if (code === 'CV_PARSE_FAILED') {
      return this.buildError(
        this.isServerErrorStatus(status) || status === HttpStatus.UNPROCESSABLE_ENTITY
          ? status
          : HttpStatus.SERVICE_UNAVAILABLE,
        code,
        'CV parsing failed. Manual review or retry is required.',
      );
    }

    if (code === 'DUPLICATE_APPLICATION') {
      return this.buildError(
        HttpStatus.CONFLICT,
        code,
        'An application already exists for this job posting.',
      );
    }

    if (code === 'DUPLICATE_CV_FILE') {
      return this.buildError(
        HttpStatus.CONFLICT,
        code,
        'This CV file has already been uploaded for this application.',
      );
    }

    if (code === 'IDEMPOTENCY_CONFLICT') {
      return this.buildError(
        HttpStatus.CONFLICT,
        code,
        'Idempotency key was already used with different application data.',
      );
    }

    if (code === 'FILE_TOO_LARGE') {
      return this.buildError(
        HttpStatus.PAYLOAD_TOO_LARGE,
        code,
        'CV file exceeds the allowed size.',
      );
    }

    if (code === 'UNSUPPORTED_FILE_TYPE') {
      return this.buildError(
        HttpStatus.BAD_REQUEST,
        code,
        'CV file type is not supported.',
      );
    }

    return this.buildError(
      status,
      code,
      this.publicMessageForCode(code, rawMessage),
      details,
    );
  }

  private fromStatusAndMessage(
    status: number,
    rawMessage: string,
    details: unknown[],
    exception: unknown,
  ): NormalizedApiError {
    const message = rawMessage.toLowerCase();
    const exceptionCode = this.extractExceptionCode(exception);

    if (exceptionCode === 'LIMIT_FILE_SIZE' || message.includes('exceeds 20mb')) {
      return this.buildError(
        HttpStatus.PAYLOAD_TOO_LARGE,
        'FILE_TOO_LARGE',
        'CV file exceeds the allowed size.',
      );
    }

    if (status === HttpStatus.UNAUTHORIZED) {
      return this.buildError(status, 'UNAUTHORIZED', 'Authentication is required.');
    }

    if (status === HttpStatus.FORBIDDEN) {
      return this.buildError(status, 'FORBIDDEN', 'You do not have permission to perform this action.');
    }

    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      return this.buildError(
        status,
        'UPLOAD_RATE_LIMIT_EXCEEDED',
        'Too many requests. Please retry later.',
      );
    }

    if (status === HttpStatus.NOT_FOUND || this.isNotFoundMessage(message)) {
      return this.buildError(
        HttpStatus.NOT_FOUND,
        'NOT_FOUND',
        'Requested resource was not found.',
      );
    }

    if (this.isUnsupportedFileMessage(message)) {
      return this.buildError(
        HttpStatus.BAD_REQUEST,
        'UNSUPPORTED_FILE_TYPE',
        'CV file type is not supported.',
      );
    }

    if (message.includes('malware')) {
      return this.buildError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'MALWARE_DETECTED',
        'CV file does not meet the security policy.',
      );
    }

    if (this.isSanitizeFailureMessage(message)) {
      return this.buildError(
        this.isServerErrorStatus(status) ? status : HttpStatus.SERVICE_UNAVAILABLE,
        'CV_SANITIZE_FAILED',
        'CV sanitization failed. Please retry later.',
      );
    }

    if (this.isParseFailureMessage(message)) {
      return this.buildError(
        status === HttpStatus.UNPROCESSABLE_ENTITY || this.isServerErrorStatus(status)
          ? status
          : HttpStatus.SERVICE_UNAVAILABLE,
        'CV_PARSE_FAILED',
        'CV parsing failed. Manual review or retry is required.',
      );
    }

    if (this.isScanFailureMessage(message)) {
      return this.buildError(
        this.isServerErrorStatus(status) ? status : HttpStatus.SERVICE_UNAVAILABLE,
        'CV_SCAN_FAILED',
        'CV security scan could not be completed. Please retry later.',
      );
    }

    if (this.isDuplicateApplicationMessage(message)) {
      return this.buildError(
        HttpStatus.CONFLICT,
        'DUPLICATE_APPLICATION',
        'An application already exists for this job posting.',
      );
    }

    if (this.isInvalidStateMessage(message)) {
      return this.buildError(
        HttpStatus.CONFLICT,
        'INVALID_STATE_TRANSITION',
        'This action is not available for the current state.',
      );
    }

    if (status === HttpStatus.BAD_REQUEST) {
      return this.buildError(
        status,
        'VALIDATION_ERROR',
        'Request payload is invalid.',
        details,
      );
    }

    if (this.isServerErrorStatus(status)) {
      return this.buildError(
        status,
        'INTERNAL_SERVER_ERROR',
        'Request could not be completed. Please retry later.',
      );
    }

    return this.buildError(
      status,
      'VALIDATION_ERROR',
      'Request payload is invalid.',
      details,
    );
  }

  private extractHttpStatus(exception: unknown) {
    if (exception instanceof HttpException) return exception.getStatus();
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private extractHttpResponse(exception: unknown) {
    if (exception instanceof HttpException) return exception.getResponse();
    return null;
  }

  private extractExplicitCode(responseBody: unknown, exception: unknown) {
    const exceptionCode = this.extractExceptionCode(exception);
    if (exceptionCode && exceptionCode !== 'LIMIT_FILE_SIZE') return exceptionCode;

    if (!this.isRecord(responseBody)) return null;
    if (typeof responseBody.code === 'string') return responseBody.code;
    if (this.isRecord(responseBody.error) && typeof responseBody.error.code === 'string') {
      return responseBody.error.code;
    }
    return null;
  }

  private extractExceptionCode(exception: unknown) {
    return this.isRecord(exception) && typeof exception.code === 'string'
      ? exception.code
      : null;
  }

  private extractRawMessage(responseBody: unknown, exception: unknown) {
    if (typeof responseBody === 'string') return responseBody;
    if (this.isRecord(responseBody)) {
      const message = responseBody.message;
      if (Array.isArray(message)) return message.join(' ');
      if (typeof message === 'string') return message;
      if (this.isRecord(responseBody.error) && typeof responseBody.error.message === 'string') {
        return responseBody.error.message;
      }
    }
    if (exception instanceof Error) return exception.message;
    return '';
  }

  private extractDetails(responseBody: unknown, status: number) {
    if (!this.isRecord(responseBody)) return [];

    const details = responseBody.details;
    if (Array.isArray(details)) return details.map((item) => this.toSafeDetail(item));

    const message = responseBody.message;
    if (status === HttpStatus.BAD_REQUEST && Array.isArray(message)) {
      return message.map((item) => this.toSafeDetail(item));
    }

    return [];
  }

  private toSafeDetail(value: unknown) {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    return 'Invalid value.';
  }

  private publicMessageForCode(code: string, rawMessage: string) {
    if (this.isSensitiveText(rawMessage)) return 'Request could not be completed. Please retry later.';
    return rawMessage || this.defaultMessageForCode(code);
  }

  private defaultMessageForCode(code: string) {
    if (code === 'UNAUTHORIZED') return 'Authentication is required.';
    if (code === 'FORBIDDEN') return 'You do not have permission to perform this action.';
    if (code === 'NOT_FOUND') return 'Requested resource was not found.';
    if (code === 'INVALID_STATE_TRANSITION') return 'This action is not available for the current state.';
    return 'Request could not be completed. Please retry later.';
  }

  private isNotFoundMessage(message: string) {
    return message.includes('not found') || message.startsWith('cannot get ') || message.startsWith('cannot post ');
  }

  private isUnsupportedFileMessage(message: string) {
    return message.includes('unsupported cv file type')
      || message.includes('mime type')
      || message.includes('file signature')
      || message.includes('invalid cv filename')
      || message.includes('invalid server cv filename');
  }

  private isDuplicateApplicationMessage(message: string) {
    return message.includes('duplicate application')
      || message.includes('application already exists')
      || message.includes('already applied');
  }

  private isInvalidStateMessage(message: string) {
    return message.includes('status does not allow')
      || message.includes('status does not match')
      || message.includes('already has this status')
      || message.includes('already being')
      || message.includes('terminal application')
      || message.includes('cannot receive')
      || message.includes('cannot be edited')
      || message.includes('cannot change')
      || message.includes('cannot be used')
      || message.includes('cannot be parsed')
      || message.includes('must be active')
      || message.includes('must have a job description version')
      || message.includes('not open')
      || message.includes('closed');
  }

  private isScanFailureMessage(message: string) {
    return message.includes('security scan')
      || message.includes('scan failed')
      || message.includes('scanner failed')
      || message.includes('scanner timeout');
  }

  private isSanitizeFailureMessage(message: string) {
    return message.includes('sanitize failed')
      || message.includes('sanitization failed')
      || message.includes('cv sanitization failed');
  }

  private isParseFailureMessage(message: string) {
    return message.includes('parse failed')
      || message.includes('parsing failed')
      || message.includes('cv parsing failed');
  }

  private isServerErrorStatus(status: number) {
    return status >= 500;
  }

  private isSensitiveText(value: string) {
    const normalized = value.toLowerCase();
    return /[a-z]:\\/i.test(value)
      || normalized.includes('/storage/')
      || normalized.includes('\\storage\\')
      || normalized.includes('/uploads/')
      || normalized.includes('\\uploads\\')
      || normalized.includes('stack')
      || normalized.includes('ghostscript')
      || normalized.includes('docker ')
      || normalized.includes('podman ')
      || normalized.includes('select ')
      || normalized.includes('insert ')
      || normalized.includes('update ')
      || normalized.includes('delete ');
  }

  private buildError(
    status: number,
    code: ApiErrorCode,
    message: string,
    details: unknown[] = [],
  ): NormalizedApiError {
    return { status, code, message, details };
  }

  private resolveRequestId(request: Request) {
    const header = request.headers['x-request-id'];
    if (Array.isArray(header)) return header[0] ?? randomUUID();
    return header || randomUUID();
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
