import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { ChannelPostingStatus } from '../recruitment-common';
import { JobPostingEntity } from '../job-postings/entities/job-posting.entity';
import { Repository } from 'typeorm';
import { FacebookPublishOptionsDto } from './dto/facebook-publish.dto';
import { FacebookPublishHistoryEntity } from './entities/facebook-publish-history.entity';
import { FacebookPublishTargetEntity } from './entities/facebook-publish-target.entity';
import {
  FacebookPublishResultItem,
  FacebookPublishResultStatus,
  FacebookPublishSummary,
  FacebookPublishTargetType,
  ResolvedFacebookPublishTarget,
} from './facebook-publishing.types';
import { FacebookPostContentService } from './content/facebook-post-content.service';
import { FacebookPageClient } from './page/facebook-page.client';
import { FacebookGroupRpaClient } from './rpa/facebook-group-rpa.client';

@Injectable()
export class FacebookPublishingService {
  constructor(
    @InjectRepository(FacebookPublishTargetEntity)
    private readonly targetsRepo: Repository<FacebookPublishTargetEntity>,
    @InjectRepository(FacebookPublishHistoryEntity)
    private readonly historiesRepo: Repository<FacebookPublishHistoryEntity>,
    private readonly configService: ConfigService,
    private readonly contentService: FacebookPostContentService,
    private readonly pageClient: FacebookPageClient,
    private readonly groupRpaClient: FacebookGroupRpaClient,
  ) {}

  async publishJobPosting(
    posting: JobPostingEntity,
    options?: FacebookPublishOptionsDto,
  ): Promise<FacebookPublishSummary> {
    const content = this.contentService.build(posting);
    const targets = await this.resolveTargets(options);

    if (targets.length === 0) {
      return {
        success: false,
        totalTargets: 0,
        successCount: 0,
        failedCount: 0,
        skippedCount: 0,
        status: ChannelPostingStatus.PUBLISH_FAILED,
        message: 'No Facebook targets configured.',
        results: [],
      };
    }

    const results: FacebookPublishResultItem[] = [];
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      const result = await this.publishToTarget(target, content);
      results.push(result);
      await this.saveHistory(posting, target, content, result);

      if (index < targets.length - 1) {
        await this.delayBetweenTargets();
      }
    }

    const successCount = results.filter((result) => result.status === FacebookPublishResultStatus.SUCCESS).length;
    const failedCount = results.filter((result) => result.status === FacebookPublishResultStatus.FAILED).length;
    const skippedCount = results.filter((result) => result.status === FacebookPublishResultStatus.SKIPPED).length;
    const status = this.resolveChannelStatus(results);

