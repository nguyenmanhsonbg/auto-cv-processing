import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobPostingEntity } from '../job-postings/entities/job-posting.entity';
import { JobPostingStatus } from '../recruitment-common';
import { FacebookPostContentService } from './content/facebook-post-content.service';
import { FacebookPublishHistoryEntity } from './entities/facebook-publish-history.entity';
import { FacebookPublishTargetEntity } from './entities/facebook-publish-target.entity';
import {
  CreateFacebookGroupInput,
  ExtensionFacebookPublishPlan,
  FacebookPublishTargetType,
  FacebookPublishResultStatus,
  ReportFacebookPublishResultInput,
  ResolvedFacebookPublishTarget,
  UpdateFacebookGroupInput,
} from './facebook-publishing.types';

@Injectable()
export class FacebookPublishingService {
  constructor(
    @InjectRepository(FacebookPublishTargetEntity)
    private readonly targetsRepo: Repository<FacebookPublishTargetEntity>,
    @InjectRepository(FacebookPublishHistoryEntity)
    private readonly historiesRepo: Repository<FacebookPublishHistoryEntity>,
    @InjectRepository(JobPostingEntity)
    private readonly jobPostingsRepo: Repository<JobPostingEntity>,
    private readonly configService: ConfigService,
    private readonly contentService: FacebookPostContentService,
  ) {}

  async prepareExtensionPublishPlan(
    posting: JobPostingEntity,
    ownerUserId: string,
  ): Promise<ExtensionFacebookPublishPlan> {
    const content = this.contentService.build(posting);
    const targets = await this.resolveActiveTargets(ownerUserId);

    return {
      jobPostingId: posting.id,
      content,
      targets,
      delay: {
        minMs: this.numberEnv('FACEBOOK_PUBLISH_TARGET_DELAY_MIN_MS', 45_000),
        maxMs: this.numberEnv('FACEBOOK_PUBLISH_TARGET_DELAY_MAX_MS', 90_000),
      },
    };
  }

  async listActiveExtensionGroups(ownerUserId: string): Promise<ResolvedFacebookPublishTarget[]> {
    const targets = await this.resolveActiveTargets(ownerUserId);
    return targets.filter((target) => target.targetType === FacebookPublishTargetType.GROUP);
  }

  async createExtensionGroup(input: CreateFacebookGroupInput): Promise<ResolvedFacebookPublishTarget> {
    const name = this.requireText(input.targetName, 'targetName');
    const groupUrl = this.normalizeFacebookGroupUrl(input.targetUrl);
    const existingTarget = await this.targetsRepo.findOne({
      where: {
        ownerUserId: input.ownerUserId,
        type: FacebookPublishTargetType.GROUP,
        externalId: groupUrl.externalId,
      },
    });

    if (existingTarget) {
      existingTarget.name = name;
      existingTarget.url = groupUrl.url;
      existingTarget.active = true;
      return this.toResolvedTarget(await this.targetsRepo.save(existingTarget));
    }

    const priority = await this.getNextGroupPriority(input.ownerUserId);
    const target = this.targetsRepo.create({
      type: FacebookPublishTargetType.GROUP,
      name,
      externalId: groupUrl.externalId,
      url: groupUrl.url,
      ownerUserId: input.ownerUserId,
      active: true,
      priority,
    });

    return this.toResolvedTarget(await this.targetsRepo.save(target));
  }

  async updateExtensionGroup(input: UpdateFacebookGroupInput): Promise<ResolvedFacebookPublishTarget> {
    const target = await this.findOwnedActiveGroup(input.ownerUserId, input.targetId);
    const name = this.requireText(input.targetName, 'targetName');
    const groupUrl = this.normalizeFacebookGroupUrl(input.targetUrl);

    const duplicateTarget = await this.targetsRepo.findOne({
      where: {
        ownerUserId: input.ownerUserId,
        type: FacebookPublishTargetType.GROUP,
        externalId: groupUrl.externalId,
        active: true,
      },
    });
    if (duplicateTarget && duplicateTarget.id !== target.id) {
      throw new BadRequestException({
        code: 'FACEBOOK_GROUP_ALREADY_EXISTS',
        message: 'Facebook group URL is already configured for this account.',
      });
    }

    target.name = name;
    target.externalId = groupUrl.externalId;
    target.url = groupUrl.url;

    return this.toResolvedTarget(await this.targetsRepo.save(target));
  }

  async deleteExtensionGroup(ownerUserId: string, targetId: string): Promise<ResolvedFacebookPublishTarget> {
    const target = await this.findOwnedActiveGroup(ownerUserId, targetId);
    target.active = false;
    return this.toResolvedTarget(await this.targetsRepo.save(target));
  }

