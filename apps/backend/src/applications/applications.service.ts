import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CandidateLevel, PaginatedResponse } from '@interview-assistant/shared';
import { createHash } from 'crypto';
import slugify from 'slugify';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditLogEntity } from '../audit-logs/entities/audit-log.entity';
import { UserEntity } from '../auth/entities/user.entity';
import { CandidateEntity } from '../candidates/entities/candidate.entity';
import { ParsedProfileEntity } from '../cv-documents/entities/parsed-profile.entity';
import { JobPostingEntity } from '../job-postings/entities/job-posting.entity';
import {
  ApplicationSourceType,
  ApplicationStatus,
  CvDocumentType,
  DuplicateCheckStatus,
  DuplicateCheckType,
  JobDescriptionStatus,
  JobDescriptionVersionStatus,
  JobPostingStatus,
  RecruitmentChannel,
} from '../recruitment-common';
import { WorkflowStateService } from '../workflow-state/workflow-state.service';
import { ApplicationSourcesService } from './application-sources.service';
import { ApplicationSourceEntity } from './entities/application-source.entity';
import { ApplicationEntity } from './entities/application.entity';
import { DuplicateCheckEntity } from './entities/duplicate-check.entity';

export interface ApplicationCandidateInput {
  candidateId?: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  birthYear?: number | null;
  position?: string | null;
  level?: CandidateLevel | null;
}

export interface CreateApplicationBaseInput {
  jobPostingId: string;
  candidate?: ApplicationCandidateInput;
  candidateId?: string;
  sourceChannel?: RecruitmentChannel | null;
  externalLeadId?: string | null;
  externalApplicationId?: string | null;
  rawPayload?: Record<string, unknown> | null;
  createdById?: string | null;
}

export interface CreateApplicationInput extends CreateApplicationBaseInput {
  source: ApplicationSourceType;
}

export interface CreateApplicationResult {
  application: ApplicationEntity;
  candidate: CandidateEntity;
  applicationSource: ApplicationSourceEntity | null;
  created: boolean;
  duplicate: boolean;
}

