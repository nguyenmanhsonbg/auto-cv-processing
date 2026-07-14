import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginatedResponse } from '@interview-assistant/shared';
import { Repository } from 'typeorm';
import { UserEntity } from '../auth/entities/user.entity';
import { JobDescriptionVersionEntity } from '../job-descriptions/entities/job-description-version.entity';
import {
  JobDescriptionStatus,
  JobDescriptionVersionStatus,
  JobPostingStatus,
  QuestionSetStatus,
} from '../recruitment-common';
import { JobPostingEntity } from './entities/job-posting.entity';
import { QuestionSetEntity } from '../questions/entities/question-set.entity';
import { QuestionSetItemEntity } from '../questions/entities/question-set-item.entity';

type DateInput = Date | string | null;
const VCS_PORTAL_SOURCE_SYSTEM = 'VCS_PORTAL';
const JOB_POSTING_SNAPSHOT_SOURCE_SYSTEM = 'JOB_POSTING_SNAPSHOT';

export interface CreateJobPostingInput {
  jobDescriptionVersionId: string;
  title?: string;
  publicSlug?: string;
  openAt?: DateInput;
  closeAt?: DateInput;
  createdById: string;
}

export interface UpdateJobPostingInput {
  title?: string;
  publicSlug?: string;
  openAt?: DateInput;
  closeAt?: DateInput;
}

export interface ListJobPostingsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: JobPostingStatus;
  jobDescriptionId?: string;
  jobDescriptionVersionId?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface PublishReadiness {
  ready: boolean;
  reasons: string[];
}

@Injectable()
export class JobPostingsService {
  constructor(
    @InjectRepository(JobPostingEntity)
    private readonly jobPostingsRepo: Repository<JobPostingEntity>,
    @InjectRepository(JobDescriptionVersionEntity)
    private readonly versionsRepo: Repository<JobDescriptionVersionEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(QuestionSetEntity)
    private readonly questionSetsRepo: Repository<QuestionSetEntity>,
    @InjectRepository(QuestionSetItemEntity)
    private readonly questionSetItemsRepo: Repository<QuestionSetItemEntity>,
  ) {}

  findAll() {
    return this.jobPostingsRepo.find({
      relations: ['jobDescription', 'jobDescriptionVersion', 'formQuestionSet', 'createdBy'],
      order: { createdAt: 'DESC' },
    });
  }

  async findPaginated(
    params: ListJobPostingsParams,
  ): Promise<PaginatedResponse<JobPostingEntity>> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;
    const sortOrder = params.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const allowedSorts: Record<string, string> = {
      title: 'posting.title',
      publicSlug: 'posting.publicSlug',
      status: 'posting.status',
      openAt: 'posting.openAt',
      closeAt: 'posting.closeAt',
      createdAt: 'posting.createdAt',
      updatedAt: 'posting.updatedAt',
    };
    const sortCol = allowedSorts[params.sortBy ?? ''] ?? 'posting.createdAt';

    const qb = this.jobPostingsRepo
      .createQueryBuilder('posting')
      .leftJoinAndSelect('posting.jobDescription', 'jobDescription')
      .leftJoinAndSelect('posting.jobDescriptionVersion', 'jobDescriptionVersion')
      .leftJoinAndSelect('posting.formQuestionSet', 'formQuestionSet')
      .leftJoinAndSelect('posting.createdBy', 'createdBy')
      .orderBy(sortCol, sortOrder);

    const search = params.search?.trim();
    if (search) {
      qb.andWhere('(posting.title ILIKE :search OR posting.publicSlug ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    if (params.status !== undefined) {
      this.assertValidStatus(params.status);
      qb.andWhere('posting.status = :status', { status: params.status });
    }

    if (params.jobDescriptionId) {
      qb.andWhere('posting.jobDescriptionId = :jobDescriptionId', {
        jobDescriptionId: params.jobDescriptionId,
      });
    }

    if (params.jobDescriptionVersionId) {
      qb.andWhere('posting.jobDescriptionVersionId = :jobDescriptionVersionId', {
        jobDescriptionVersionId: params.jobDescriptionVersionId,
      });
    }

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const normalizedId = this.requireText(id, 'Job posting id');
    const posting = await this.jobPostingsRepo.findOne({
      where: { id: normalizedId },
      relations: [
        'jobDescription',
        'jobDescriptionVersion',
        'jobDescriptionVersion.jobDescription',
        'formQuestionSet',
        'createdBy',
      ],
    });
    if (!posting) throw new BadRequestException('Job posting not found');
    return posting;
  }

