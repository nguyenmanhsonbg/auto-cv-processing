import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

type Schema = Record<string, unknown>;

const errorExamples: Record<number, { code: string; message: string }> = {
  400: { code: 'VALIDATION_ERROR', message: 'Request payload is invalid.' },
  401: { code: 'UNAUTHORIZED', message: 'Authentication is required.' },
  403: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action.' },
  404: { code: 'NOT_FOUND', message: 'Requested resource was not found.' },
  409: {
    code: 'INVALID_STATE_TRANSITION',
    message: 'This action is not available for the current state.',
  },
  413: { code: 'FILE_TOO_LARGE', message: 'CV file exceeds the allowed size.' },
  422: { code: 'MALWARE_DETECTED', message: 'CV file does not meet the security policy.' },
  429: { code: 'UPLOAD_RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please retry later.' },
  500: {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Request could not be completed. Please retry later.',
  },
  503: {
    code: 'CV_SCAN_FAILED',
    message: 'CV security scan could not be completed. Please retry later.',
  },
};

export function apiSuccessEnvelopeSchema(dataSchema: Schema): Schema {
  return {
    type: 'object',
    required: ['success', 'data', 'meta'],
    properties: {
      success: { type: 'boolean', example: true },
      data: dataSchema,
      meta: {
        type: 'object',
        properties: {
          timestamp: { type: 'string', format: 'date-time' },
          requestId: { type: 'string' },
          idempotencyKey: { type: 'string', nullable: true },
        },
      },
    },
  };
}

export function apiPaginatedEnvelopeSchema(itemSchema: Schema): Schema {
  return {
    type: 'object',
    required: ['success', 'data', 'pagination', 'meta'],
    properties: {
      success: { type: 'boolean', example: true },
      data: {
        type: 'array',
        items: itemSchema,
      },
      pagination: {
        type: 'object',
        required: ['page', 'limit', 'total', 'totalPages'],
        properties: {
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 20 },
          total: { type: 'integer', example: 1 },
          totalPages: { type: 'integer', example: 1 },
        },
      },
      meta: {
        type: 'object',
        properties: {
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    },
  };
}

export function apiErrorEnvelopeSchema(
  code: string,
  message: string,
): Schema {
  return {
    type: 'object',
    required: ['success', 'error', 'meta'],
    properties: {
      success: { type: 'boolean', example: false },
      error: {
        type: 'object',
        required: ['code', 'message', 'details'],
        properties: {
          code: { type: 'string', example: code },
          message: { type: 'string', example: message },
          details: {
            type: 'array',
            items: {},
            example: [],
          },
        },
      },
      meta: {
        type: 'object',
        properties: {
          requestId: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    },
  };
}

export function ApiErrorResponses(statuses: number[] = [400, 401, 403, 404, 409, 500]) {
  return applyDecorators(
    ...statuses.map((status) => {
      const example = errorExamples[status] ?? errorExamples[500];
      return ApiResponse({
        status,
        description: `${example.code} error envelope`,
        schema: apiErrorEnvelopeSchema(example.code, example.message),
      });
    }),
  );
}
