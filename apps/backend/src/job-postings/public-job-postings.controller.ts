import {
  ArgumentsHost,
  BadRequestException,
  Body,
  Catch,
  ConflictException,
  Controller,
  ExceptionFilter,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createHash, randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import {
  ApplicationsService,
  CreateApplicationResult,
} from '../applications/applications.service';
import { CvDocumentsService } from '../cv-documents/cv-documents.service';
import { CvDocumentEntity } from '../cv-documents/entities/cv-document.entity';
import {
  buildCvQuarantineFileName,
  deleteCvQuarantineFile,
  ensureCvQuarantineRoot,
} from '../cv-documents/storage/cv-quarantine-storage';
import {
  ApiErrorResponses,
  apiSuccessEnvelopeSchema,
} from '../common/swagger/api-envelope.schema';
import { JobPostingStatus, RecruitmentChannel } from '../recruitment-common';
import { PublicApplyDto } from './dto/public-apply.dto';
import { JobPostingEntity } from './entities/job-posting.entity';
import { JobPostingsService } from './job-postings.service';

interface PublicJobDescriptionSnapshot extends Record<string, unknown> {
  jobDescription?: {
    summary?: unknown;
    description?: unknown;
    requirements?: unknown;
    benefits?: unknown;
  };
  position?: {
    id?: unknown;
    name?: unknown;
  } | null;
  level?: {
    id?: unknown;
    name?: unknown;
    displayName?: unknown;
  } | null;
}

type PublicApplyErrorCode =
  | 'CV_SCAN_FAILED'
  | 'DUPLICATE_APPLICATION'
  | 'DUPLICATE_CV_FILE'
  | 'FILE_TOO_LARGE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_STATE_TRANSITION'
  | 'MALWARE_DETECTED'
  | 'NOT_FOUND'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'UPLOAD_RATE_LIMIT_EXCEEDED'
  | 'VALIDATION_ERROR';

interface PublicApplyError {
  status: number;
  code: PublicApplyErrorCode;
  message: string;
}

const MAX_PUBLIC_APPLY_CV_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const allowedPublicApplyExtensions = new Set(['.pdf', '.docx', '.xlsx']);

const publicJobPostingSchema = {
  type: 'object',
  properties: {
    jobPostingId: { type: 'string', format: 'uuid' },
    title: { type: 'string' },
    status: { type: 'string', example: JobPostingStatus.PUBLISHED },
    publicSlug: { type: 'string' },
    summary: { type: 'string' },
    description: { type: 'string' },
    requirements: { type: 'object', additionalProperties: true },
    benefits: { type: 'object', nullable: true, additionalProperties: true },
    position: {
      type: 'object',
      nullable: true,
      properties: {
        name: { type: 'string', nullable: true },
      },
    },
    level: {
      type: 'object',
      nullable: true,
      properties: {
        name: { type: 'string', nullable: true },
        displayName: { type: 'string', nullable: true },
      },
    },
    openAt: { type: 'string', format: 'date-time', nullable: true },
    closeAt: { type: 'string', format: 'date-time', nullable: true },
    applyUrl: { type: 'string', example: '/api/public/job-postings/<id>/apply' },
  },
};

const publicApplySuccessSchema = apiSuccessEnvelopeSchema({
  type: 'object',
  properties: {
    applicationId: { type: 'string', format: 'uuid' },
    candidateId: { type: 'string', format: 'uuid' },
    jobPostingId: { type: 'string', format: 'uuid' },
    status: { type: 'string', example: 'CV_SCAN_PASSED' },
    processingStatus: { type: 'string', example: 'ACCEPTED' },
    cvDocumentId: { type: 'string', format: 'uuid' },
    nextStep: { type: 'string', example: 'CV_SANITIZE_PENDING' },
    message: {
      type: 'string',
      example: 'CV upload accepted. Sanitization and parsing will continue asynchronously.',
    },
  },
});

const publicApplyFileInterceptor = FileInterceptor('cvFile', {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      try {
        cb(null, ensureCvQuarantineRoot());
      } catch (error) {
        cb(error instanceof Error ? error : new Error('CV quarantine storage is invalid'), '');
      }
    },
    filename: (_req, file, cb) => {
      cb(null, buildCvQuarantineFileName(file.originalname));
    },
  }),
  fileFilter: (_req, file, cb) => {
    const extension = extname(file.originalname).toLowerCase();

    if (!allowedPublicApplyExtensions.has(extension)) {
      cb(new BadRequestException('Unsupported CV file type'), false);
      return;
    }

    cb(null, true);
  },
  limits: { fileSize: MAX_PUBLIC_APPLY_CV_FILE_SIZE_BYTES },
});

