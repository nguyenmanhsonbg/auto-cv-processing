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
  requirements: Record<string, unknown>;
  benefits?: Record<string, unknown> | null;
  status?: JobDescriptionStatus;
  createdById: string;
}

export interface UpdateJobDescriptionInput {
  title?: string;
  positionId?: string | null;
  levelId?: string | null;
  description?: string;
  requirements?: Record<string, unknown>;
  benefits?: Record<string, unknown> | null;
  status?: JobDescriptionStatus;
}

export interface ListJobDescriptionsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: JobDescriptionStatus;
  positionId?: string;
  levelId?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

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
      relations: ['position', 'level', 'createdBy'],
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
    };
    const sortCol = allowedSorts[params.sortBy ?? ''] ?? 'jd.createdAt';

    const qb = this.jobDescriptionsRepo
      .createQueryBuilder('jd')
      .leftJoinAndSelect('jd.position', 'position')
      .leftJoinAndSelect('jd.level', 'level')
      .leftJoinAndSelect('jd.createdBy', 'createdBy')
      .orderBy(sortCol, sortOrder);

    const search = params.search?.trim();
    if (search) {
      qb.andWhere('(jd.title ILIKE :search OR jd.description ILIKE :search)', {
        search: `%${search}%`,
      });
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

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const jobDescription = await this.jobDescriptionsRepo.findOne({
      where: { id },
      relations: ['position', 'level', 'createdBy'],
    });
    if (!jobDescription) throw new BadRequestException('Job description not found');
    return jobDescription;
  }

  async create(input: CreateJobDescriptionInput) {
    const title = this.requireText(input.title, 'Title');
    const description = this.requireText(input.description, 'Description');
    const createdById = await this.assertUserExists(input.createdById);
    await this.assertPositionExists(input.positionId);
    await this.assertLevelExists(input.levelId);
    if (input.status !== undefined) this.assertValidStatus(input.status);

    const jobDescription = this.jobDescriptionsRepo.create({
      title,
      positionId: input.positionId ?? null,
      levelId: input.levelId ?? null,
      description,
      requirements: this.requireJsonObject(input.requirements, 'Requirements'),
      benefits: this.optionalJsonObject(input.benefits, 'Benefits'),
      status: input.status ?? JobDescriptionStatus.DRAFT,
      createdById,
    });

    return this.jobDescriptionsRepo.save(jobDescription);
  }

  async update(id: string, input: UpdateJobDescriptionInput) {
    const jobDescription = await this.findOne(id);

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

    if (input.requirements !== undefined) {
      jobDescription.requirements = this.requireJsonObject(input.requirements, 'Requirements');
    }

    if (input.benefits !== undefined) {
      jobDescription.benefits = this.optionalJsonObject(input.benefits, 'Benefits');
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

  private requireText(value: string, fieldName: string) {
    const normalized = value?.trim();
    if (!normalized) throw new BadRequestException(`${fieldName} is required`);
    return normalized;
  }

  private requireJsonObject(value: Record<string, unknown>, fieldName: string) {
    if (!this.isJsonObject(value)) {
      throw new BadRequestException(`${fieldName} must be a JSON object`);
    }
    return value;
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

  private isJsonObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
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
