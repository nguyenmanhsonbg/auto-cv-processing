import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JobPostingEntity } from '../job-postings/entities/job-posting.entity';
import { JobPostingStatus } from '../recruitment-common';
import { FacebookPostContentService } from './content/facebook-post-content.service';
import { FacebookPublishHistoryEntity } from './entities/facebook-publish-history.entity';
import { FacebookPublishTargetEntity } from './entities/facebook-publish-target.entity';
import { FacebookAccountEntity } from './entities/facebook-account.entity';
import {
  FacebookGroupSyncStateEntity,
} from './entities/facebook-group-sync-state.entity';
import {
  CreateFacebookGroupInput,
  ManualIncludeFacebookGroupInput,
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
  ResolveFacebookAccountInput,
  ResolvedFacebookAccount,
} from './facebook-publishing.types';
import { DiscoverFacebookGroupsResponseDto } from '../extension-integration/dto';
import { AmisJobSnapshotDto } from '../extension-integration/dto/sync-amis-job-posting.dto';
import { AiService } from '../ai/ai.service';

interface DiscoverFacebookGroupsInput {
  ownerUserId: string;
  ownerExtensionInstanceId?: string | null;
  facebookAccountId?: string | null;
  scanComplete?: boolean;
  groups: Array<{
    targetName: string;
    targetUrl: string;
    targetExternalId?: string | null;
  }>;
}

interface UniqueDiscoveredGroup {
  targetName: string;
  targetUrl: string;
  externalId: string;
}

interface GenerateFacebookPreviewContentInput {
  snapshot: AmisJobSnapshotDto;
  mode?: 'TEMPLATE' | 'AI';
}

@Injectable()
export class FacebookPublishingService {
  private readonly logger = new Logger(FacebookPublishingService.name);
  private readonly IT_RECRUITMENT_GROUP_PATTERNS = [
    /\b(?:tuyen\s*dung|viec\s*lam|recruitment|jobs?)\b/i,
    /\b(?:it|cntt|dev(?:eloper)?|tester|engineer|frontend|backend|fullstack|coder|qa|qc)\b/i,
    /\b(?:cong\s*nghe\s*thong\s*tin|tech(?:nology)?|react|node|java(?:script)?|type\s*script)\b/i,
    /\b(?:comtor|ba|brse|lap\s*trinh)\b/i,
  ] as const;

  constructor(
    @InjectRepository(FacebookPublishTargetEntity)
    private readonly targetsRepo: Repository<FacebookPublishTargetEntity>,
    @InjectRepository(FacebookGroupSyncStateEntity)
    private readonly groupSyncStatesRepo: Repository<FacebookGroupSyncStateEntity>,
    @InjectRepository(FacebookPublishHistoryEntity)
    private readonly historiesRepo: Repository<FacebookPublishHistoryEntity>,
    @InjectRepository(JobPostingEntity)
    private readonly jobPostingsRepo: Repository<JobPostingEntity>,
    private readonly contentService: FacebookPostContentService,
    private readonly aiService: AiService,
    private readonly configService?: ConfigService,
    @Optional()
    @InjectRepository(FacebookAccountEntity)
    private readonly facebookAccountsRepo?: Repository<FacebookAccountEntity>,
  ) {}

  async prepareExtensionPublishPlan(
    posting: JobPostingEntity,
    ownerUserId: string,
    selectedTargetIds?: string[],
    customContent?: string | null,
    ownerExtensionInstanceId?: string | null,
    facebookAccountId?: string | null,
  ): Promise<ExtensionFacebookPublishPlan> {
    const content = await this.generateContent(posting, customContent);
    const targets = await this.resolveActiveTargets(
      ownerUserId,
      selectedTargetIds,
      ownerExtensionInstanceId,
      facebookAccountId,
    );

    return {
      jobPostingId: posting.id,
      content,
      targets,
      delay: {
        minMs: this.numberEnv('FACEBOOK_PUBLISH_TARGET_DELAY_MIN_MS', 10_000),
        maxMs: this.numberEnv('FACEBOOK_PUBLISH_TARGET_DELAY_MAX_MS', 20_000),
      },
    };
  }

  async generateExtensionPreviewContent(input: GenerateFacebookPreviewContentInput) {
    if (input.mode !== 'AI') {
      return {
        content: this.contentService.buildFromSnapshot(input.snapshot),
        mode: 'TEMPLATE' as const,
      };
    }

    try {
      const content = await this.aiService.generateFacebookRecruitmentContent(input.snapshot as unknown as Record<string, unknown>);
      if (content) return { content, mode: 'AI' as const };
    } catch (error) {
      this.logger.warn(`Facebook AI content generation failed; using template fallback: ${error instanceof Error ? error.message : error}`);
    }

    return {
      content: this.contentService.buildFromSnapshot(input.snapshot),
      mode: 'TEMPLATE' as const,
    };
  }

