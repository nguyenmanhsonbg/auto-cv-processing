import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginatedResponse } from '@interview-assistant/shared';
import { Repository } from 'typeorm';
import { UserEntity } from '../auth/entities/user.entity';
import { LevelEntity } from '../levels/entities/level.entity';
import { PositionEntity } from '../positions/entities/position.entity';
import { JobDescriptionStatus } from '../recruitment-common';
import { JobDescriptionEntity } from './entities/job-description.entity';

export interface CreateJobDescriptionInput {
  title: string;
  positionId?: string | null;
  levelId?: string | null;
  description: string;
  overview?: string | null;
  responsibilities?: string | null;
  summary: string;
  requirements: string;
  benefits?: Record<string, unknown> | null;
  salary?: string | null;
  annualLeaveDays?: string | null;
  department?: string | null;
  applicationDeadline?: string | null;
  status?: JobDescriptionStatus;
  createdById: string;
}

export interface UpdateJobDescriptionInput {
  title?: string;
  positionId?: string | null;
  levelId?: string | null;
  description?: string;
  overview?: string | null;
  responsibilities?: string | null;
  summary?: string;
  requirements?: string;
  benefits?: Record<string, unknown> | null;
  salary?: string | null;
  annualLeaveDays?: string | null;
  department?: string | null;
  applicationDeadline?: string | null;
  status?: JobDescriptionStatus;
}

export interface ListJobDescriptionsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: JobDescriptionStatus;
  positionId?: string;
  levelId?: string;
  sourceSystem?: string;
  latestSyncedOnly?: boolean;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

const VCS_PORTAL_SOURCE_SYSTEM = 'VCS_PORTAL';
const VCS_PORTAL_MANAGED_BUSINESS_FIELDS: Array<keyof UpdateJobDescriptionInput> = [
  'title',
  'description',
  'overview',
  'responsibilities',
  'summary',
  'requirements',
  'benefits',
  'salary',
  'annualLeaveDays',
  'department',
  'applicationDeadline',
];

@Injectable()
export class JobDescriptionsService {
  constructor(
    @InjectRepository(JobDescriptionEntity)
    private readonly jobDescriptionsRepo: Repository<JobDescriptionEntity>,
    @InjectRepository(PositionEntity)
    private readonly positionsRepo: Repository<PositionEntity>,
    @InjectRepository(LevelEntity)
    private readonly levelsRepo: Repository<LevelEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
  ) {}

  findAll() {
    return this.jobDescriptionsRepo.find({
      relations: ['position', 'level', 'createdBy', 'sourceCategories'],
      order: { createdAt: 'DESC' },
    });
  }

  async findPaginated(
    params: ListJobDescriptionsParams,
  ): Promise<PaginatedResponse<JobDescriptionEntity>> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;
    const sortOrder = params.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const allowedSorts: Record<string, string> = {
      title: 'jd.title',
      status: 'jd.status',
      createdAt: 'jd.createdAt',
      updatedAt: 'jd.updatedAt',
      lastSyncedAt: 'jd.lastSyncedAt',
    };
    const sortCol = allowedSorts[params.sortBy ?? ''] ?? 'jd.createdAt';

    const qb = this.jobDescriptionsRepo
      .createQueryBuilder('jd')
      .leftJoinAndSelect('jd.position', 'position')
      .leftJoinAndSelect('jd.level', 'level')
      .leftJoinAndSelect('jd.createdBy', 'createdBy')
      .leftJoinAndSelect('jd.sourceCategories', 'sourceCategories')
      .orderBy(sortCol, sortOrder);

    const search = params.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          jd.title ILIKE :search
          OR jd.summary ILIKE :search
          OR jd.description ILIKE :search
          OR jd.overview ILIKE :search
          OR jd.responsibilities ILIKE :search
          OR jd.requirements ILIKE :search
          OR jd.salary ILIKE :search
          OR jd.annual_leave_days ILIKE :search
          OR jd.department ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    if (params.status !== undefined) {
      this.assertValidStatus(params.status);
      qb.andWhere('jd.status = :status', { status: params.status });
    }