  async findPublishedBySlug(publicSlug: string) {
    const normalizedSlug = this.normalizeSlug(publicSlug);
    const posting = await this.jobPostingsRepo.findOne({
      where: {
        publicSlug: normalizedSlug,
        status: JobPostingStatus.PUBLISHED,
      },
      relations: [
        'jobDescription',
        'jobDescriptionVersion',
        'jobDescriptionVersion.jobDescription',
        'formQuestionSet',
      ],
    });
    if (!posting || !this.isPubliclyAccessible(posting)) {
      throw new NotFoundException('Published job posting not found');
    }
    return posting;
  }

  async create(input: CreateJobPostingInput) {
    const version = await this.assertVersionCanBackPosting(input.jobDescriptionVersionId);
    const createdById = await this.assertUserExists(input.createdById);
    const title = this.requireText(input.title ?? this.titleFromVersion(version), 'Title');
    const publicSlug = await this.ensureUniqueSlug(
      input.publicSlug ? this.normalizeSlug(input.publicSlug) : await this.createUniqueSlug(title),
    );
    const openAt = this.parseOptionalDate(input.openAt, 'Open at');
    const closeAt = this.parseOptionalDate(input.closeAt, 'Close at');
    this.assertDateWindow(openAt, closeAt);

    const posting = this.jobPostingsRepo.create({
      jobDescriptionId: version.jobDescriptionId,
      jobDescriptionVersionId: version.id,
      title,
      publicSlug,
      status: JobPostingStatus.DRAFT,
      openAt,
      closeAt,
      createdById,
    });

    const savedPosting = await this.jobPostingsRepo.save(posting);
    await this.createPostingQuestionSetSnapshotFromActiveJobDescription(
      savedPosting,
      version,
      createdById,
    );
    return savedPosting;
  }

  async update(id: string, input: UpdateJobPostingInput) {
    const posting = await this.findOne(id);
    this.assertEditable(posting);

    if (input.title !== undefined) {
      posting.title = this.requireText(input.title, 'Title');
    }

    if (input.publicSlug !== undefined) {
      posting.publicSlug = await this.ensureUniqueSlug(
        this.normalizeSlug(input.publicSlug),
        posting.id,
      );
    }

    const nextOpenAt =
      input.openAt === undefined ? posting.openAt : this.parseOptionalDate(input.openAt, 'Open at');
    const nextCloseAt =
      input.closeAt === undefined ? posting.closeAt : this.parseOptionalDate(input.closeAt, 'Close at');
    this.assertDateWindow(nextOpenAt, nextCloseAt);
    posting.openAt = nextOpenAt;
    posting.closeAt = nextCloseAt;

    return this.jobPostingsRepo.save(posting);
  }

  async getPublishReadiness(id: string): Promise<PublishReadiness> {
    const posting = await this.findOne(id);
    return this.evaluatePublishReadiness(posting);
  }

  async ensurePublishReady(id: string) {
    const posting = await this.findOne(id);
    this.assertPublishReady(posting);
    return posting;
  }

  async markPublishing(id: string) {
    const posting = await this.findOne(id);
    this.assertPublishReady(posting);
    posting.status = JobPostingStatus.PUBLISHING;
    if (!posting.openAt) posting.openAt = new Date();
    return this.jobPostingsRepo.save(posting);
  }

  async markPublished(id: string) {
    const posting = await this.findOne(id);
    this.assertPublishReady(posting);
    posting.status = JobPostingStatus.PUBLISHED;
    if (!posting.openAt) posting.openAt = new Date();
    return this.jobPostingsRepo.save(posting);
  }

  async markPublishFailed(id: string) {
    const posting = await this.findOne(id);
    this.assertNotClosed(posting);
    posting.status = JobPostingStatus.PUBLISH_FAILED;
    return this.jobPostingsRepo.save(posting);
  }

  async markManualRequired(id: string) {
    const posting = await this.findOne(id);
    this.assertNotClosed(posting);
    posting.status = JobPostingStatus.MANUAL_REQUIRED;
    return this.jobPostingsRepo.save(posting);
  }

