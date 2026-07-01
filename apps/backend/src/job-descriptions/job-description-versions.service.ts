import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { UserRole } from '@interview-assistant/shared';
import { UserEntity } from '../auth/entities/user.entity';
import { JobDescriptionVersionStatus } from '../recruitment-common';
import { JobDescriptionEntity } from './entities/job-description.entity';
import { JobDescriptionVersionEntity } from './entities/job-description-version.entity';

type CreatableVersionStatus =
  | JobDescriptionVersionStatus.ACTIVE
  | JobDescriptionVersionStatus.DRAFT;

interface JobDescriptionSnapshot extends Record<string, unknown> {
  schemaVersion: 1;
  snapshottedAt: string;
  jobDescription: {
    id: string;
    title: string;
    positionId: string | null;
    levelId: string | null;
    description: string;
    summary: string;
    requirements: Record<string, unknown>;
    benefits: Record<string, unknown> | null;
    status: string;
    createdById: string;
    createdAt: string | null;
    updatedAt: string | null;
  };
  position: {
    id: string;
    name: string;
    description: string | null;
  } | null;
  level: {
    id: string;
    name: string;
    displayName: string;
    orderIndex: number;
  } | null;
  createdBy: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  } | null;
}

export interface CreateJobDescriptionVersionInput {
  jobDescriptionId: string;
  createdById: string;
  status?: CreatableVersionStatus;
}

