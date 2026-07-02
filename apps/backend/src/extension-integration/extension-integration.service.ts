import { UserRole } from '@interview-assistant/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
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
  RecruitmentChannel,
} from '../recruitment-common';
import {
  ChannelPostingResultDto,
  ExtensionSyncResponseDto,
  ExtensionSyncWarningDto,
  SyncAmisJobPostingDto,
} from './dto';
import {
  ExtensionExternalEntityType,
  ExtensionInternalEntityType,
  ExtensionSyncAction,
  ExtensionSyncResultCode,
  type ExtensionSyncChannel,
} from './enums';
import { RecruitmentExternalReferenceEntity } from './entities';
import {
  ExtensionIdempotencyDecision,
  ExtensionIdempotencyService,
} from './extension-idempotency.service';
import { createAmisSnapshotHash, createExtensionRequestHash } from './utils';

export interface ExtensionSyncContext {
  actorUserId: string;
  actorRole: UserRole;
  idempotencyKey: string;
  requestId?: string;
  extensionVersion?: string;
}

@Injectable()
export class ExtensionIntegrationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly idempotencyService: ExtensionIdempotencyService,
    private readonly facebookPublishingService: FacebookPublishingService,
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

        return await this.buildResponse({
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

    return await this.buildResponse({
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

    return await this.buildResponse({
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

  private async buildResponse(input: {
    resultCode: ExtensionSyncResultCode;
    posting: JobPostingEntity;
    dto: SyncAmisJobPostingDto;
    snapshotHash: string;
    snapshotChanged: boolean;
  }): Promise<ExtensionSyncResponseDto> {
    const facebookPublishPlan = input.dto.channels.includes(RecruitmentChannel.FACEBOOK)
      ? await this.facebookPublishingService.prepareExtensionPublishPlan(input.posting)
      : undefined;
    const warnings: ExtensionSyncWarningDto[] = [];
    for (const channel of input.dto.channels) {
      if (channel === RecruitmentChannel.VCS_PORTAL) continue;

      if (channel === RecruitmentChannel.FACEBOOK) {
        if (!facebookPublishPlan || facebookPublishPlan.targets.length === 0) {
          warnings.push({
            code: 'FACEBOOK_TARGETS_NOT_CONFIGURED',
            message: 'No active Facebook publish targets are configured.',
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
            : 'No active Facebook publish targets are configured.',
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
        requirements: this.normalizeRequirements(dto.snapshot.requirements),
        benefits: dto.snapshot.benefits,
        location: this.optionalText(dto.snapshot.location) ?? undefined,
        deadline: this.optionalText(dto.snapshot.deadline) ?? undefined,
      },
      channels,
      metadata: this.safeMetadata(dto.metadata),
    };
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