  async close(id: string, closeAt?: DateInput) {
    const posting = await this.findOne(id);
    posting.status = JobPostingStatus.CLOSED;
    posting.closeAt = this.parseOptionalDate(closeAt ?? new Date(), 'Close at');
    return this.jobPostingsRepo.save(posting);
  }

  async remove(id: string) {
    await this.close(id);
    return { closed: true };
  }

  private async assertVersionCanBackPosting(jobDescriptionVersionId: string) {
    const normalizedId = this.requireText(
      jobDescriptionVersionId,
      'Job description version id',
    );
    const version = await this.versionsRepo.findOne({
      where: { id: normalizedId },
      relations: ['jobDescription'],
    });
    if (!version) throw new BadRequestException('Job description version not found');
    if (version.status !== JobDescriptionVersionStatus.ACTIVE) {
      throw new BadRequestException('Only active job description version can be used for posting');
    }
    if (version.jobDescription?.status === JobDescriptionStatus.ARCHIVED) {
      throw new BadRequestException('Archived job description cannot be used for posting');
    }
    return version;
  }

  private async createPostingQuestionSetSnapshotFromActiveJobDescription(
    posting: JobPostingEntity,
    version: JobDescriptionVersionEntity,
    createdById: string,
  ) {
    const sourceSet = await this.questionSetsRepo
      .createQueryBuilder('questionSet')
      .leftJoinAndSelect('questionSet.items', 'item')
      .leftJoinAndSelect('item.question', 'question')
      .where('questionSet.jobDescriptionId = :jobDescriptionId', {
        jobDescriptionId: version.jobDescriptionId,
      })
      .andWhere('questionSet.sourceSystem = :sourceSystem', {
        sourceSystem: VCS_PORTAL_SOURCE_SYSTEM,
      })
      .andWhere('questionSet.status = :status', { status: QuestionSetStatus.ACTIVE })
      .orderBy('questionSet.sourceLastSyncedAt', 'DESC', 'NULLS LAST')
      .addOrderBy('questionSet.updatedAt', 'DESC')
      .addOrderBy('item.orderIndex', 'ASC')
      .getOne();

    const sourceItems = (sourceSet?.items ?? []).sort((left, right) =>
      left.orderIndex - right.orderIndex,
    );
    if (!sourceSet || sourceItems.length === 0) return null;

    const snapshotSet = await this.questionSetsRepo.save(this.questionSetsRepo.create({
      name: `Posting Questionnaire - ${posting.title}`,
      jobDescriptionId: posting.jobDescriptionId,
      jobDescriptionVersionId: posting.jobDescriptionVersionId,
      positionId: version.jobDescription?.positionId ?? null,
      levelId: version.jobDescription?.levelId ?? null,
      status: QuestionSetStatus.ACTIVE,
      createdById,
      sourceSystem: JOB_POSTING_SNAPSHOT_SOURCE_SYSTEM,
      sourceJobId: sourceSet.sourceJobId,
      sourceSnapshotHash: sourceSet.sourceSnapshotHash,
      sourceSnapshot: {
        copiedFromQuestionSetId: sourceSet.id,
        jobPostingId: posting.id,
        questionCount: sourceItems.length,
      },
      sourceLastSyncedAt: new Date(),
    }));

    const snapshotItems = await this.questionSetItemsRepo.save(
      sourceItems.map((item, index) => this.questionSetItemsRepo.create({
        questionSetId: snapshotSet.id,
        questionId: item.questionId,
        questionTextSnapshot: item.questionTextSnapshot,
        questionType: item.questionType,
        orderIndex: index,
        required: item.required,
        metadata: {
          ...(this.isRecord(item.metadata) ? item.metadata : {}),
          copiedFromQuestionSetId: sourceSet.id,
          copiedFromQuestionSetItemId: item.id,
          snapshotForJobPostingId: posting.id,
        },
      })),
    );

    posting.formQuestionSetId = snapshotSet.id;
    posting.formQuestionIds = snapshotItems.map((item) => item.id);
    return this.jobPostingsRepo.save(posting);
  }

  private async assertUserExists(userId: string) {
    const normalizedUserId = this.requireText(userId, 'Created by user id');
    const user = await this.usersRepo.findOne({ where: { id: normalizedUserId } });
    if (!user) throw new BadRequestException('Created by user not found');
    return normalizedUserId;
  }

