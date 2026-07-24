import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, timingSafeEqual } from 'crypto';
import { Repository } from 'typeorm';
import { ApplicationsService } from '../applications/applications.service';
import { CvDocumentsService } from '../cv-documents/cv-documents.service';
import { deleteCvQuarantineFile } from '../cv-documents/storage/cv-quarantine-storage';
import { CvParsingService } from '../cv-parsing/cv-parsing.service';
import { ExtensionSourceSystem } from '../extension-integration/enums';
import { FormSessionsService } from '../form-sessions/form-sessions.service';
import { JobDescriptionEntity } from '../job-descriptions/entities/job-description.entity';
import { JobPostingEntity } from '../job-postings/entities/job-posting.entity';
import {
  JobPostingStatus,
  RecruitmentChannel,
} from '../recruitment-common';

const VCS_PORTAL_PAYLOAD_SOURCE = 'vcs_portal';
const VCS_PORTAL_WEBHOOK_EXTERNAL_PREFIX = 'wpforms';
const VCS_PORTAL_APPLY_FORM_IDS = new Set([2500, 2502, 2504]);

type JsonRecord = Record<string, unknown>;

interface NormalizedVcsPortalApplyPayload {
  raw: JsonRecord;
  sourceEntryId: string;
  externalApplicationId: string;
  formId: number;
  submittedAt: string;
  job: {
    sourceJobId: string;
    title: string | null;
    url: string | null;
    raw: JsonRecord;
  };
  candidate: {
    name: string;
    email: string | null;
    phone: string | null;
    raw: JsonRecord;
  };
  candidateFields: JsonRecord;
  cvMetadata: {
    status: string;
    originalFilename: string;
    hash: string;
    sourceHash: string | null;
    size: number | null;
    mime: string | null;
    storageKey: string | null;
    raw: JsonRecord;
  };
}

export interface HandleVcsPortalApplyWebhookInput {
  payloadJson?: string;
  cvFile?: Express.Multer.File;
  webhookKey?: string | string[];
}

@Injectable()
export class VcsPortalApplyWebhookService {
  private readonly logger = new Logger(VcsPortalApplyWebhookService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly applicationsService: ApplicationsService,
    private readonly cvDocumentsService: CvDocumentsService,
    private readonly cvParsingService: CvParsingService,
    private readonly formSessionsService: FormSessionsService,
    @InjectRepository(JobPostingEntity)
    private readonly jobPostingsRepo: Repository<JobPostingEntity>,
    @InjectRepository(JobDescriptionEntity)
    private readonly jobDescriptionsRepo: Repository<JobDescriptionEntity>,
  ) {}

  async handleApplyWebhook(input: HandleVcsPortalApplyWebhookInput) {
    if (!input.cvFile) {
      throw new BadRequestException({
        code: 'CLEAN_CV_FILE_REQUIRED',
        message: 'Clean CV file is required.',
      });
    }

    let cvFileHandled = false;
    try {
      this.assertWebhookKey(input.webhookKey);
      const payload = this.normalizePayload(input.payloadJson);
      this.assertMetadataMatchesUploadedFile(payload, input.cvFile);
      const jobPosting = await this.resolveJobPosting(payload.job.sourceJobId);
      this.assertJobPostingAcceptsPortalApply(jobPosting);

      const applicationResult = await this.applicationsService.createFromWebhook({
        jobPostingId: jobPosting.id,
        candidate: payload.candidate,
        sourceChannel: RecruitmentChannel.VCS_PORTAL,
        externalLeadId: payload.job.sourceJobId,
        externalApplicationId: payload.externalApplicationId,
        rawPayload: this.toApplicationRawPayload(payload, jobPosting.id),
      });

      cvFileHandled = true;
      const cleanCvResult = await this.cvDocumentsService.ingestExternalCleanCv({
        applicationId: applicationResult.application.id,
        file: input.cvFile,
        originalFileName: payload.cvMetadata.originalFilename,
        cleanFileHash: payload.cvMetadata.hash,
        sourceFileHash: payload.cvMetadata.sourceHash,
        sourceStorageKey: payload.cvMetadata.storageKey,
        sourceEntryId: payload.sourceEntryId,
        sourceSystem: ExtensionSourceSystem.VCS_PORTAL,
        idempotencyKey: payload.externalApplicationId,
        rawMetadata: {
          formId: payload.formId,
          submittedAt: payload.submittedAt,
          sourceJobId: payload.job.sourceJobId,
          sourceJobTitle: payload.job.title,
          sourceJobUrl: payload.job.url,
          cvMetadata: payload.cvMetadata.raw,
        },
      });

      if (cleanCvResult.created) {
        this.schedulePostIngestProcessing(
          applicationResult.application.id,
          cleanCvResult.cvDocument.id,
        );
      }

      return {
        success: true,
        data: {
          accepted: true,
          duplicate: applicationResult.duplicate,
          applicationCreated: applicationResult.created,
          duplicateReason: applicationResult.duplicateReason ?? null,
          cleanCvCreated: cleanCvResult.created,
          applicationId: applicationResult.application.id,
          candidateId: applicationResult.candidate.id,
          jobPostingId: jobPosting.id,
          cleanCvDocumentId: cleanCvResult.cvDocument.id,
          cleanCvParseStatus: cleanCvResult.cvDocument.parseStatus,
          postIngestProcessingScheduled: cleanCvResult.created,
        },
        meta: {
          source: VCS_PORTAL_PAYLOAD_SOURCE,
          sourceEntryId: payload.sourceEntryId,
          externalApplicationId: payload.externalApplicationId,
        },
      };
    } finally {
      if (!cvFileHandled) {
        await deleteCvQuarantineFile(input.cvFile.path);
      }
    }
  }