  private async generateContent(posting: JobPostingEntity, customContent?: string | null) {
    if (customContent?.trim()) return this.contentService.build(posting, customContent);
    return this.contentService.build(posting);
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }

  async listActiveExtensionGroups(
    ownerUserId: string,
    ownerExtensionInstanceId?: string | null,
    facebookAccountId?: string | null,
  ): Promise<ResolvedFacebookPublishTarget[]> {
    const targets = (await this.targetsRepo.find({
      where: {
        active: true,
        ownerUserId,
        type: FacebookPublishTargetType.GROUP,
      },
      order: { priority: 'ASC', createdAt: 'ASC' },
    })).filter((target) => this.isTargetInAccountScope(
      target.ownerExtensionInstanceId,
      ownerExtensionInstanceId,
      target.facebookAccountId,
      facebookAccountId,
    ));

    return this.toResolvedTargets(targets);
  }

  async resolveFacebookAccount(input: ResolveFacebookAccountInput): Promise<ResolvedFacebookAccount> {
    if (!this.facebookAccountsRepo) {
      throw new BadRequestException({
        code: 'FACEBOOK_ACCOUNT_STORAGE_UNAVAILABLE',
        message: 'Facebook account storage is not available.',
      });
    }
    const facebookExternalId = this.requireText(input.facebookExternalId, 'facebookExternalId');
    const now = new Date();
    const hasDisplayName = Object.prototype.hasOwnProperty.call(input, 'displayName');
    const hasProfileUrl = Object.prototype.hasOwnProperty.call(input, 'profileUrl');
    const normalizedProfileUrl = this.normalizeFacebookProfileUrl(input.profileUrl, facebookExternalId);
    const normalizedDisplayName = hasDisplayName
      && (!hasProfileUrl || normalizedProfileUrl)
      ? this.normalizeFacebookAccountDisplayName(input.displayName, facebookExternalId)
      : null;
    let account = await this.facebookAccountsRepo.findOne({
      where: {
        ownerUserId: input.ownerUserId,
        facebookExternalId,
      },
    });

    if (!account) {
      account = this.facebookAccountsRepo.create({
        ownerUserId: input.ownerUserId,
        facebookExternalId,
        displayName: normalizedDisplayName,
        profileUrl: normalizedProfileUrl,
        status: 'ACTIVE',
        lastSeenAt: now,
        lastAuthenticatedAt: now,
      });
      account = await this.facebookAccountsRepo.save(account);

      // Rows created before account identity existed can only be safely claimed
      // when this is the user's first known Facebook account.
      const accountCount = await this.facebookAccountsRepo.count({
        where: { ownerUserId: input.ownerUserId },
      });
      if (accountCount === 1) {
        await this.targetsRepo
          .createQueryBuilder()
          .update(FacebookPublishTargetEntity)
          .set({ facebookAccountId: account.id })
          .where('owner_user_id = :ownerUserId', { ownerUserId: input.ownerUserId })
          .andWhere('type = :type', { type: FacebookPublishTargetType.GROUP })
          .andWhere('facebook_account_id IS NULL')
          .execute();
      }
    } else {
      const existingDisplayName = this.normalizeFacebookAccountDisplayName(
        account.displayName,
        facebookExternalId,
      );
      if (normalizedDisplayName) {
        account.displayName = normalizedDisplayName;
      } else if (!existingDisplayName) {
        // Do not retain generic labels such as "Facebook account" from an
        // earlier auth attempt, but preserve a previously verified real name
        // when the current browser probe has no usable label.
        account.displayName = null;
      }
      if (normalizedProfileUrl) {
        account.profileUrl = normalizedProfileUrl;
      }
      account.status = 'ACTIVE';
      account.lastSeenAt = now;
      account.lastAuthenticatedAt = now;
      account = await this.facebookAccountsRepo.save(account);
    }

    return this.toResolvedFacebookAccount(account);
  }

  async listFacebookAccounts(ownerUserId: string): Promise<ResolvedFacebookAccount[]> {
    if (!this.facebookAccountsRepo) return [];
    const accounts = await this.facebookAccountsRepo.find({
      where: { ownerUserId },
      order: { lastSeenAt: 'DESC', createdAt: 'ASC' },
    });
    return accounts.map((account) => this.toResolvedFacebookAccount(account));
  }

  async getExtensionGroupSyncState(
    ownerUserId: string,
    extensionInstanceId?: string | null,
    facebookAccountId?: string | null,
  ) {
    const scopeKey = facebookAccountId?.trim() || extensionInstanceId?.trim() || 'USER';
    const state = await this.groupSyncStatesRepo.findOne({ where: { ownerUserId, scopeKey } });
    return {
      status: state?.status ?? 'NOT_INITIALIZED',
      initialScanCompletedAt: state?.initialScanCompletedAt?.toISOString() ?? null,
      lastScanStartedAt: state?.lastScanStartedAt?.toISOString() ?? null,
      lastScanCompletedAt: state?.lastScanCompletedAt?.toISOString() ?? null,
      lastScannedCount: state?.lastScannedCount ?? 0,
      lastError: state?.lastError ?? null,
    };
  }

