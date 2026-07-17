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
  UnprocessableEntityException,
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
import { FormSessionsService } from '../form-sessions/form-sessions.service';
import { CvDocumentEntity } from '../cv-documents/entities/cv-document.entity';
import { ParsedProfileEntity } from '../cv-documents/entities/parsed-profile.entity';
import {
  buildCvQuarantineFileName,
  deleteCvQuarantineFile,
  ensureCvQuarantineRoot,
} from '../cv-documents/storage/cv-quarantine-storage';
import {
  ApiErrorResponses,
  apiSuccessEnvelopeSchema,
} from '../common/swagger/api-envelope.schema';
import { validateResumeSignals } from '../cv-parsing/resume-validation.util';
import { CvParsingService } from '../cv-parsing/cv-parsing.service';
import {
  CvSimilarityIdentity,
  CvSimilarityService,
} from '../cv-parsing/cv-similarity.service';
import { FileParserService } from '../file-parser/file-parser.service';
import {
  ApplicationStatus,
  JobPostingStatus,
  RecruitmentChannel,
} from '../recruitment-common';
import { PublicApplyDto } from './dto/public-apply.dto';
import { JobPostingEntity } from './entities/job-posting.entity';
import { JobPostingsService } from './job-postings.service';

interface PublicJobDescriptionSnapshot extends Record<string, unknown> {
  jobDescription?: {
    summary?: unknown;
    description?: unknown;
    overview?: unknown;
    responsibilities?: unknown;
    requirements?: unknown;
    benefits?: unknown;
    salary?: unknown;
    annualLeaveDays?: unknown;
    department?: unknown;
    applicationDeadline?: unknown;
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
  | 'CV_SANITIZE_FAILED'
  | 'CV_PARSE_FAILED'
  | 'CV_NOT_RESUME'
  | 'DUPLICATE_APPLICATION'
  | 'DUPLICATE_CV_CONTENT'
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

interface UploadedResumeText {
  rawText: string;
  normalizedText: string;
}

const MAX_PUBLIC_APPLY_CV_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const allowedPublicApplyExtensions = new Set(['.pdf']);
const PUBLIC_CANDIDATE_CV_UPDATE_ALLOWED_STATUSES = [
  ApplicationStatus.APPLICATION_CREATED,
  ApplicationStatus.APPLICATION_VALIDATING,
  ApplicationStatus.APPLICATION_DUPLICATE_CHECKING,
  ApplicationStatus.APPLICATION_OVERWRITTEN,
  ApplicationStatus.CV_UPLOADED,
  ApplicationStatus.CV_STORED_QUARANTINE,
  ApplicationStatus.CV_SCAN_REQUESTED,
  ApplicationStatus.CV_SCAN_PASSED,
  ApplicationStatus.CV_SCAN_FAILED,
  ApplicationStatus.CV_SANITIZING,
  ApplicationStatus.CV_SANITIZED,
  ApplicationStatus.CV_SANITIZE_FAILED,
  ApplicationStatus.CV_PARSED,
  ApplicationStatus.CV_PARSE_FAILED,
  ApplicationStatus.PROFILE_DUPLICATE_CHECKED,
  ApplicationStatus.PROFILE_DUPLICATE_NEEDS_REVIEW,
  ApplicationStatus.MAPPING_REQUESTED,
  ApplicationStatus.MAPPING_DONE,
  ApplicationStatus.MAPPING_FAILED,
] as const;

const publicJobPostingSchema = {
  type: 'object',
  properties: {
    jobPostingId: { type: 'string', format: 'uuid' },
    title: { type: 'string' },
    status: { type: 'string', example: JobPostingStatus.PUBLISHED },
    publicSlug: { type: 'string' },
    summary: { type: 'string' },
    description: { type: 'string' },
    overview: { type: 'string', nullable: true },
    responsibilities: { type: 'string', nullable: true },
    requirements: { type: 'string' },
    benefits: { type: 'object', nullable: true, additionalProperties: true },
    salary: { type: 'string', nullable: true },
    annualLeaveDays: { type: 'string', nullable: true },
    department: { type: 'string', nullable: true },
    applicationDeadline: { type: 'string', format: 'date', nullable: true },
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
    status: { type: 'string', example: 'CV_ACCEPTED' },
    processingStatus: { type: 'string', example: 'ACCEPTED' },
    originalCvDocumentId: { type: 'string', format: 'uuid' },
    cleanCvDocumentId: { type: 'string', format: 'uuid' },
    currentCvDocumentId: { type: 'string', format: 'uuid' },
    parsedProfileId: { type: 'string', format: 'uuid' },
    nextStep: { type: 'string', example: 'CV_JD_MAPPING_PENDING' },
    message: {
      type: 'string',
      example: 'CV accepted. Malware scan, sanitization and parsing completed successfully.',
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
      cb(new UnprocessableEntityException({
        code: 'UNSUPPORTED_FILE_TYPE',
        message: 'Only PDF CV files are supported for public apply.',
      }), false);
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
    private readonly cvParsingService: CvParsingService,
    private readonly cvSimilarityService: CvSimilarityService,
    private readonly fileParserService: FileParserService,
    private readonly formSessionsService: FormSessionsService,
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
    description: 'CV upload accepted; malware scan and sanitization completed successfully.',
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
      const uploadedResumeText = await this.extractAndValidateUploadedCvText(
        file,
        candidate,
      );
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

      const isPublicReapply = applicationResult.duplicate
        && applicationResult.duplicateReason !== 'IDEMPOTENT_REPLAY';
      if (isPublicReapply) {
        this.assertPublicReapplyBelongsToSameCandidate(applicationResult, candidate);
        await this.checkPublicReapplyCvSimilarity({
          application: applicationResult,
          candidate,
          uploadedNormalizedText: uploadedResumeText.normalizedText,
        });
      }

      handedToCvUploadService = true;
      const originalCvDocument = await this.cvDocumentsService.uploadOriginalCv({
        applicationId: applicationResult.application.id,
        file,
        replaceCurrent: true,
        reason: dto.note,
        actorId: null,
        idempotencyKey: normalizedIdempotencyKey,
        allowedApplicationStatuses: isPublicReapply
          ? PUBLIC_CANDIDATE_CV_UPDATE_ALLOWED_STATUSES
          : undefined,
        scheduleSanitizeAfterScanPass: false,
      });
      const cleanCvDocument = await this.cvDocumentsService.sanitizeOriginalCvAfterScanPass({
        applicationId: applicationResult.application.id,
        originalCvDocumentId: originalCvDocument.id,
        actorId: null,
        idempotencyKey: normalizedIdempotencyKey,
        scheduleParseAfterSanitizeSuccess: false,
      });
      const parsedProfile = await this.cvParsingService.parseCleanCvDocument({
        applicationId: applicationResult.application.id,
        cvDocumentId: cleanCvDocument.id,
        actorId: null,
        idempotencyKey: normalizedIdempotencyKey,
      });

      // Automatically generate a questionnaire form session and send email to candidate in background
      this.formSessionsService.generateFormSession(applicationResult.application.id).catch((err) => {
        this.formSessionsService['logger'].error(`Failed to auto-generate form session on candidate apply: ${err.message}`);
      });

      return {
        success: true,
        data: this.toApplyResponse(
          jobPostingId,
          applicationResult,
          originalCvDocument,
          cleanCvDocument,
          parsedProfile,
        ),
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
      overview: this.asString(jobDescription?.overview)
        ?? posting.jobDescription?.overview
        ?? null,
      responsibilities: this.asString(jobDescription?.responsibilities)
        ?? posting.jobDescription?.responsibilities
        ?? null,
      requirements: this.asString(jobDescription?.requirements)
        ?? posting.jobDescription?.requirements
        ?? '',
      benefits: this.asRecord(jobDescription?.benefits)
        ?? posting.jobDescription?.benefits
        ?? null,
      salary: this.asString(jobDescription?.salary)
        ?? posting.jobDescription?.salary
        ?? null,
      annualLeaveDays: this.asDisplayText(jobDescription?.annualLeaveDays)
        ?? posting.jobDescription?.annualLeaveDays
        ?? null,
      department: this.asString(jobDescription?.department)
        ?? posting.jobDescription?.department
        ?? null,
      applicationDeadline: this.asString(jobDescription?.applicationDeadline)
        ?? posting.jobDescription?.applicationDeadline
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
    originalCvDocument: CvDocumentEntity,
    cleanCvDocument: CvDocumentEntity,
    parsedProfile: ParsedProfileEntity,
  ) {
    return {
      applicationId: applicationResult.application.id,
      candidateId: applicationResult.candidate.id,
      jobPostingId,
      status: 'CV_ACCEPTED',
      processingStatus: 'ACCEPTED',
      originalCvDocumentId: originalCvDocument.id,
      cleanCvDocumentId: cleanCvDocument.id,
      currentCvDocumentId: cleanCvDocument.id,
      parsedProfileId: parsedProfile.id,
      nextStep: 'CV_JD_MAPPING_PENDING',
      message: 'CV accepted. Malware scan, sanitization and parsing completed successfully.',
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

  private async extractAndValidateUploadedCvText(
    file: Express.Multer.File,
    identity: CvSimilarityIdentity,
  ): Promise<UploadedResumeText> {
    const parsedData = await this.fileParserService.parseFile(file.path);
    const rawText = typeof parsedData.rawText === 'string' ? parsedData.rawText : '';
    const validation = validateResumeSignals(parsedData, rawText);

    if (validation.isLikelyCv) {
      return {
        rawText,
        normalizedText: this.cvSimilarityService.normalizeForSimilarity(rawText, identity),
      };
    }

    throw new UnprocessableEntityException({
      code: 'CV_NOT_RESUME',
      message: 'Uploaded file is not a valid CV.',
      details: [
        {
          requiredSignals: validation.requiredSignals,
          foundSignals: validation.foundSignals,
          reasons: validation.reasons,
        },
      ],
    });
  }

  private assertPublicReapplyBelongsToSameCandidate(
    applicationResult: CreateApplicationResult,
    candidate: { name: string; email: string; phone: string },
  ) {
    const existingCandidate = applicationResult.application.candidate
      ?? applicationResult.candidate;

    const sameName = this.normalizeCandidateName(existingCandidate?.name)
      === this.normalizeCandidateName(candidate.name);
    const sameEmail = this.normalizeCandidateEmail(existingCandidate?.email)
      === this.normalizeCandidateEmail(candidate.email);
    const samePhone = this.normalizeCandidatePhone(existingCandidate?.phone)
      === this.normalizeCandidatePhone(candidate.phone);

    if (sameName && sameEmail && samePhone) return;

    throw new ConflictException({
      code: 'DUPLICATE_APPLICATION',
      message: 'An application already exists for this job posting.',
    });
  }

  private async checkPublicReapplyCvSimilarity(input: {
    application: CreateApplicationResult;
    candidate: CvSimilarityIdentity;
    uploadedNormalizedText: string;
  }): Promise<void> {
    const parsedProfile = await this.applicationsService.findParsedProfileByApplicationId(
      input.application.application.id,
    );
    if (!parsedProfile) return;

    const parsedRawText = typeof parsedProfile.parsedData?.rawText === 'string'
      ? parsedProfile.parsedData.rawText
      : '';
    const oldText = parsedRawText.trim()
      ? parsedRawText
      : await this.cvDocumentsService.extractCleanCvText(parsedProfile.cvDocument);
    const result = this.cvSimilarityService.compare(
      oldText,
      input.uploadedNormalizedText,
      input.candidate,
    );
    const isDuplicate = result.score >= result.threshold;
    const previousCvDocumentId = parsedProfile.cvDocument?.id ?? parsedProfile.cvDocumentId;
    const candidateId = input.application.application.candidateId ?? input.application.candidate.id;

    await this.applicationsService.recordCvContentSimilarityCheck({
      applicationId: input.application.application.id,
      candidateId,
      jobPostingId: input.application.application.jobPostingId,
      previousParsedProfileId: parsedProfile.id,
      previousCvDocumentId,
      oldNormalizedTextHash: result.oldNormalizedTextHash,
      newNormalizedTextHash: result.newNormalizedTextHash,
      score: result.score,
      threshold: result.threshold,
      methodVersion: result.methodVersion,
      decision: isDuplicate ? 'DUPLICATE_FOUND' : 'PASSED',
    });

    if (isDuplicate) {
      throw new ConflictException({
        code: 'DUPLICATE_CV_CONTENT',
        message: 'This CV is too similar to a previous CV submitted for this job posting.',
      });
    }
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

  private normalizeCandidateName(value?: string | null) {
    return this.optionalText(value)
      ?.normalize('NFC')
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase('vi')
      ?? null;
  }

  private normalizeCandidateEmail(value?: string | null) {
    return this.optionalText(value)?.toLowerCase() ?? null;
  }

  private normalizeCandidatePhone(value?: string | null) {
    const normalized = this.optionalText(value)?.replace(/[^\d+]/g, '');
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

  private asDisplayText(value: unknown) {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return null;
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

  if (
    code === 'CV_SANITIZE_FAILED'
    || normalizedMessage.includes('sanitization')
    || normalizedMessage.includes('sanitize')
  ) {
    return buildPublicApplyError(
      status === HttpStatus.UNPROCESSABLE_ENTITY
        ? HttpStatus.UNPROCESSABLE_ENTITY
        : HttpStatus.SERVICE_UNAVAILABLE,
      'CV_SANITIZE_FAILED',
      'CV could not be sanitized. Please upload a valid PDF CV or try again later.',
    );
  }

  if (
    code === 'CV_PARSE_FAILED'
    || normalizedMessage.includes('parsing')
    || normalizedMessage.includes('parse')
  ) {
    return buildPublicApplyError(
      status === HttpStatus.UNPROCESSABLE_ENTITY
        ? HttpStatus.UNPROCESSABLE_ENTITY
        : HttpStatus.SERVICE_UNAVAILABLE,
      'CV_PARSE_FAILED',
      'CV could not be processed safely. Please upload a valid PDF CV or try again later.',
    );
  }

  if (code === 'CV_SCAN_FAILED' || status === HttpStatus.SERVICE_UNAVAILABLE) {
    return buildPublicApplyError(
      HttpStatus.SERVICE_UNAVAILABLE,
      'CV_SCAN_FAILED',
      'CV security scan could not be completed. Please retry later.',
    );
  }

  if (code === 'CV_NOT_RESUME') {
    return buildPublicApplyError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'CV_NOT_RESUME',
      'Uploaded file does not look like a CV.',
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

  if (code === 'DUPLICATE_CV_CONTENT') {
    return buildPublicApplyError(
      HttpStatus.CONFLICT,
      'DUPLICATE_CV_CONTENT',
      'This CV is too similar to a previous CV submitted for this job posting.',
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
    code === 'UNSUPPORTED_FILE_TYPE'
    || normalizedMessage.includes('only pdf cv files are supported')
    || normalizedMessage.includes('unsupported cv file type')
    || normalizedMessage.includes('mime type')
    || normalizedMessage.includes('file signature')
    || normalizedMessage.includes('invalid cv filename')
    || normalizedMessage.includes('invalid server cv filename')
  ) {
    return buildPublicApplyError(
      status === HttpStatus.UNPROCESSABLE_ENTITY
        ? HttpStatus.UNPROCESSABLE_ENTITY
        : HttpStatus.BAD_REQUEST,
      'UNSUPPORTED_FILE_TYPE',
      'Only PDF CV files are supported.',
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

  if (
    code === 'INVALID_STATE_TRANSITION'
    || normalizedMessage.includes('terminal application')
    || normalizedMessage.includes('cannot receive candidate cv update')
  ) {
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