  private assertWebhookKey(value?: string | string[]) {
    const expectedKey = this.configService.get<string>('VCS_APPLY_WEBHOOK_KEY')?.trim();
    if (!expectedKey) {
      throw new ServiceUnavailableException({
        code: 'VCS_PORTAL_WEBHOOK_NOT_CONFIGURED',
        message: 'VCS Portal apply webhook key is not configured.',
      });
    }

    const providedKey = this.optionalText(Array.isArray(value) ? value[0] : value);
    if (!providedKey) {
      throw new UnauthorizedException({
        code: 'VCS_PORTAL_WEBHOOK_UNAUTHORIZED',
        message: 'VCS Portal webhook key is required.',
      });
    }

    const expected = Buffer.from(expectedKey);
    const provided = Buffer.from(providedKey);
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      throw new UnauthorizedException({
        code: 'VCS_PORTAL_WEBHOOK_UNAUTHORIZED',
        message: 'VCS Portal webhook key is invalid.',
      });
    }
  }

  private normalizePayload(payloadJson?: string): NormalizedVcsPortalApplyPayload {
    const raw = this.parsePayloadJson(payloadJson);
    const source = this.requireText(raw.source, 'source');
    if (source !== VCS_PORTAL_PAYLOAD_SOURCE) {
      throw new BadRequestException({
        code: 'VCS_PORTAL_SOURCE_INVALID',
        message: 'Webhook source must be vcs_portal.',
      });
    }

    const sourceEntryId = this.requireIdText(raw.source_entry_id, 'source_entry_id');
    const formId = this.requireInteger(raw.form_id, 'form_id');
    if (!VCS_PORTAL_APPLY_FORM_IDS.has(formId)) {
      throw new BadRequestException({
        code: 'VCS_PORTAL_FORM_NOT_SUPPORTED',
        message: 'Webhook form_id is not an apply form.',
      });
    }

    const job = this.requireRecord(raw.job, 'job');
    const candidate = this.requireRecord(raw.candidate, 'candidate');
    const candidateFields = this.optionalRecord(raw.candidate_fields) ?? {};
    const cvMetadata = this.requireRecord(raw.cv_metadata, 'cv_metadata');
    const normalizedCvMetadata = this.normalizeCvMetadata(cvMetadata);
    const normalizedCandidate = this.normalizeCandidate(candidate, candidateFields, sourceEntryId);

    return {
      raw,
      sourceEntryId,
      externalApplicationId: `${VCS_PORTAL_WEBHOOK_EXTERNAL_PREFIX}:${sourceEntryId}`,
      formId,
      submittedAt: this.requireText(raw.submitted_at, 'submitted_at'),
      job: {
        sourceJobId: this.requireIdText(job.job_id, 'job.job_id'),
        title: this.optionalText(job.title),
        url: this.optionalText(job.url),
        raw: job,
      },
      candidate: normalizedCandidate,
      candidateFields,
      cvMetadata: normalizedCvMetadata,
    };
  }

  private normalizeCvMetadata(value: JsonRecord) {
    const status = this.requireText(value.status, 'cv_metadata.status');
    if (status !== 'sanitized') {
      throw new BadRequestException({
        code: 'CLEAN_CV_STATUS_INVALID',
        message: 'Webhook CV metadata status must be sanitized.',
      });
    }

    const mime = this.optionalText(value.mime);
    if (mime && mime !== 'application/pdf') {
      throw new BadRequestException({
        code: 'CLEAN_CV_MIME_INVALID',
        message: 'Webhook clean CV must be application/pdf.',
      });
    }

    return {
      status,
      originalFilename: this.requireText(
        value.original_filename,
        'cv_metadata.original_filename',
      ),
      hash: this.requireSha256Hash(value.hash, 'cv_metadata.hash'),
      sourceHash: this.optionalSha256Hash(value.source_hash, 'cv_metadata.source_hash'),
      size: this.optionalInteger(value.size, 'cv_metadata.size'),
      mime,
      storageKey: this.optionalText(value.storage_key),
      raw: value,
    };
  }

  private normalizeCandidate(
    candidate: JsonRecord,
    candidateFields: JsonRecord,
    sourceEntryId: string,
  ) {
    const name = this.firstText([
      candidate.candidate_name,
      candidate.name,
      candidate.full_name,
      this.findCandidateField(candidateFields, ['Full name', 'Full Name', 'Name', 'Candidate name']),
    ]);
    const email = this.firstText([
      candidate.email,
      candidate.candidate_email,
      this.findCandidateField(candidateFields, ['Email', 'Email address', 'E-mail']),
    ]);
    const phone = this.firstText([
      candidate.phone,
      candidate.candidate_phone,
      this.findCandidateField(candidateFields, ['Phone', 'Phone number', 'Mobile', 'Tel']),
    ]);

    if (!name) {
      throw new BadRequestException({
        code: 'CANDIDATE_NAME_REQUIRED',
        message: `Candidate name is required for source_entry_id ${sourceEntryId}.`,
      });
    }
    if (!email && !phone) {
      throw new BadRequestException({
        code: 'CANDIDATE_CONTACT_REQUIRED',
        message: `Candidate email or phone is required for source_entry_id ${sourceEntryId}.`,
      });
    }

    return {
      name,
      email,
      phone,
      raw: candidate,
    };
  }

  private async resolveJobPosting(sourceJobId: string) {
    const jobDescriptionExists = await this.jobDescriptionsRepo.exist({
      where: {
        sourceSystem: ExtensionSourceSystem.VCS_PORTAL,
        sourceJobId,
      },
    });
    if (!jobDescriptionExists) {
      throw new BadRequestException({
        code: 'JOB_DESCRIPTION_NOT_MAPPED',
        message: 'VCS Portal job_id is not mapped to a backend job description.',
      });
    }

    const now = new Date();
    const posting = await this.jobPostingsRepo
      .createQueryBuilder('posting')
      .innerJoin('posting.jobDescription', 'jobDescription')
      .where('jobDescription.sourceSystem = :sourceSystem', {
        sourceSystem: ExtensionSourceSystem.VCS_PORTAL,
      })
      .andWhere('jobDescription.sourceJobId = :sourceJobId', { sourceJobId })
      .andWhere('posting.status = :postingStatus', {
        postingStatus: JobPostingStatus.PUBLISHED,
      })
      .andWhere('(posting.openAt IS NULL OR posting.openAt <= :now)', { now })
      .andWhere('(posting.closeAt IS NULL OR posting.closeAt > :now)', { now })
      .orderBy('posting.createdAt', 'DESC')
      .addOrderBy('posting.updatedAt', 'DESC')
      .addOrderBy('posting.id', 'DESC')
      .getOne();

    if (!posting) {
      throw new BadRequestException({
        code: 'JOB_POSTING_NOT_OPEN',
        message: 'No published/open backend job posting exists for this VCS Portal job_id.',
      });
    }

    return posting;
  }

  private assertJobPostingAcceptsPortalApply(jobPosting: JobPostingEntity) {
    const now = new Date();
    if (jobPosting.status !== JobPostingStatus.PUBLISHED) {
      throw new BadRequestException({
        code: 'JOB_POSTING_NOT_PUBLISHED',
        message: 'Mapped backend job posting is not published.',
      });
    }
    if (jobPosting.openAt && jobPosting.openAt > now) {
      throw new BadRequestException({
        code: 'JOB_POSTING_NOT_OPEN_YET',
        message: 'Mapped backend job posting is not open yet.',
      });
    }
    if (jobPosting.closeAt && jobPosting.closeAt <= now) {
      throw new BadRequestException({
        code: 'JOB_POSTING_CLOSED',
        message: 'Mapped backend job posting is closed.',
      });
    }
  }

  private assertMetadataMatchesUploadedFile(
    payload: NormalizedVcsPortalApplyPayload,
    file: Express.Multer.File,
  ) {
    if (payload.cvMetadata.size == null || payload.cvMetadata.size === file.size) return;

    throw new UnprocessableEntityException({
      code: 'CLEAN_CV_SIZE_MISMATCH',
      message: 'Clean CV metadata size does not match uploaded file.',
    });
  }

  private schedulePostIngestProcessing(applicationId: string, cleanCvDocumentId: string) {
    setImmediate(() => {
      this.logger.log(
        `VCS Portal clean CV parse scheduled applicationId=${applicationId} cleanCvDocumentId=${cleanCvDocumentId}`,
      );
      void this.cvParsingService.parseCleanCvDocument({
        applicationId,
        cvDocumentId: cleanCvDocumentId,
      }).then(() => (
        this.formSessionsService.generateFormSession(applicationId)
      )).catch((error) => {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `VCS Portal post-ingest processing failed applicationId=${applicationId} cleanCvDocumentId=${cleanCvDocumentId} message=${message}`,
        );
      });
    });
  }

  private toApplicationRawPayload(
    payload: NormalizedVcsPortalApplyPayload,
    jobPostingId: string,
  ) {
    return {
      source: payload.raw.source,
      sourceEntryId: payload.sourceEntryId,
      externalApplicationId: payload.externalApplicationId,
      formId: payload.formId,
      submittedAt: payload.submittedAt,
      jobPostingId,
      sourceJobId: payload.job.sourceJobId,
      sourceJobTitle: payload.job.title,
      sourceJobUrl: payload.job.url,
      candidateEmailHash: this.hashOptionalText(payload.candidate.email?.toLowerCase() ?? null),
      candidatePhoneHash: this.hashOptionalText(payload.candidate.phone),
      candidateNameHash: this.hashOptionalText(payload.candidate.name.toLowerCase()),
      candidateFields: payload.candidateFields,
      cvMetadata: payload.cvMetadata.raw,
      payload: payload.raw,
    };
  }

  private parsePayloadJson(payloadJson?: string) {
    const normalized = this.optionalText(payloadJson);
    if (!normalized) {
      throw new BadRequestException({
        code: 'VCS_PORTAL_PAYLOAD_REQUIRED',
        message: 'Multipart field payload is required.',
      });
    }

    try {
      const parsed: unknown = JSON.parse(normalized);
      return this.requireRecord(parsed, 'payload');
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException({
        code: 'VCS_PORTAL_PAYLOAD_INVALID_JSON',
        message: 'Multipart field payload must be valid JSON.',
      });
    }
  }

  private requireRecord(value: unknown, fieldName: string): JsonRecord {
    if (this.isRecord(value)) return value;
    throw new BadRequestException(`${fieldName} must be an object`);
  }

  private optionalRecord(value: unknown) {
    if (value == null) return null;
    return this.requireRecord(value, 'candidate_fields');
  }

  private requireText(value: unknown, fieldName: string) {
    const normalized = this.optionalText(value);
    if (!normalized) throw new BadRequestException(`${fieldName} is required`);
    return normalized;
  }

  private optionalText(value: unknown) {
    if (typeof value === 'string') return value.trim() || null;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return null;
  }

  private requireIdText(value: unknown, fieldName: string) {
    const normalized = this.requireText(value, fieldName);
    if (!/^\d+$/.test(normalized)) {
      throw new BadRequestException(`${fieldName} must be a numeric id`);
    }
    return normalized;
  }

  private requireInteger(value: unknown, fieldName: string) {
    if (typeof value === 'string' && !/^\d+$/.test(value.trim())) {
      throw new BadRequestException(`${fieldName} must be an integer`);
    }
    const normalized = typeof value === 'number'
      ? value
      : Number.parseInt(this.requireText(value, fieldName), 10);
    if (!Number.isInteger(normalized)) {
      throw new BadRequestException(`${fieldName} must be an integer`);
    }
    return normalized;
  }

  private optionalInteger(value: unknown, fieldName: string) {
    if (value == null || value === '') return null;
    if (typeof value === 'string' && !/^\d+$/.test(value.trim())) {
      throw new BadRequestException(`${fieldName} must be a non-negative integer`);
    }
    const normalized = typeof value === 'number'
      ? value
      : Number.parseInt(this.requireText(value, fieldName), 10);
    if (!Number.isInteger(normalized) || normalized < 0) {
      throw new BadRequestException(`${fieldName} must be a non-negative integer`);
    }
    return normalized;
  }

  private requireSha256Hash(value: unknown, fieldName: string) {
    const normalized = this.requireText(value, fieldName).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(normalized)) {
      throw new BadRequestException(`${fieldName} must be a SHA-256 hash`);
    }
    return normalized;
  }

  private optionalSha256Hash(value: unknown, fieldName: string) {
    if (value == null || value === '') return null;
    return this.requireSha256Hash(value, fieldName);
  }

  private firstText(values: unknown[]) {
    for (const value of values) {
      const normalized = this.optionalText(value);
      if (normalized) return normalized;
    }
    return null;
  }

  private findCandidateField(candidateFields: JsonRecord, names: string[]) {
    const targetNames = names.map((name) => name.toLowerCase());
    for (const [key, value] of Object.entries(candidateFields)) {
      if (targetNames.includes(key.trim().toLowerCase())) {
        return value;
      }
    }
    return null;
  }

  private hashOptionalText(value: string | null) {
    return value ? createHash('sha256').update(value).digest('hex') : null;
  }

  private isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