@Catch()
class PublicApplyExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const error = toPublicApplyError(exception);

    response.status(error.status).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: [],
      },
      meta: {
        requestId: randomUUID(),
        idempotencyKey: normalizeHeader(request.headers['idempotency-key']),
        timestamp: new Date().toISOString(),
      },
    });
  }
}

@ApiTags('Public Job Postings')
@Controller('public/job-postings')
@ApiErrorResponses([400, 404, 409, 413, 422, 429, 503])
export class PublicJobPostingsController {
  constructor(
    private readonly jobPostingsService: JobPostingsService,
    private readonly applicationsService: ApplicationsService,
    private readonly cvDocumentsService: CvDocumentsService,
  ) {}

  @Get(':slug')
  @ApiOperation({ summary: 'Get published job posting detail by public slug' })
  @ApiParam({ name: 'slug', description: 'Public job posting slug' })
  @ApiResponse({
    status: 200,
    description: 'Published public job posting detail.',
    schema: apiSuccessEnvelopeSchema(publicJobPostingSchema),
  })
  async findBySlug(@Param('slug') slug: string) {
    const posting = await this.jobPostingsService.findPublishedBySlug(slug);
    return {
      success: true,
      data: this.toPublicDetail(posting),
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Post(':jobPostingId/apply')
  @UseFilters(PublicApplyExceptionFilter)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({ summary: 'Public candidate apply with CV upload' })
  @ApiParam({ name: 'jobPostingId', description: 'Published job posting id' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Optional idempotency key for safe public apply retries.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['fullName', 'email', 'phone', 'cvFile'],
      properties: {
        fullName: { type: 'string' },
        email: { type: 'string', format: 'email' },
        phone: { type: 'string' },
        note: { type: 'string' },
        cvFile: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'CV upload accepted; malware scan passed and async processing was scheduled.',
    schema: publicApplySuccessSchema,
  })
  @UseInterceptors(publicApplyFileInterceptor)
  async apply(
    @Param('jobPostingId', ParseUUIDPipe) jobPostingId: string,
    @Body() dto: PublicApplyDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!file) throw new BadRequestException('CV file is required');

    const normalizedIdempotencyKey = this.normalizeIdempotencyKey(idempotencyKey);
    const candidate = {
      name: this.requireText(dto.fullName, 'Candidate name'),
      email: this.requireText(dto.email, 'Candidate email'),
      phone: this.requireText(dto.phone, 'Candidate phone'),
    };
    let handedToCvUploadService = false;

    try {
      await this.applicationsService.assertPublicApplyRateLimit({
        jobPostingId,
        email: candidate.email,
        phone: candidate.phone,
        ipAddress: this.getClientIp(req),
        userAgent: normalizeHeader(req.headers['user-agent']),
      });
      await this.applicationsService.recordPublicApplyReceived({
        jobPostingId,
        email: candidate.email,
        phone: candidate.phone,
        ipAddress: this.getClientIp(req),
        userAgent: normalizeHeader(req.headers['user-agent']),
      });
      const applicationResult = await this.applicationsService.createFromApply({
        jobPostingId,
        candidate,
        sourceChannel: RecruitmentChannel.VCS_PORTAL,
        externalApplicationId: normalizedIdempotencyKey,
        rawPayload: this.toApplyRawPayload(dto, jobPostingId),
      });

      if (applicationResult.duplicate && !normalizedIdempotencyKey) {
        await deleteCvQuarantineFile(file.path);
        throw new ConflictException({
          code: 'DUPLICATE_APPLICATION',
          message: 'An application already exists for this job posting.',
        });
      }

      handedToCvUploadService = true;
      const cvDocument = await this.cvDocumentsService.uploadOriginalCv({
        applicationId: applicationResult.application.id,
        file,
        replaceCurrent: true,
        reason: dto.note,
        actorId: null,
        idempotencyKey: normalizedIdempotencyKey,
      });

      return {
        success: true,
        data: this.toApplyResponse(jobPostingId, applicationResult, cvDocument),
        meta: this.applyMeta(normalizedIdempotencyKey),
      };
    } catch (error) {
      if (!handedToCvUploadService) {
        await deleteCvQuarantineFile(file.path);
      }
      throw error;
    }
  }

  private toPublicDetail(posting: JobPostingEntity) {
    const snapshot = posting.jobDescriptionVersion
      ?.snapshot as PublicJobDescriptionSnapshot | undefined;
    const jobDescription = snapshot?.jobDescription;

    return {
      jobPostingId: posting.id,
      title: posting.title,
      status: JobPostingStatus.PUBLISHED,
      publicSlug: posting.publicSlug,
      summary: this.asString(jobDescription?.summary)
        ?? posting.jobDescription?.summary
        ?? '',
      description: this.asString(jobDescription?.description)
        ?? posting.jobDescription?.description
        ?? '',
      requirements: this.asRecord(jobDescription?.requirements)
        ?? posting.jobDescription?.requirements
        ?? {},
      benefits: this.asRecord(jobDescription?.benefits)
        ?? posting.jobDescription?.benefits
        ?? null,
      position: this.toPublicPosition(snapshot),
      level: this.toPublicLevel(snapshot),
      openAt: posting.openAt?.toISOString() ?? null,
      closeAt: posting.closeAt?.toISOString() ?? null,
      applyUrl: `/api/public/job-postings/${posting.id}/apply`,
    };
  }

  private toApplyResponse(
    jobPostingId: string,
    applicationResult: CreateApplicationResult,
    cvDocument: CvDocumentEntity,
  ) {
    return {
      applicationId: applicationResult.application.id,
      candidateId: applicationResult.candidate.id,
      jobPostingId,
      status: 'CV_SCAN_PASSED',
      processingStatus: 'ACCEPTED',
      cvDocumentId: cvDocument.id,
      nextStep: 'CV_SANITIZE_PENDING',
      message: 'CV upload accepted. Sanitization and parsing will continue asynchronously.',
    };
  }

  private toApplyRawPayload(dto: PublicApplyDto, jobPostingId: string) {
    const note = this.optionalText(dto.note);
    return {
      jobPostingId,
      candidateNameHash: this.hashIdentityText(dto.fullName, true),
      candidateEmailHash: this.hashIdentityText(dto.email, true),
      candidatePhoneHash: this.hashIdentityText(dto.phone),
      hasNote: Boolean(note),
    };
  }

  private applyMeta(idempotencyKey: string | null) {
    return {
      requestId: randomUUID(),
      idempotencyKey,
      timestamp: new Date().toISOString(),
    };
  }

  private normalizeIdempotencyKey(value?: string) {
    return this.optionalText(value)?.slice(0, 255) ?? null;
  }

  private requireText(value: string | undefined, fieldName: string) {
    const normalized = value?.trim();
    if (!normalized) throw new BadRequestException(`${fieldName} is required`);
    return normalized;
  }

  private optionalText(value?: string | null) {
    const normalized = value?.trim();
    return normalized || null;
  }

  private hashIdentityText(value?: string | null, lowerCase = false) {
    const normalized = this.optionalText(value);
    if (!normalized) return null;
    return createHash('sha256')
      .update(lowerCase ? normalized.toLowerCase() : normalized)
      .digest('hex');
  }

  private getClientIp(req: Request) {
    const forwardedFor = normalizeHeader(req.headers['x-forwarded-for']);
    const forwardedIp = forwardedFor?.split(',')[0]?.trim();
    return forwardedIp || req.ip || req.socket.remoteAddress || null;
  }

  private toPublicPosition(snapshot?: PublicJobDescriptionSnapshot) {
    const position = snapshot?.position;
    if (!position) return null;
    return {
      name: this.asString(position.name),
    };
  }

  private toPublicLevel(snapshot?: PublicJobDescriptionSnapshot) {
    const level = snapshot?.level;
    if (!level) return null;
    return {
      name: this.asString(level.name),
      displayName: this.asString(level.displayName),
    };
  }

  private asString(value: unknown) {
    return typeof value === 'string' ? value : null;
  }

  private asRecord(value: unknown) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }
}

function toPublicApplyError(exception: unknown): PublicApplyError {
  const status = exception instanceof HttpException
    ? exception.getStatus()
    : HttpStatus.INTERNAL_SERVER_ERROR;
  const code = extractErrorCode(exception);
  const message = extractErrorMessage(exception);
  const normalizedMessage = message.toLowerCase();

  if (code === 'LIMIT_FILE_SIZE' || normalizedMessage.includes('exceeds 20mb')) {
    return buildPublicApplyError(
      HttpStatus.PAYLOAD_TOO_LARGE,
      'FILE_TOO_LARGE',
      'CV file exceeds the allowed size.',
    );
  }

  if (code === 'MALWARE_DETECTED' || normalizedMessage.includes('malware')) {
    return buildPublicApplyError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'MALWARE_DETECTED',
      'CV file does not meet the security policy.',
    );
  }