  async reportExtensionPublishResult(input: ReportFacebookPublishResultInput) {
    const posting = await this.jobPostingsRepo.findOne({
      where: { id: input.jobPostingId },
      relations: [
        'jobDescription',
        'jobDescriptionVersion',
        'jobDescriptionVersion.jobDescription',
        'createdBy',
      ],
    });
    if (!posting) throw new BadRequestException('Job posting not found');

    const content = input.content?.trim() || this.contentService.build(posting);
    const history = this.historiesRepo.create({
      jobPostingId: posting.id,
      jobDescriptionId: posting.jobDescriptionId ?? null,
      jobDescriptionVersionId: posting.jobDescriptionVersionId ?? null,
      targetId: input.targetId ?? null,
      targetType: input.targetType,
      targetName: input.targetName,
      targetUrl: input.targetUrl ?? null,
      content,
      status: input.status,
      errorReason: input.status === FacebookPublishResultStatus.SUCCESS ? null : input.message,
      externalPostId: input.externalPostId ?? null,
      submittedAt: input.status === FacebookPublishResultStatus.SUCCESS
        ? input.submittedAt ?? new Date()
        : null,
    });

    const savedHistory = await this.historiesRepo.save(history);
    if (
      input.status === FacebookPublishResultStatus.SUCCESS
      && posting.status !== JobPostingStatus.CLOSED
      && posting.status !== JobPostingStatus.PUBLISHED
    ) {
      posting.status = JobPostingStatus.PUBLISHED;
      if (!posting.openAt) posting.openAt = new Date();
      await this.jobPostingsRepo.save(posting);
    }

    return savedHistory;
  }

  private async resolveActiveTargets(ownerUserId: string): Promise<ResolvedFacebookPublishTarget[]> {
    const configuredTargets = await this.targetsRepo.find({
      where: { active: true, ownerUserId },
      order: { priority: 'ASC', createdAt: 'ASC' },
    });

    return configuredTargets.map((target) => this.toResolvedTarget(target));
  }

  private toResolvedTarget(target: FacebookPublishTargetEntity): ResolvedFacebookPublishTarget {
    return {
      targetId: target.id,
      targetType: target.type,
      targetName: target.name,
      targetUrl: target.url,
      targetExternalId: target.externalId,
    };
  }

  private numberEnv(name: string, defaultValue: number) {
    const raw = this.configService.get<string | number>(name);
    const value = Number(raw);
    return Number.isFinite(value) ? value : defaultValue;
  }

  private async getNextGroupPriority(ownerUserId: string) {
    const latestTarget = await this.targetsRepo.findOne({
      where: {
        ownerUserId,
        type: FacebookPublishTargetType.GROUP,
      },
      order: { priority: 'DESC', createdAt: 'DESC' },
    });

    return (latestTarget?.priority ?? -1) + 1;
  }

  private async findOwnedActiveGroup(ownerUserId: string, targetId: string) {
    const target = await this.targetsRepo.findOne({
      where: {
        id: targetId,
        ownerUserId,
        type: FacebookPublishTargetType.GROUP,
        active: true,
      },
    });

    if (!target) {
      throw new BadRequestException({
        code: 'FACEBOOK_GROUP_NOT_FOUND',
        message: 'Facebook group not found for this account.',
      });
    }

    return target;
  }

  private normalizeFacebookGroupUrl(value: string) {
    const rawUrl = this.requireText(value, 'targetUrl');
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      throw new BadRequestException({
        code: 'FACEBOOK_GROUP_URL_INVALID',
        message: 'Facebook group URL must be a valid absolute URL.',
      });
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    const isFacebookHost = hostname === 'facebook.com' || hostname.endsWith('.facebook.com');
    if (!isFacebookHost) {
      throw new BadRequestException({
        code: 'FACEBOOK_GROUP_URL_INVALID',
        message: 'Facebook group URL must use a facebook.com domain.',
      });
    }

    const pathSegments = parsedUrl.pathname
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);
    const groupsIndex = pathSegments.findIndex((segment) => segment.toLowerCase() === 'groups');
    const rawExternalId = groupsIndex >= 0 ? pathSegments[groupsIndex + 1] : undefined;
    const externalId = rawExternalId ? this.decodeUrlPathSegment(rawExternalId).trim() : '';

    if (!externalId) {
      throw new BadRequestException({
        code: 'FACEBOOK_GROUP_URL_INVALID',
        message: 'Facebook group URL must match https://www.facebook.com/groups/{groupId}.',
      });
    }

    return {
      externalId,
      url: `https://www.facebook.com/groups/${encodeURIComponent(externalId)}`,
    };
  }

  private requireText(value: string, fieldName: string) {
    const normalizedValue = value?.trim();
    if (!normalizedValue) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `${fieldName} is required.`,
      });
    }

    return normalizedValue;
  }

  private decodeUrlPathSegment(value: string) {
    try {
      return decodeURIComponent(value);
    } catch {
      throw new BadRequestException({
        code: 'FACEBOOK_GROUP_URL_INVALID',
        message: 'Facebook group URL contains an invalid group id.',
      });
    }
  }
}
