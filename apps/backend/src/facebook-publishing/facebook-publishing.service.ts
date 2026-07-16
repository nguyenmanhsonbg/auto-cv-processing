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
  FacebookReviewStatus,
  FacebookPublishTargetEligibilityStatus,
  FacebookPublishTargetType,
  FacebookPublishResultStatus,
  ListFacebookPublishHistoriesInput,
  ReportFacebookPublishResultInput,
  ResolvedFacebookPublishTarget,
  UpdateFacebookGroupVerificationInput,
  UpdateFacebookGroupInput,
  UpdateFacebookPublishHistoryStatusCheckInput,
} from './facebook-publishing.types';
import { DiscoverFacebookGroupsResponseDto } from '../extension-integration/dto';
import { AmisJobSnapshotDto } from '../extension-integration/dto/sync-amis-job-posting.dto';

interface DiscoverFacebookGroupsInput {
  ownerUserId: string;
  groups: Array<{
    targetName: string;
    targetUrl: string;
    targetExternalId?: string | null;
  }>;
}

interface GenerateFacebookPreviewContentInput {
  snapshot: AmisJobSnapshotDto;
}

@Injectable()
export class FacebookPublishingService {
  private readonly IT_RECRUITMENT_GROUP_REGEX =
    /\b(tuyen\s*dung|viec\s*lam|recruitment|jobs?|it|cntt|dev(eloper)?|tester|cong\s*nghe\s*thong\s*tin|tech(nology)?|engineer|frontend|backend|fullstack|react|node|java(script)?|type\s*script|comtor|ba|brse|lap\s*trinh|coder|qa|qc)\b/i;

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
    customContent?: string | null,
  ): Promise<ExtensionFacebookPublishPlan> {
    const content = this.contentService.build(posting, customContent);
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

  generateExtensionPreviewContent(input: GenerateFacebookPreviewContentInput) {
    return this.contentService.buildFromSnapshot(input.snapshot);
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
    const discoveryTime = new Date();
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
      inactiveTarget.lastDiscoveredAt = discoveryTime;
      inactiveTarget.ownerExtensionInstanceId = input.ownerExtensionInstanceId ?? inactiveTarget.ownerExtensionInstanceId;
      return this.toResolvedTarget(await this.targetsRepo.save(inactiveTarget));
    }

    const priority = await this.getNextGroupPriority(input.ownerUserId);
    const target = this.targetsRepo.create({
      type: FacebookPublishTargetType.GROUP,
      name,
      externalId: groupUrl.externalId,
      url: groupUrl.url,
      ownerUserId: input.ownerUserId,
      ownerExtensionInstanceId: input.ownerExtensionInstanceId ?? null,
      lastVerifiedByInstanceId: null,
      facebookAccountLabel: null,
      active: true,
      priority,
      eligibilityStatus: FacebookPublishTargetEligibilityStatus.UNKNOWN,
      eligibilityReason: 'Group has not been verified yet.',
      lastVerifiedAt: null,
      lastDiscoveredAt: discoveryTime,
    });

    return this.toResolvedTarget(await this.targetsRepo.save(target));
  }

  async discoverAndSyncExtensionGroups(input: DiscoverFacebookGroupsInput): Promise<DiscoverFacebookGroupsResponseDto> {
    const requested = input.groups.length;
    const discoveryTime = new Date();
    const result: DiscoverFacebookGroupsResponseDto = {
      requested,
      valid: 0,
      created: 0,
      updated: 0,
      reactivated: 0,
      duplicates: 0,
      filtered: 0,
      skipped: 0,
      conflicts: 0,
      errors: [],
      items: [],
    };

    const uniqueGroups = new Map<string, { targetName: string; targetUrl: string }>();
    for (const rawItem of input.groups) {
      try {
        const name = this.requireText(rawItem.targetName, 'targetName');
        const groupUrl = this.normalizeFacebookGroupUrl(rawItem.targetUrl);

        if (!groupUrl.externalId) continue;
        if (!this.isItRecruitmentFacebookGroupName(name)) {
          result.filtered += 1;
          result.skipped += 1;
          result.items.push({
            action: 'skipped',
            targetName: name,
            targetUrl: groupUrl.url,
            targetExternalId: groupUrl.externalId,
            targetId: null,
            reason: 'Group name does not match IT recruitment keywords.',
          });
          continue;
        }

        if (uniqueGroups.has(groupUrl.externalId)) {
          result.duplicates += 1;
          result.skipped += 1;
          result.items.push({
            action: 'skipped',
            targetName: name,
            targetUrl: groupUrl.url,
            targetExternalId: groupUrl.externalId,
            targetId: null,
            reason: 'Duplicate group in discovery payload.',
          });
          continue;
        }

        uniqueGroups.set(groupUrl.externalId, {
          targetName: name,
          targetUrl: groupUrl.url,
        });
      } catch (error) {
        result.skipped += 1;
        const message = error instanceof Error ? error.message : 'Invalid group discovery payload.';
        result.errors.push(message);
      }
    }

    const uniqueItems = Array.from(uniqueGroups.entries()).map(([externalId, item]) => ({
      targetName: item.targetName,
      targetUrl: item.targetUrl,
      externalId,
    }));
    let nextPriority = await this.getNextGroupPriority(input.ownerUserId);

    for (const item of uniqueItems) {
      try {
        const matches = await this.targetsRepo.find({
          where: {
            ownerUserId: input.ownerUserId,
            type: FacebookPublishTargetType.GROUP,
            externalId: item.externalId,
          },
          order: { createdAt: 'ASC' },
        });

        if (matches.length > 1) {
          result.conflicts += 1;
        }

        const activeTarget = matches.find((target) => target.active);
        if (activeTarget) {
          const changed = activeTarget.name !== item.targetName || activeTarget.url !== item.targetUrl;
          const originalName = activeTarget.name;
          activeTarget.name = item.targetName;
          activeTarget.externalId = item.externalId;
          activeTarget.url = item.targetUrl;
          activeTarget.lastDiscoveredAt = discoveryTime;
          if (changed) result.updated += 1;

          const savedTarget = await this.targetsRepo.save(activeTarget);
          result.valid += 1;
          result.items.push({
            action: changed ? 'updated' : 'reused',
            targetName: savedTarget.name,
            targetUrl: savedTarget.url ?? item.targetUrl,
            targetExternalId: savedTarget.externalId,
            targetId: savedTarget.id,
            reason: changed ? `Name updated from ${originalName} to ${savedTarget.name}.` : null,
          });
          continue;
        }

        const inactiveTarget = matches.find((target) => !target.active);
        if (inactiveTarget) {
          inactiveTarget.active = true;
          inactiveTarget.name = item.targetName;
          inactiveTarget.externalId = item.externalId;
          inactiveTarget.url = item.targetUrl;
          inactiveTarget.eligibilityStatus = FacebookPublishTargetEligibilityStatus.UNKNOWN;
          inactiveTarget.eligibilityReason = 'Group has not been verified yet.';
          inactiveTarget.lastVerifiedAt = null;
          inactiveTarget.lastDiscoveredAt = discoveryTime;

          const savedTarget = await this.targetsRepo.save(inactiveTarget);
          result.reactivated += 1;
          result.valid += 1;
          result.items.push({
            action: 'reactivated',
            targetName: savedTarget.name,
            targetUrl: savedTarget.url ?? item.targetUrl,
            targetExternalId: savedTarget.externalId,
            targetId: savedTarget.id,
          });
          continue;
        }

        const createdTarget = this.targetsRepo.create({
          type: FacebookPublishTargetType.GROUP,
          name: item.targetName,
          externalId: item.externalId,
          url: item.targetUrl,
          ownerUserId: input.ownerUserId,
          active: true,
          priority: nextPriority,
          eligibilityStatus: FacebookPublishTargetEligibilityStatus.UNKNOWN,
          eligibilityReason: 'Group has not been verified yet.',
          lastVerifiedAt: null,
          lastDiscoveredAt: discoveryTime,
          dailyPublishLimit: 10,
        });
        nextPriority += 1;
        const savedTarget = await this.targetsRepo.save(createdTarget);
        result.created += 1;
        result.valid += 1;
        result.items.push({
          action: 'created',
          targetName: savedTarget.name,
          targetUrl: savedTarget.url ?? item.targetUrl,
          targetExternalId: savedTarget.externalId,
          targetId: savedTarget.id,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not sync this discovered group.';
        result.skipped += 1;
        result.errors.push(`${item.externalId}: ${message}`);
        result.items.push({
          action: 'skipped',
          targetName: item.targetName,
          targetUrl: item.targetUrl,
          targetExternalId: item.externalId,
          targetId: null,
          reason: message,
        });
      }
    }

    return result;
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
    target.lastDiscoveredAt = new Date();

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
    target.lastVerifiedByInstanceId = input.lastVerifiedByInstanceId ?? null;

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
    const externalPost = this.parseFacebookGroupPostUrl(input.externalPostUrl);
    const history = this.historiesRepo.create({
      jobPostingId: posting.id,
      jobDescriptionId: posting.jobDescriptionId ?? null,
      jobDescriptionVersionId: posting.jobDescriptionVersionId ?? null,
      targetId: input.targetId ?? null,
      extensionInstanceId: input.extensionInstanceId ?? null,
      targetType: input.targetType,
      targetName: input.targetName,
      targetUrl: input.targetUrl ?? null,
      content,
      status: input.status,
      facebookReviewStatus: this.resolveFacebookReviewStatus(
        input.status,
        input.message,
        input.facebookReviewStatus,
      ),
      message: input.message,
      errorReason: input.status === FacebookPublishResultStatus.SUCCESS ? null : input.message,
      externalPostId: externalPost?.postId ?? null,
      externalPostUrl: externalPost?.url ?? null,
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
    if (
      input.status === FacebookPublishResultStatus.FAILED
      && posting.status !== JobPostingStatus.CLOSED
      && posting.status !== JobPostingStatus.PUBLISHED
    ) {
      posting.status = JobPostingStatus.PUBLISH_FAILED;
      await this.jobPostingsRepo.save(posting);
    }

    return savedHistory;
  }

  async listExtensionGroupPublishHistories(input: ListFacebookPublishHistoriesInput) {
    const target = await this.findOwnedActiveGroup(input.ownerUserId, input.targetId);
    const page = this.normalizePage(input.page);
    const limit = this.normalizeLimit(input.limit);
    const skip = (page - 1) * limit;

    const baseQuery = this.historiesRepo
      .createQueryBuilder('history')
      .leftJoinAndSelect('history.jobPosting', 'jobPosting')
      .leftJoinAndSelect('history.target', 'target')
      .where('history.targetId = :targetId', { targetId: target.id });

    if (input.facebookReviewStatus) {
      baseQuery.andWhere('history.facebookReviewStatus = :facebookReviewStatus', {
        facebookReviewStatus: input.facebookReviewStatus,
      });
    }

    const [histories, total] = await baseQuery
      .orderBy('history.submittedAt', 'DESC', 'NULLS LAST')
      .addOrderBy('history.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      summary: await this.getGroupPublishHistorySummary(target.id),
      items: histories.map((history) => this.toPublishHistoryListItem(history)),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async updateExtensionPublishHistoryStatusCheck(input: UpdateFacebookPublishHistoryStatusCheckInput) {
    const history = await this.historiesRepo
      .createQueryBuilder('history')
      .leftJoinAndSelect('history.jobPosting', 'jobPosting')
      .leftJoinAndSelect('history.target', 'target')
      .where('history.id = :historyId', { historyId: input.historyId })
      .andWhere('target.ownerUserId = :ownerUserId', { ownerUserId: input.ownerUserId })
      .getOne();

    if (!history) {
      throw new BadRequestException({
        code: 'FACEBOOK_PUBLISH_HISTORY_NOT_FOUND',
        message: 'Facebook publish history not found for this account.',
      });
    }

    const message = input.message?.trim() || null;
    history.facebookReviewStatus = input.facebookReviewStatus;
    history.lastStatusCheckedAt = input.checkedAt ?? new Date();
    history.lastStatusCheckMessage = message;
    if (message) history.message = message;

    if (input.externalPostUrl !== undefined) {
      const externalPost = this.parseFacebookGroupPostUrl(input.externalPostUrl);
      history.externalPostUrl = externalPost?.url ?? null;
      history.externalPostId = externalPost?.postId ?? null;
    }
    if (input.externalPostUrl === undefined && input.externalPostId !== undefined) {
      history.externalPostId = input.externalPostId?.trim() || null;
    }
    if (input.extensionInstanceId !== undefined) {
      history.extensionInstanceId = input.extensionInstanceId ?? history.extensionInstanceId;
    }

    return this.toPublishHistoryListItem(await this.historiesRepo.save(history));
  }

  private async getGroupPublishHistorySummary(targetId: string) {
    const rows = await this.historiesRepo
      .createQueryBuilder('history')
      .select('history.facebookReviewStatus', 'facebookReviewStatus')
      .addSelect('COUNT(*)', 'count')
      .where('history.targetId = :targetId', { targetId })
      .groupBy('history.facebookReviewStatus')
      .getRawMany<{ facebookReviewStatus: FacebookReviewStatus | null; count: string }>();

    const summary = {
      total: 0,
      posted: 0,
      pendingReview: 0,
      rejected: 0,
      deleted: 0,
      unknown: 0,
    };

    for (const row of rows) {
      const count = Number(row.count);
      summary.total += count;
      if (row.facebookReviewStatus === FacebookReviewStatus.POSTED) summary.posted += count;
      else if (row.facebookReviewStatus === FacebookReviewStatus.PENDING_REVIEW) summary.pendingReview += count;
      else if (row.facebookReviewStatus === FacebookReviewStatus.REJECTED) summary.rejected += count;
      else if (row.facebookReviewStatus === FacebookReviewStatus.DELETED) summary.deleted += count;
      else summary.unknown += count;
    }

    return summary;
  }

  private toPublishHistoryListItem(history: FacebookPublishHistoryEntity) {
    const content = history.content ?? '';
    const title = history.jobPosting?.title || this.extractTitleFromContent(content, history.jobPostingId);

    return {
      id: history.id,
      jobPostingId: history.jobPostingId,
      title,
      contentPreview: this.toContentPreview(content),
      targetId: history.targetId,
      targetName: history.targetName,
      targetUrl: history.targetUrl,
      targetExternalId: history.target?.externalId ?? null,
      publishStatus: history.status,
      facebookReviewStatus: history.facebookReviewStatus ?? FacebookReviewStatus.UNKNOWN,
      message: history.message ?? history.errorReason,
      errorReason: history.errorReason,
      submittedAt: history.submittedAt?.toISOString() ?? null,
      lastStatusCheckedAt: history.lastStatusCheckedAt?.toISOString() ?? null,
      lastStatusCheckMessage: history.lastStatusCheckMessage,
      externalPostId: history.externalPostId,
      externalPostUrl: history.externalPostUrl,
      createdAt: history.createdAt?.toISOString() ?? null,
      updatedAt: history.updatedAt?.toISOString() ?? null,
      extensionInstanceId: history.extensionInstanceId ?? null,
    };
  }

  private resolveFacebookReviewStatus(
    publishStatus: FacebookPublishResultStatus,
    message: string | null | undefined,
    explicitStatus?: FacebookReviewStatus | null,
  ) {
    if (explicitStatus) return explicitStatus;

    const normalizedMessage = this.normalizeText(message);
    if (publishStatus === FacebookPublishResultStatus.SUCCESS) {
      return /pending|waiting for approval|cho duyet|cho phe duyet|dang cho|quan tri vien phe duyet/.test(normalizedMessage)
        ? FacebookReviewStatus.PENDING_REVIEW
        : FacebookReviewStatus.POSTED;
    }

    if (
      publishStatus === FacebookPublishResultStatus.FAILED
      && /rejected|declined|not approved|tu choi|khong duoc phe duyet|bi go|removed/.test(normalizedMessage)
    ) {
      return FacebookReviewStatus.REJECTED;
    }

    return FacebookReviewStatus.UNKNOWN;
  }

  private normalizePage(value: number | null | undefined) {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) && parsedValue > 0 ? Math.floor(parsedValue) : 1;
  }

  private normalizeLimit(value: number | null | undefined) {
    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue)) return 10;
    return Math.min(50, Math.max(1, Math.floor(parsedValue)));
  }

  private extractTitleFromContent(content: string, fallback: string) {
    const firstLine = content
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean);
    const title = firstLine || fallback;
    return title.length > 120 ? `${title.slice(0, 117)}...` : title;
  }

  private toContentPreview(content: string) {
    const preview = content.replace(/\s+/g, ' ').trim();
    return preview.length > 180 ? `${preview.slice(0, 177)}...` : preview;
  }

  private normalizeText(value: string | null | undefined) {
    return (value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
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
        lastDiscoveredAt: target.lastDiscoveredAt?.toISOString() ?? null,
        todayPublishCount,
        dailyPublishLimit,
        quotaLabel: `${todayPublishCount}/${dailyPublishLimit}`,
        quotaExceeded,
        selectable: !disabledReason,
        disabledReason,
        ownerExtensionInstanceId: target.ownerExtensionInstanceId,
        lastVerifiedByInstanceId: target.lastVerifiedByInstanceId,
        facebookAccountLabel: target.facebookAccountLabel,
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

  private parseFacebookGroupPostUrl(value: string | null | undefined) {
    const rawUrl = value?.trim();
    if (!rawUrl) return null;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return null;
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    const isFacebookHost = hostname === 'facebook.com' || hostname.endsWith('.facebook.com');
    if (!isFacebookHost) return null;

    const directMatch = parsedUrl.pathname.match(/^\/groups\/([^/]+)\/(posts|pending_posts|permalink)\/([^/?#]+)\/?$/i);
    if (directMatch) {
      const [, rawGroupId, rawPathType, postId] = directMatch;
      const groupId = this.decodeUrlPathSegment(rawGroupId).trim();
      const pathType = rawPathType.toLowerCase() === 'pending_posts' ? 'pending_posts' : 'posts';
      if (!groupId || !postId) return null;

      const suffix = pathType === 'posts' ? '/' : '';
      return {
        groupId,
        postId,
        pathType,
        url: `https://www.facebook.com/groups/${encodeURIComponent(groupId)}/${pathType}/${postId}${suffix}`,
      };
    }

    const groupId = this.readFacebookGroupId(parsedUrl);
    const postId = this.readFacebookPostId(parsedUrl);
    if (!groupId || !postId) return null;

    return {
      groupId,
      postId,
      pathType: 'posts',
      url: `https://www.facebook.com/groups/${encodeURIComponent(groupId)}/posts/${postId}/`,
    };
  }

  private readFacebookGroupId(parsedUrl: URL) {
    const groupPathMatch = parsedUrl.pathname.match(/^\/groups\/([^/]+)/i);
    const groupPathId = groupPathMatch?.[1] ? this.decodeUrlPathSegment(groupPathMatch[1]).trim() : '';
    if (groupPathId) return groupPathId;

    return this.firstNumericSearchParam(parsedUrl, ['id', 'group_id', 'groupid']);
  }

  private readFacebookPostId(parsedUrl: URL) {
    return this.firstFacebookPostIdSearchParam(parsedUrl, [
      'story_fbid',
      'fbid',
      'multi_permalinks',
      'post_id',
      'postid',
    ]);
  }

  private firstFacebookPostIdSearchParam(parsedUrl: URL, names: string[]) {
    for (const name of names) {
      const value = parsedUrl.searchParams.get(name);
      const match = value?.match(/(?:\d{5,}|pfbid[a-z0-9]+)/i);
      if (match?.[0]) return match[0];
    }

    return null;
  }

  private firstNumericSearchParam(parsedUrl: URL, names: string[]) {
    for (const name of names) {
      const value = parsedUrl.searchParams.get(name);
      const match = value?.match(/\d{5,}/);
      if (match?.[0]) return match[0];
    }

    return null;
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

  private isItRecruitmentFacebookGroupName(value: string) {
    return this.IT_RECRUITMENT_GROUP_REGEX.test(this.normalizeTextForSearch(value));
  }

  private normalizeTextForSearch(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\u0111/g, 'd')
      .replace(/\u0110/g, 'D')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
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