  async createExtensionGroup(input: CreateFacebookGroupInput): Promise<ResolvedFacebookPublishTarget> {
    await this.assertFacebookAccountOwner(input.ownerUserId, input.facebookAccountId);
    const name = this.requireText(input.targetName, 'targetName');
    const groupUrl = this.normalizeFacebookGroupUrl(
      this.requireText(input.targetUrl, 'targetURL'),
    );
    this.assertValidFacebookGroupId(groupUrl.externalId);
    if (input.targetExternalId !== undefined
      && input.targetExternalId !== null
      && input.targetExternalId.trim() !== groupUrl.externalId) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Request payload is invalid.',
      });
    }
    const discoveryTime = new Date();
    const matches = await this.targetsRepo.find({
      where: {
        ownerUserId: input.ownerUserId,
        type: FacebookPublishTargetType.GROUP,
        externalId: groupUrl.externalId,
      },
      order: { createdAt: 'ASC' },
    });
    const scopedMatches = matches.filter((target) => this.isTargetInAccountScope(
      target.ownerExtensionInstanceId,
      input.ownerExtensionInstanceId,
      target.facebookAccountId,
      input.facebookAccountId,
    ));
    const activeTarget = scopedMatches.find((target) => target.active);
    if (activeTarget) {
      throw new BadRequestException({
        code: 'FACEBOOK_GROUP_ALREADY_EXISTS',
        message: 'Facebook group URL is already configured for this account.',
      });
    }

    const inactiveTarget = scopedMatches.find((target) => !target.active);
    if (inactiveTarget) {
      inactiveTarget.name = name;
      inactiveTarget.url = groupUrl.url;
      inactiveTarget.active = true;
      inactiveTarget.eligibilityStatus = FacebookPublishTargetEligibilityStatus.UNKNOWN;
      inactiveTarget.eligibilityReason = 'Group has not been verified yet.';
      inactiveTarget.lastVerifiedAt = null;
      inactiveTarget.lastDiscoveredAt = discoveryTime;
      inactiveTarget.ownerExtensionInstanceId = input.ownerExtensionInstanceId ?? inactiveTarget.ownerExtensionInstanceId;
      inactiveTarget.facebookAccountId = input.facebookAccountId ?? inactiveTarget.facebookAccountId;
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
      facebookAccountId: input.facebookAccountId ?? null,
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

  async manuallyIncludeExtensionGroup(input: ManualIncludeFacebookGroupInput): Promise<ResolvedFacebookPublishTarget> {
    await this.assertFacebookAccountOwner(input.ownerUserId, input.facebookAccountId);
    const name = this.requireText(input.targetName, 'targetName');
    const groupUrl = this.normalizeFacebookGroupUrl(input.targetUrl);
    const discoveryTime = new Date();
    const matches = await this.targetsRepo.find({
      where: {
        ownerUserId: input.ownerUserId,
        type: FacebookPublishTargetType.GROUP,
        externalId: groupUrl.externalId,
      },
      order: { createdAt: 'ASC' },
    });
    const scopedMatches = matches.filter((target) => this.isTargetInAccountScope(
      target.ownerExtensionInstanceId,
      input.ownerExtensionInstanceId,
      target.facebookAccountId,
      input.facebookAccountId,
    ));
    const target = scopedMatches.find((candidate) => candidate.active)
      ?? scopedMatches.find((candidate) => !candidate.active);

    if (target) {
      target.name = name;
      target.url = groupUrl.url;
      target.externalId = groupUrl.externalId;
      target.active = true;
      target.ownerExtensionInstanceId = input.ownerExtensionInstanceId ?? target.ownerExtensionInstanceId;
      target.facebookAccountId = input.facebookAccountId ?? target.facebookAccountId;
      target.manualIncluded = true;
      target.manualIncludedAt = discoveryTime;
      target.manualIncludedBy = input.ownerUserId;
      target.lastDiscoveredAt = discoveryTime;
      if (!target.lastVerifiedAt) {
        target.eligibilityStatus = FacebookPublishTargetEligibilityStatus.UNKNOWN;
        target.eligibilityReason = 'Group was added manually and needs verification.';
      }
      return this.toResolvedTarget(await this.targetsRepo.save(target));
    }

    const priority = await this.getNextGroupPriority(input.ownerUserId);
    const createdTarget = this.targetsRepo.create({
      type: FacebookPublishTargetType.GROUP,
      name,
      externalId: groupUrl.externalId,
      url: groupUrl.url,
      ownerUserId: input.ownerUserId,
      ownerExtensionInstanceId: input.ownerExtensionInstanceId ?? null,
      facebookAccountId: input.facebookAccountId ?? null,
      active: true,
      manualIncluded: true,
      manualIncludedAt: discoveryTime,
      manualIncludedBy: input.ownerUserId,
      priority,
      eligibilityStatus: FacebookPublishTargetEligibilityStatus.UNKNOWN,
      eligibilityReason: 'Group was added manually and needs verification.',
      lastVerifiedAt: null,
      lastDiscoveredAt: discoveryTime,
      dailyPublishLimit: 10,
    });

    return this.toResolvedTarget(await this.targetsRepo.save(createdTarget));
  }

  async discoverAndSyncExtensionGroups(input: DiscoverFacebookGroupsInput): Promise<DiscoverFacebookGroupsResponseDto> {
    await this.assertFacebookAccountOwner(input.ownerUserId, input.facebookAccountId);
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
      removed: 0,
      scanComplete: input.scanComplete === true,
      reconciliationApplied: false,
      items: [],
    };

    const manualIncludedExternalIds = await this.loadManualIncludedExternalIds(input);
    const uniqueItems = this.collectUniqueDiscoveredGroups(input, manualIncludedExternalIds, result);
    let nextPriority = await this.getNextGroupPriority(input.ownerUserId);

    for (const item of uniqueItems) {
      nextPriority = await this.syncDiscoveredGroup(item, input, discoveryTime, nextPriority, result);
    }

    return result;
  }

  private async loadManualIncludedExternalIds(input: DiscoverFacebookGroupsInput): Promise<Set<string>> {
    const manualIncludedTargets = await this.targetsRepo.find({
      where: {
        ownerUserId: input.ownerUserId,
        type: FacebookPublishTargetType.GROUP,
        manualIncluded: true,
      },
    });
    return new Set(
      manualIncludedTargets
        .filter((target) => this.isTargetInAccountScope(
          target.ownerExtensionInstanceId,
          input.ownerExtensionInstanceId,
          target.facebookAccountId,
          input.facebookAccountId,
        ))
        .map((target) => target.externalId?.trim().toLowerCase())
        .filter((value): value is string => Boolean(value)),
    );
  }

  private collectUniqueDiscoveredGroups(
    input: DiscoverFacebookGroupsInput,
    manualIncludedExternalIds: Set<string>,
    result: DiscoverFacebookGroupsResponseDto,
  ): UniqueDiscoveredGroup[] {
    const uniqueGroups = new Map<string, UniqueDiscoveredGroup>();
    for (const rawItem of input.groups) {
      try {
        const name = this.requireText(rawItem.targetName, 'targetName');
        const groupUrl = this.normalizeFacebookGroupUrl(rawItem.targetUrl);
        if (!groupUrl.externalId) continue;

        const isManualIncluded = manualIncludedExternalIds.has(groupUrl.externalId.toLowerCase());
        if (!isManualIncluded && !this.isItRecruitmentFacebookGroupName(name)) {
          this.appendSkippedDiscovery(result, name, groupUrl.url, groupUrl.externalId, 'Group name does not match the recruitment filter.');
          result.filtered += 1;
          continue;
        }
        if (uniqueGroups.has(groupUrl.externalId)) {
          this.appendSkippedDiscovery(result, name, groupUrl.url, groupUrl.externalId, 'Duplicate group in discovery payload.');
          result.duplicates += 1;
          continue;
        }
        uniqueGroups.set(groupUrl.externalId, {
          targetName: name,
          targetUrl: groupUrl.url,
          externalId: groupUrl.externalId,
        });
      } catch (error) {
        result.skipped += 1;
        result.errors.push(error instanceof Error ? error.message : 'Invalid group discovery payload.');
      }
    }
    return [...uniqueGroups.values()];
  }

  private appendSkippedDiscovery(
    result: DiscoverFacebookGroupsResponseDto,
    targetName: string,
    targetUrl: string,
    targetExternalId: string | null,
    reason: string,
  ) {
    result.skipped += 1;
    result.items.push({
      action: 'skipped',
      targetName,
      targetUrl,
      targetExternalId,
      targetId: null,
      reason,
    });
  }

  private async syncDiscoveredGroup(
    item: UniqueDiscoveredGroup,
    input: DiscoverFacebookGroupsInput,
    discoveryTime: Date,
    nextPriority: number,
    result: DiscoverFacebookGroupsResponseDto,
  ): Promise<number> {
    try {
      const matches = await this.findScopedGroupTargets(item.externalId, input);
      if (matches.length > 1) result.conflicts += 1;

      const activeTarget = matches.find((target) => target.active);
      if (activeTarget) {
        await this.updateActiveDiscoveredGroup(activeTarget, item, input, discoveryTime, result);
        return nextPriority;
      }

      const inactiveTarget = matches.find((target) => !target.active);
      if (inactiveTarget) {
        await this.reactivateDiscoveredGroup(inactiveTarget, item, input, discoveryTime, result);
        return nextPriority;
      }

      await this.createDiscoveredGroup(item, input, discoveryTime, nextPriority, result);
      return nextPriority + 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not sync this discovered group.';
      this.appendSkippedDiscovery(result, item.targetName, item.targetUrl, item.externalId, message);
      result.errors.push(`${item.externalId}: ${message}`);
      return nextPriority;
    }
  }

  private async findScopedGroupTargets(externalId: string, input: DiscoverFacebookGroupsInput) {
    const matches = await this.targetsRepo.find({
      where: {
        ownerUserId: input.ownerUserId,
        type: FacebookPublishTargetType.GROUP,
        externalId,
      },
      order: { createdAt: 'ASC' },
    });
    return matches.filter((target) => this.isTargetInAccountScope(
      target.ownerExtensionInstanceId,
      input.ownerExtensionInstanceId,
      target.facebookAccountId,
      input.facebookAccountId,
    ));
  }

  private async updateActiveDiscoveredGroup(
    target: FacebookPublishTargetEntity,
    item: UniqueDiscoveredGroup,
    input: DiscoverFacebookGroupsInput,
    discoveryTime: Date,
    result: DiscoverFacebookGroupsResponseDto,
  ) {
    const changed = target.name !== item.targetName || target.url !== item.targetUrl;
    const originalName = target.name;
    target.name = item.targetName;
    target.externalId = item.externalId;
    target.url = item.targetUrl;
    target.ownerExtensionInstanceId = input.ownerExtensionInstanceId ?? target.ownerExtensionInstanceId;
    target.facebookAccountId = input.facebookAccountId ?? target.facebookAccountId;
    target.lastDiscoveredAt = discoveryTime;
    if (changed) result.updated += 1;

    const savedTarget = await this.targetsRepo.save(target);
    result.valid += 1;
    result.items.push({
      action: changed ? 'updated' : 'reused',
      targetName: savedTarget.name,
      targetUrl: savedTarget.url ?? item.targetUrl,
      targetExternalId: savedTarget.externalId,
      targetId: savedTarget.id,
      reason: changed ? `Name updated from ${originalName} to ${savedTarget.name}.` : null,
    });
  }

  private async reactivateDiscoveredGroup(
    target: FacebookPublishTargetEntity,
    item: UniqueDiscoveredGroup,
    input: DiscoverFacebookGroupsInput,
    discoveryTime: Date,
    result: DiscoverFacebookGroupsResponseDto,
  ) {
    target.active = true;
    target.name = item.targetName;
    target.externalId = item.externalId;
    target.url = item.targetUrl;
    target.eligibilityStatus = FacebookPublishTargetEligibilityStatus.UNKNOWN;
    target.eligibilityReason = 'Group has not been verified yet.';
    target.lastVerifiedAt = null;
    target.lastDiscoveredAt = discoveryTime;
    target.ownerExtensionInstanceId = input.ownerExtensionInstanceId ?? target.ownerExtensionInstanceId;
    target.facebookAccountId = input.facebookAccountId ?? target.facebookAccountId;

    const savedTarget = await this.targetsRepo.save(target);
    result.reactivated += 1;
    result.valid += 1;
    result.items.push({
      action: 'reactivated',
      targetName: savedTarget.name,
      targetUrl: savedTarget.url ?? item.targetUrl,
      targetExternalId: savedTarget.externalId,
      targetId: savedTarget.id,
    });
  }

  private async createDiscoveredGroup(
    item: UniqueDiscoveredGroup,
    input: DiscoverFacebookGroupsInput,
    discoveryTime: Date,
    priority: number,
    result: DiscoverFacebookGroupsResponseDto,
  ) {
    const createdTarget = this.targetsRepo.create({
      type: FacebookPublishTargetType.GROUP,
      name: item.targetName,
      externalId: item.externalId,
      url: item.targetUrl,
      ownerUserId: input.ownerUserId,
      ownerExtensionInstanceId: input.ownerExtensionInstanceId ?? null,
      facebookAccountId: input.facebookAccountId ?? null,
      active: true,
      priority,
      eligibilityStatus: FacebookPublishTargetEligibilityStatus.UNKNOWN,
      eligibilityReason: 'Group has not been verified yet.',
      lastVerifiedAt: null,
      lastDiscoveredAt: discoveryTime,
      dailyPublishLimit: 10,
    });
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
  }

  async syncAndReconcileExtensionGroups(input: DiscoverFacebookGroupsInput) {
    await this.assertFacebookAccountOwner(input.ownerUserId, input.facebookAccountId);
    const scopeKey = input.facebookAccountId?.trim()
      || input.ownerExtensionInstanceId?.trim()
      || 'USER';
    let syncState = await this.groupSyncStatesRepo.findOne({
      where: { ownerUserId: input.ownerUserId, scopeKey },
    });
    if (!syncState) {
      syncState = this.groupSyncStatesRepo.create({
        ownerUserId: input.ownerUserId,
        scopeKey,
        status: 'NOT_INITIALIZED',
        initialScanCompletedAt: null,
        lastScanStartedAt: null,
        lastScanCompletedAt: null,
        lastScannedCount: 0,
        lastError: null,
      });
    }

    syncState.status = 'SYNCING';
    syncState.lastScanStartedAt = new Date();
    syncState.lastError = null;
    await this.groupSyncStatesRepo.save(syncState);

    try {
      const result = await this.discoverAndSyncExtensionGroups(input);
      const completePayload = input.scanComplete === true;
      const payloadIsConsistent = result.errors.length === 0
        && result.requested === result.valid + result.filtered + result.duplicates;
      const reconciliationApplied = completePayload && payloadIsConsistent;

      if (reconciliationApplied) {
        await this.reconcileMissingExtensionGroups(input, result);
      }

      const completedAt = new Date();
      syncState.status = reconciliationApplied ? 'READY' : 'PARTIAL';
      syncState.lastScanCompletedAt = reconciliationApplied ? completedAt : null;
      syncState.lastScannedCount = result.valid;
      let lastError: string | null = null;
      if (!reconciliationApplied) {
        if (completePayload) {
          lastError = 'The scan payload was incomplete, so missing groups were not deactivated.';
        } else {
          lastError = 'The hidden Facebook scan did not reach its completion guard.';
        }
      }
      syncState.lastError = lastError;
      if (reconciliationApplied && !syncState.initialScanCompletedAt) {
        syncState.initialScanCompletedAt = completedAt;
      }
      await this.groupSyncStatesRepo.save(syncState);

      result.scanComplete = completePayload;
      result.reconciliationApplied = reconciliationApplied;
      return result;
    } catch (error) {
      syncState.status = 'FAILED';
      syncState.lastError = error instanceof Error ? error.message : 'Facebook group sync failed.';
      await this.groupSyncStatesRepo.save(syncState);
      throw error;
    }
  }

  private async reconcileMissingExtensionGroups(
    input: DiscoverFacebookGroupsInput,
    result: DiscoverFacebookGroupsResponseDto,
  ) {
    const activeTargets = await this.targetsRepo.find({
      where: {
        ownerUserId: input.ownerUserId,
        type: FacebookPublishTargetType.GROUP,
        active: true,
      },
    });
    const discoveredIds = this.getDiscoveredGroupIds(result);
    const removableTargets = activeTargets.filter((target) => (
      !target.manualIncluded
      && this.isTargetInAccountScope(
        target.ownerExtensionInstanceId,
        input.ownerExtensionInstanceId,
        target.facebookAccountId,
        input.facebookAccountId,
      )
    ));

    for (const target of removableTargets) {
      await this.deactivateMissingGroup(target, discoveredIds, result);
    }
  }

  private getDiscoveredGroupIds(result: DiscoverFacebookGroupsResponseDto) {
    return new Set(
      result.items
        .map((item) => item.targetExternalId?.trim().toLowerCase())
        .filter((value): value is string => Boolean(value)),
    );
  }

  private async deactivateMissingGroup(
    target: FacebookPublishTargetEntity,
    discoveredIds: Set<string>,
    result: DiscoverFacebookGroupsResponseDto,
  ) {
    const externalId = target.externalId?.trim().toLowerCase();
    if (!externalId || discoveredIds.has(externalId)) return;

    target.active = false;
    target.eligibilityStatus = FacebookPublishTargetEligibilityStatus.UNKNOWN;
    target.eligibilityReason = 'Group was not returned by the latest Facebook joined-groups scan.';
    await this.targetsRepo.save(target);
    result.removed += 1;
    result.items.push({
      action: 'deactivated',
      targetName: target.name,
      targetUrl: target.url ?? `https://www.facebook.com/groups/${externalId}`,
      targetExternalId: target.externalId,
      targetId: target.id,
      reason: 'Group was not returned by the latest completed scan.',
    });
  }

  async updateExtensionGroup(input: UpdateFacebookGroupInput): Promise<ResolvedFacebookPublishTarget> {
    await this.assertFacebookAccountOwner(input.ownerUserId, input.facebookAccountId);
    const target = await this.findOwnedActiveGroup(
      input.ownerUserId,
      input.targetId,
      input.ownerExtensionInstanceId,
      input.facebookAccountId,
    );
    const name = this.requireText(input.targetName, 'targetName');
    const groupUrl = this.normalizeFacebookGroupUrl(input.targetUrl);

    const duplicateTargets = await this.targetsRepo.find({
      where: {
        ownerUserId: input.ownerUserId,
        type: FacebookPublishTargetType.GROUP,
        externalId: groupUrl.externalId,
        active: true,
      },
    });
    const duplicateTarget = duplicateTargets.find((candidate) => this.isTargetInAccountScope(
      candidate.ownerExtensionInstanceId,
      input.ownerExtensionInstanceId,
      candidate.facebookAccountId,
      input.facebookAccountId,
    ));
    if (duplicateTarget && duplicateTarget.id !== target.id) {
      throw new BadRequestException({
        code: 'FACEBOOK_GROUP_ALREADY_EXISTS',
        message: 'Facebook group URL is already configured for this account.',
      });
    }

    target.name = name;
    target.externalId = groupUrl.externalId;
    target.url = groupUrl.url;
    target.ownerExtensionInstanceId = input.ownerExtensionInstanceId ?? target.ownerExtensionInstanceId;
    target.facebookAccountId = input.facebookAccountId ?? target.facebookAccountId;
    target.eligibilityStatus = FacebookPublishTargetEligibilityStatus.UNKNOWN;
    target.eligibilityReason = 'Group has not been verified yet.';
    target.lastVerifiedAt = null;
    target.lastDiscoveredAt = new Date();

    return this.toResolvedTarget(await this.targetsRepo.save(target));
  }

  async updateExtensionGroupVerification(
    input: UpdateFacebookGroupVerificationInput,
  ): Promise<ResolvedFacebookPublishTarget> {
    await this.assertFacebookAccountOwner(input.ownerUserId, input.facebookAccountId);
    const target = await this.findOwnedActiveGroup(
      input.ownerUserId,
      input.targetId,
      input.ownerExtensionInstanceId,
      input.facebookAccountId,
    );
    const eligibilityStatus = this.normalizeVerificationStatus(input.eligibilityStatus, input.eligibilityReason);

    target.eligibilityStatus = eligibilityStatus;
    target.eligibilityReason = input.eligibilityReason?.trim() || null;
    target.lastVerifiedAt = input.verifiedAt ?? new Date();
    target.lastVerifiedByInstanceId = input.lastVerifiedByInstanceId ?? null;
    target.ownerExtensionInstanceId = input.ownerExtensionInstanceId ?? target.ownerExtensionInstanceId;
    target.facebookAccountId = input.facebookAccountId ?? target.facebookAccountId;

    return this.toResolvedTarget(await this.targetsRepo.save(target));
  }

  async deleteExtensionGroup(
    ownerUserId: string,
    targetId: string,
    ownerExtensionInstanceId?: string | null,
    facebookAccountId?: string | null,
  ): Promise<ResolvedFacebookPublishTarget> {
    await this.assertFacebookAccountOwner(ownerUserId, facebookAccountId);
    const target = await this.findOwnedActiveGroup(ownerUserId, targetId, ownerExtensionInstanceId, facebookAccountId);
    target.active = false;
    return this.toResolvedTarget(await this.targetsRepo.save(target));
  }

  async reportExtensionPublishResult(input: ReportFacebookPublishResultInput) {
    if (input.targetId) {
      try {
        await this.findOwnedActiveGroup(input.ownerUserId, input.targetId, input.extensionInstanceId);
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw new BadRequestException({
            code: 'VALIDATION_ERROR',
            message: 'Request payload is invalid.',
          });
        }
        throw error;
      }
    }

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
      .replaceAll('đ', 'd')
      .replaceAll('Đ', 'D')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async resolveActiveTargets(
    ownerUserId: string,
    selectedTargetIds?: string[],
    ownerExtensionInstanceId?: string | null,
    facebookAccountId?: string | null,
  ): Promise<ResolvedFacebookPublishTarget[]> {
    if (selectedTargetIds) {
      const uniqueTargetIds = [...new Set(selectedTargetIds.map((targetId) => targetId.trim()).filter(Boolean))];
      if (uniqueTargetIds.length === 0) {
        throw new BadRequestException({
          code: 'FACEBOOK_TARGETS_REQUIRED',
          message: 'Select at least one Facebook group before publishing.',
        });
      }

      const selectedTargets = (await this.targetsRepo.find({
        where: {
          id: In(uniqueTargetIds),
          active: true,
          ownerUserId,
          type: FacebookPublishTargetType.GROUP,
        },
        order: { priority: 'ASC', createdAt: 'ASC' },
      })).filter((target) => this.isTargetInAccountScope(
        target.ownerExtensionInstanceId,
        ownerExtensionInstanceId,
        target.facebookAccountId,
        facebookAccountId,
      ));
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
    const scopedTargets = configuredTargets.filter((target) => this.isTargetInAccountScope(
      target.ownerExtensionInstanceId,
      ownerExtensionInstanceId,
      target.facebookAccountId,
      facebookAccountId,
    ));

    return (await this.toResolvedTargets(scopedTargets)).filter((target) => target.selectable);
  }

  private async toResolvedTarget(target: FacebookPublishTargetEntity): Promise<ResolvedFacebookPublishTarget> {
    return (await this.toResolvedTargets([target]))[0];
  }

  private async toResolvedTargets(targets: FacebookPublishTargetEntity[]): Promise<ResolvedFacebookPublishTarget[]> {
    const targetIds = targets.map((target) => target.id).filter(Boolean);
    const todayCounts = await this.getTodayPublishCounts(targetIds);
    const accountIds = [...new Set(targets.map((target) => target.facebookAccountId).filter(Boolean))] as string[];
    const accounts = this.facebookAccountsRepo && accountIds.length > 0
      ? await this.facebookAccountsRepo.find({ where: { id: In(accountIds) } })
      : [];
    const accountExternalIds = new Map(accounts.map((account) => [account.id, account.facebookExternalId]));

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
        facebookAccountId: target.facebookAccountId,
        facebookAccountExternalId: target.facebookAccountId
          ? accountExternalIds.get(target.facebookAccountId) ?? null
          : null,
        manualIncluded: target.manualIncluded,
        manualIncludedAt: target.manualIncludedAt?.toISOString() ?? null,
        manualIncludedBy: target.manualIncludedBy,
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
    const raw = this.configService?.get<string | number>(name);
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

  private async findOwnedActiveGroup(
    ownerUserId: string,
    targetId: string,
    ownerExtensionInstanceId?: string | null,
    facebookAccountId?: string | null,
  ) {
    const target = await this.targetsRepo.findOne({
      where: {
        id: targetId,
        ownerUserId,
        type: FacebookPublishTargetType.GROUP,
        active: true,
      },
    });

    if (!target || !this.isTargetInAccountScope(
      target.ownerExtensionInstanceId,
      ownerExtensionInstanceId,
      target.facebookAccountId,
      facebookAccountId,
    )) {
      throw new BadRequestException({
        code: 'FACEBOOK_GROUP_NOT_FOUND',
        message: 'Facebook group not found for this account.',
      });
    }

    return target;
  }

  private isTargetInAccountScope(
    targetExtensionInstanceId: string | null | undefined,
    requestedExtensionInstanceId?: string | null,
    targetFacebookAccountId?: string | null,
    requestedFacebookAccountId?: string | null,
  ) {
    const requestedAccountId = requestedFacebookAccountId?.trim();
    if (requestedAccountId) return targetFacebookAccountId === requestedAccountId;

    // Legacy requests without account identity keep their old extension scope.
    // The new extension always sends facebookAccountId after auth resolution.
    const requestedInstanceId = requestedExtensionInstanceId?.trim();
    return !requestedInstanceId
      || !targetExtensionInstanceId
      || targetExtensionInstanceId === requestedInstanceId;
  }

  private toResolvedFacebookAccount(account: FacebookAccountEntity): ResolvedFacebookAccount {
    return {
      id: account.id,
      facebookExternalId: account.facebookExternalId,
      displayName: account.displayName,
      profileUrl: account.profileUrl,
      status: account.status,
      lastSeenAt: account.lastSeenAt?.toISOString() ?? null,
    };
  }

  private async assertFacebookAccountOwner(ownerUserId: string, facebookAccountId?: string | null) {
    if (!facebookAccountId) return;
    const account = await this.facebookAccountsRepo?.findOne({
      where: { id: facebookAccountId, ownerUserId },
    });
    if (!account) {
      throw new BadRequestException({
        code: 'FACEBOOK_ACCOUNT_NOT_FOUND',
        message: 'Facebook account was not resolved for this HR user.',
      });
    }
  }

  private normalizeFacebookAccountDisplayName(value: string | null | undefined, facebookExternalId: string) {
    const normalized = value?.replace(/\s+/g, ' ').trim() ?? '';
    if (!normalized) return null;
    const comparable = normalized
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const placeholderPatterns = [
      /^account(?:\s+id)?(?:\s+\d+)?$/i,
      /^facebook(?:\s+account)?$/i,
      /^\(\d+\)\s*facebook$/i,
      /^(?:thong\s+bao|notification)$/i,
    ] as const;
    if (placeholderPatterns.some((pattern) => pattern.test(comparable))) {
      return null;
    }
    if (normalized === facebookExternalId || normalized.length > 100) return null;
    if (/đã phê duyệt một lần đăng nhập|approved a login|notification/i.test(normalized)) return null;
    return normalized;
  }

  private normalizeFacebookProfileUrl(value: string | null | undefined, facebookExternalId: string) {
    const normalized = value?.trim();
    if (!normalized) return null;

    try {
      const parsed = new URL(normalized);
      const hostname = parsed.hostname.toLowerCase();
      if (hostname !== 'facebook.com' && !hostname.endsWith('.facebook.com')) return null;

      const queryId = parsed.searchParams.get('id')?.trim();
      if (queryId && queryId !== facebookExternalId) return null;
      return parsed.href;
    } catch {
      return null;
    }
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

  private assertValidFacebookGroupId(groupId: string) {
    if (/^[a-z0-9][a-z0-9._-]*$/i.test(groupId)) return;

    throw new BadRequestException({
      code: 'FACEBOOK_GROUP_URL_INVALID',
      message: 'Facebook group URL contains an invalid group id.',
    });
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
    const normalizedValue = this.normalizeTextForSearch(value);
    return this.IT_RECRUITMENT_GROUP_PATTERNS.some((pattern) => pattern.test(normalizedValue));
  }

  private normalizeTextForSearch(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replaceAll('\u0111', 'd')
      .replaceAll('\u0110', 'D')
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