    if (params.positionId) {
      qb.andWhere('jd.positionId = :positionId', { positionId: params.positionId });
    }

    if (params.levelId) {
      qb.andWhere('jd.levelId = :levelId', { levelId: params.levelId });
    }

    const sourceSystem = params.sourceSystem?.trim();
    if (sourceSystem) {
      qb.andWhere('jd.sourceSystem = :sourceSystem', { sourceSystem });
    }

    if (params.latestSyncedOnly) {
      const latestSyncConditions = ['latest_jd.last_synced_at IS NOT NULL'];
      if (sourceSystem) {
        latestSyncConditions.push('latest_jd.source_system = :sourceSystem');
      }
      if (params.status !== undefined) {
        latestSyncConditions.push('latest_jd.status = :status');
      }
      qb.andWhere(`jd.lastSyncedAt = (
        SELECT MAX(latest_jd.last_synced_at)
        FROM job_descriptions latest_jd
        WHERE ${latestSyncConditions.join(' AND ')}
      )`);
    }

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const jobDescription = await this.jobDescriptionsRepo.findOne({
      where: { id },
      relations: ['position', 'level', 'createdBy', 'sourceCategories'],
    });
    if (!jobDescription) throw new BadRequestException('Job description not found');
    return jobDescription;
  }

  async create(input: CreateJobDescriptionInput) {
    const title = this.requireText(input.title, 'Title');
    const description = this.requireText(input.description, 'Description');
    const summary = this.requireText(input.summary, 'Summary', 500);
    const createdById = await this.assertUserExists(input.createdById);
    await this.assertPositionExists(input.positionId);
    await this.assertLevelExists(input.levelId);
    if (input.status !== undefined) this.assertValidStatus(input.status);

    const jobDescription = this.jobDescriptionsRepo.create({
      title,
      positionId: input.positionId ?? null,
      levelId: input.levelId ?? null,
      description,
      overview: this.optionalText(input.overview, 'Overview'),
      responsibilities: this.optionalText(input.responsibilities, 'Responsibilities'),
      summary,
      requirements: this.requireText(input.requirements, 'Requirements'),
      benefits: this.optionalJsonObject(input.benefits, 'Benefits'),
      salary: this.optionalText(input.salary, 'Salary'),
      annualLeaveDays: this.optionalText(input.annualLeaveDays, 'Annual leave days'),
      department: this.optionalText(input.department, 'Department'),
      applicationDeadline: this.optionalDate(input.applicationDeadline, 'Application deadline'),
      status: input.status ?? JobDescriptionStatus.DRAFT,
      createdById,
    });

    return this.jobDescriptionsRepo.save(jobDescription);
  }

  async update(id: string, input: UpdateJobDescriptionInput) {
    const jobDescription = await this.findOne(id);
    this.assertPortalManagedFieldsAreNotEdited(jobDescription, input);

    if (input.title !== undefined) {
      jobDescription.title = this.requireText(input.title, 'Title');
    }

    if (input.positionId !== undefined) {
      await this.assertPositionExists(input.positionId);
      jobDescription.positionId = input.positionId ?? null;
    }

    if (input.levelId !== undefined) {
      await this.assertLevelExists(input.levelId);
      jobDescription.levelId = input.levelId ?? null;
    }

    if (input.description !== undefined) {
      jobDescription.description = this.requireText(input.description, 'Description');
    }

    if (input.overview !== undefined) {
      jobDescription.overview = this.optionalText(input.overview, 'Overview');
    }

    if (input.responsibilities !== undefined) {
      jobDescription.responsibilities = this.optionalText(input.responsibilities, 'Responsibilities');
    }

    if (input.summary !== undefined) {
      jobDescription.summary = this.requireText(input.summary, 'Summary', 500);
    }

    if (input.requirements !== undefined) {
      jobDescription.requirements = this.requireText(input.requirements, 'Requirements');
    }

    if (input.benefits !== undefined) {
      jobDescription.benefits = this.optionalJsonObject(input.benefits, 'Benefits');
    }

    if (input.salary !== undefined) {
      jobDescription.salary = this.optionalText(input.salary, 'Salary');
    }

    if (input.annualLeaveDays !== undefined) {
      jobDescription.annualLeaveDays = this.optionalText(input.annualLeaveDays, 'Annual leave days');
    }

    if (input.department !== undefined) {
      jobDescription.department = this.optionalText(input.department, 'Department');
    }

    if (input.applicationDeadline !== undefined) {
      jobDescription.applicationDeadline = this.optionalDate(
        input.applicationDeadline,
        'Application deadline',
      );
    }

    if (input.status !== undefined) {
      this.assertValidStatus(input.status);
      jobDescription.status = input.status;
    }

    return this.jobDescriptionsRepo.save(jobDescription);
  }

  async archive(id: string) {
    const jobDescription = await this.findOne(id);
    jobDescription.status = JobDescriptionStatus.ARCHIVED;
    return this.jobDescriptionsRepo.save(jobDescription);
  }

  async remove(id: string) {
    await this.archive(id);
    return { archived: true };
  }

  private requireText(value: string, fieldName: string, maxLength?: number) {
    const normalized = value?.trim();
    if (!normalized) throw new BadRequestException(`${fieldName} is required`);
    if (maxLength !== undefined && normalized.length > maxLength) {
      throw new BadRequestException(`${fieldName} must be at most ${maxLength} characters`);
    }
    return normalized;
  }

  private optionalJsonObject(
    value: Record<string, unknown> | null | undefined,
    fieldName: string,
  ) {
    if (value == null) return null;
    if (!this.isJsonObject(value)) {
      throw new BadRequestException(`${fieldName} must be a JSON object`);
    }
    return value;
  }

  private optionalText(value: string | null | undefined, fieldName: string) {
    if (value == null) return null;
    if (typeof value !== 'string') {
      throw new BadRequestException(`${fieldName} must be text`);
    }
    return value.trim() || null;
  }

  private optionalDate(value: string | null | undefined, fieldName: string) {
    if (value == null || value === '') return null;
    if (typeof value !== 'string') {
      throw new BadRequestException(`${fieldName} must be a date string`);
    }

    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid date`);
    }
    return date.toISOString().slice(0, 10);
  }

  private isJsonObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private assertPortalManagedFieldsAreNotEdited(
    jobDescription: JobDescriptionEntity,
    input: UpdateJobDescriptionInput,
  ) {
    if (jobDescription.sourceSystem !== VCS_PORTAL_SOURCE_SYSTEM) return;

    const editedFields = VCS_PORTAL_MANAGED_BUSINESS_FIELDS.filter((fieldName) =>
      input[fieldName] !== undefined,
    );
    if (editedFields.length === 0) return;

    throw new BadRequestException({
      code: 'VCS_PORTAL_JD_LOCAL_EDIT_BLOCKED',
      message: 'VCS Portal job descriptions cannot be edited locally for source-managed business fields.',
      details: { fields: editedFields },
    });
  }

  private assertValidStatus(status: JobDescriptionStatus) {
    if (!Object.values(JobDescriptionStatus).includes(status)) {
      throw new BadRequestException('Invalid job description status');
    }
  }

  private async assertUserExists(userId: string) {
    const normalizedUserId = this.requireText(userId, 'Created by user id');
    const user = await this.usersRepo.findOne({ where: { id: normalizedUserId } });
    if (!user) throw new BadRequestException('Created by user not found');
    return normalizedUserId;
  }

  private async assertPositionExists(positionId?: string | null) {
    if (positionId == null) return;
    const position = await this.positionsRepo.findOne({ where: { id: positionId } });
    if (!position) throw new BadRequestException('Position not found');
  }

  private async assertLevelExists(levelId?: string | null) {
    if (levelId == null) return;
    const level = await this.levelsRepo.findOne({ where: { id: levelId } });
    if (!level) throw new BadRequestException('Level not found');
  }
}
