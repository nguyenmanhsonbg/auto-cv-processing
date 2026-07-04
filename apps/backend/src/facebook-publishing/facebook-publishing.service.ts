import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JobPostingEntity } from '../job-postings/entities/job-posting.entity';
import { JobPostingStatus } from '../recruitment-common';
import { FacebookPostContentService } from './content/facebook-post-content.service';
import { FacebookPublishHistoryEntity } from './entities/facebook-publish-history.entity';
import { FacebookPublishTargetEntity } from './entities/facebook-publish-target.entity';
import {
  CreateFacebookGroupInput,
  ExtensionFacebookPublishPlan,
  FacebookPublishTargetEligibilityStatus,
  FacebookPublishTargetType,
  FacebookPublishResultStatus,
  ReportFacebookPublishResultInput,
  ResolvedFacebookPublishTarget,
  UpdateFacebookGroupVerificationInput,
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
    selectedTargetIds?: string[],
  ): Promise<ExtensionFacebookPublishPlan> {
    const content = this.contentService.build(posting);
    const targets = await this.resolveActiveTargets(ownerUserId, selectedTargetIds);

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
    const targets = await this.targetsRepo.find({
      where: {
        active: true,
        ownerUserId,
        type: FacebookPublishTargetType.GROUP,
      },
      order: { priority: 'ASC', createdAt: 'ASC' },
    });

    return this.toResolvedTargets(targets);
  }

  async createExtensionGroup(input: CreateFacebookGroupInput): Promise<ResolvedFacebookPublishTarget> {
    const name = this.requireText(input.targetName, 'targetName');
    const groupUrl = this.normalizeFacebookGroupUrl(input.targetUrl);
    const activeTarget = await this.targetsRepo.findOne({
      where: {
        ownerUserId: input.ownerUserId,
        type: FacebookPublishTargetType.GROUP,
        externalId: groupUrl.externalId,
        active: true,
      },
    });
    if (activeTarget) {
      throw new BadRequestException({
        code: 'FACEBOOK_GROUP_ALREADY_EXISTS',
        message: 'Facebook group URL is already configured for this account.',
      });
    }

    const inactiveTarget = await this.targetsRepo.findOne({
      where: {
        ownerUserId: input.ownerUserId,
        type: FacebookPublishTargetType.GROUP,
        externalId: groupUrl.externalId,
        active: false,
      },
    });
    if (inactiveTarget) {
      inactiveTarget.name = name;
      inactiveTarget.url = groupUrl.url;
      inactiveTarget.active = true;
      inactiveTarget.eligibilityStatus = FacebookPublishTargetEligibilityStatus.UNKNOWN;
      inactiveTarget.eligibilityReason = 'Group has not been verified yet.';
      inactiveTarget.lastVerifiedAt = null;
      return this.toResolvedTarget(await this.targetsRepo.save(inactiveTarget));
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
      eligibilityStatus: FacebookPublishTargetEligibilityStatus.UNKNOWN,
      eligibilityReason: 'Group has not been verified yet.',
      lastVerifiedAt: null,
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
    target.eligibilityStatus = FacebookPublishTargetEligibilityStatus.UNKNOWN;
    target.eligibilityReason = 'Group has not been verified yet.';
    target.lastVerifiedAt = null;

    return this.toResolvedTarget(await this.targetsRepo.save(target));
  }

  async updateExtensionGroupVerification(
    input: UpdateFacebookGroupVerificationInput,
  ): Promise<ResolvedFacebookPublishTarget> {
    const target = await this.findOwnedActiveGroup(input.ownerUserId, input.targetId);
    const eligibilityStatus = this.normalizeVerificationStatus(input.eligibilityStatus, input.eligibilityReason);

    target.eligibilityStatus = eligibilityStatus;
    target.eligibilityReason = input.eligibilityReason?.trim() || null;
    target.lastVerifiedAt = input.verifiedAt ?? new Date();

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

  private async resolveActiveTargets(
    ownerUserId: string,
    selectedTargetIds?: string[],
  ): Promise<ResolvedFacebookPublishTarget[]> {
    if (selectedTargetIds) {
      const uniqueTargetIds = [...new Set(selectedTargetIds.map((targetId) => targetId.trim()).filter(Boolean))];
      if (uniqueTargetIds.length === 0) {
        throw new BadRequestException({
          code: 'FACEBOOK_TARGETS_REQUIRED',
          message: 'Select at least one Facebook group before publishing.',
        });
      }

      const selectedTargets = await this.targetsRepo.find({
        where: {
          id: In(uniqueTargetIds),
          active: true,
          ownerUserId,
          type: FacebookPublishTargetType.GROUP,
        },
        order: { priority: 'ASC', createdAt: 'ASC' },
      });
      if (selectedTargets.length !== uniqueTargetIds.length) {
        throw new BadRequestException({
          code: 'FACEBOOK_TARGETS_INVALID',
          message: 'One or more selected Facebook groups are unavailable for this account.',
        });
      }

      const resolvedTargets = await this.toResolvedTargets(selectedTargets);
      const unavailableTargets = resolvedTargets.filter((target) => !target.selectable);
      if (unavailableTargets.length > 0) {
        throw new BadRequestException({
          code: 'FACEBOOK_TARGETS_NOT_ELIGIBLE',
          message: 'One or more selected Facebook groups need verification or have reached the daily publish limit.',
          details: unavailableTargets.map((target) =>
            `${target.targetName}: ${target.eligibilityStatus}, quota ${target.quotaLabel}. ${target.disabledReason ?? 'Not selectable.'}`,
          ),
        });
      }

      return resolvedTargets;
    }

    const configuredTargets = await this.targetsRepo.find({
      where: { active: true, ownerUserId },
      order: { priority: 'ASC', createdAt: 'ASC' },
    });

    return (await this.toResolvedTargets(configuredTargets)).filter((target) => target.selectable);
  }

  private async toResolvedTarget(target: FacebookPublishTargetEntity): Promise<ResolvedFacebookPublishTarget> {
    return (await this.toResolvedTargets([target]))[0];
  }

  private async toResolvedTargets(targets: FacebookPublishTargetEntity[]): Promise<ResolvedFacebookPublishTarget[]> {
    const targetIds = targets.map((target) => target.id).filter(Boolean);
    const todayCounts = await this.getTodayPublishCounts(targetIds);

    return targets.map((target) => {
      const todayPublishCount = todayCounts.get(target.id) ?? 0;
      const dailyPublishLimit = this.normalizeDailyPublishLimit(target.dailyPublishLimit);
      const quotaExceeded = todayPublishCount >= dailyPublishLimit;
      const eligibilityStatus = this.normalizeVerificationStatus(
        target.eligibilityStatus ?? FacebookPublishTargetEligibilityStatus.UNKNOWN,
        target.eligibilityReason,
      );
      const disabledReason = this.getDisabledReason(target, quotaExceeded, eligibilityStatus);

      return {
        targetId: target.id,
        targetType: target.type,
        targetName: target.name,
        targetUrl: target.url,
        targetExternalId: target.externalId,
        eligibilityStatus,
        eligibilityReason: target.eligibilityReason,
        lastVerifiedAt: target.lastVerifiedAt?.toISOString() ?? null,
        todayPublishCount,
        dailyPublishLimit,
        quotaLabel: `${todayPublishCount}/${dailyPublishLimit}`,
        quotaExceeded,
        selectable: !disabledReason,
        disabledReason,
      };
    });
  }

  private getDisabledReason(
    target: FacebookPublishTargetEntity,
    quotaExceeded: boolean,
    eligibilityStatus = target.eligibilityStatus ?? FacebookPublishTargetEligibilityStatus.UNKNOWN,
  ) {
    if (eligibilityStatus === FacebookPublishTargetEligibilityStatus.UNKNOWN) {
      return target.eligibilityReason || 'Group has not been verified yet.';
    }

    if (eligibilityStatus === FacebookPublishTargetEligibilityStatus.CANNOT_POST) {
      return target.eligibilityReason || 'Current Facebook account cannot post to this group.';
    }

    if (quotaExceeded) {
      return 'Daily publish limit has been reached for this group.';
    }

    return null;
  }

  private normalizeDailyPublishLimit(value: number | null | undefined) {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) && parsedValue > 0 ? Math.floor(parsedValue) : 10;
  }

  private normalizeVerificationStatus(
    status: FacebookPublishTargetEligibilityStatus,
    reason: string | null | undefined,
  ) {
    if (status !== FacebookPublishTargetEligibilityStatus.CANNOT_POST) return status;

    const normalizedReason = reason?.trim().toLowerCase() ?? '';
    const ambiguousAutomationFailure = [
      'could not find facebook group post composer',
      'could not open facebook group post composer',
      'could not verify facebook group composer automatically',
      'hidden and visible verification could not prove posting eligibility',
    ].some((pattern) => normalizedReason.includes(pattern));

    return ambiguousAutomationFailure
      ? FacebookPublishTargetEligibilityStatus.UNKNOWN
      : status;
  }

  private async getTodayPublishCounts(targetIds: string[]) {
    if (targetIds.length === 0) return new Map<string, number>();

    const { start, end } = this.getSaigonDayWindow(new Date());
    const rows = await this.historiesRepo
      .createQueryBuilder('history')
      .select('history.targetId', 'targetId')
      .addSelect('COUNT(*)', 'count')
      .where('history.targetId IN (:...targetIds)', { targetIds })
      .andWhere('history.status = :status', { status: FacebookPublishResultStatus.SUCCESS })
      .andWhere('history.submittedAt >= :start', { start })
      .andWhere('history.submittedAt < :end', { end })
      .groupBy('history.targetId')
      .getRawMany<{ targetId: string; count: string }>();

    return new Map(rows.map((row) => [row.targetId, Number(row.count)]));
  }

  private getSaigonDayWindow(now: Date) {
    const saigonOffsetMs = 7 * 60 * 60 * 1000;
    const saigonNow = new Date(now.getTime() + saigonOffsetMs);
    const start = new Date(Date.UTC(
      saigonNow.getUTCFullYear(),
      saigonNow.getUTCMonth(),
      saigonNow.getUTCDate(),
    ) - saigonOffsetMs);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

    return { start, end };
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
