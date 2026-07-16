import { UserRole } from '@interview-assistant/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { UserEntity } from '../auth/entities/user.entity';
import { JobDescriptionEntity } from '../job-descriptions/entities/job-description.entity';
import { JobDescriptionVersionEntity } from '../job-descriptions/entities/job-description-version.entity';
import { JobPostingEntity } from '../job-postings/entities/job-posting.entity';
import { FacebookPublishingService } from '../facebook-publishing/facebook-publishing.service';
import { type ExtensionFacebookPublishPlan } from '../facebook-publishing/facebook-publishing.types';
import {
  ChannelPostingStatus,
  JobDescriptionStatus,
  JobDescriptionVersionStatus,
  JobPostingStatus,
  QuestionSetStatus,
  RecruitmentChannel,
} from '../recruitment-common';
import {
  ChannelPostingResultDto,
  AmisCareerCatalogItemDto,
  CreateAmisCareerQuestionDto,
  ExtensionPreviewPublishPlanResponseDto,
  ExtensionSyncResponseDto,
  ExtensionSyncWarningDto,
  SyncAmisCareersDto,
  SyncAmisCareersResponseDto,
  SyncAmisCareerItemDto,
  SyncAmisApplicationsDto,
  SyncAmisApplicationsResponseDto,
  SyncAmisJobPostingDto,
  UpdateAmisCareerQuestionCategoriesDto,
} from './dto';
import {
  ExtensionExternalEntityType,
  ExtensionInternalEntityType,
  ExtensionSourceSystem,
  ExtensionSyncAction,
  ExtensionSyncResultCode,
  type ExtensionSyncChannel,
} from './enums';
import { AmisCareerEntity, RecruitmentExternalReferenceEntity } from './entities';
import {
  ExtensionIdempotencyDecision,
  ExtensionIdempotencyService,
} from './extension-idempotency.service';
import { createAmisSnapshotHash, createExtensionRequestHash } from './utils';
import { QuestionsService } from '../questions/questions.service';
import { QuestionSetEntity } from '../questions/entities/question-set.entity';
import { QuestionEntity } from '../questions/entities/question.entity';
import { QuestionSetItemEntity } from '../questions/entities/question-set-item.entity';
import { CategoriesService } from '../categories/categories.service';
import { QuestionType } from '@interview-assistant/shared';
import { ApplicationsService } from '../applications/applications.service';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { ApplicationSourceEntity } from '../applications/entities/application-source.entity';

const JOB_POSTING_SNAPSHOT_SOURCE_SYSTEM = 'JOB_POSTING_SNAPSHOT';

interface PostingQuestionSnapshotItemInput {
  questionId: string | null;
  questionTextSnapshot: string;
  questionType: string;
  required: boolean;
  metadata: Record<string, unknown> | null;
}

export interface ExtensionSyncContext {
  actorUserId: string;
  actorRole: UserRole;
  idempotencyKey: string;
  requestId?: string;
  extensionVersion?: string;
  extensionInstanceId?: string | null;
}

export interface ExtensionCatalogSyncContext {
  actorUserId: string;
  actorRole: UserRole;
  requestId?: string;
  extensionVersion?: string;
  extensionInstanceId?: string | null;
}

