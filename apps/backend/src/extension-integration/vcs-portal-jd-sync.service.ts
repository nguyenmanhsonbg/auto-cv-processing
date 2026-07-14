import { BadRequestException, Injectable } from '@nestjs/common';
import { UserRole } from '@interview-assistant/shared';
import { DataSource, EntityManager, In } from 'typeorm';
import { AuditLogEntity } from '../audit-logs/entities/audit-log.entity';
import { UserEntity } from '../auth/entities/user.entity';
import { JobDescriptionEntity } from '../job-descriptions/entities/job-description.entity';
import { JobSourceCategoryEntity } from '../job-descriptions/entities/job-source-category.entity';
import { QuestionSetEntity } from '../questions/entities/question-set.entity';
import { QuestionSetItemEntity } from '../questions/entities/question-set-item.entity';
import { JobDescriptionStatus, QuestionSetStatus } from '../recruitment-common';
import { SyncVcsPortalJdsResponseDto, SyncVcsPortalJdWarningDto } from './dto';
import { ExtensionSourceSystem } from './enums';
import { VcsPortalClientService } from './vcs-portal-client.service';
import { VcsPortalJdMapper } from './vcs-portal-jd.mapper';
import {
  VcsPortalMappedJobDescription,
  VcsPortalMappedSourceCategory,
  VcsPortalRawJobDescription,
} from './vcs-portal.types';

interface VcsPortalSyncContext {
  actorUserId: string;
  actorRole: UserRole;
  requestId?: string;
  extensionVersion?: string;
}

interface VcsPortalSyncCounters {
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  archivedCount: number;
  failedCount: number;
  questionSetCreatedCount: number;
  questionSetDeletedCount: number;
  questionCount: number;
}