@Injectable()
export class JobDescriptionVersionsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(JobDescriptionVersionEntity)
    private readonly versionsRepo: Repository<JobDescriptionVersionEntity>,
  ) {}

  findByJobDescription(jobDescriptionId: string) {
    const normalizedJobDescriptionId = this.requireText(jobDescriptionId, 'Job description id');
    return this.versionsRepo.find({
      where: { jobDescriptionId: normalizedJobDescriptionId },
      relations: ['createdBy'],
      order: { versionNo: 'DESC' },
    });
  }

  async findLatest(jobDescriptionId: string) {
    const normalizedJobDescriptionId = this.requireText(jobDescriptionId, 'Job description id');
    return this.versionsRepo.findOne({
      where: { jobDescriptionId: normalizedJobDescriptionId },
      relations: ['createdBy'],
      order: { versionNo: 'DESC' },
    });
  }

  async findActive(jobDescriptionId: string) {
    const normalizedJobDescriptionId = this.requireText(jobDescriptionId, 'Job description id');
    return this.versionsRepo.findOne({
      where: {
        jobDescriptionId: normalizedJobDescriptionId,
        status: JobDescriptionVersionStatus.ACTIVE,
      },
      relations: ['createdBy'],
      order: { versionNo: 'DESC' },
    });
  }

  async findOne(id: string) {
    const normalizedId = this.requireText(id, 'Job description version id');
    const version = await this.versionsRepo.findOne({
      where: { id: normalizedId },
      relations: ['jobDescription', 'createdBy'],
    });
    if (!version) throw new BadRequestException('Job description version not found');
    return version;
  }

  async createFromCurrentJobDescription(input: CreateJobDescriptionVersionInput) {
    const status = input.status ?? JobDescriptionVersionStatus.ACTIVE;
    const jobDescriptionId = this.requireText(input.jobDescriptionId, 'Job description id');
    this.assertCreatableStatus(status);

    return this.dataSource.transaction(async (manager) => {
      await this.lockJobDescriptionVersionSeries(manager, jobDescriptionId);

      const jobDescription = await this.findJobDescriptionForSnapshot(
        manager,
        jobDescriptionId,
      );
      const createdById = await this.assertUserExists(manager, input.createdById);
      const versionNo = await this.getNextVersionNo(manager, jobDescriptionId);

      if (status === JobDescriptionVersionStatus.ACTIVE) {
        await this.supersedeActiveVersions(manager, jobDescriptionId);
      }

      const version = manager.getRepository(JobDescriptionVersionEntity).create({
        jobDescriptionId: jobDescription.id,
        versionNo,
        snapshot: this.buildSnapshot(jobDescription),
        status,
        createdById,
      });

      return manager.getRepository(JobDescriptionVersionEntity).save(version);
    });
  }

  async activate(id: string) {
    const normalizedId = this.requireText(id, 'Job description version id');
    return this.dataSource.transaction(async (manager) => {
      const version = await manager.getRepository(JobDescriptionVersionEntity).findOne({
        where: { id: normalizedId },
      });
      if (!version) throw new BadRequestException('Job description version not found');
      if (version.status === JobDescriptionVersionStatus.ARCHIVED) {
        throw new BadRequestException('Archived job description version cannot be activated');
      }

      await this.lockJobDescriptionVersionSeries(manager, version.jobDescriptionId);
      await this.supersedeActiveVersions(manager, version.jobDescriptionId);
      version.status = JobDescriptionVersionStatus.ACTIVE;
      return manager.getRepository(JobDescriptionVersionEntity).save(version);
    });
  }

  async supersede(id: string) {
    const version = await this.findOne(id);
    if (version.status === JobDescriptionVersionStatus.ARCHIVED) {
      throw new BadRequestException('Archived job description version cannot be superseded');
    }

    version.status = JobDescriptionVersionStatus.SUPERSEDED;
    return this.versionsRepo.save(version);
  }

  async archive(id: string) {
    const version = await this.findOne(id);
    version.status = JobDescriptionVersionStatus.ARCHIVED;
    return this.versionsRepo.save(version);
  }

  private async findJobDescriptionForSnapshot(
    manager: EntityManager,
    jobDescriptionId: string,
  ) {
    const jobDescription = await manager.getRepository(JobDescriptionEntity).findOne({
      where: { id: jobDescriptionId },
      relations: ['position', 'level', 'createdBy'],
    });
    if (!jobDescription) throw new BadRequestException('Job description not found');
    return jobDescription;
  }

  private async getNextVersionNo(manager: EntityManager, jobDescriptionId: string) {
    const latest = await manager
      .getRepository(JobDescriptionVersionEntity)
      .createQueryBuilder('version')
      .where('version.jobDescriptionId = :jobDescriptionId', { jobDescriptionId })
      .orderBy('version.versionNo', 'DESC')
      .getOne();

    return (latest?.versionNo ?? 0) + 1;
  }

  private async supersedeActiveVersions(
    manager: EntityManager,
    jobDescriptionId: string,
  ) {
    await manager.getRepository(JobDescriptionVersionEntity).update(
      { jobDescriptionId, status: JobDescriptionVersionStatus.ACTIVE },
      { status: JobDescriptionVersionStatus.SUPERSEDED },
    );
  }

  private async assertUserExists(manager: EntityManager, userId: string) {
    const normalizedUserId = this.requireText(userId, 'Created by user id');
    const user = await manager.getRepository(UserEntity).findOne({
      where: { id: normalizedUserId },
    });
    if (!user) throw new BadRequestException('Created by user not found');
    return normalizedUserId;
  }

  private assertCreatableStatus(status: JobDescriptionVersionStatus) {
    if (
      status !== JobDescriptionVersionStatus.ACTIVE
      && status !== JobDescriptionVersionStatus.DRAFT
    ) {
      throw new BadRequestException('Job description version can only be created as ACTIVE or DRAFT');
    }
  }

  private requireText(value: string, fieldName: string) {
    const normalized = value?.trim();
    if (!normalized) throw new BadRequestException(`${fieldName} is required`);
    return normalized;
  }

  private buildSnapshot(jobDescription: JobDescriptionEntity): JobDescriptionSnapshot {
    return {
      schemaVersion: 1,
      snapshottedAt: new Date().toISOString(),
      jobDescription: {
        id: jobDescription.id,
        title: jobDescription.title,
        positionId: jobDescription.positionId,
        levelId: jobDescription.levelId,
        description: jobDescription.description,
        summary: jobDescription.summary,
        requirements: jobDescription.requirements,
        benefits: jobDescription.benefits,
        status: jobDescription.status,
        createdById: jobDescription.createdById,
        createdAt: jobDescription.createdAt?.toISOString() ?? null,
        updatedAt: jobDescription.updatedAt?.toISOString() ?? null,
      },
      position: jobDescription.position
        ? {
            id: jobDescription.position.id,
            name: jobDescription.position.name,
            description: jobDescription.position.description,
          }
        : null,
      level: jobDescription.level
        ? {
            id: jobDescription.level.id,
            name: jobDescription.level.name,
            displayName: jobDescription.level.displayName,
            orderIndex: jobDescription.level.orderIndex,
          }
        : null,
      createdBy: jobDescription.createdBy
        ? {
            id: jobDescription.createdBy.id,
            email: jobDescription.createdBy.email,
            name: jobDescription.createdBy.name,
            role: jobDescription.createdBy.role,
          }
        : null,
    };
  }

  private lockJobDescriptionVersionSeries(
    manager: EntityManager,
    jobDescriptionId: string,
  ) {
    return manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `job-description-version:${jobDescriptionId}`,
    ]);
  }
}