export interface ListApplicationsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: ApplicationStatus;
  sourceChannel?: RecruitmentChannel;
  candidateId?: string;
  jobPostingId?: string;
  jobDescriptionVersionId?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface ListApplicationAuditLogsParams {
  page?: number;
  limit?: number;
  action?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface OverrideApplicationStatusInput {
  status: ApplicationStatus;
  reason: string;
  expectedFromStatus?: ApplicationStatus;
  actorId?: string | null;
}

export interface OverrideApplicationStatusResult {
  applicationId: string;
  previousStatus: ApplicationStatus;
  status: ApplicationStatus;
  workflowEventId: string;
}

export interface PublicApplyRateLimitInput {
  jobPostingId: string;
  email?: string | null;
  phone?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ApplicationEntity)
    private readonly applicationsRepo: Repository<ApplicationEntity>,
    @InjectRepository(ParsedProfileEntity)
    private readonly parsedProfilesRepo: Repository<ParsedProfileEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly auditLogsRepo: Repository<AuditLogEntity>,
    private readonly applicationSourcesService: ApplicationSourcesService,
    private readonly workflowStateService: WorkflowStateService,
  ) {}

  findOne(id: string) {
    const normalizedId = this.requireText(id, 'Application id');
    return this.findOneOrThrow(normalizedId);
  }

  async findPaginated(
    params: ListApplicationsParams,
  ): Promise<PaginatedResponse<ApplicationEntity>> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;
    const sortOrder = params.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const allowedSorts: Record<string, string> = {
      createdAt: 'application.createdAt',
      updatedAt: 'application.updatedAt',
      status: 'application.status',
      sourceChannel: 'application.sourceChannel',
    };
    const sortCol = allowedSorts[params.sortBy ?? ''] ?? 'application.createdAt';

    const qb = this.applicationsRepo
      .createQueryBuilder('application')
      .leftJoinAndSelect('application.candidate', 'candidate')
      .leftJoinAndSelect('application.jobPosting', 'jobPosting')
      .leftJoinAndSelect('application.jobDescriptionVersion', 'jobDescriptionVersion')
      .leftJoinAndSelect('application.currentCvDocument', 'currentCvDocument')
      .orderBy(sortCol, sortOrder);

    const search = params.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          candidate.name ILIKE :search
          OR candidate.email ILIKE :search
          OR candidate.phone ILIKE :search
          OR jobPosting.title ILIKE :search
          OR application.externalApplicationId ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    if (params.status !== undefined) {
      this.assertValidApplicationStatus(params.status, 'Application status');
      qb.andWhere('application.status = :status', { status: params.status });
    }

    if (params.sourceChannel !== undefined) {
      this.assertValidRecruitmentChannel(params.sourceChannel);
      qb.andWhere('application.sourceChannel = :sourceChannel', {
        sourceChannel: params.sourceChannel,
      });
    }

    if (params.candidateId) {
      qb.andWhere('application.candidateId = :candidateId', {
        candidateId: this.requireText(params.candidateId, 'Candidate id'),
      });
    }

    if (params.jobPostingId) {
      qb.andWhere('application.jobPostingId = :jobPostingId', {
        jobPostingId: this.requireText(params.jobPostingId, 'Job posting id'),
      });
    }

    if (params.jobDescriptionVersionId) {
      qb.andWhere('application.jobDescriptionVersionId = :jobDescriptionVersionId', {
        jobDescriptionVersionId: this.requireText(
          params.jobDescriptionVersionId,
          'Job description version id',
        ),
      });
    }

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  findDetail(id: string) {
    return this.findOneOrThrow(this.requireText(id, 'Application id'), [
      'candidate',
      'jobPosting',
      'jobDescriptionVersion',
      'currentCvDocument',
      'cvDocuments',
      'mappingResults',
      'formSessions',
      'aiScreeningResults',
      'sources',
    ]);
  }

  async findParsedProfileByApplicationId(applicationId: string) {
    const normalizedApplicationId = this.requireText(applicationId, 'Application id');
    await this.assertApplicationExists(normalizedApplicationId);

    return this.parsedProfilesRepo
      .createQueryBuilder('parsedProfile')
      .innerJoinAndSelect('parsedProfile.cvDocument', 'cvDocument')
      .where('parsedProfile.applicationId = :applicationId', {
        applicationId: normalizedApplicationId,
      })
      .andWhere('cvDocument.documentType = :documentType', {
        documentType: CvDocumentType.CLEAN,
      })
      .andWhere('cvDocument.isCurrent = :isCurrent', { isCurrent: true })
      .orderBy('parsedProfile.createdAt', 'DESC')
      .addOrderBy('parsedProfile.id', 'DESC')
      .getOne();
  }

  async findAuditLogsByApplicationId(
    applicationId: string,
    params: ListApplicationAuditLogsParams = {},
  ): Promise<PaginatedResponse<AuditLogEntity>> {
    const normalizedApplicationId = this.requireText(applicationId, 'Application id');
    await this.assertApplicationExists(normalizedApplicationId);

    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const sortOrder = params.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const action = this.optionalText(params.action);

    const qb = this.auditLogsRepo
      .createQueryBuilder('auditLog')
      .where('auditLog.applicationId = :applicationId', {
        applicationId: normalizedApplicationId,
      })
      .orderBy('auditLog.createdAt', sortOrder)
      .addOrderBy('auditLog.id', sortOrder)
      .skip((page - 1) * limit)
      .take(limit);

    if (action) {
      qb.andWhere('auditLog.action = :action', { action });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async overrideStatus(
    id: string,
    input: OverrideApplicationStatusInput,
  ): Promise<OverrideApplicationStatusResult> {
    const applicationId = this.requireText(id, 'Application id');
    const status = this.assertValidApplicationStatus(input.status, 'Application status');
    const reason = this.requireText(input.reason, 'Override reason');
    const expectedFromStatus = input.expectedFromStatus
      ? this.assertValidApplicationStatus(input.expectedFromStatus, 'Expected from status')
      : undefined;

    return this.dataSource.transaction(async (manager) => {
      const current = await manager.getRepository(ApplicationEntity).findOne({
        where: { id: applicationId },
      });
      if (!current) throw new BadRequestException('Application not found');
      if (current.status === status) {
        throw new BadRequestException('Application already has this status');
      }

      const workflowEvent = await this.workflowStateService.recordStatusTransition(
        {
          applicationId,
          toStatus: status,
          expectedFromStatus,
          eventType: 'APPLICATION_STATUS_OVERRIDDEN',
          actorType: 'USER',
          actorId: this.optionalText(input.actorId),
          metadata: {
            applicationId,
            previousStatus: current.status,
            status,
            reason,
          },
        },
        manager,
      );

      return {
        applicationId,
        previousStatus: workflowEvent.fromStatus ?? current.status,
        status: workflowEvent.toStatus,
        workflowEventId: workflowEvent.id,
      };
    });
  }

  findByCandidateAndPosting(candidateId: string, jobPostingId: string) {
    return this.applicationsRepo.findOne({
      where: {
        candidateId: this.requireText(candidateId, 'Candidate id'),
        jobPostingId: this.requireText(jobPostingId, 'Job posting id'),
      },
      relations: ['candidate', 'jobPosting', 'jobDescriptionVersion'],
    });
  }

  createFromApply(input: CreateApplicationBaseInput) {
    return this.createOrGetApplication({
      ...input,
      source: ApplicationSourceType.PORTAL,
      sourceChannel: input.sourceChannel ?? RecruitmentChannel.VCS_PORTAL,
    });
  }

  createManual(input: CreateApplicationBaseInput) {
    return this.createOrGetApplication({
      ...input,
      source: ApplicationSourceType.MANUAL_IMPORT,
      sourceChannel: input.sourceChannel ?? RecruitmentChannel.MANUAL,
    });
  }

  createFromChannel(input: CreateApplicationBaseInput) {
    return this.createOrGetApplication({
      ...input,
      source: ApplicationSourceType.CHANNEL,
    });
  }

  createFromWebhook(input: CreateApplicationBaseInput) {
    return this.createOrGetApplication({
      ...input,
      source: ApplicationSourceType.WEBHOOK,
    });
  }

  createFromEmailParse(input: CreateApplicationBaseInput) {
    return this.createOrGetApplication({
      ...input,
      source: ApplicationSourceType.EMAIL_PARSE,
    });
  }

  async assertPublicApplyRateLimit(input: PublicApplyRateLimitInput) {
    const jobPostingId = this.requireText(input.jobPostingId, 'Job posting id');
    const emailHash = this.hashOptional(this.normalizeEmail(input.email));
    const phoneHash = this.hashOptional(this.optionalText(input.phone));
    const ipAddress = this.optionalText(input.ipAddress);
    const oneMinuteAgo = new Date(Date.now() - 60_000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    if (ipAddress) {
      const attemptsByIp = await this.auditLogsRepo
        .createQueryBuilder('auditLog')
        .where('auditLog.action = :action', { action: 'PUBLIC_APPLY_RECEIVED' })
        .andWhere('auditLog.createdAt >= :since', { since: oneMinuteAgo })
        .andWhere("auditLog.metadata ->> 'jobPostingId' = :jobPostingId", { jobPostingId })
        .andWhere('auditLog.ipAddress = :ipAddress', { ipAddress })
        .getCount();

      if (attemptsByIp >= 20) {
        await this.recordPublicRateLimitRejected(input, 'IP_PER_MINUTE', attemptsByIp);
        throw new HttpException(
          {
            code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
            message: 'Too many application attempts. Please try again later.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    if (emailHash || phoneHash) {
      const identityQb = this.auditLogsRepo
        .createQueryBuilder('auditLog')
        .where('auditLog.action = :action', { action: 'PUBLIC_APPLY_RECEIVED' })
        .andWhere('auditLog.createdAt >= :since', { since: oneDayAgo })
        .andWhere("auditLog.metadata ->> 'jobPostingId' = :jobPostingId", { jobPostingId });

      if (emailHash && phoneHash) {
        identityQb.andWhere(
          `(
            auditLog.metadata ->> 'emailHash' = :emailHash
            OR auditLog.metadata ->> 'phoneHash' = :phoneHash
          )`,
          { emailHash, phoneHash },
        );
      } else if (emailHash) {
        identityQb.andWhere("auditLog.metadata ->> 'emailHash' = :emailHash", { emailHash });
      } else if (phoneHash) {
        identityQb.andWhere("auditLog.metadata ->> 'phoneHash' = :phoneHash", { phoneHash });
      }

      const attemptsByIdentity = await identityQb.getCount();
      if (attemptsByIdentity >= 5) {
        await this.recordPublicRateLimitRejected(
          input,
          'IDENTITY_PER_JOB_PER_DAY',
          attemptsByIdentity,
        );
        throw new HttpException(
          {
            code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
            message: 'Too many application attempts. Please try again later.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  async recordPublicApplyReceived(input: PublicApplyRateLimitInput) {
    const jobPostingId = this.requireText(input.jobPostingId, 'Job posting id');
    const emailHash = this.hashOptional(this.normalizeEmail(input.email));
    const phoneHash = this.hashOptional(this.optionalText(input.phone));
    const ipAddress = this.optionalText(input.ipAddress);
    const userAgent = this.optionalText(input.userAgent);

    await this.auditLogsRepo.save(
      this.auditLogsRepo.create({
        applicationId: null,
        actorType: 'PUBLIC',
        actorId: null,
        action: 'PUBLIC_APPLY_RECEIVED',
        objectType: 'JOB_POSTING',
        objectId: jobPostingId,
        ipAddress,
        userAgent,
        metadata: {
          jobPostingId,
          emailHash,
          phoneHash,
        },
      }),
    );
  }

  async createOrGetApplication(input: CreateApplicationInput): Promise<CreateApplicationResult> {
    this.assertSupportedSource(input.source);
    const sourceChannel = this.resolveSourceChannel(input.source, input.sourceChannel);
    const externalApplicationId = this.optionalText(input.externalApplicationId);

    return this.dataSource.transaction(async (manager) => {
      if (sourceChannel && externalApplicationId) {
        await this.lockApplicationSourceReference(manager, sourceChannel, externalApplicationId);
        const existingSource = await this.applicationSourcesService.findByExternalReference(
          sourceChannel,
          externalApplicationId,
          manager,
        );
        if (existingSource?.application) {
          this.assertIdempotentApplicationSourceMatches(existingSource, input);
          return {
            application: existingSource.application,
            candidate: existingSource.application.candidate,
            applicationSource: existingSource,
            created: false,
            duplicate: true,
          };
        }
      }

      const posting = await this.findJobPostingForApplication(manager, input.jobPostingId);
      this.assertPostingAcceptsApplication(posting, input.source);

      const createdById = await this.resolveCreatedById(manager, input.createdById);
      const candidate = await this.resolveCandidate(manager, input, createdById);
      const duplicateByIdentity = await this.findDuplicateApplicationByIdentity(
        manager,
        posting.id,
        candidate,
        input.candidate ?? {},
      );
      if (duplicateByIdentity) {
        const applicationSource = await this.resolveDuplicateApplicationSource(
          manager,
          duplicateByIdentity.id,
          input,
          sourceChannel,
          externalApplicationId,
        );
        await this.recordApplicationDuplicateDetected(
          manager,
          duplicateByIdentity,
          input,
          sourceChannel,
          externalApplicationId,
        );

        return {
          application: duplicateByIdentity,
          candidate: duplicateByIdentity.candidate ?? candidate,
          applicationSource,
          created: false,
          duplicate: true,
        };
      }

      await this.lockApplicationPair(manager, candidate.id, posting.id);
      const existing = await manager.getRepository(ApplicationEntity).findOne({
        where: {
          candidateId: candidate.id,
          jobPostingId: posting.id,
        },
        relations: ['candidate', 'jobPosting', 'jobDescriptionVersion'],
      });

      if (existing) {
        const applicationSource = await this.resolveDuplicateApplicationSource(
          manager,
          existing.id,
          input,
          sourceChannel,
          externalApplicationId,
        );
        await this.recordApplicationDuplicateDetected(
          manager,
          existing,
          input,
          sourceChannel,
          externalApplicationId,
        );

        return {
          application: existing,
          candidate,
          applicationSource,
          created: false,
          duplicate: true,
        };
      }

      const application = manager.getRepository(ApplicationEntity).create({
        candidateId: candidate.id,
        jobPostingId: posting.id,
        jobDescriptionVersionId: posting.jobDescriptionVersionId,
        source: input.source,
        sourceChannel,
        externalApplicationId,
        status: ApplicationStatus.APPLICATION_CREATED,
        currentCvDocumentId: null,
        mappingStatus: null,
        formStatus: null,
        aiScreeningStatus: null,
        hrReviewStatus: null,
      });
      const savedApplication = await manager.getRepository(ApplicationEntity).save(application);
      const applicationSource = await this.createApplicationSource(
        manager,
        savedApplication.id,
        input,
        sourceChannel,
        externalApplicationId,
      );
      await this.workflowStateService.recordEvent(
        {
          applicationId: savedApplication.id,
          fromStatus: null,
          toStatus: ApplicationStatus.APPLICATION_CREATED,
          eventType: 'APPLICATION_SUBMITTED',
          actorType: this.resolveWorkflowActorType(input.source),
          actorId: createdById,
          metadata: {
            applicationId: savedApplication.id,
            applicationSourceId: applicationSource.id,
            candidateId: candidate.id,
            jobPostingId: posting.id,
            jobDescriptionVersionId: posting.jobDescriptionVersionId,
            source: input.source,
            sourceChannel,
            externalApplicationId,
          },
        },
        manager,
      );
      await this.recordApplicationAuditLog(manager, {
        applicationId: savedApplication.id,
        actorType: this.resolveWorkflowActorType(input.source),
        actorId: createdById,
        action: 'APPLICATION_SUBMITTED',
        objectType: 'APPLICATION',
        objectId: savedApplication.id,
        metadata: {
          applicationId: savedApplication.id,
          applicationSourceId: applicationSource.id,
          candidateId: candidate.id,
          jobPostingId: posting.id,
          jobDescriptionVersionId: posting.jobDescriptionVersionId,
          source: input.source,
          sourceChannel,
        },
      });
      await this.recordApplicationAuditLog(manager, {
        applicationId: savedApplication.id,
        actorType: this.resolveWorkflowActorType(input.source),
        actorId: createdById,
        action: ApplicationStatus.APPLICATION_CREATED,
        objectType: 'APPLICATION',
        objectId: savedApplication.id,
        metadata: {
          applicationId: savedApplication.id,
          applicationSourceId: applicationSource.id,
          candidateId: candidate.id,
          jobPostingId: posting.id,
          jobDescriptionVersionId: posting.jobDescriptionVersionId,
          source: input.source,
          sourceChannel,
        },
      });
      await this.workflowStateService.recordStatusTransition(
        {
          applicationId: savedApplication.id,
          toStatus: ApplicationStatus.APPLICATION_VALIDATING,
          expectedFromStatus: ApplicationStatus.APPLICATION_CREATED,
          eventType: 'APPLICATION_VALIDATING',
          actorType: this.resolveWorkflowActorType(input.source),
          actorId: createdById,
          metadata: {
            applicationId: savedApplication.id,
            validationScope: ['candidate_payload', 'job_posting', 'job_description_version'],
          },
        },
        manager,
      );
      await this.workflowStateService.recordStatusTransition(
        {
          applicationId: savedApplication.id,
          toStatus: ApplicationStatus.APPLICATION_DUPLICATE_CHECKING,
          expectedFromStatus: ApplicationStatus.APPLICATION_VALIDATING,
          eventType: 'APPLICATION_DUPLICATE_CHECKING',
          actorType: this.resolveWorkflowActorType(input.source),
          actorId: createdById,
          metadata: {
            applicationId: savedApplication.id,
            checkType: DuplicateCheckType.APPLICATION_DUPLICATE,
            criteria: ['candidate', 'email', 'phone', 'jobPosting'],
          },
        },
        manager,
      );
      await this.recordDuplicateCheck(manager, {
        applicationId: savedApplication.id,
        checkType: DuplicateCheckType.APPLICATION_DUPLICATE,
        status: DuplicateCheckStatus.PASSED,
        details: {
          candidateId: candidate.id,
          jobPostingId: posting.id,
          jobDescriptionVersionId: posting.jobDescriptionVersionId,
          sourceChannel,
          emailHash: this.hashOptional(this.normalizeEmail(candidate.email)),
          phoneHash: this.hashOptional(this.optionalText(candidate.phone)),
        },
      });

      return {
        application: savedApplication,
        candidate,
        applicationSource,
        created: true,
        duplicate: false,
      };
    });
  }

  private async recordPublicRateLimitRejected(
    input: PublicApplyRateLimitInput,
    reason: string,
    attemptCount: number,
  ) {
    const jobPostingId = this.requireText(input.jobPostingId, 'Job posting id');
    const emailHash = this.hashOptional(this.normalizeEmail(input.email));
    const phoneHash = this.hashOptional(this.optionalText(input.phone));
    const ipAddress = this.optionalText(input.ipAddress);
    const userAgent = this.optionalText(input.userAgent);

    await this.auditLogsRepo.save(
      this.auditLogsRepo.create({
        applicationId: null,
        actorType: 'PUBLIC',
        actorId: null,
        action: ApplicationStatus.APPLICATION_REJECTED_RATE_LIMIT,
        objectType: 'JOB_POSTING',
        objectId: jobPostingId,
        ipAddress,
        userAgent,
        metadata: {
          jobPostingId,
          reason,
          attemptCount,
          emailHash,
          phoneHash,
        },
      }),
    );
  }

  private assertIdempotentApplicationSourceMatches(
    existingSource: ApplicationSourceEntity,
    input: CreateApplicationInput,
  ) {
    const existingPayload = this.asRecord(existingSource.rawPayload);
    const incomingPayload = this.asRecord(input.rawPayload);
    const existingJobPostingId = this.recordText(existingPayload, 'jobPostingId');
    const incomingJobPostingId = this.recordText(incomingPayload, 'jobPostingId') ?? input.jobPostingId;

    if (
      existingJobPostingId
      && incomingJobPostingId
      && existingJobPostingId !== incomingJobPostingId
    ) {
      this.throwIdempotencyConflict();
    }

    const hashKeys = ['candidateEmailHash', 'candidatePhoneHash', 'candidateNameHash'];
    for (const key of hashKeys) {
      const existingHash = this.recordText(existingPayload, key);
      const incomingHash = this.recordText(incomingPayload, key);
      if (existingHash && incomingHash && existingHash !== incomingHash) {
        this.throwIdempotencyConflict();
      }
    }
  }

  private async findDuplicateApplicationByIdentity(
    manager: EntityManager,
    jobPostingId: string,
    candidate: CandidateEntity,
    candidateInput: ApplicationCandidateInput,
  ) {
    const email = this.normalizeEmail(candidateInput.email) ?? this.normalizeEmail(candidate.email);
    const phone = this.optionalText(candidateInput.phone) ?? this.optionalText(candidate.phone);
    const conditions = ['application.candidateId = :candidateId'];
    const params: Record<string, string> = {
      candidateId: candidate.id,
      jobPostingId,
    };

    if (email) {
      conditions.push('LOWER(candidate.email) = :email');
      params.email = email;
    }
    if (phone) {
      conditions.push('candidate.phone = :phone');
      params.phone = phone;
    }

    return manager
      .getRepository(ApplicationEntity)
      .createQueryBuilder('application')
      .leftJoinAndSelect('application.candidate', 'candidate')
      .leftJoinAndSelect('application.jobPosting', 'jobPosting')
      .leftJoinAndSelect('application.jobDescriptionVersion', 'jobDescriptionVersion')
      .where('application.jobPostingId = :jobPostingId', { jobPostingId })
      .andWhere(`(${conditions.join(' OR ')})`, params)
      .orderBy('application.createdAt', 'ASC')
      .getOne();
  }

  private async recordApplicationDuplicateDetected(
    manager: EntityManager,
    matchedApplication: ApplicationEntity,
    input: CreateApplicationInput,
    sourceChannel: RecruitmentChannel | null,
    externalApplicationId: string | null,
  ) {
    const candidateInput = input.candidate ?? {};
    const email = this.normalizeEmail(candidateInput.email)
      ?? this.normalizeEmail(matchedApplication.candidate?.email);
    const phone = this.optionalText(candidateInput.phone)
      ?? this.optionalText(matchedApplication.candidate?.phone);
    const actorType = this.resolveWorkflowActorType(input.source);
    const actorId = this.optionalText(input.createdById);

    await this.recordDuplicateCheck(manager, {
      applicationId: matchedApplication.id,
      checkType: DuplicateCheckType.APPLICATION_DUPLICATE,
      status: DuplicateCheckStatus.DUPLICATE_FOUND,
      matchedEntityType: 'APPLICATION',
      matchedEntityId: matchedApplication.id,
      details: {
        matchedApplicationId: matchedApplication.id,
        candidateId: matchedApplication.candidateId,
        jobPostingId: matchedApplication.jobPostingId,
        jobDescriptionVersionId: matchedApplication.jobDescriptionVersionId,
        source: input.source,
        sourceChannel,
        externalApplicationId,
        emailHash: this.hashOptional(email),
        phoneHash: this.hashOptional(phone),
      },
    });
    await this.workflowStateService.recordEvent(
      {
        applicationId: matchedApplication.id,
        fromStatus: matchedApplication.status,
        toStatus: matchedApplication.status,
        eventType: ApplicationStatus.APPLICATION_DUPLICATE_FOUND,
        actorType,
        actorId,
        metadata: {
          matchedApplicationId: matchedApplication.id,
          checkType: DuplicateCheckType.APPLICATION_DUPLICATE,
          source: input.source,
          sourceChannel,
        },
      },
      manager,
    );
    await this.recordApplicationAuditLog(manager, {
      applicationId: matchedApplication.id,
      actorType,
      actorId,
      action: ApplicationStatus.APPLICATION_DUPLICATE_FOUND,
      objectType: 'APPLICATION',
      objectId: matchedApplication.id,
      metadata: {
        matchedApplicationId: matchedApplication.id,
        checkType: DuplicateCheckType.APPLICATION_DUPLICATE,
        source: input.source,
        sourceChannel,
        emailHash: this.hashOptional(email),
        phoneHash: this.hashOptional(phone),
      },
    });
  }

  private async recordDuplicateCheck(
    manager: EntityManager,
    input: {
      applicationId: string;
      checkType: DuplicateCheckType;
      status: DuplicateCheckStatus;
      matchedEntityType?: string | null;
      matchedEntityId?: string | null;
      score?: string | null;
      details?: Record<string, unknown> | null;
    },
  ) {
    await manager.getRepository(DuplicateCheckEntity).save(
      manager.getRepository(DuplicateCheckEntity).create({
        applicationId: input.applicationId,
        checkType: input.checkType,
        status: input.status,
        matchedEntityType: input.matchedEntityType ?? null,
        matchedEntityId: input.matchedEntityId ?? null,
        score: input.score ?? null,
        details: input.details ?? null,
      }),
    );
  }

  private async recordApplicationAuditLog(
    manager: EntityManager,
    input: {
      applicationId: string | null;
      actorType: string;
      actorId?: string | null;
      action: string;
      objectType: string;
      objectId?: string | null;
      metadata?: Record<string, unknown> | null;
      ipAddress?: string | null;
      userAgent?: string | null;
    },
  ) {
    await manager.getRepository(AuditLogEntity).save(
      manager.getRepository(AuditLogEntity).create({
        applicationId: input.applicationId,
        actorType: input.actorType,
        actorId: this.optionalText(input.actorId),
        action: input.action,
        objectType: input.objectType,
        objectId: input.objectId ?? null,
        metadata: input.metadata ?? null,
        ipAddress: this.optionalText(input.ipAddress),
        userAgent: this.optionalText(input.userAgent),
      }),
    );
  }

  private throwIdempotencyConflict(): never {
    throw new ConflictException({
      code: 'IDEMPOTENCY_CONFLICT',
      message: 'Idempotency key was already used with different application data.',
    });
  }

  private async findOneOrThrow(
    id: string,
    relations: string[] = ['candidate', 'jobPosting', 'jobDescriptionVersion'],
  ) {
    const application = await this.applicationsRepo.findOne({
      where: { id },
      relations,
    });
    if (!application) throw new BadRequestException('Application not found');
    return application;
  }

  private async assertApplicationExists(applicationId: string) {
    const exists = await this.applicationsRepo.exist({
      where: { id: applicationId },
    });
    if (!exists) throw new BadRequestException('Application not found');
  }

  private async findJobPostingForApplication(
    manager: EntityManager,
    jobPostingId: string,
  ) {
    const normalizedJobPostingId = this.requireText(jobPostingId, 'Job posting id');
    const posting = await manager.getRepository(JobPostingEntity).findOne({
      where: { id: normalizedJobPostingId },
      relations: ['jobDescription', 'jobDescriptionVersion', 'jobDescriptionVersion.jobDescription'],
    });
    if (!posting) throw new BadRequestException('Job posting not found');
    if (!posting.jobDescriptionVersion) {
      throw new BadRequestException('Job posting must have a job description version');
    }
    if (posting.jobDescriptionVersion.status !== JobDescriptionVersionStatus.ACTIVE) {
      throw new BadRequestException('Job description version must be active');
    }
    if (posting.jobDescriptionVersion.jobDescription?.status !== JobDescriptionStatus.ACTIVE) {
      throw new BadRequestException('Job description must be active');
    }
    return posting;
  }

  private assertPostingAcceptsApplication(
    posting: JobPostingEntity,
    source: ApplicationSourceType,
  ) {
    const now = new Date();
    if (source === ApplicationSourceType.PORTAL) {
      if (posting.status !== JobPostingStatus.PUBLISHED) {
        throw new BadRequestException('Job posting is not open for public applications');
      }
      if (posting.openAt && posting.openAt > now) {
        throw new BadRequestException('Job posting is not open yet');
      }
    } else if (posting.status === JobPostingStatus.CLOSED) {
      throw new BadRequestException('Closed job posting cannot receive manual applications');
    }

    if (posting.closeAt && posting.closeAt <= now) {
      throw new BadRequestException('Job posting is closed');
    }
  }

  private async resolveCandidate(
    manager: EntityManager,
    input: CreateApplicationInput,
    createdById: string | null,
  ) {
    const candidateInput = input.candidate ?? {};
    const candidateId = input.candidateId ?? candidateInput.candidateId;
    if (candidateId) {
      const existing = await manager.getRepository(CandidateEntity).findOne({
        where: { id: this.requireText(candidateId, 'Candidate id') },
      });
      if (!existing) throw new BadRequestException('Candidate not found');
      return existing;
    }

    const email = this.normalizeEmail(candidateInput.email);
    const phone = this.optionalText(candidateInput.phone);
    if (!email && !phone) {
      throw new BadRequestException('Candidate email or phone is required');
    }

    if (email) await this.lockCandidateLookup(manager, `email:${email}`);
    if (phone) await this.lockCandidateLookup(manager, `phone:${phone}`);
    const existing = await this.findExistingCandidate(manager, email, phone);
    if (existing) {
      return this.mergeCandidateProfile(manager, existing, candidateInput);
    }

    return this.createCandidate(manager, candidateInput, email, phone, createdById);
  }

  private async findExistingCandidate(
    manager: EntityManager,
    email: string | null,
    phone: string | null,
  ) {
    const qb = manager.getRepository(CandidateEntity).createQueryBuilder('candidate');
    if (email && phone) {
      qb.where('(LOWER(candidate.email) = :email OR candidate.phone = :phone)', {
        email,
        phone,
      });
    } else if (email) {
      qb.where('LOWER(candidate.email) = :email', { email });
    } else if (phone) {
      qb.where('candidate.phone = :phone', { phone });
    } else {
      return null;
    }
    return qb.orderBy('candidate.createdAt', 'ASC').getOne();
  }

  private async createCandidate(
    manager: EntityManager,
    input: ApplicationCandidateInput,
    email: string | null,
    phone: string | null,
    createdById: string | null,
  ) {
    const name = this.requireText(input.name ?? '', 'Candidate name');
    const level = this.normalizeLevel(input.level);
    const birthYear = this.normalizeBirthYear(input.birthYear);
    const candidate = manager.getRepository(CandidateEntity).create({
      name,
      slug: await this.createUniqueCandidateSlug(manager, name),
      email: email ?? undefined,
      phone: phone ?? undefined,
      birthYear: birthYear ?? undefined,
      position: this.optionalText(input.position) ?? 'Backend Developer',
      level,
      createdById,
    });

    return manager.getRepository(CandidateEntity).save(candidate);
  }

  private async mergeCandidateProfile(
    manager: EntityManager,
    candidate: CandidateEntity,
    input: ApplicationCandidateInput,
  ) {
    let changed = false;
    const email = this.normalizeEmail(input.email);
    const phone = this.optionalText(input.phone);
    const birthYear = this.normalizeBirthYear(input.birthYear);

    if (!candidate.email && email) {
      candidate.email = email;
      changed = true;
    }
    if (!candidate.phone && phone) {
      candidate.phone = phone;
      changed = true;
    }
    if (!candidate.birthYear && birthYear) {
      candidate.birthYear = birthYear;
      changed = true;
    }

    return changed ? manager.getRepository(CandidateEntity).save(candidate) : candidate;
  }

  private async resolveCreatedById(manager: EntityManager, userId?: string | null) {
    const normalizedUserId = this.optionalText(userId);
    if (!normalizedUserId) return null;
    const user = await manager.getRepository(UserEntity).findOne({
      where: { id: normalizedUserId },
    });
    if (!user) throw new BadRequestException('Created by user not found');
    return normalizedUserId;
  }

  private async resolveDuplicateApplicationSource(
    manager: EntityManager,
    applicationId: string,
    input: CreateApplicationInput,
    sourceChannel: RecruitmentChannel | null,
    externalApplicationId: string | null,
  ) {
    if (
      this.shouldRecordDuplicateSource(input, sourceChannel, externalApplicationId)
    ) {
      return this.createApplicationSource(
        manager,
        applicationId,
        input,
        sourceChannel,
        externalApplicationId,
      );
    }

    return this.applicationSourcesService.findLatestByApplication(applicationId, manager);
  }

  private createApplicationSource(
    manager: EntityManager,
    applicationId: string,
    input: CreateApplicationInput,
    sourceChannel: RecruitmentChannel | null,
    externalApplicationId: string | null,
  ) {
    return this.applicationSourcesService.create(
      {
        applicationId,
        sourceType: input.source,
        channel: sourceChannel,
        externalLeadId: input.externalLeadId,
        externalApplicationId,
        rawPayload: input.rawPayload,
      },
      manager,
    );
  }

  private shouldRecordDuplicateSource(
    input: CreateApplicationInput,
    sourceChannel: RecruitmentChannel | null,
    externalApplicationId: string | null,
  ) {
    return Boolean(sourceChannel && externalApplicationId)
      || Boolean(this.optionalText(input.externalLeadId))
      || input.rawPayload != null;
  }

  private assertSupportedSource(source: ApplicationSourceType) {
    if (!Object.values(ApplicationSourceType).includes(source)) {
      throw new BadRequestException('Application source is invalid');
    }
  }

  private assertValidApplicationStatus(
    status: ApplicationStatus,
    fieldName: string,
  ) {
    if (!Object.values(ApplicationStatus).includes(status)) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }
    return status;
  }

  private assertValidRecruitmentChannel(channel: RecruitmentChannel) {
    if (!Object.values(RecruitmentChannel).includes(channel)) {
      throw new BadRequestException('Recruitment channel is invalid');
    }
    return channel;
  }

  private resolveSourceChannel(
    source: ApplicationSourceType,
    sourceChannel?: RecruitmentChannel | null,
  ) {
    const normalizedChannel = this.normalizeChannel(sourceChannel);
    if (source === ApplicationSourceType.PORTAL) {
      return normalizedChannel ?? RecruitmentChannel.VCS_PORTAL;
    }
    if (source === ApplicationSourceType.MANUAL_IMPORT) {
      return normalizedChannel ?? RecruitmentChannel.MANUAL;
    }
    if (this.sourceRequiresChannel(source) && !normalizedChannel) {
      throw new BadRequestException('Source channel is required for this application source');
    }
    return normalizedChannel;
  }

  private sourceRequiresChannel(source: ApplicationSourceType) {
    return [
      ApplicationSourceType.CHANNEL,
      ApplicationSourceType.WEBHOOK,
      ApplicationSourceType.EMAIL_PARSE,
    ].includes(source);
  }

  private normalizeChannel(value?: RecruitmentChannel | null) {
    if (!value) return null;
    if (!Object.values(RecruitmentChannel).includes(value)) {
      throw new BadRequestException('Recruitment channel is invalid');
    }
    return value;
  }

  private resolveWorkflowActorType(source: ApplicationSourceType) {
    if (source === ApplicationSourceType.PORTAL) return 'PUBLIC';
    if (source === ApplicationSourceType.MANUAL_IMPORT) return 'USER';
    if (
      source === ApplicationSourceType.CHANNEL
      || source === ApplicationSourceType.WEBHOOK
      || source === ApplicationSourceType.EMAIL_PARSE
    ) {
      return 'CHANNEL';
    }
    return 'SYSTEM';
  }

  private normalizeEmail(value?: string | null) {
    const email = this.optionalText(value)?.toLowerCase() ?? null;
    if (!email) return null;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new BadRequestException('Candidate email is invalid');
    }
    return email;
  }

  private normalizeLevel(value?: CandidateLevel | null) {
    if (!value) return CandidateLevel.ENTRY;
    if (!Object.values(CandidateLevel).includes(value)) {
      throw new BadRequestException('Candidate level is invalid');
    }
    return value;
  }

  private normalizeBirthYear(value?: number | null) {
    if (value == null) return undefined;
    if (!Number.isInteger(value) || value < 1900 || value > new Date().getFullYear()) {
      throw new BadRequestException('Candidate birth year is invalid');
    }
    return value;
  }

  private requireText(value: string, fieldName: string) {
    const normalized = value?.trim();
    if (!normalized) throw new BadRequestException(`${fieldName} is required`);
    return normalized;
  }

  private optionalText(value?: string | null) {
    const normalized = value?.trim();
    return normalized || null;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  }

  private recordText(record: Record<string, unknown> | null, key: string) {
    const value = record?.[key];
    return typeof value === 'string' ? this.optionalText(value) : null;
  }

  private hashOptional(value?: string | null) {
    const normalized = this.optionalText(value);
    if (!normalized) return null;
    return createHash('sha256').update(normalized).digest('hex');
  }

  private async createUniqueCandidateSlug(manager: EntityManager, name: string) {
    const baseSlug = slugify(name, { lower: true, strict: true, trim: true }) || 'candidate';
    let slug = baseSlug;
    let suffix = 1;

    while (await manager.getRepository(CandidateEntity).findOne({ where: { slug } })) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return slug;
  }

  private lockCandidateLookup(manager: EntityManager, key: string) {
    return manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `candidate-lookup:${key}`,
    ]);
  }

  private lockApplicationPair(
    manager: EntityManager,
    candidateId: string,
    jobPostingId: string,
  ) {
    return manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `application:${candidateId}:${jobPostingId}`,
    ]);
  }

  private lockApplicationSourceReference(
    manager: EntityManager,
    channel: RecruitmentChannel,
    externalApplicationId: string,
  ) {
    return manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `application-source:${channel}:${externalApplicationId}`,
    ]);
  }
}