    return {
      success: targets.length > 0 && successCount === targets.length,
      totalTargets: targets.length,
      successCount,
      failedCount,
      skippedCount,
      status,
      results,
    };
  }

  async getLatestJobPostingSummary(jobPostingId: string): Promise<FacebookPublishSummary | null> {
    const histories = await this.historiesRepo.find({
      where: { jobPostingId },
      order: { createdAt: 'DESC' },
      take: 50,
    });

    if (histories.length === 0) return null;

    const latestByTarget = new Map<string, FacebookPublishHistoryEntity>();
    for (const history of histories) {
      const targetKey = history.targetId ?? history.targetUrl ?? history.targetName;
      if (!latestByTarget.has(targetKey)) {
        latestByTarget.set(targetKey, history);
      }
    }

    const results = [...latestByTarget.values()].map((history): FacebookPublishResultItem => ({
      targetType: history.targetType,
      targetName: history.targetName,
      targetUrl: history.targetUrl,
      targetId: history.targetId,
      status: history.status,
      message: history.status === FacebookPublishResultStatus.SUCCESS
        ? 'Published to Facebook'
        : history.errorReason ?? 'Facebook publish failed.',
      externalPostId: history.externalPostId,
    }));
    const successCount = results.filter((result) => result.status === FacebookPublishResultStatus.SUCCESS).length;
    const failedCount = results.filter((result) => result.status === FacebookPublishResultStatus.FAILED).length;
    const skippedCount = results.filter((result) => result.status === FacebookPublishResultStatus.SKIPPED).length;
    const firstProblem = results.find((result) => result.status !== FacebookPublishResultStatus.SUCCESS);

    return {
      success: results.length > 0 && successCount === results.length,
      totalTargets: results.length,
      successCount,
      failedCount,
      skippedCount,
      status: this.resolveChannelStatus(results),
      message: firstProblem?.message,
      results,
    };
  }

  private async resolveTargets(options?: FacebookPublishOptionsDto) {
    const explicitTargets = this.resolveExplicitTargets(options);
    if (explicitTargets.length > 0) return explicitTargets;

    const configuredTargets = await this.targetsRepo.find({
      where: { active: true },
      order: { priority: 'ASC', createdAt: 'ASC' },
    });

    if (configuredTargets.length > 0) {
      return configuredTargets.map((target): ResolvedFacebookPublishTarget => ({
        targetId: target.id,
        targetType: target.type,
        targetName: target.name,
        targetUrl: target.url,
        targetExternalId: target.externalId,
      }));
    }

    return this.resolveEnvTargets();
  }

  private resolveEnvTargets() {
    const targets: ResolvedFacebookPublishTarget[] = [];
    const groupTargets = this.parseEnvTargetArray(
      this.configService.get<string>('FACEBOOK_GROUP_TARGETS'),
    );
    const fanpageTargets = this.parseEnvTargetArray(
      this.configService.get<string>('FACEBOOK_FANPAGE_TARGETS'),
    );

    for (const group of groupTargets) {
      targets.push({
        targetType: FacebookPublishTargetType.GROUP,
        targetName: group.name,
        targetUrl: group.url,
        targetExternalId: group.externalId,
      });
    }

    for (const fanpage of fanpageTargets) {
      targets.push({
        targetType: FacebookPublishTargetType.FANPAGE,
        targetName: fanpage.name,
        targetUrl: fanpage.url,
        targetExternalId: fanpage.externalId,
      });
    }

    return targets;
  }

  private parseEnvTargetArray(value: string | undefined) {
    if (!value?.trim()) return [];

    try {
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed)) return [];

      return parsed
        .map((item) => this.normalizeEnvTarget(item))
        .filter((item): item is { name: string; url: string | null; externalId: string | null } => Boolean(item));
    } catch {
      return value
        .split(';')
        .map((item) => {
          const [name, url, externalId] = item.split('|').map((part) => part?.trim());
          if (!name) return null;
          return { name, url: url || null, externalId: externalId || null };
        })
        .filter((item): item is { name: string; url: string | null; externalId: string | null } => Boolean(item));
    }
  }

  private normalizeEnvTarget(value: unknown) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const name = this.stringValue(record.name ?? record.groupName ?? record.pageName);
    if (!name) return null;

    return {
      name,
      url: this.stringValue(record.url ?? record.groupUrl ?? record.pageUrl),
      externalId: this.stringValue(record.externalId ?? record.pageId),
    };
  }

  private stringValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private mapEntityTarget(target: FacebookPublishTargetEntity): ResolvedFacebookPublishTarget {
    return {
      targetId: target.id,
      targetType: target.type,
      targetName: target.name,
      targetUrl: target.url,
      targetExternalId: target.externalId,
    };
  }

  private resolveExplicitTargets(options?: FacebookPublishOptionsDto) {
    const targets: ResolvedFacebookPublishTarget[] = [];

    for (const group of options?.targets?.groups ?? []) {
      targets.push({
        targetType: FacebookPublishTargetType.GROUP,
        targetName: group.groupName,
        targetUrl: group.groupUrl,
      });
    }

    for (const fanpage of options?.targets?.fanpages ?? []) {
      targets.push({
        targetType: FacebookPublishTargetType.FANPAGE,
        targetName: fanpage.pageName,
        targetUrl: fanpage.pageUrl ?? null,
        targetExternalId: fanpage.pageId ?? null,
      });
    }

    return targets;
  }

  private async publishToTarget(
    target: ResolvedFacebookPublishTarget,
    content: string,
  ): Promise<FacebookPublishResultItem> {
    const result = target.targetType === FacebookPublishTargetType.GROUP
      ? await this.groupRpaClient.publishToGroup(target, content)
      : await this.pageClient.publishToFanpage(target, content);

    return {
      targetType: target.targetType,
      targetName: target.targetName,
      targetUrl: target.targetUrl ?? null,
      targetId: target.targetId ?? null,
      status: result.status,
      message: result.message,
      externalPostId: result.externalPostId ?? null,
    };
  }

  private async delayBetweenTargets() {
    const min = this.numberEnv('FACEBOOK_PUBLISH_TARGET_DELAY_MIN_MS', 45_000);
    const max = Math.max(min, this.numberEnv('FACEBOOK_PUBLISH_TARGET_DELAY_MAX_MS', 90_000));
    const delayMs = Math.round(min + Math.random() * (max - min));
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
  }

  private async saveHistory(
    posting: JobPostingEntity,
    target: ResolvedFacebookPublishTarget,
    content: string,
    result: FacebookPublishResultItem,
  ) {
    const history = this.historiesRepo.create({
      jobPostingId: posting.id,
      jobDescriptionId: posting.jobDescriptionId ?? null,
      jobDescriptionVersionId: posting.jobDescriptionVersionId ?? null,
      targetId: target.targetId ?? null,
      targetType: target.targetType,
      targetName: target.targetName,
      targetUrl: target.targetUrl ?? null,
      content,
      status: result.status,
      errorReason: result.status === FacebookPublishResultStatus.SUCCESS ? null : result.message,
      externalPostId: result.externalPostId ?? null,
      submittedAt: result.status === FacebookPublishResultStatus.SUCCESS ? new Date() : null,
    });

    await this.historiesRepo.save(history);
  }

  private resolveChannelStatus(results: FacebookPublishResultItem[]) {
    if (results.length === 0) return ChannelPostingStatus.PUBLISH_FAILED;

    const successCount = results.filter((result) => result.status === FacebookPublishResultStatus.SUCCESS).length;
    if (successCount === results.length) return ChannelPostingStatus.PUBLISHED;
    if (successCount > 0) return ChannelPostingStatus.UPDATED;
    return ChannelPostingStatus.PUBLISH_FAILED;
  }

  private numberEnv(name: string, defaultValue: number) {
    const raw = this.configService.get<string | number>(name);
    const value = Number(raw);
    return Number.isFinite(value) ? value : defaultValue;
  }
}