@Injectable()
export class VcsPortalJdSyncService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly portalClient: VcsPortalClientService,
    private readonly mapper: VcsPortalJdMapper,
  ) {}

  async syncAllFromPortal(context: VcsPortalSyncContext): Promise<SyncVcsPortalJdsResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    const lockAcquired = await this.tryAcquireSyncLock(queryRunner.manager);
    if (!lockAcquired) {
      await queryRunner.release();
      throw new BadRequestException({
        code: 'VCS_PORTAL_SYNC_IN_PROGRESS',
        message: 'A VCS Portal JD sync is already running.',
      });
    }

    try {
      await this.assertActorExists(context.actorUserId);
      const lastSyncedAt = new Date();
      const fetched = await this.portalClient.fetchAllJobDescriptions();
      const counters: VcsPortalSyncCounters = {
        createdCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
        archivedCount: 0,
        failedCount: 0,
        questionSetCreatedCount: 0,
        questionSetDeletedCount: 0,
        questionCount: 0,
      };
      const warnings: SyncVcsPortalJdWarningDto[] = [];
      const incomingSourceJobIds = this.collectIncomingSourceJobIds(fetched.items);

      for (const rawItem of fetched.items) {
        try {
          const mapped = this.mapper.map(rawItem);
          warnings.push(...mapped.warnings.map((warning) => ({
            ...warning,
            sourceJobId: mapped.sourceJobId,
            sourceSlug: mapped.sourceSlug,
          })));
          const itemResult = await this.dataSource.transaction((manager) =>
            this.syncOneJobDescription(manager, mapped, context, lastSyncedAt),
          );
          counters.createdCount += itemResult.created ? 1 : 0;
          counters.updatedCount += itemResult.updated ? 1 : 0;
          counters.unchangedCount += itemResult.unchanged ? 1 : 0;
          counters.questionSetCreatedCount += itemResult.questionSetCreated ? 1 : 0;
          counters.questionSetDeletedCount += itemResult.questionSetDeletedCount;
          counters.questionCount += itemResult.questionCount;
        } catch (error) {
          counters.failedCount += 1;
          warnings.push({
            code: 'VCS_PORTAL_ITEM_FAILED',
            message: this.toSafeErrorMessage(error),
            sourceJobId: this.safeSourceJobId(rawItem),
            sourceSlug: this.safeSourceSlug(rawItem),
          });
        }
      }

      counters.archivedCount = await this.archiveStaleJobDescriptions(
        incomingSourceJobIds,
        lastSyncedAt,
      );

      const response: SyncVcsPortalJdsResponseDto = {
        fetchedCount: fetched.fetchedCount,
        pagesFetched: fetched.pagesFetched,
        createdCount: counters.createdCount,
        updatedCount: counters.updatedCount,
        unchangedCount: counters.unchangedCount,
        archivedCount: counters.archivedCount,
        failedCount: counters.failedCount,
        questionSetCreatedCount: counters.questionSetCreatedCount,
        questionSetDeletedCount: counters.questionSetDeletedCount,
        questionCount: counters.questionCount,
        lastSyncedAt: lastSyncedAt.toISOString(),
        warnings: warnings.length > 0 ? warnings : undefined,
      };

      await this.writeAuditLog(response, context, warnings, lastSyncedAt);
      return response;
    } finally {
      await queryRunner.manager.query('SELECT pg_advisory_unlock(hashtext($1))', [
        'vcs-portal-jd-full-sync',
      ]);
      await queryRunner.release();
    }
  }

  private async syncOneJobDescription(
    manager: EntityManager,
    mapped: VcsPortalMappedJobDescription,
    context: VcsPortalSyncContext,
    lastSyncedAt: Date,
  ) {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `vcs-portal-jd:${mapped.sourceJobId}`,
    ]);

    const repo = manager.getRepository(JobDescriptionEntity);
    const existing = await repo.findOne({
      where: {
        sourceSystem: ExtensionSourceSystem.VCS_PORTAL,
        sourceJobId: mapped.sourceJobId,
      },
    });
    const contentChanged = existing?.sourceContentHash !== mapped.sourceContentHash;
    const statusChanged = existing !== null && existing?.status !== JobDescriptionStatus.ACTIVE;
    const jobDescription = existing ?? repo.create({
      createdById: context.actorUserId,
    });

    if (existing && !contentChanged) {
      jobDescription.status = JobDescriptionStatus.ACTIVE;
      jobDescription.lastSyncedAt = lastSyncedAt;
      await repo.save(jobDescription);

      return {
        created: false,
        updated: statusChanged,
        unchanged: !statusChanged,
        questionSetCreated: false,
        questionSetDeletedCount: 0,
        questionCount: 0,
      };
    }

    jobDescription.title = mapped.title;
    jobDescription.positionId = jobDescription.positionId ?? null;
    jobDescription.levelId = jobDescription.levelId ?? null;
    jobDescription.description = mapped.description;
    jobDescription.overview = mapped.overview;
    jobDescription.responsibilities = mapped.responsibilities;
    jobDescription.summary = mapped.summary;
    jobDescription.requirements = mapped.requirements;
    jobDescription.benefits = mapped.benefits;
    jobDescription.salary = mapped.salary;
    jobDescription.annualLeaveDays = mapped.annualLeaveDays;
    jobDescription.department = mapped.department;
    jobDescription.applicationDeadline = mapped.applicationDeadline;
    jobDescription.status = JobDescriptionStatus.ACTIVE;
    jobDescription.sourceSystem = ExtensionSourceSystem.VCS_PORTAL;
    jobDescription.sourceJobId = mapped.sourceJobId;
    jobDescription.sourceSlug = mapped.sourceSlug;
    jobDescription.sourceUrl = mapped.sourceUrl;
    jobDescription.sourceCreatedAt = mapped.sourceCreatedAt;
    jobDescription.sourceModifiedAt = mapped.sourceModifiedAt;
    jobDescription.sourcePayload = mapped.sourcePayload;
    jobDescription.sourceContentHash = mapped.sourceContentHash;
    jobDescription.lastSyncedAt = lastSyncedAt;

    const saved = await repo.save(jobDescription);
    const sourceCategories = await this.ensurePortalSourceCategories(manager, mapped.categories);
    await this.replaceSourceCategories(manager, saved.id, sourceCategories);
    const questionResult = await this.replacePortalQuestionSet(
      manager,
      saved.id,
      mapped,
      context,
      lastSyncedAt,
    );

    return {
      created: !existing,
      updated: Boolean(existing),
      unchanged: false,
      ...questionResult,
    };
  }

  private async replacePortalQuestionSet(
    manager: EntityManager,
    jobDescriptionId: string,
    mapped: VcsPortalMappedJobDescription,
    context: VcsPortalSyncContext,
    lastSyncedAt: Date,
  ) {
    const setRepo = manager.getRepository(QuestionSetEntity);
    const existingSets = await setRepo.find({
      select: ['id'],
      where: {
        jobDescriptionId,
        sourceSystem: ExtensionSourceSystem.VCS_PORTAL,
        status: QuestionSetStatus.ACTIVE,
      },
    });
    const existingSetIds = existingSets.map((set) => set.id);
    if (existingSetIds.length > 0) {
      await setRepo.update({ id: In(existingSetIds) }, { status: QuestionSetStatus.ARCHIVED });
    }

    if (mapped.questions.length === 0) {
      return {
        questionSetCreated: false,
        questionSetDeletedCount: existingSetIds.length,
        questionCount: 0,
      };
    }

    const questionSet = await setRepo.save(setRepo.create({
      name: `VCS Portal Questions - ${mapped.title}`,
      jobDescriptionId,
      jobDescriptionVersionId: null,
      positionId: null,
      levelId: null,
      status: QuestionSetStatus.ACTIVE,
      createdById: context.actorUserId,
      sourceSystem: ExtensionSourceSystem.VCS_PORTAL,
      sourceJobId: mapped.sourceJobId,
      sourceSnapshotHash: mapped.sourceContentHash,
      sourceSnapshot: {
        sourceJobId: mapped.sourceJobId,
        sourceSlug: mapped.sourceSlug,
        questionCount: mapped.questions.length,
        questions: mapped.questions.map((question) => question.rawSnapshot),
      },
      sourceLastSyncedAt: lastSyncedAt,
    }));

    const itemRepo = manager.getRepository(QuestionSetItemEntity);
    const items = mapped.questions.map((question, index) => itemRepo.create({
      questionSetId: questionSet.id,
      questionId: null,
      questionTextSnapshot: question.text,
      questionType: question.type,
      orderIndex: index,
      required: question.required,
      metadata: {
        sourceSystem: ExtensionSourceSystem.VCS_PORTAL,
        sourceJobId: mapped.sourceJobId,
        sourceSlug: mapped.sourceSlug,
        placeholder: question.placeholder,
        rawSnapshot: question.rawSnapshot,
      },
    }));

    await itemRepo.save(items);
    return {
      questionSetCreated: true,
      questionSetDeletedCount: existingSetIds.length,
      questionCount: items.length,
    };
  }

  private async archiveStaleJobDescriptions(
    incomingSourceJobIds: string[],
    lastSyncedAt: Date,
  ) {
    const result = await this.dataSource.transaction(async (manager) => {
      const qb = manager.getRepository(JobDescriptionEntity)
        .createQueryBuilder()
        .update(JobDescriptionEntity)
        .set({
          status: JobDescriptionStatus.ARCHIVED,
          lastSyncedAt,
        })
        .where('source_system = :sourceSystem', {
          sourceSystem: ExtensionSourceSystem.VCS_PORTAL,
        })
        .andWhere('status != :archivedStatus', {
          archivedStatus: JobDescriptionStatus.ARCHIVED,
        });

      if (incomingSourceJobIds.length > 0) {
        qb.andWhere('source_job_id NOT IN (:...incomingSourceJobIds)', {
          incomingSourceJobIds,
        });
      }

      return qb.execute();
    });

    return result.affected ?? 0;
  }

  private async ensurePortalSourceCategories(
    manager: EntityManager,
    mappedCategories: VcsPortalMappedSourceCategory[],
  ) {
    const repo = manager.getRepository(JobSourceCategoryEntity);
    const savedCategories: JobSourceCategoryEntity[] = [];

    for (const mappedCategory of mappedCategories) {
      const existing = await this.findExistingSourceCategory(manager, mappedCategory);
      const category = existing ?? repo.create({
        sourceSystem: ExtensionSourceSystem.VCS_PORTAL,
      });

      category.sourceCategoryId = mappedCategory.sourceCategoryId;
      category.name = mappedCategory.name;
      category.displayName = mappedCategory.displayName;
      category.slug = mappedCategory.slug;
      category.isActive = true;
      savedCategories.push(await repo.save(category));
    }

    return savedCategories;
  }

  private async findExistingSourceCategory(
    manager: EntityManager,
    mappedCategory: VcsPortalMappedSourceCategory,
  ) {
    const repo = manager.getRepository(JobSourceCategoryEntity);
    if (mappedCategory.sourceCategoryId) {
      const existingBySourceId = await repo.findOne({
        where: {
          sourceSystem: ExtensionSourceSystem.VCS_PORTAL,
          sourceCategoryId: mappedCategory.sourceCategoryId,
        },
      });
      if (existingBySourceId) return existingBySourceId;
    }

    return repo
      .createQueryBuilder('category')
      .where('category.sourceSystem = :sourceSystem', {
        sourceSystem: ExtensionSourceSystem.VCS_PORTAL,
      })
      .andWhere('category.name = :name', { name: mappedCategory.name })
      .andWhere('category.sourceCategoryId IS NULL')
      .getOne();
  }

  private async replaceSourceCategories(
    manager: EntityManager,
    jobDescriptionId: string,
    categories: JobSourceCategoryEntity[],
  ) {
    await manager.query(
      'DELETE FROM "job_description_source_categories" WHERE "job_description_id" = $1',
      [jobDescriptionId],
    );

    for (const category of categories) {
      await manager.query(
        `
          INSERT INTO "job_description_source_categories" ("job_description_id", "source_category_id")
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `,
        [jobDescriptionId, category.id],
      );
    }
  }

  private collectIncomingSourceJobIds(items: VcsPortalRawJobDescription[]) {
    return [...new Set(items
      .map((item) => this.safeSourceJobId(item))
      .filter((sourceJobId): sourceJobId is string => Boolean(sourceJobId)))];
  }

  private async assertActorExists(actorUserId: string) {
    const user = await this.dataSource.getRepository(UserEntity).findOne({
      where: { id: actorUserId },
    });
    if (!user) throw new BadRequestException('Actor user not found');
  }

  private async tryAcquireSyncLock(manager: EntityManager) {
    const rows = await manager.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [
      'vcs-portal-jd-full-sync',
    ]);
    const firstRow = Array.isArray(rows) ? rows[0] : null;
    return Boolean(firstRow?.locked);
  }

  private async writeAuditLog(
    response: SyncVcsPortalJdsResponseDto,
    context: VcsPortalSyncContext,
    warnings: SyncVcsPortalJdWarningDto[],
    lastSyncedAt: Date,
  ) {
    await this.dataSource.getRepository(AuditLogEntity).save(
      this.dataSource.getRepository(AuditLogEntity).create({
        actorType: 'USER',
        actorId: context.actorUserId,
        action: 'VCS_PORTAL_JD_SYNC_COMPLETED',
        objectType: 'JOB_DESCRIPTION',
        objectId: null,
        applicationId: null,
        metadata: {
          sourceSystem: ExtensionSourceSystem.VCS_PORTAL,
          actorRole: context.actorRole,
          requestId: context.requestId ?? null,
          extensionVersion: context.extensionVersion ?? null,
          fetchedCount: response.fetchedCount,
          pagesFetched: response.pagesFetched,
          createdCount: response.createdCount,
          updatedCount: response.updatedCount,
          unchangedCount: response.unchangedCount,
          archivedCount: response.archivedCount,
          failedCount: response.failedCount,
          questionSetCreatedCount: response.questionSetCreatedCount,
          questionSetDeletedCount: response.questionSetDeletedCount,
          questionCount: response.questionCount,
          warningCount: warnings.length,
          warnings: warnings.slice(0, 50),
          lastSyncedAt: lastSyncedAt.toISOString(),
        },
        ipAddress: null,
        userAgent: null,
      }),
    );
  }

  private safeSourceJobId(item: VcsPortalRawJobDescription) {
    if (typeof item.id === 'number' && Number.isFinite(item.id)) return String(item.id);
    if (typeof item.id === 'string' && item.id.trim()) return item.id.trim();
    return null;
  }

  private safeSourceSlug(item: VcsPortalRawJobDescription) {
    return typeof item.slug === 'string' && item.slug.trim() ? item.slug.trim() : null;
  }

  private toSafeErrorMessage(error: unknown) {
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      if (typeof response === 'string') return response;
      if (typeof response === 'object' && response !== null) {
        const message = (response as { message?: unknown }).message;
        if (typeof message === 'string') return message;
      }
    }

    return error instanceof Error ? error.message : 'Unknown sync error';
  }
}
