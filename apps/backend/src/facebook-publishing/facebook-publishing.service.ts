import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JobPostingEntity } from '../job-postings/entities/job-posting.entity';
import { JobPostingStatus } from '../recruitment-common';
import { FacebookPostContentService } from './content/facebook-post-content.service';
import { FacebookPublishHistoryEntity } from './entities/facebook-publish-history.entity';
import { FacebookPublishTargetEntity } from './entities/facebook-publish-target.entity';
import { AiService } from '../ai/ai.service';
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
    private readonly aiService: AiService,
  ) {}

  async prepareExtensionPublishPlan(
    posting: JobPostingEntity,
    ownerUserId: string,
    selectedTargetIds?: string[],
    customContent?: string,
  ): Promise<ExtensionFacebookPublishPlan> {
    const content = customContent || this.contentService.build(posting);
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

  async findJobPostingById(id: string): Promise<JobPostingEntity | null> {
    return this.jobPostingsRepo.findOne({
      where: { id },
      relations: [
        'jobDescription',
        'jobDescriptionVersion',
      ],
    });
  }

  formatPostingToJdText(posting: JobPostingEntity): string {
    const versionSnapshot = posting.jobDescriptionVersion?.snapshot as any;
    const jd = versionSnapshot?.jobDescription || versionSnapshot || posting.jobDescription;
    const title = posting.title || jd?.title || '';
    const desc = jd?.description || jd?.summary || '';
    
    let requirementsText = '';
    if (jd?.requirements) {
      if (typeof jd.requirements === 'string') {
        requirementsText = jd.requirements;
      } else if (typeof jd.requirements === 'object') {
        requirementsText = jd.requirements.rawText || JSON.stringify(jd.requirements);
      }
    }

    let benefitsText = '';
    if (jd?.benefits) {
      if (typeof jd.benefits === 'string') {
        benefitsText = jd.benefits;
      } else {
        benefitsText = JSON.stringify(jd.benefits);
      }
    }

    return [
      `Title: ${title}`,
      `Description: ${desc}`,
      `Requirements: ${requirementsText}`,
      `Benefits: ${benefitsText}`
    ].join('\n\n');
  }

  formatSnapshotToJdText(snapshot: any): string {
    const title = snapshot.title || '';
    const desc = snapshot.description || snapshot.summary || '';
    const reqText = snapshot.requirements?.rawText || (typeof snapshot.requirements === 'string' ? snapshot.requirements : JSON.stringify(snapshot.requirements || ''));
    const benefitsText = typeof snapshot.benefits === 'string'
      ? snapshot.benefits
      : JSON.stringify(snapshot.benefits || '');
    
    return [
      `Title: ${title}`,
      `Location: ${snapshot.location || ''}`,
      `Description: ${desc}`,
      `Requirements: ${reqText}`,
      `Benefits: ${benefitsText}`
    ].join('\n\n');
  }

  async generatePreviewContent(
    mode: 'TEMPLATE' | 'AI',
    options: { jobPostingId?: string; snapshot?: any },
  ): Promise<string> {
    let posting: JobPostingEntity | null = null;

    if (options.jobPostingId) {
      posting = await this.findJobPostingById(options.jobPostingId);
      if (!posting) {
        throw new BadRequestException('Job posting not found');
      }
      if (options.snapshot) {
        posting.title = options.snapshot.title || posting.title;
        if (posting.jobDescriptionVersion) {
          const currentSnapshot = posting.jobDescriptionVersion.snapshot as any;
          if (currentSnapshot && typeof currentSnapshot === 'object') {
            if (currentSnapshot.jobDescription && typeof currentSnapshot.jobDescription === 'object') {
              currentSnapshot.jobDescription = {
                ...currentSnapshot.jobDescription,
                ...options.snapshot,
              };
            } else {
              posting.jobDescriptionVersion.snapshot = {
                ...currentSnapshot,
                ...options.snapshot,
              };
            }
          } else {
            posting.jobDescriptionVersion.snapshot = options.snapshot;
          }
        } else {
          posting.jobDescriptionVersion = {
            snapshot: options.snapshot,
          } as any;
        }
      }
    }

    if (mode === 'TEMPLATE') {
      if (posting) {
        return this.contentService.build(posting);
      } else if (options.snapshot) {
        const mockPosting = {
          title: options.snapshot.title,
          publicSlug: 'amis-import',
          jobDescriptionVersion: {
            snapshot: options.snapshot,
          },
        } as any;
        return this.contentService.build(mockPosting);
      } else {
        throw new BadRequestException('Either jobPostingId or snapshot must be provided');
      }
    } else {
      // mode === 'AI'
      let jdText = '';
      if (posting) {
        jdText = this.formatPostingToJdText(posting);
      } else if (options.snapshot) {
        jdText = this.formatSnapshotToJdText(options.snapshot);
      } else {
        throw new BadRequestException('Either jobPostingId or snapshot must be provided');
      }
      return this.aiService.generateFacebookPostContent(jdText);
    }
  }

  private readonly IT_RECRUITMENT_REGEX = /\b(tuy(e|ê)n\s*d(u|ụ)ng|recruitment|job|it|cntt|dev(eloper)?|tester|c(o|ô)ng\s*ngh(e|ệ)\s*th(o|ô)ng\s*tin|tech(nology)?|engineer|frontend|backend|fullstack|react|node|java|comtor|ba|brse|l(a|ậ)p\s*tr(i|ì)nh|coder|qa|qc)\b/i;

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

  async discoverExtensionGroups(
    ownerUserId: string,
    groups: Array<{ targetName: string; targetUrl: string; targetExternalId: string }>,
  ) {
    const results = {
      totalScanned: groups.length,
      matchedItGroups: 0,
      newGroupsAdded: 0,
      updatedGroups: 0,
    };

    for (const group of groups) {
      const isItRecruitment = this.IT_RECRUITMENT_REGEX.test(group.targetName);
      if (isItRecruitment) {
        results.matchedItGroups++;
      }

      let target = await this.targetsRepo.findOne({
        where: {
          ownerUserId,
          type: FacebookPublishTargetType.GROUP,
          externalId: group.targetExternalId,
        },
      });

      if (target) {
        target.name = group.targetName;
        target.url = group.targetUrl;
        target.lastDiscoveredAt = new Date();
        if (!target.active && isItRecruitment) {
          target.active = true;
        }
        await this.targetsRepo.save(target);
        results.updatedGroups++;
      } else {
        const priority = await this.getNextGroupPriority(ownerUserId);
        const newTarget = this.targetsRepo.create({
          type: FacebookPublishTargetType.GROUP,
          name: group.targetName,
          externalId: group.targetExternalId,
          url: group.targetUrl,
          ownerUserId,
          active: isItRecruitment,
          priority,
          eligibilityStatus: FacebookPublishTargetEligibilityStatus.UNKNOWN,
          eligibilityReason: 'Group has not been verified yet.',
          lastVerifiedAt: null,
          lastDiscoveredAt: new Date(),
        });
        await this.targetsRepo.save(newTarget);
        results.newGroupsAdded++;
      }

    }

    return results;
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
    const externalPost = this.parseFacebookGroupPostUrl(input.externalPostUrl);
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
      unknown: 0,
    };

    for (const row of rows) {
      const count = Number(row.count);
      summary.total += count;
      if (row.facebookReviewStatus === FacebookReviewStatus.POSTED) summary.posted += count;
      else if (row.facebookReviewStatus === FacebookReviewStatus.PENDING_REVIEW) summary.pendingReview += count;
      else if (row.facebookReviewStatus === FacebookReviewStatus.REJECTED) summary.rejected += count;
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

    const match = parsedUrl.pathname.match(/^\/groups\/([^/]+)\/(posts|pending_posts)\/(\d+)\/?$/i);
    if (!match) return null;

    const [, rawGroupId, rawPathType, postId] = match;
    const groupId = this.decodeUrlPathSegment(rawGroupId).trim();
    const pathType = rawPathType.toLowerCase();
    if (!groupId || !postId) return null;

    const suffix = pathType === 'posts' ? '/' : '';
    return {
      groupId,
      postId,
      pathType,
      url: `https://www.facebook.com/groups/${encodeURIComponent(groupId)}/${pathType}/${postId}${suffix}`,
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
