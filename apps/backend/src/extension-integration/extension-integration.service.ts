import { UserRole } from '@interview-assistant/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { UserEntity } from '../auth/entities/user.entity';
import { JobDescriptionEntity } from '../job-descriptions/entities/job-description.entity';
import { JobDescriptionVersionEntity } from '../job-descriptions/entities/job-description-version.entity';
import { JobPostingEntity } from '../job-postings/entities/job-posting.entity';
import {
  ChannelPostingStatus,
  JobDescriptionStatus,
  JobDescriptionVersionStatus,
  JobPostingStatus,
  RecruitmentChannel,
} from '../recruitment-common';
import {
  ChannelPostingResultDto,
  AmisCareerCatalogItemDto,
  CreateAmisCareerQuestionDto,
  ExtensionSyncResponseDto,
  SyncAmisCareersDto,
  SyncAmisCareersResponseDto,
  SyncAmisCareerItemDto,
  SyncAmisJobPostingDto,
  UpdateAmisCareerQuestionCategoriesDto,
} from './dto';
import {
  ExtensionExternalEntityType,
  ExtensionInternalEntityType,
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
import { CategoriesService } from '../categories/categories.service';
import { QuestionType } from '@interview-assistant/shared';

export interface ExtensionSyncContext {
  actorUserId: string;
  actorRole: UserRole;
  idempotencyKey: string;
  requestId?: string;
  extensionVersion?: string;
}

export interface ExtensionCatalogSyncContext {
  actorUserId: string;
  actorRole: UserRole;
  requestId?: string;
  extensionVersion?: string;
}

@Injectable()
export class ExtensionIntegrationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly idempotencyService: ExtensionIdempotencyService,
    private readonly questionsService: QuestionsService,
    private readonly categoriesService: CategoriesService,
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
    const snapshotHash = createAmisSnapshotHash(normalizedDto.snapshot);

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

        return this.buildResponse({
          resultCode: ExtensionSyncResultCode.DUPLICATE_OR_IDEMPOTENT_REPLAY,
          posting,
          dto,
          snapshotHash,
          snapshotChanged: false,
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
        summary: this.toSummary(dto.snapshot.summary ?? dto.snapshot.description),
        requirements: this.toPlainRequirements(dto.snapshot.requirements),
        benefits: this.normalizeBenefits(dto.snapshot.benefits),
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
        createdById: createdBy.id,
      }),
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
        lastSyncedAt: now,
        metadata: this.buildExternalReferenceMetadata(dto, context),
      }),
    );

    return this.buildResponse({
      resultCode: ExtensionSyncResultCode.CREATED,
      posting: await this.findPosting(manager, posting.id),
      dto,
      snapshotHash,
      snapshotChanged: true,
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
    jobDescription.summary = this.toSummary(dto.snapshot.summary ?? dto.snapshot.description);
    jobDescription.requirements = this.toPlainRequirements(dto.snapshot.requirements);
    jobDescription.benefits = this.normalizeBenefits(dto.snapshot.benefits);
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

    await this.updateExternalReferenceSyncMetadata(
      manager,
      externalReference,
      dto,
      context,
      snapshotHash,
    );

    return this.buildResponse({
      resultCode: ExtensionSyncResultCode.UPDATED,
      posting: await this.findPosting(manager, posting.id),
      dto,
      snapshotHash,
      snapshotChanged: true,
    });
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

  private buildResponse(input: {
    resultCode: ExtensionSyncResultCode;
    posting: JobPostingEntity;
    dto: SyncAmisJobPostingDto;
    snapshotHash: string;
    snapshotChanged: boolean;
  }): ExtensionSyncResponseDto {
    const warnings = input.dto.channels
      .filter((channel) => channel !== RecruitmentChannel.VCS_PORTAL)
      .map((channel) => ({
        code: 'CHANNEL_NOT_CONFIGURED',
        message: `${channel} is not configured for automatic publishing.`,
        channel,
      }));

    return {
      resultCode: input.resultCode,
      jobDescriptionId: input.posting.jobDescriptionId,
      jobDescriptionVersionId: input.posting.jobDescriptionVersionId,
      jobPostingId: input.posting.id,
      amisRecruitmentId: input.dto.amisRecruitmentId,
      snapshotHash: input.snapshotHash,
      snapshotChanged: input.snapshotChanged,
      channelPostings: this.buildChannelPostings(input.posting, input.dto.channels),
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  private buildChannelPostings(
    posting: JobPostingEntity,
    channels: ExtensionSyncChannel[],
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

  private normalizeRequest(dto: SyncAmisJobPostingDto): SyncAmisJobPostingDto {
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
      metadata: this.safeMetadata(dto.metadata),
    };
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
  ): Record<string, unknown> {
    return {
      rawText: value.rawText,
      sections: value.sections,
      mustHaveSkills: value.mustHaveSkills,
      niceToHaveSkills: value.niceToHaveSkills,
      minExperienceYears: value.minExperienceYears,
      education: value.education,
      languages: value.languages,
      certifications: value.certifications,
      notes: value.notes,
    };
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
      actorRole: context.actorRole,
      action: dto.action,
      channels: dto.channels,
      hasAmisUrl: Boolean(dto.amisUrl),
    };
  }

  private buildJobDescriptionSnapshot(jobDescription: JobDescriptionEntity) {
    return {
      schemaVersion: 1,
      snapshottedAt: new Date().toISOString(),
      jobDescription: {
        id: jobDescription.id,
        title: jobDescription.title,
        positionId: jobDescription.positionId,
        levelId: jobDescription.levelId,
        description: jobDescription.description,
        summary: this.summaryForSnapshot(jobDescription),
        requirements: jobDescription.requirements,
        benefits: jobDescription.benefits,
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