  private evaluatePublishReadiness(posting: JobPostingEntity): PublishReadiness {
    const reasons: string[] = [];
    const now = new Date();

    if (posting.status === JobPostingStatus.CLOSED) {
      reasons.push('Job posting is closed');
    }
    if (!posting.title?.trim()) {
      reasons.push('Title is required');
    }
    if (!posting.publicSlug?.trim()) {
      reasons.push('Public slug is required');
    }
    if (posting.closeAt && posting.closeAt <= now) {
      reasons.push('Close time must be in the future');
    }
    if (!posting.jobDescriptionVersion) {
      reasons.push('Job description version is required');
    } else {
      if (posting.jobDescriptionVersion.status !== JobDescriptionVersionStatus.ACTIVE) {
        reasons.push('Job description version must be active');
      }
      if (posting.jobDescriptionVersion.jobDescription?.status !== JobDescriptionStatus.ACTIVE) {
        reasons.push('Job description must be active');
      }
    }

    return { ready: reasons.length === 0, reasons };
  }

  private isPubliclyAccessible(posting: JobPostingEntity) {
    const closeAt = posting.closeAt;
    if (posting.status !== JobPostingStatus.PUBLISHED) return false;
    if (closeAt && closeAt <= new Date()) return false;
    if (posting.jobDescriptionVersion?.status !== JobDescriptionVersionStatus.ACTIVE) return false;
    return posting.jobDescriptionVersion.jobDescription?.status === JobDescriptionStatus.ACTIVE;
  }

  private assertPublishReady(posting: JobPostingEntity) {
    const readiness = this.evaluatePublishReadiness(posting);
    if (!readiness.ready) {
      throw new BadRequestException(`Job posting is not publish-ready: ${readiness.reasons.join('; ')}`);
    }
  }

  private assertEditable(posting: JobPostingEntity) {
    if (posting.status === JobPostingStatus.CLOSED) {
      throw new BadRequestException('Closed job posting cannot be edited');
    }
  }

  private assertNotClosed(posting: JobPostingEntity) {
    if (posting.status === JobPostingStatus.CLOSED) {
      throw new BadRequestException('Closed job posting cannot change publish state');
    }
  }

  private assertDateWindow(openAt: Date | null, closeAt: Date | null) {
    if (openAt && closeAt && closeAt <= openAt) {
      throw new BadRequestException('Close time must be after open time');
    }
  }

  private assertValidStatus(status: JobPostingStatus) {
    if (!Object.values(JobPostingStatus).includes(status)) {
      throw new BadRequestException('Invalid job posting status');
    }
  }

  private requireText(value: string, fieldName: string) {
    const normalized = value?.trim();
    if (!normalized) throw new BadRequestException(`${fieldName} is required`);
    return normalized;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private parseOptionalDate(value: DateInput | undefined, fieldName: string) {
    if (value == null) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid date`);
    }
    return date;
  }

  private normalizeSlug(value: string) {
    const slug = value
      ?.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');

    if (!slug) throw new BadRequestException('Public slug is required');
    return slug;
  }

  private async createUniqueSlug(title: string) {
    const baseSlug = this.normalizeSlug(title);
    let slug = baseSlug;
    let suffix = 2;

    while (await this.slugExists(slug)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return slug;
  }

  private async ensureUniqueSlug(publicSlug: string, excludeId?: string) {
    if (await this.slugExists(publicSlug, excludeId)) {
      throw new BadRequestException('Job posting public slug already exists');
    }
    return publicSlug;
  }

  private async slugExists(publicSlug: string, excludeId?: string) {
    const qb = this.jobPostingsRepo
      .createQueryBuilder('posting')
      .where('posting.publicSlug = :publicSlug', { publicSlug });

    if (excludeId) {
      qb.andWhere('posting.id != :excludeId', { excludeId });
    }

    return (await qb.getCount()) > 0;
  }

  private titleFromVersion(version: JobDescriptionVersionEntity) {
    const snapshot = version.snapshot as {
      jobDescription?: {
        title?: unknown;
      };
    };
    const snapshotTitle = snapshot.jobDescription?.title;
    if (typeof snapshotTitle === 'string' && snapshotTitle.trim()) {
      return snapshotTitle;
    }
    return version.jobDescription?.title ?? '';
  }
}