  if (code === 'CV_SCAN_FAILED' || status === HttpStatus.SERVICE_UNAVAILABLE) {
    return buildPublicApplyError(
      HttpStatus.SERVICE_UNAVAILABLE,
      'CV_SCAN_FAILED',
      'CV security scan could not be completed. Please retry later.',
    );
  }

  if (code === 'IDEMPOTENCY_CONFLICT') {
    return buildPublicApplyError(
      HttpStatus.CONFLICT,
      'IDEMPOTENCY_CONFLICT',
      'Idempotency key was already used with different application data.',
    );
  }

  if (code === 'DUPLICATE_CV_FILE') {
    return buildPublicApplyError(
      HttpStatus.CONFLICT,
      'DUPLICATE_CV_FILE',
      'This CV file has already been uploaded for this application.',
    );
  }

  if (code === 'DUPLICATE_APPLICATION' || normalizedMessage.includes('duplicate')) {
    return buildPublicApplyError(
      HttpStatus.CONFLICT,
      'DUPLICATE_APPLICATION',
      'An application already exists for this job posting.',
    );
  }

  if (status === HttpStatus.TOO_MANY_REQUESTS) {
    return buildPublicApplyError(
      HttpStatus.TOO_MANY_REQUESTS,
      'UPLOAD_RATE_LIMIT_EXCEEDED',
      'Too many apply attempts. Please retry later.',
    );
  }