@Injectable()
export class ExtensionIntegrationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly idempotencyService: ExtensionIdempotencyService,
    private readonly questionsService: QuestionsService,
    private readonly categoriesService: CategoriesService,
    private readonly facebookPublishingService: FacebookPublishingService,
    private readonly applicationsService: ApplicationsService,
  ) {}

  async syncAndPublishFromAmis(
    dto: SyncAmisJobPostingDto,
    context: ExtensionSyncContext,
  ): Promise<ExtensionSyncResponseDto> {
    const normalizedDto = this.normalizeRequest(dto);
    const requestHash = createExtensionRequestHash({
      body: normalizedDto,
      sourceSystem: normalizedDto.sourceSystem,
    });
    const snapshotHash = createAmisSnapshotHash(
      normalizedDto.snapshot,
      normalizedDto.selectedQuestionIds,
    );

    const keyDecision = await this.idempotencyService.assertKeyCanBeUsed({
      idempotencyKey: context.idempotencyKey,
      sourceSystem: normalizedDto.sourceSystem,
      requestHash,
    });

    if (keyDecision.decision === ExtensionIdempotencyDecision.REPLAY_SUCCEEDED) {
      return this.toDuplicateReplayResponse(keyDecision.record.responseData);
    }

    await this.idempotencyService.createProcessingRecord({
      idempotencyKey: context.idempotencyKey,
      sourceSystem: normalizedDto.sourceSystem,
      requestHash,
      actorUserId: context.actorUserId,
      extensionInstanceId: context.extensionInstanceId,
    });

    try {
      const response = await this.dataSource.transaction((manager) =>
        this.syncDomainRecords(manager, normalizedDto, context, snapshotHash),
      );
      await this.idempotencyService.markSucceeded({
        idempotencyKey: context.idempotencyKey,
        responseData: response,
      });
      return response;
    } catch (error) {
      await this.idempotencyService.markFailed({
        idempotencyKey: context.idempotencyKey,
      });
      throw error;
    }
  }

  async previewPublishPlanFromAmis(
    dto: SyncAmisJobPostingDto,
    context: ExtensionCatalogSyncContext,
  ): Promise<ExtensionPreviewPublishPlanResponseDto> {
    const normalizedDto = this.normalizeRequest(dto, { requireFacebookTargets: false });
    if (normalizedDto.action !== ExtensionSyncAction.PUBLISH) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Only PUBLISH action is supported for extension integration MVP.',
      });
    }

    const snapshotHash = createAmisSnapshotHash(
      normalizedDto.snapshot,
      normalizedDto.selectedQuestionIds,
    );
    const posting = await this.buildPreviewPosting(normalizedDto, snapshotHash);
    const facebookPublishPlan = normalizedDto.channels.includes(RecruitmentChannel.FACEBOOK)
      ? await this.facebookPublishingService.prepareExtensionPublishPlan(
        posting,
        context.actorUserId,
        normalizedDto.facebookTargetIds,
        normalizedDto.facebookContent,
        context.extensionInstanceId,
      )
      : undefined;
    const warnings = this.buildFacebookPreviewWarnings(normalizedDto.channels, facebookPublishPlan);

    return {
      amisRecruitmentId: normalizedDto.amisRecruitmentId,
      snapshotHash,
      ...(facebookPublishPlan ? { facebookPublishPlan } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  private async syncDomainRecords(
    manager: EntityManager,
    dto: SyncAmisJobPostingDto,
    context: ExtensionSyncContext,
    snapshotHash: string,
  ): Promise<ExtensionSyncResponseDto> {
    if (dto.action !== ExtensionSyncAction.PUBLISH) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Only PUBLISH action is supported for extension integration MVP.',
      });
    }

    const externalRefRepo = manager.getRepository(RecruitmentExternalReferenceEntity);
    const existingReference = await externalRefRepo.findOne({
      where: {
        sourceSystem: dto.sourceSystem,
        externalEntityType: ExtensionExternalEntityType.JOB_POSTING,
        externalId: dto.amisRecruitmentId,
      },
    });

    if (existingReference) {
      const posting = await this.findPosting(manager, existingReference.internalEntityId);

      if (existingReference.lastSnapshotHash === snapshotHash) {
        await this.updateExternalReferenceSyncMetadata(
          manager,
          existingReference,
          dto,
          context,
          snapshotHash,
        );

        return await this.buildResponse({
          resultCode: ExtensionSyncResultCode.DUPLICATE_OR_IDEMPOTENT_REPLAY,
          posting,
          dto,
          snapshotHash,
          snapshotChanged: false,
          actorUserId: context.actorUserId,
          ownerExtensionInstanceId: context.extensionInstanceId,
        });
      }

      return this.updateExistingPosting(
        manager,
        existingReference,
        posting,
        dto,
        context,
        snapshotHash,
      );
    }

    return this.createNewPosting(manager, dto, context, snapshotHash);
  }

  private async createNewPosting(
    manager: EntityManager,
    dto: SyncAmisJobPostingDto,
    context: ExtensionSyncContext,
    snapshotHash: string,
  ) {
    const now = new Date();
    const closeAt = this.parseDeadline(dto.snapshot.deadline, now);
    const createdBy = await this.findActor(manager, context.actorUserId);
    const jobDescription = await manager.getRepository(JobDescriptionEntity).save(
      manager.getRepository(JobDescriptionEntity).create({
        title: dto.snapshot.title,
        positionId: null,
        levelId: null,
        description: dto.snapshot.description,
        overview: this.optionalText(dto.snapshot.summary) ?? null,
        responsibilities: dto.snapshot.description,
        summary: this.toSummary(dto.snapshot.summary ?? dto.snapshot.description),
        requirements: this.toPlainRequirements(dto.snapshot.requirements),
        benefits: this.normalizeBenefits(dto.snapshot.benefits),
        salary: null,
        annualLeaveDays: null,
        department: null,
        applicationDeadline: closeAt?.toISOString().slice(0, 10) ?? null,
        status: JobDescriptionStatus.ACTIVE,
        createdById: createdBy.id,
      }),
    );

    const version = await this.createActiveVersionFromJobDescription(
      manager,
      jobDescription.id,
      createdBy.id,
    );
    const publicSlug = await this.createUniqueSlug(manager, dto.snapshot.title);
    const posting = await manager.getRepository(JobPostingEntity).save(
      manager.getRepository(JobPostingEntity).create({
        jobDescriptionId: jobDescription.id,
        jobDescriptionVersionId: version.id,
        title: dto.snapshot.title,
        publicSlug,
        status: JobPostingStatus.PUBLISHED,
        openAt: now,
        closeAt,
        formQuestionIds: null,
        formQuestionSetId: null,
        createdById: createdBy.id,
      }),
    );
    await this.replacePostingQuestionSetSnapshot(
      manager,
      posting,
      dto.selectedQuestionIds ?? [],
      createdBy.id,
    );

    await manager.getRepository(RecruitmentExternalReferenceEntity).save(
      manager.getRepository(RecruitmentExternalReferenceEntity).create({
        sourceSystem: dto.sourceSystem,
        externalEntityType: ExtensionExternalEntityType.JOB_POSTING,
        externalId: dto.amisRecruitmentId,
        externalUrl: dto.amisUrl ?? null,
        internalEntityType: ExtensionInternalEntityType.JOB_POSTING,
        internalEntityId: posting.id,
        lastSnapshotHash: snapshotHash,
        lastIdempotencyKey: context.idempotencyKey,
        lastSyncedByExtensionInstanceId: context.extensionInstanceId ?? null,
        lastSyncedAt: now,
        metadata: this.buildExternalReferenceMetadata(dto, context),
      }),
    );

    return await this.buildResponse({
      resultCode: ExtensionSyncResultCode.CREATED,
      posting: await this.findPosting(manager, posting.id),
      dto,
      snapshotHash,
      snapshotChanged: true,
      actorUserId: context.actorUserId,
      ownerExtensionInstanceId: context.extensionInstanceId,
    });
  }

  private async updateExistingPosting(
    manager: EntityManager,
    externalReference: RecruitmentExternalReferenceEntity,
    posting: JobPostingEntity,
    dto: SyncAmisJobPostingDto,
    context: ExtensionSyncContext,
    snapshotHash: string,
  ) {
    if (posting.status === JobPostingStatus.CLOSED) {
      throw new BadRequestException({
        code: 'INVALID_STATE_TRANSITION',
        message: 'Closed job posting cannot be updated from extension integration.',
      });
    }

    const now = new Date();
    const closeAt = this.parseDeadline(dto.snapshot.deadline, now);
    const jobDescription = await manager.getRepository(JobDescriptionEntity).findOne({
      where: { id: posting.jobDescriptionId },
    });
    if (!jobDescription) {
      throw new BadRequestException('Job description not found');
    }

    jobDescription.title = dto.snapshot.title;
    jobDescription.description = dto.snapshot.description;
    jobDescription.overview = this.optionalText(dto.snapshot.summary) ?? null;
    jobDescription.responsibilities = dto.snapshot.description;
    jobDescription.summary = this.toSummary(dto.snapshot.summary ?? dto.snapshot.description);
    jobDescription.requirements = this.toPlainRequirements(dto.snapshot.requirements);
    jobDescription.benefits = this.normalizeBenefits(dto.snapshot.benefits);
    jobDescription.salary = null;
    jobDescription.annualLeaveDays = null;
    jobDescription.department = null;
    jobDescription.applicationDeadline = closeAt?.toISOString().slice(0, 10) ?? null;
    jobDescription.status = JobDescriptionStatus.ACTIVE;
    await manager.getRepository(JobDescriptionEntity).save(jobDescription);

    const version = await this.createActiveVersionFromJobDescription(
      manager,
      jobDescription.id,
      context.actorUserId,
    );

    posting.title = dto.snapshot.title;
    posting.jobDescriptionVersionId = version.id;
    posting.status = JobPostingStatus.PUBLISHED;
    if (!posting.openAt) posting.openAt = now;
    posting.closeAt = closeAt;
    await manager.getRepository(JobPostingEntity).save(posting);
    if (dto.selectedQuestionIds !== undefined) {
      await this.replacePostingQuestionSetSnapshot(
        manager,
        posting,
        dto.selectedQuestionIds,
        context.actorUserId,
      );
    }

    await this.updateExternalReferenceSyncMetadata(
      manager,
      externalReference,
      dto,
      context,
      snapshotHash,
    );

    return await this.buildResponse({
      resultCode: ExtensionSyncResultCode.UPDATED,
      posting: await this.findPosting(manager, posting.id),
      dto,
      snapshotHash,
      snapshotChanged: true,
      actorUserId: context.actorUserId,
      ownerExtensionInstanceId: context.extensionInstanceId,
    });
  }

  private async replacePostingQuestionSetSnapshot(
    manager: EntityManager,
    posting: JobPostingEntity,
    selectedQuestionIds: string[],
    createdById: string,
  ) {
    const uniqueQuestionIds = [...new Set(selectedQuestionIds.filter(Boolean))];
    if (uniqueQuestionIds.length === 0) return null;

    const snapshotItems = await this.resolvePostingQuestionSnapshotItems(
      manager,
      uniqueQuestionIds,
    );
    if (snapshotItems.length === 0) {
      throw new BadRequestException(
        'Selected questionnaire questions are not available to snapshot for this job posting.',
      );
    }

    const previousQuestionSetId = posting.formQuestionSetId;
    const setRepo = manager.getRepository(QuestionSetEntity);
    const itemRepo = manager.getRepository(QuestionSetItemEntity);
    const snapshotSet = await setRepo.save(setRepo.create({
      name: `Posting Questionnaire - ${posting.title}`,
      jobDescriptionId: posting.jobDescriptionId,
      jobDescriptionVersionId: posting.jobDescriptionVersionId,
      positionId: null,
      levelId: null,
      status: QuestionSetStatus.ACTIVE,
      createdById,
      sourceSystem: JOB_POSTING_SNAPSHOT_SOURCE_SYSTEM,
      sourceJobId: null,
      sourceSnapshotHash: null,
      sourceSnapshot: {
        jobPostingId: posting.id,
        selectedQuestionIds: uniqueQuestionIds,
        questionCount: snapshotItems.length,
      },
      sourceLastSyncedAt: new Date(),
    }));

    const savedItems = await itemRepo.save(
      snapshotItems.map((item, index) => itemRepo.create({
        questionSetId: snapshotSet.id,
        questionId: item.questionId,
        questionTextSnapshot: item.questionTextSnapshot,
        questionType: item.questionType,
        orderIndex: index,
        required: item.required,
        metadata: {
          ...(this.isRecord(item.metadata) ? item.metadata : {}),
          snapshotForJobPostingId: posting.id,
        },
      })),
    );

    posting.formQuestionSetId = snapshotSet.id;
    posting.formQuestionIds = savedItems.map((item) => item.id);
    await manager.getRepository(JobPostingEntity).save(posting);

    if (previousQuestionSetId && previousQuestionSetId !== snapshotSet.id) {
      await setRepo.update(
        {
          id: previousQuestionSetId,
          sourceSystem: JOB_POSTING_SNAPSHOT_SOURCE_SYSTEM,
        },
        { status: QuestionSetStatus.ARCHIVED },
      );
    }

    return snapshotSet;
  }

  private async resolvePostingQuestionSnapshotItems(
    manager: EntityManager,
    selectedQuestionIds: string[],
  ): Promise<PostingQuestionSnapshotItemInput[]> {
    const itemRepo = manager.getRepository(QuestionSetItemEntity);
    const questionSetItems = await itemRepo.find({
      where: { id: In(selectedQuestionIds) },
      relations: ['questionSet', 'question'],
    });
    const itemById = new Map(questionSetItems.map((item) => [item.id, item]));
    const unresolvedIds: string[] = [];
    const resolvedItems: PostingQuestionSnapshotItemInput[] = [];

    for (const selectedQuestionId of selectedQuestionIds) {
      const item = itemById.get(selectedQuestionId);
      if (!item) {
        unresolvedIds.push(selectedQuestionId);
        continue;
      }

      resolvedItems.push({
        questionId: item.questionId,
        questionTextSnapshot: item.questionTextSnapshot,
        questionType: item.questionType,
        required: item.required,
        metadata: {
          ...(this.isRecord(item.metadata) ? item.metadata : {}),
          copiedFromQuestionSetId: item.questionSetId,
          copiedFromQuestionSetItemId: item.id,
          copiedFromQuestionSetSourceSystem: item.questionSet?.sourceSystem ?? null,
        },
      });
    }

    if (unresolvedIds.length === 0) return resolvedItems;

    const bankQuestions = await manager.getRepository(QuestionEntity).find({
      where: { id: In(unresolvedIds), isActive: true },
    });
    const bankQuestionById = new Map(bankQuestions.map((question) => [question.id, question]));

    for (const unresolvedId of unresolvedIds) {
      const question = bankQuestionById.get(unresolvedId);
      if (!question) continue;
      resolvedItems.push({
        questionId: question.id,
        questionTextSnapshot: question.text,
        questionType: question.type,
        required: true,
        metadata: {
          copiedFromQuestionId: question.id,
        },
      });
    }

    return resolvedItems;
  }

  private async updateExternalReferenceSyncMetadata(
    manager: EntityManager,
    externalReference: RecruitmentExternalReferenceEntity,
    dto: SyncAmisJobPostingDto,
    context: ExtensionSyncContext,
    snapshotHash: string,
  ) {
    externalReference.externalUrl = dto.amisUrl ?? externalReference.externalUrl;
    externalReference.lastSnapshotHash = snapshotHash;
    externalReference.lastIdempotencyKey = context.idempotencyKey;
    externalReference.lastSyncedByExtensionInstanceId = context.extensionInstanceId ?? null;
    externalReference.lastSyncedAt = new Date();
    externalReference.metadata = this.buildExternalReferenceMetadata(dto, context);
    await manager.getRepository(RecruitmentExternalReferenceEntity).save(externalReference);
  }

  private async createActiveVersionFromJobDescription(
    manager: EntityManager,
    jobDescriptionId: string,
    createdById: string,
  ) {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `job-description-version:${jobDescriptionId}`,
    ]);
    await manager.getRepository(JobDescriptionVersionEntity).update(
      { jobDescriptionId, status: JobDescriptionVersionStatus.ACTIVE },
      { status: JobDescriptionVersionStatus.SUPERSEDED },
    );

    const latest = await manager.getRepository(JobDescriptionVersionEntity)
      .createQueryBuilder('version')
      .where('version.jobDescriptionId = :jobDescriptionId', { jobDescriptionId })
      .orderBy('version.versionNo', 'DESC')
      .getOne();
    const jobDescription = await manager.getRepository(JobDescriptionEntity).findOne({
      where: { id: jobDescriptionId },
      relations: ['position', 'level', 'createdBy'],
    });
    if (!jobDescription) throw new BadRequestException('Job description not found');

    return manager.getRepository(JobDescriptionVersionEntity).save(
      manager.getRepository(JobDescriptionVersionEntity).create({
        jobDescriptionId,
        versionNo: (latest?.versionNo ?? 0) + 1,
        snapshot: this.buildJobDescriptionSnapshot(jobDescription),
        status: JobDescriptionVersionStatus.ACTIVE,
        createdById,
      }),
    );
  }

  private async buildPreviewPosting(
    dto: SyncAmisJobPostingDto,
    snapshotHash: string,
  ) {
    const manager = this.dataSource.manager;
    const existingReference = await manager.getRepository(RecruitmentExternalReferenceEntity).findOne({
      where: {
        sourceSystem: dto.sourceSystem,
        externalEntityType: ExtensionExternalEntityType.JOB_POSTING,
        externalId: dto.amisRecruitmentId,
      },
    });
    const existingPosting = existingReference
      ? await manager.getRepository(JobPostingEntity).findOne({
        where: { id: existingReference.internalEntityId },
        relations: [
          'jobDescription',
          'jobDescriptionVersion',
          'jobDescriptionVersion.jobDescription',
          'createdBy',
        ],
      })
      : null;

    if (existingPosting && existingReference?.lastSnapshotHash === snapshotHash) {
      return existingPosting;
    }

    const publicSlug = existingPosting?.publicSlug ?? await this.createUniqueSlug(manager, dto.snapshot.title);
    const now = new Date();
    const closeAt = this.parseDeadline(dto.snapshot.deadline, now);
    const jobDescription = manager.getRepository(JobDescriptionEntity).create({
      id: existingPosting?.jobDescriptionId ?? 'preview-job-description',
      title: dto.snapshot.title,
      positionId: null,
      levelId: null,
      description: dto.snapshot.description,
      overview: this.optionalText(dto.snapshot.summary) ?? null,
      responsibilities: dto.snapshot.description,
      summary: this.toSummary(dto.snapshot.summary ?? dto.snapshot.description),
      requirements: this.toPlainRequirements(dto.snapshot.requirements),
      benefits: this.normalizeBenefits(dto.snapshot.benefits),
      salary: null,
      annualLeaveDays: null,
      department: null,
      applicationDeadline: closeAt?.toISOString().slice(0, 10) ?? null,
      status: JobDescriptionStatus.ACTIVE,
      createdById: existingPosting?.createdById ?? 'preview-user',
    });
    const version = manager.getRepository(JobDescriptionVersionEntity).create({
      id: existingPosting?.jobDescriptionVersionId ?? 'preview-job-description-version',
      jobDescriptionId: jobDescription.id,
      versionNo: existingPosting?.jobDescriptionVersion?.versionNo ?? 1,
      snapshot: this.buildJobDescriptionSnapshot(jobDescription),
      status: JobDescriptionVersionStatus.ACTIVE,
      createdById: jobDescription.createdById,
    });

    return manager.getRepository(JobPostingEntity).create({
      id: existingPosting?.id ?? 'preview-job-posting',
      jobDescriptionId: jobDescription.id,
      jobDescription,
      jobDescriptionVersionId: version.id,
      jobDescriptionVersion: version,
      title: dto.snapshot.title,
      publicSlug,
      status: JobPostingStatus.PUBLISHED,
      openAt: existingPosting?.openAt ?? now,
      closeAt,
      formQuestionIds: existingPosting?.formQuestionIds ?? null,
      formQuestionSetId: existingPosting?.formQuestionSetId ?? null,
      createdById: existingPosting?.createdById ?? jobDescription.createdById,
    });
  }

  private buildFacebookPreviewWarnings(
    channels: ExtensionSyncChannel[],
    facebookPublishPlan?: ExtensionFacebookPublishPlan,
  ): ExtensionSyncWarningDto[] {
    const warnings: ExtensionSyncWarningDto[] = [];
    for (const channel of channels) {
      if (channel === RecruitmentChannel.VCS_PORTAL) continue;
      if (channel === RecruitmentChannel.FACEBOOK) {
        if (!facebookPublishPlan || facebookPublishPlan.targets.length === 0) {
          warnings.push({
            code: 'FACEBOOK_TARGETS_NOT_CONFIGURED',
            message: 'No eligible Facebook publish targets are configured or available today.',
            channel,
          });
        }
        continue;
      }

      warnings.push({
        code: 'CHANNEL_NOT_CONFIGURED',
        message: `${channel} is not configured for automatic publishing.`,
        channel,
      });
    }
    return warnings;
  }

  private async findPosting(manager: EntityManager, id: string) {
    const posting = await manager.getRepository(JobPostingEntity).findOne({
      where: { id },
      relations: [
        'jobDescription',
        'jobDescriptionVersion',
        'jobDescriptionVersion.jobDescription',
        'createdBy',
      ],
    });
    if (!posting) throw new BadRequestException('Job posting not found');
    return posting;
  }

  private async findActor(manager: EntityManager, actorUserId: string) {
    const actor = await manager.getRepository(UserEntity).findOne({
      where: { id: actorUserId },
    });
    if (!actor) throw new BadRequestException('Actor user not found');
    return actor;
  }

  private async buildResponse(input: {
    resultCode: ExtensionSyncResultCode;
    posting: JobPostingEntity;
    dto: SyncAmisJobPostingDto;
    snapshotHash: string;
    snapshotChanged: boolean;
    actorUserId: string;
    ownerExtensionInstanceId?: string | null;
  }): Promise<ExtensionSyncResponseDto> {
    const facebookPublishPlan = input.dto.channels.includes(RecruitmentChannel.FACEBOOK)
      ? await this.facebookPublishingService.prepareExtensionPublishPlan(
        input.posting,
        input.actorUserId,
        input.dto.facebookTargetIds,
        input.dto.facebookContent,
        input.ownerExtensionInstanceId,
      )
      : undefined;
    const warnings: ExtensionSyncWarningDto[] = [];
    for (const channel of input.dto.channels) {
      if (channel === RecruitmentChannel.VCS_PORTAL) continue;

      if (channel === RecruitmentChannel.FACEBOOK) {
        if (!facebookPublishPlan || facebookPublishPlan.targets.length === 0) {
          warnings.push({
            code: 'FACEBOOK_TARGETS_NOT_CONFIGURED',
            message: 'No eligible Facebook publish targets are configured or available today.',
            channel,
          });
        }
        continue;
      }

      warnings.push({
        code: 'CHANNEL_NOT_CONFIGURED',
        message: `${channel} is not configured for automatic publishing.`,
        channel,
      });
    }

    return {
      resultCode: input.resultCode,
      jobDescriptionId: input.posting.jobDescriptionId,
      jobDescriptionVersionId: input.posting.jobDescriptionVersionId,
      jobPostingId: input.posting.id,
      amisRecruitmentId: input.dto.amisRecruitmentId,
      snapshotHash: input.snapshotHash,
      snapshotChanged: input.snapshotChanged,
      channelPostings: this.buildChannelPostings(input.posting, input.dto.channels, facebookPublishPlan),
      ...(facebookPublishPlan ? { facebookPublishPlan } : {}),
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  private buildChannelPostings(
    posting: JobPostingEntity,
    channels: ExtensionSyncChannel[],
    facebookPublishPlan?: ExtensionFacebookPublishPlan,
  ): ChannelPostingResultDto[] {
    return channels.map((channel) => {
      if (channel === RecruitmentChannel.VCS_PORTAL) {
        return {
          channel,
          status: this.toPortalChannelStatus(posting.status),
          publishedUrl: posting.status === JobPostingStatus.PUBLISHED
            ? `/jobs/${posting.publicSlug}`
            : null,
          externalPostingId: posting.id,
          errorCode: null,
          manualActionRequired: false,
          message: null,
          lastSyncAt: posting.updatedAt?.toISOString() ?? null,
        };
      }

      if (channel === RecruitmentChannel.FACEBOOK) {
        const hasTargets = Boolean(facebookPublishPlan?.targets.length);
        return {
          channel,
          status: hasTargets ? ChannelPostingStatus.PUBLISHING : ChannelPostingStatus.NOT_CONFIGURED,
          publishedUrl: null,
          externalPostingId: null,
          errorCode: hasTargets ? null : 'FACEBOOK_TARGETS_NOT_CONFIGURED',
          manualActionRequired: !hasTargets,
          message: hasTargets
            ? 'Facebook publish plan is prepared for browser extension execution.'
            : 'No eligible Facebook publish targets are configured or available today.',
          lastSyncAt: posting.updatedAt?.toISOString() ?? null,
        };
      }

      return {
        channel,
        status: ChannelPostingStatus.NOT_CONFIGURED,
        publishedUrl: null,
        externalPostingId: null,
        errorCode: 'CHANNEL_NOT_CONFIGURED',
        manualActionRequired: true,
        message: `${channel} is not configured for automatic publishing.`,
        lastSyncAt: posting.updatedAt?.toISOString() ?? null,
      };
    });
  }

  private toPortalChannelStatus(status: JobPostingStatus) {
    if (status === JobPostingStatus.PUBLISHED) return ChannelPostingStatus.PUBLISHED;
    if (status === JobPostingStatus.PUBLISHING) return ChannelPostingStatus.PUBLISHING;
    if (status === JobPostingStatus.PUBLISH_FAILED) return ChannelPostingStatus.PUBLISH_FAILED;
    if (status === JobPostingStatus.CLOSED) return ChannelPostingStatus.CLOSED;
    if (status === JobPostingStatus.MANUAL_REQUIRED) return ChannelPostingStatus.MANUAL_REQUIRED;
    return ChannelPostingStatus.DRAFT;
  }

  private toDuplicateReplayResponse(responseData: Record<string, unknown> | null) {
    if (!this.isResponseData(responseData)) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_REPLAY_RESPONSE_INVALID',
        message: 'Stored idempotency response is invalid.',
      });
    }

    return {
      ...responseData,
      resultCode: ExtensionSyncResultCode.DUPLICATE_OR_IDEMPOTENT_REPLAY,
      snapshotChanged: false,
    };
  }

  private isResponseData(value: unknown): value is ExtensionSyncResponseDto {
    return typeof value === 'object'
      && value !== null
      && typeof (value as ExtensionSyncResponseDto).amisRecruitmentId === 'string'
      && typeof (value as ExtensionSyncResponseDto).snapshotHash === 'string'
      && Array.isArray((value as ExtensionSyncResponseDto).channelPostings);
  }

  private normalizeRequest(
    dto: SyncAmisJobPostingDto,
    options: { requireFacebookTargets?: boolean } = {},
  ): SyncAmisJobPostingDto {
    if (dto.sourceSystem !== ExtensionSourceSystem.AMIS) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'AMIS job posting sync only accepts AMIS as sourceSystem.',
      });
    }

    const channels = [...new Set(dto.channels)];

    return {
      ...dto,
      sourceSystem: dto.sourceSystem,
      amisRecruitmentId: this.requireText(dto.amisRecruitmentId, 'amisRecruitmentId'),
      amisUrl: this.optionalText(dto.amisUrl) ?? undefined,
      action: dto.action,
      snapshot: {
        ...dto.snapshot,
        title: this.requireText(dto.snapshot.title, 'snapshot.title'),
        description: this.requireText(dto.snapshot.description, 'snapshot.description'),
        summary: this.toSummary(dto.snapshot.summary ?? dto.snapshot.description),
        requirements: this.normalizeRequirements(dto.snapshot.requirements),
        benefits: dto.snapshot.benefits,
        location: this.optionalText(dto.snapshot.location) ?? undefined,
        deadline: this.optionalText(dto.snapshot.deadline) ?? undefined,
      },
      channels,
      facebookTargetIds: this.normalizeFacebookTargetIds(
        dto.facebookTargetIds,
        channels,
        options.requireFacebookTargets ?? true,
      ),
      selectedQuestionIds: this.normalizeSelectedQuestionIds(dto.selectedQuestionIds),
      metadata: this.safeMetadata(dto.metadata),
    };
  }

  private normalizeSelectedQuestionIds(value?: string[]) {
    if (!Array.isArray(value)) return undefined;
    const questionIds = [...new Set(value.map((item) => this.optionalText(item)).filter(Boolean))] as string[];
    return questionIds.length ? questionIds : undefined;
  }

  private normalizeCareerItems(items: SyncAmisCareerItemDto[]): SyncAmisCareerItemDto[] {
    const deduped = new Map<string, SyncAmisCareerItemDto>();

    for (const item of items) {
      const amisCareerId = this.optionalText(item.amisCareerId);
      const name = this.optionalText(item.name);
      if (!amisCareerId || !name) continue;

      deduped.set(amisCareerId, {
        amisCareerId,
        name,
        code: this.optionalText(item.code) ?? undefined,
        description: this.optionalText(item.description) ?? undefined,
        organizationUnitId: this.optionalText(item.organizationUnitId) ?? undefined,
        organizationUnitName: this.optionalText(item.organizationUnitName) ?? undefined,
        usageStatus: typeof item.usageStatus === 'number' ? item.usageStatus : undefined,
        parentAmisCareerId: this.optionalText(item.parentAmisCareerId) ?? undefined,
        sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : undefined,
        isActive: item.isActive ?? item.usageStatus === 1,
        rawSnapshot: this.safeAmisCatalogSnapshot(item.rawSnapshot),
      });
    }

    if (deduped.size === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'At least one AMIS career item with amisCareerId and name is required.',
      });
    }

    return [...deduped.values()];
  }

  private normalizeApplicationItems(items: SyncAmisApplicationsDto['items']) {
    const deduped = new Map<string, SyncAmisApplicationsDto['items'][number]>();

    for (const item of items) {
      const recruitmentId = this.optionalText(item.recruitmentId);
      const recruitmentRoundId = this.optionalText(item.recruitmentRoundId);
      const candidateId = this.optionalText(item.candidateId);
      const candidateName = this.optionalText(item.candidateName);
      const email = this.optionalText(item.email)?.toLowerCase() ?? undefined;
      const mobile = this.optionalText(item.mobile) ?? undefined;

      if (!recruitmentId || !recruitmentRoundId || !candidateId || !candidateName) continue;
      if (!email && !mobile) continue;

      const normalizedItem = {
        recruitmentId,
        recruitmentRoundId,
        candidateId,
        candidateName,
        ...(this.optionalText(item.candidateConvertId) ? { candidateConvertId: this.optionalText(item.candidateConvertId) ?? undefined } : {}),
        ...(email ? { email } : {}),
        ...(mobile ? { mobile } : {}),
        ...(this.optionalText(item.birthday) ? { birthday: this.optionalText(item.birthday) ?? undefined } : {}),
        ...(this.optionalText(item.recruitmentRoundName) ? { recruitmentRoundName: this.optionalText(item.recruitmentRoundName) ?? undefined } : {}),
        ...(typeof item.status === 'number' ? { status: item.status } : {}),
        ...(this.optionalText(item.channelName) ? { channelName: this.optionalText(item.channelName) ?? undefined } : {}),
        ...(this.optionalText(item.applyDate) ? { applyDate: this.optionalText(item.applyDate) ?? undefined } : {}),
        ...(this.optionalText(item.recruitmentTitle) ? { recruitmentTitle: this.optionalText(item.recruitmentTitle) ?? undefined } : {}),
        ...(this.optionalText(item.attachmentCvId) ? { attachmentCvId: this.optionalText(item.attachmentCvId) ?? undefined } : {}),
        ...(this.optionalText(item.attachmentCvName) ? { attachmentCvName: this.optionalText(item.attachmentCvName) ?? undefined } : {}),
        ...(this.optionalText(item.educationDegreeName) ? { educationDegreeName: this.optionalText(item.educationDegreeName) ?? undefined } : {}),
        ...(this.optionalText(item.educationMajorName) ? { educationMajorName: this.optionalText(item.educationMajorName) ?? undefined } : {}),
        ...(this.optionalText(item.workPlaceRecent) ? { workPlaceRecent: this.optionalText(item.workPlaceRecent) ?? undefined } : {}),
        rawSnapshot: this.safeAmisCatalogSnapshot(item.rawSnapshot),
      };

      deduped.set(this.buildAmisExternalApplicationId(normalizedItem), normalizedItem);
    }

    if (deduped.size === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'At least one AMIS candidate item with recruitment, round, candidate, and contact data is required.',
      });
    }

    return [...deduped.values()];
  }

  private requireSingleRecruitmentId(items: Array<{ recruitmentId: string }>) {
    const recruitmentIds = [...new Set(items.map((item) => item.recruitmentId))];
    if (recruitmentIds.length !== 1) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'AMIS application sync must contain candidates from a single RecruitmentID.',
      });
    }

    return recruitmentIds[0];
  }

  private async resolveJobPostingIdByAmisRecruitmentId(amisRecruitmentId: string) {
    const reference = await this.dataSource.getRepository(RecruitmentExternalReferenceEntity).findOne({
      where: {
        sourceSystem: ExtensionSourceSystem.AMIS,
        externalEntityType: ExtensionExternalEntityType.JOB_POSTING,
        externalId: this.requireText(amisRecruitmentId, 'amisRecruitmentId'),
        internalEntityType: ExtensionInternalEntityType.JOB_POSTING,
      },
    });

    if (!reference) {
      throw new BadRequestException({
        code: 'AMIS_RECRUITMENT_NOT_SYNCED',
        message: 'AMIS recruitment is not mapped to an internal job posting yet.',
      });
    }

    return reference.internalEntityId;
  }

  private buildAmisExternalApplicationId(item: {
    recruitmentId: string;
    recruitmentRoundId: string;
    candidateId: string;
    candidateConvertId?: string;
  }) {
    const candidateExternalId = this.optionalText(item.candidateConvertId) ?? item.candidateId;
    return `AMIS:${item.recruitmentId}:${item.recruitmentRoundId}:${candidateExternalId}`;
  }

  private resolveAmisApplicationChannel(channelName?: string) {
    const normalized = this.removeVietnameseMarks(channelName ?? '').toUpperCase().replace(/\s+/g, '');
    if (normalized.includes('FACEBOOK')) return RecruitmentChannel.FACEBOOK;
    if (normalized.includes('TOPCV')) return RecruitmentChannel.TOPCV;
    if (normalized.includes('ITVIEC')) return RecruitmentChannel.ITVIEC;
    if (normalized.includes('VIETNAMWORKS')) return RecruitmentChannel.VIETNAMWORKS;
    if (normalized.includes('LINKEDIN')) return RecruitmentChannel.LINKEDIN;
    return RecruitmentChannel.OTHER;
  }

  private extractBirthYear(value?: string) {
    const normalizedValue = this.optionalText(value);
    if (!normalizedValue) return null;
    const date = new Date(normalizedValue);
    if (!Number.isNaN(date.getTime())) return date.getFullYear();

    const yearMatch = normalizedValue.match(/\b(19|20)\d{2}\b/);
    return yearMatch ? Number(yearMatch[0]) : null;
  }

  private buildAmisApplicationRawPayload(
    item: SyncAmisApplicationsDto['items'][number],
    dto: SyncAmisApplicationsDto,
    context: ExtensionCatalogSyncContext,
    syncedAt: Date,
  ) {
    return {
      sourceSystem: ExtensionSourceSystem.AMIS,
      recruitmentId: item.recruitmentId,
      recruitmentRoundId: item.recruitmentRoundId,
      recruitmentRoundName: item.recruitmentRoundName ?? null,
      candidateId: item.candidateId,
      candidateConvertId: item.candidateConvertId ?? null,
      status: item.status ?? null,
      channelName: item.channelName ?? null,
      applyDate: item.applyDate ?? null,
      recruitmentTitle: item.recruitmentTitle ?? null,
      attachmentCvId: item.attachmentCvId ?? null,
      attachmentCvName: item.attachmentCvName ?? null,
      educationDegreeName: item.educationDegreeName ?? null,
      educationMajorName: item.educationMajorName ?? null,
      workPlaceRecent: item.workPlaceRecent ?? null,
      sourceUrl: this.optionalText(dto.sourceUrl),
      autoSync: dto.metadata?.autoSync === true,
      extensionVersion: this.optionalText(context.extensionVersion),
      extensionInstanceId: this.optionalText(context.extensionInstanceId),
      requestId: this.optionalText(context.requestId),
      lastSyncedAt: syncedAt.toISOString(),
    };
  }

  private findAmisApplicationSource(
    sources: ApplicationSourceEntity[] | undefined,
    amisRecruitmentId: string,
  ) {
    return sources
      ?.filter((source) => {
        if (!this.isRecord(source.rawPayload)) return false;
        return source.rawPayload.sourceSystem === ExtensionSourceSystem.AMIS
          && source.rawPayload.recruitmentId === amisRecruitmentId;
      })
      .sort((left, right) => right.receivedAt.getTime() - left.receivedAt.getTime())[0] ?? null;
  }

  private findNewestApplicationSource(
    left: ApplicationSourceEntity | null | undefined,
    right: ApplicationSourceEntity | null | undefined,
  ) {
    if (!left) return right ?? null;
    if (!right) return left;
    return right.receivedAt.getTime() > left.receivedAt.getTime() ? right : left;
  }

  private getApplicationUploadIdPrefix(applicationId: string) {
    return applicationId.replace(/-/g, '').slice(0, 8).toLowerCase();
  }

  private extractApplicationIdPrefixFromAmisAttachmentName(attachmentCvName?: string | null) {
    const normalizedName = this.optionalText(attachmentCvName);
    if (!normalizedName) return null;

    return normalizedName.match(/-([a-f0-9]{8})(?:\.[a-z0-9]{2,8})?$/i)?.[1]?.toLowerCase() ?? null;
  }

  private async findApplicationByAmisUploadedCvName(
    jobPostingId: string,
    attachmentCvName?: string | null,
  ) {
    const applicationIdPrefix = this.extractApplicationIdPrefixFromAmisAttachmentName(attachmentCvName);
    if (!applicationIdPrefix) return null;

    return this.dataSource.getRepository(ApplicationEntity)
      .createQueryBuilder('application')
      .where('application.jobPostingId = :jobPostingId', { jobPostingId })
      .andWhere("REPLACE(application.id::text, '-', '') LIKE :applicationIdPrefix", {
        applicationIdPrefix: `${applicationIdPrefix}%`,
      })
      .orderBy('application.createdAt', 'ASC')
      .getOne();
  }

  private buildAmisApplicationListRows(
    applications: ApplicationEntity[],
    amisRecruitmentId: string,
  ) {
    const applicationByUploadPrefix = new Map(
      applications.map((application) => [
        this.getApplicationUploadIdPrefix(application.id),
        application,
      ]),
    );
    const sourceOverrides = new Map<string, ApplicationSourceEntity>();
    const duplicateApplicationIds = new Set<string>();

    for (const application of applications) {
      const source = this.findAmisApplicationSource(application.sources, amisRecruitmentId);
      const rawPayload = this.isRecord(source?.rawPayload) ? source.rawPayload : null;
      const attachmentCvName = typeof rawPayload?.attachmentCvName === 'string'
        ? rawPayload.attachmentCvName
        : null;
      const targetApplicationPrefix = this.extractApplicationIdPrefixFromAmisAttachmentName(attachmentCvName);
      const targetApplication = targetApplicationPrefix
        ? applicationByUploadPrefix.get(targetApplicationPrefix)
        : null;

      if (!source || !targetApplication || targetApplication.id === application.id) continue;

      duplicateApplicationIds.add(application.id);
      const newestSource = this.findNewestApplicationSource(
        sourceOverrides.get(targetApplication.id),
        source,
      );
      if (newestSource) sourceOverrides.set(targetApplication.id, newestSource);
    }

    return applications
      .filter((application) => !duplicateApplicationIds.has(application.id))
      .map((application) => ({
        application,
        source: sourceOverrides.get(application.id)
          ?? this.findAmisApplicationSource(application.sources, amisRecruitmentId),
      }));
  }

  private latestByCreatedAt<T extends { createdAt?: Date | null }>(items?: T[] | null) {
    if (!items?.length) return null;
    return [...items].sort((left, right) => {
      const leftTime = left.createdAt?.getTime() ?? 0;
      const rightTime = right.createdAt?.getTime() ?? 0;
      return rightTime - leftTime;
    })[0];
  }

  private safeAmisCatalogSnapshot(value: unknown) {
    if (!this.isRecord(value) || Array.isArray(value)) return undefined;

    const safeSnapshot: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (this.isSensitiveFieldName(key)) continue;

      if (typeof item === 'string') {
        safeSnapshot[key] = item.length > 500 ? item.slice(0, 500) : item;
        continue;
      }

      if (
        typeof item === 'number'
        || typeof item === 'boolean'
        || item === null
      ) {
        safeSnapshot[key] = item;
      }
    }

    return Object.keys(safeSnapshot).length > 0 ? safeSnapshot : undefined;
  }

  private isSensitiveFieldName(key: string) {
    return /(cookie|token|secret|password|authorization|session)/i.test(key);
  }

  private normalizeRequirements(
    value: SyncAmisJobPostingDto['snapshot']['requirements'],
  ): SyncAmisJobPostingDto['snapshot']['requirements'] {
    return {
      ...value,
      rawText: this.requireText(value.rawText, 'snapshot.requirements.rawText'),
      sections: value.sections?.map((section) => ({
        title: this.optionalText(section.title) ?? undefined,
        items: section.items.map((item) => this.requireText(item, 'snapshot.requirements.sections.items')),
      })),
    };
  }

  private toPlainRequirements(
    value: SyncAmisJobPostingDto['snapshot']['requirements'],
  ): string {
    return value.rawText;
  }

  private normalizeBenefits(value: unknown): Record<string, unknown> | null {
    if (value == null) return null;
    if (typeof value === 'string') {
      const rawText = this.optionalText(value);
      return rawText ? { rawText } : null;
    }
    if (this.isRecord(value) && !Array.isArray(value)) return value;

    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'snapshot.benefits must be a JSON object, string, or null.',
    });
  }

  async syncAmisCareers(
    dto: SyncAmisCareersDto,
    context: ExtensionCatalogSyncContext,
  ): Promise<SyncAmisCareersResponseDto> {
    const normalizedItems = this.normalizeCareerItems(dto.items);
    const lastSyncedAt = new Date();

    let createdCount = 0;
    let updatedCount = 0;
    let removedCount = 0;

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AmisCareerEntity);
      const syncOrganizationUnitId = this.findSingleOrganizationUnitId(normalizedItems);
      const incomingIds = new Set(normalizedItems.map((item) => item.amisCareerId));

      for (const item of normalizedItems) {
        const existing = await repo.findOne({
          where: { amisCareerId: item.amisCareerId },
        });

        if (!existing) {
          const questionCategoryNames = this.inferQuestionCategoryNames(item.name);
          await repo.save(repo.create({
            amisCareerId: item.amisCareerId,
            code: item.code ?? null,
            name: item.name,
            description: item.description ?? null,
            organizationUnitId: item.organizationUnitId ?? null,
            organizationUnitName: item.organizationUnitName ?? null,
            usageStatus: item.usageStatus ?? null,
            parentAmisCareerId: item.parentAmisCareerId ?? null,
            sortOrder: item.sortOrder ?? null,
            questionCategoryNames,
            isActive: item.isActive ?? true,
            removedFromAmisAt: null,
            rawSnapshot: item.rawSnapshot ?? null,
            lastSyncedAt,
            lastSyncedById: context.actorUserId,
          }));
          createdCount += 1;
          continue;
        }

        existing.code = item.code ?? null;
        existing.name = item.name;
        existing.description = item.description ?? null;
        existing.organizationUnitId = item.organizationUnitId ?? null;
        existing.organizationUnitName = item.organizationUnitName ?? null;
        existing.usageStatus = item.usageStatus ?? null;
        existing.parentAmisCareerId = item.parentAmisCareerId ?? null;
        existing.sortOrder = item.sortOrder ?? null;
        if (!existing.questionCategoryNames?.length) {
          existing.questionCategoryNames = this.inferQuestionCategoryNames(item.name);
        }
        existing.isActive = item.isActive ?? true;
        existing.removedFromAmisAt = null;
        existing.rawSnapshot = item.rawSnapshot ?? null;
        existing.lastSyncedAt = lastSyncedAt;
        existing.lastSyncedById = context.actorUserId;
        await repo.save(existing);
        updatedCount += 1;
      }

      if (syncOrganizationUnitId) {
        const existingCareersForOrg = await repo.find({
          where: { organizationUnitId: syncOrganizationUnitId },
        });
        const removedCareers = existingCareersForOrg.filter((career) =>
          !incomingIds.has(career.amisCareerId) && career.removedFromAmisAt === null,
        );

        for (const career of removedCareers) {
          career.isActive = false;
          career.usageStatus = 0;
          career.removedFromAmisAt = lastSyncedAt;
          career.lastSyncedAt = lastSyncedAt;
          career.lastSyncedById = context.actorUserId;
          await repo.save(career);
        }

        removedCount = removedCareers.length;
      }
    });

    return {
      syncedCount: normalizedItems.length,
      createdCount,
      updatedCount,
      removedCount,
      skippedCount: dto.items.length - normalizedItems.length,
      lastSyncedAt: lastSyncedAt.toISOString(),
    };
  }

  async syncAmisApplications(
    dto: SyncAmisApplicationsDto,
    context: ExtensionCatalogSyncContext,
  ): Promise<SyncAmisApplicationsResponseDto> {
    const normalizedItems = this.normalizeApplicationItems(dto.items);
    const amisRecruitmentId = this.requireSingleRecruitmentId(normalizedItems);
    const jobPostingId = await this.resolveJobPostingIdByAmisRecruitmentId(amisRecruitmentId);
    const lastSyncedAt = new Date();

    let createdCount = 0;
    let updatedCount = 0;

    for (const item of normalizedItems) {
      const sourceChannel = this.resolveAmisApplicationChannel(item.channelName);
      const externalApplicationId = this.buildAmisExternalApplicationId(item);
      const uploadedApplication = await this.findApplicationByAmisUploadedCvName(
        jobPostingId,
        item.attachmentCvName,
      );
      const result = await this.applicationsService.createFromChannel({
        jobPostingId,
        ...(uploadedApplication ? { candidateId: uploadedApplication.candidateId } : {}),
        candidate: {
          name: item.candidateName,
          email: item.email ?? null,
          phone: item.mobile ?? null,
          birthYear: this.extractBirthYear(item.birthday),
          position: item.recruitmentTitle ?? null,
        },
        sourceChannel,
        externalApplicationId,
        rawPayload: this.buildAmisApplicationRawPayload(item, dto, context, lastSyncedAt),
        createdById: context.actorUserId,
      });

      if (result.created) {
        createdCount += 1;
      } else {
        updatedCount += 1;
      }

      if (result.applicationSource) {
        result.applicationSource.rawPayload = this.buildAmisApplicationRawPayload(
          item,
          dto,
          context,
          lastSyncedAt,
        );
        await this.dataSource.getRepository(ApplicationSourceEntity).save(result.applicationSource);
      }
    }

    return {
      syncedCount: normalizedItems.length,
      createdCount,
      updatedCount,
      skippedCount: dto.items.length - normalizedItems.length,
      jobPostingId,
      amisRecruitmentId,
      lastSyncedAt: lastSyncedAt.toISOString(),
    };
  }

  async listAmisApplicationsForRecruitment(amisRecruitmentId: string) {
    const normalizedRecruitmentId = this.requireText(amisRecruitmentId, 'amisRecruitmentId');
    const jobPostingId = await this.resolveJobPostingIdByAmisRecruitmentId(normalizedRecruitmentId);
    const applications = await this.dataSource.getRepository(ApplicationEntity).find({
      where: { jobPostingId },
      relations: ['candidate', 'currentCvDocument', 'formSessions', 'sources'],
      order: { createdAt: 'DESC' },
    });
    const applicationRows = this.buildAmisApplicationListRows(
      applications,
      normalizedRecruitmentId,
    );

    return {
      amisRecruitmentId: normalizedRecruitmentId,
      jobPostingId,
      total: applicationRows.length,
      applications: applicationRows.map(({ application, source }) => {
        const rawPayload = this.isRecord(source?.rawPayload) ? source.rawPayload : {};
        const latestForm = this.latestByCreatedAt(application.formSessions);

        return {
          applicationId: application.id,
          candidateId: application.candidateId,
          candidateName: application.candidate?.name ?? '',
          email: application.candidate?.email ?? null,
          mobile: application.candidate?.phone ?? null,
          status: application.status,
          formStatus: latestForm?.status ?? null,
          latestForm: latestForm
            ? {
                formSessionId: latestForm.id,
                status: latestForm.status,
                expiresAt: latestForm.expiresAt.toISOString(),
                sentAt: latestForm.sentAt?.toISOString() ?? null,
                openedAt: latestForm.openedAt?.toISOString() ?? null,
                submittedAt: latestForm.submittedAt?.toISOString() ?? null,
                createdAt: latestForm.createdAt.toISOString(),
              }
            : null,
          currentCvDocumentId: application.currentCvDocumentId,
          cvScanStatus: application.currentCvDocument?.scanStatus ?? null,
          cvSanitizeStatus: application.currentCvDocument?.sanitizeStatus ?? null,
          cvParseStatus: application.currentCvDocument?.parseStatus ?? null,
          cvDocumentType: application.currentCvDocument?.documentType ?? null,
          sourceChannel: application.sourceChannel,
          externalApplicationId: application.externalApplicationId,
          amisRecruitmentRoundId: this.optionalText(rawPayload.recruitmentRoundId),
          amisRecruitmentRoundName: this.optionalText(rawPayload.recruitmentRoundName),
          amisStatus: typeof rawPayload.status === 'number' ? rawPayload.status : null,
          attachmentCvId: this.optionalText(rawPayload.attachmentCvId),
          attachmentCvName: this.optionalText(rawPayload.attachmentCvName),
          applyDate: this.optionalText(rawPayload.applyDate),
          createdAt: application.createdAt.toISOString(),
          updatedAt: application.updatedAt.toISOString(),
        };
      }),
    };
  }

  async listAmisCareers(): Promise<AmisCareerCatalogItemDto[]> {
    const repo = this.dataSource.getRepository(AmisCareerEntity);
    const careers = await repo
      .createQueryBuilder('career')
      .where('career.removedFromAmisAt IS NULL')
      .andWhere('career.isActive = true')
      .orderBy('career.name', 'ASC')
      .getMany();

    return careers.map((career) => this.toCareerCatalogItem(career));
  }

  async updateAmisCareerQuestionCategories(
    amisCareerId: string,
    dto: UpdateAmisCareerQuestionCategoriesDto,
  ): Promise<AmisCareerCatalogItemDto> {
    const normalizedId = this.optionalText(amisCareerId);
    if (!normalizedId) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'amisCareerId is required.',
      });
    }

    const questionCategoryNames = dto.questionCategoryNames
      .map((name) => this.optionalText(name))
      .filter((name): name is string => Boolean(name));

    if (!questionCategoryNames.length) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'At least one question category name is required.',
      });
    }

    const repo = this.dataSource.getRepository(AmisCareerEntity);
    const career = await repo.findOne({ where: { amisCareerId: normalizedId } });
    if (!career) {
      throw new BadRequestException({
        code: 'AMIS_CAREER_NOT_FOUND',
        message: 'AMIS career was not found in the synced catalog.',
      });
    }

    career.questionCategoryNames = [...new Set(questionCategoryNames)];
    await repo.save(career);
    return this.toCareerCatalogItem(career);
  }

  async getAmisCareerQuestionContext(amisCareerId: string) {
    const career = await this.resolveActiveAmisCareer(amisCareerId);
    const categoryNames = this.resolveQuestionCategoryNamesForCareer(career);
    const questions = categoryNames.length
      ? await this.questionsService.findAll({ categories: categoryNames, isActive: true })
      : [];
    const allCategories = await this.categoriesService.findAllCategories();
    const mappedCategories = allCategories.filter((category) => categoryNames.includes(category.name));
    const categories = await Promise.all(mappedCategories.map(async (category) => ({
      id: category.id,
      name: category.name,
      displayName: category.displayName,
      description: category.description,
      subcategories: (await this.categoriesService.findAllSubCategories(category.id)).map((subcategory) => ({
        id: subcategory.id,
        name: subcategory.name,
        competencyType: subcategory.competencyType,
        orderIndex: subcategory.orderIndex,
      })),
    })));

    return {
      career: this.toCareerCatalogItem(career),
      categories,
      questions,
    };
  }

  async getJobDescriptionQuestionSetContext(jobDescriptionId: string) {
    const normalizedJobDescriptionId = this.requireText(jobDescriptionId, 'jobDescriptionId');
    const jobDescription = await this.dataSource.getRepository(JobDescriptionEntity).findOne({
      where: { id: normalizedJobDescriptionId },
      relations: ['position', 'level'],
    });
    if (!jobDescription) {
      throw new BadRequestException({
        code: 'JOB_DESCRIPTION_NOT_FOUND',
        message: 'Job description was not found.',
      });
    }

    const questionSet = await this.dataSource.getRepository(QuestionSetEntity)
      .createQueryBuilder('questionSet')
      .leftJoinAndSelect('questionSet.items', 'item')
      .leftJoinAndSelect('item.question', 'question')
      .where('questionSet.jobDescriptionId = :jobDescriptionId', {
        jobDescriptionId: normalizedJobDescriptionId,
      })
      .andWhere('questionSet.status = :status', { status: QuestionSetStatus.ACTIVE })
      .orderBy(
        `CASE WHEN "questionSet"."source_system" = :sourceSystem THEN 0 ELSE 1 END`,
        'ASC',
      )
      .addOrderBy('questionSet.sourceLastSyncedAt', 'DESC', 'NULLS LAST')
      .addOrderBy('questionSet.updatedAt', 'DESC')
      .addOrderBy('item.orderIndex', 'ASC')
      .setParameter('sourceSystem', ExtensionSourceSystem.VCS_PORTAL)
      .getOne();

    const sortedItems = (questionSet?.items ?? []).sort((left, right) =>
      left.orderIndex - right.orderIndex,
    );

    return {
      jobDescription: {
        id: jobDescription.id,
        jobDescriptionId: jobDescription.id,
        title: jobDescription.title,
        summary: jobDescription.summary,
        description: jobDescription.description,
        status: jobDescription.status,
        sourceSystem: jobDescription.sourceSystem,
        sourceJobId: jobDescription.sourceJobId,
        sourceSlug: jobDescription.sourceSlug,
        position: jobDescription.position
          ? {
              id: jobDescription.position.id,
              name: jobDescription.position.name,
              description: jobDescription.position.description,
            }
          : null,
        level: jobDescription.level
          ? {
              id: jobDescription.level.id,
              name: jobDescription.level.name,
              displayName: jobDescription.level.displayName,
              orderIndex: jobDescription.level.orderIndex,
            }
          : null,
      },
      questionSet: questionSet
        ? {
            id: questionSet.id,
            name: questionSet.name,
            status: questionSet.status,
            sourceSystem: questionSet.sourceSystem,
            sourceJobId: questionSet.sourceJobId,
            sourceLastSyncedAt: questionSet.sourceLastSyncedAt?.toISOString() ?? null,
            updatedAt: questionSet.updatedAt?.toISOString() ?? null,
          }
        : null,
      questions: sortedItems.map((item) => ({
        id: item.id,
        questionSetItemId: item.id,
        questionId: item.questionId,
        text: item.questionTextSnapshot,
        type: item.questionType,
        required: item.required,
        orderIndex: item.orderIndex,
        category: item.question?.category ?? null,
        subcategory: item.question?.subcategory ?? null,
        competencyType: item.question?.competencyType ?? null,
        difficulty: item.question?.difficulty ?? null,
        targetLevels: item.question?.targetLevels ?? [],
        expectedAnswer: item.question?.expectedAnswer ?? null,
        scoringGuide: item.question?.scoringGuide ?? null,
        metadata: item.metadata,
      })),
    };
  }

  async createAmisCareerQuestion(
    amisCareerId: string,
    dto: CreateAmisCareerQuestionDto,
  ) {
    const career = await this.resolveActiveAmisCareer(amisCareerId);
    const categoryNames = this.resolveQuestionCategoryNamesForCareer(career);
    const category = this.requireText(dto.category, 'category');
    if (!categoryNames.includes(category)) {
      throw new BadRequestException({
        code: 'AMIS_CAREER_CATEGORY_NOT_MAPPED',
        message: 'Question category is not mapped to the selected AMIS career.',
      });
    }

    return this.questionsService.create({
      category,
      subcategory: this.requireText(dto.subcategory, 'subcategory'),
      text: this.requireText(dto.text, 'text'),
      difficulty: dto.difficulty ?? 1,
      targetLevels: dto.targetLevels?.length
        ? dto.targetLevels
        : ['ENTRY', 'EXPERIENCED', 'SENIOR', 'SPECIALIST'],
      type: dto.type ?? QuestionType.OPEN_ENDED,
      competencyType: dto.competencyType,
      expectedAnswer: this.optionalText(dto.expectedAnswer) ?? undefined,
      scoringGuide: this.optionalText(dto.scoringGuide) ?? undefined,
    });
  }

  private async resolveActiveAmisCareer(amisCareerId: string) {
    const normalizedId = this.optionalText(amisCareerId);
    if (!normalizedId) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'amisCareerId is required.',
      });
    }

    const repo = this.dataSource.getRepository(AmisCareerEntity);
    const career = await repo.findOne({ where: { amisCareerId: normalizedId } });
    if (!career || !career.isActive || career.removedFromAmisAt) {
      throw new BadRequestException({
        code: 'AMIS_CAREER_NOT_FOUND',
        message: 'AMIS career was not found in the synced catalog.',
      });
    }

    return career;
  }

  private resolveQuestionCategoryNamesForCareer(career: AmisCareerEntity) {
    return career.questionCategoryNames?.length
      ? career.questionCategoryNames
      : this.inferQuestionCategoryNames(career.name);
  }

  private toCareerCatalogItem(career: AmisCareerEntity): AmisCareerCatalogItemDto {
    return {
      id: career.id,
      amisCareerId: career.amisCareerId,
      name: career.name,
      description: career.description,
      organizationUnitId: career.organizationUnitId,
      organizationUnitName: career.organizationUnitName,
      usageStatus: career.usageStatus,
      questionCategoryNames: career.questionCategoryNames ?? this.inferQuestionCategoryNames(career.name),
      isActive: career.isActive,
      lastSyncedAt: career.lastSyncedAt.toISOString(),
    };
  }

  private inferQuestionCategoryNames(careerName: string): string[] {
    const defaults = ['SOFT_SKILL', 'PERSONALITY'];
    const normalizedName = this.removeVietnameseMarks(careerName).toLowerCase();
    const isSoftwareCareer = (
      normalizedName.includes('cntt - phan mem') ||
      normalizedName.includes('phan mem') ||
      normalizedName.includes('software') ||
      normalizedName.includes('developer') ||
      normalizedName.includes('lap trinh')
    );

    if (isSoftwareCareer) {
      return ['BACKEND_MUST', 'BACKEND_SHOULD', ...defaults];
    }

    return defaults;
  }

  private removeVietnameseMarks(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  }

  private findSingleOrganizationUnitId(items: SyncAmisCareerItemDto[]) {
    const organizationUnitIds = new Set(
      items
        .map((item) => this.optionalText(item.organizationUnitId))
        .filter((value): value is string => Boolean(value)),
    );

    return organizationUnitIds.size === 1 ? [...organizationUnitIds][0] : null;
  }

  private toSummary(value: unknown) {
    const normalized = this.optionalText(value);
    if (!normalized) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'snapshot.summary is required or must be derivable from snapshot.description.',
      });
    }

    return normalized.length > 500 ? normalized.slice(0, 500).trim() : normalized;
  }

  private summaryForSnapshot(jobDescription: JobDescriptionEntity) {
    const summary = jobDescription.summary?.trim();
    if (summary) return summary;

    return this.toSummary(jobDescription.description || jobDescription.title);
  }

  private parseDeadline(value: string | undefined, now: Date) {
    if (!value) return null;
    const closeAt = new Date(value);
    if (Number.isNaN(closeAt.getTime())) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'snapshot.deadline must be a valid date.',
      });
    }
    if (closeAt <= now) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'snapshot.deadline must be in the future.',
      });
    }
    return closeAt;
  }

  private buildExternalReferenceMetadata(
    dto: SyncAmisJobPostingDto,
    context: ExtensionSyncContext,
  ) {
    return {
      requestId: context.requestId ?? null,
      extensionVersion: context.extensionVersion ?? null,
      extensionInstanceId: context.extensionInstanceId ?? null,
      actorRole: context.actorRole,
      action: dto.action,
      channels: dto.channels,
      facebookTargetCount: dto.facebookTargetIds?.length ?? 0,
      hasAmisUrl: Boolean(dto.amisUrl),
    };
  }

  private buildJobDescriptionSnapshot(jobDescription: JobDescriptionEntity) {
    return {
      schemaVersion: 2,
      snapshottedAt: new Date().toISOString(),
      jobDescription: {
        id: jobDescription.id,
        title: jobDescription.title,
        positionId: jobDescription.positionId,
        levelId: jobDescription.levelId,
        description: jobDescription.description,
        overview: jobDescription.overview,
        responsibilities: jobDescription.responsibilities,
        summary: this.summaryForSnapshot(jobDescription),
        requirements: jobDescription.requirements,
        benefits: jobDescription.benefits,
        salary: jobDescription.salary,
        annualLeaveDays: jobDescription.annualLeaveDays,
        department: jobDescription.department,
        applicationDeadline: jobDescription.applicationDeadline,
        status: jobDescription.status,
        createdById: jobDescription.createdById,
        createdAt: jobDescription.createdAt?.toISOString() ?? null,
        updatedAt: jobDescription.updatedAt?.toISOString() ?? null,
      },
      position: jobDescription.position
        ? {
            id: jobDescription.position.id,
            name: jobDescription.position.name,
            description: jobDescription.position.description,
          }
        : null,
      level: jobDescription.level
        ? {
            id: jobDescription.level.id,
            name: jobDescription.level.name,
            displayName: jobDescription.level.displayName,
            orderIndex: jobDescription.level.orderIndex,
          }
        : null,
      createdBy: jobDescription.createdBy
        ? {
            id: jobDescription.createdBy.id,
            email: jobDescription.createdBy.email,
            name: jobDescription.createdBy.name,
            role: jobDescription.createdBy.role,
          }
        : null,
    };
  }

  private async createUniqueSlug(manager: EntityManager, title: string) {
    const baseSlug = this.normalizeSlug(title);
    let slug = baseSlug;
    let suffix = 2;

    while (await this.slugExists(manager, slug)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return slug;
  }

  private async slugExists(manager: EntityManager, publicSlug: string) {
    return await manager.getRepository(JobPostingEntity).count({
      where: { publicSlug },
    }) > 0;
  }

  private normalizeSlug(value: string) {
    const slug = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');

    if (!slug) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Public slug is required.',
      });
    }
    return slug;
  }

  private safeMetadata(value: unknown) {
    if (value == null) return undefined;
    if (!this.isRecord(value)) return undefined;

    return {
      extensionVersion: this.optionalText(value.extensionVersion),
      capturedAt: this.optionalText(value.capturedAt),
    };
  }

  private normalizeFacebookTargetIds(
    value: unknown,
    channels: ExtensionSyncChannel[],
    requireTargets: boolean,
  ) {
    if (!channels.includes(RecruitmentChannel.FACEBOOK)) return undefined;

    if (!Array.isArray(value)) {
      if (!requireTargets) return undefined;
      throw new BadRequestException({
        code: 'FACEBOOK_TARGETS_REQUIRED',
        message: 'Select at least one Facebook group before publishing.',
      });
    }

    const uniqueTargetIds = [...new Set(value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean))];

    if (uniqueTargetIds.length === 0) {
      if (!requireTargets) return undefined;
      throw new BadRequestException({
        code: 'FACEBOOK_TARGETS_REQUIRED',
        message: 'Select at least one Facebook group before publishing.',
      });
    }

    if (!uniqueTargetIds.every((targetId) => this.isUuid(targetId))) {
      throw new BadRequestException({
        code: 'FACEBOOK_TARGETS_INVALID',
        message: 'Selected Facebook group ids must be valid UUIDs.',
      });
    }

    return uniqueTargetIds;
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private requireText(value: string | undefined, fieldName: string) {
    const normalized = value?.trim();
    if (!normalized) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `${fieldName} is required.`,
      });
    }
    return normalized;
  }

  private optionalText(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