  if (
    normalizedMessage.includes('unsupported cv file type')
    || normalizedMessage.includes('mime type')
    || normalizedMessage.includes('file signature')
    || normalizedMessage.includes('invalid cv filename')
    || normalizedMessage.includes('invalid server cv filename')
  ) {
    return buildPublicApplyError(
      HttpStatus.BAD_REQUEST,
      'UNSUPPORTED_FILE_TYPE',
      'CV file type is not supported.',
    );
  }

  if (
    normalizedMessage.includes('job posting not found')
    || normalizedMessage.includes('job posting is not open')
    || normalizedMessage.includes('job posting is not open yet')
    || normalizedMessage.includes('job posting is closed')
    || status === HttpStatus.NOT_FOUND
  ) {
    return buildPublicApplyError(
      HttpStatus.NOT_FOUND,
      'NOT_FOUND',
      'Job posting is not available.',
    );
  }

  if (normalizedMessage.includes('terminal application')) {
    return buildPublicApplyError(
      HttpStatus.CONFLICT,
      'INVALID_STATE_TRANSITION',
      'This action is not available for the current state.',
    );
  }

  if (status === HttpStatus.BAD_REQUEST) {
    return buildPublicApplyError(
      HttpStatus.BAD_REQUEST,
      'VALIDATION_ERROR',
      'Request payload is invalid.',
    );
  }

  return buildPublicApplyError(
    HttpStatus.SERVICE_UNAVAILABLE,
    'CV_SCAN_FAILED',
    'CV security scan could not be completed. Please retry later.',
  );
}

function buildPublicApplyError(
  status: number,
  code: PublicApplyErrorCode,
  message: string,
): PublicApplyError {
  return { status, code, message };
}

function extractErrorCode(exception: unknown) {
  const exceptionCode = isRecord(exception) && typeof exception.code === 'string'
    ? exception.code
    : null;
  if (exceptionCode) return exceptionCode;

  if (!(exception instanceof HttpException)) return null;
  const response = exception.getResponse();
  if (!isRecord(response)) return null;

  if (typeof response.code === 'string') return response.code;
  if (isRecord(response.error) && typeof response.error.code === 'string') {
    return response.error.code;
  }

  return null;
}

function extractErrorMessage(exception: unknown) {
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    if (typeof response === 'string') return response;
    if (isRecord(response)) {
      const responseMessage = response.message;
      if (Array.isArray(responseMessage)) return responseMessage.join(' ');
      if (typeof responseMessage === 'string') return responseMessage;
      if (isRecord(response.error) && typeof response.error.message === 'string') {
        return response.error.message;
      }
    }
  }

  if (exception instanceof Error) return exception.message;
  return '';
}

function normalizeHeader(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
