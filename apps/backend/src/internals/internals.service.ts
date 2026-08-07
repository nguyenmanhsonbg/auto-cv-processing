import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { ApplicationReferralEntity } from '../freelancers/entities/application-referral.entity';
import { ApplicationReferralSourceType } from './internals.types';
import { InternalEntity } from './entities/internal.entity';
import {
  CreateInternalInput,
  InternalApplicationSummary,
  InternalSummary,
  ListInternalApplicationsParams,
  ListInternalsParams,
} from './internals.types';
import { normalizeInternalEmail } from './internal-email.util';

@Injectable()
export class InternalsService {
  constructor(
    @InjectRepository(InternalEntity)
    private readonly internalsRepo: Repository<InternalEntity>,
    @InjectRepository(ApplicationReferralEntity)
    private readonly referralsRepo: Repository<ApplicationReferralEntity>,
  ) {}

  async create(input: CreateInternalInput): Promise<InternalSummary> {
    const email = normalizeInternalEmail(input.email);
    const existing = await this.internalsRepo.findOne({ where: { email } });
    if (existing) throw this.emailExistsError();

    try {
      const internal = await this.internalsRepo.save(
      this.internalsRepo.create({
        email,
        name: input.name?.trim() || null,
        phone: input.phone?.trim() || null,
        isActive: true,
          createdById: input.createdById ?? null,
        }),
      );
      return this.findOne(internal.id);
    } catch (error) {
      if (this.isUniqueViolation(error)) throw this.emailExistsError();
      throw error;
    }
  }

  async findPaginated(params: ListInternalsParams) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const sortOrder = params.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const allowedSorts: Record<string, string> = {
      email: 'internal.email',
      createdAt: 'internal.createdAt',
      updatedAt: 'internal.updatedAt',
    };
    const sortColumn = allowedSorts[params.sortBy ?? ''] ?? 'internal.createdAt';
    const qb = this.buildSummaryQuery()
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('internal.id', sortOrder)
      .skip((page - 1) * limit)
      .take(limit);

    const search = this.optionalText(params.search);
    if (search) {
      qb.andWhere("(internal.email ILIKE :search ESCAPE E'\\\\' OR internal.name ILIKE :search ESCAPE E'\\\\' OR internal.phone ILIKE :search ESCAPE E'\\\\')", {
        search: `%${escapeLikePattern(search)}%`,
      });
    }
    if (params.status === 'ACTIVE') qb.andWhere('internal.isActive = :isActive', { isActive: true });
    if (params.status === 'INACTIVE') qb.andWhere('internal.isActive = :isActive', { isActive: false });

    const [data, total] = await qb.getManyAndCount();
    return {
      data: data.map((internal) => this.toSummary(internal)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<InternalSummary> {
    const internal = await this.buildSummaryQuery()
      .where('internal.id = :internalId', { internalId: this.requireText(id, 'Internal id') })
      .getOne();
    if (!internal) throw this.internalNotFoundError();
    return this.toSummary(internal);
  }

  async updateStatus(id: string, isActive: boolean): Promise<InternalSummary> {
    const internal = await this.internalsRepo.findOne({
      where: { id: this.requireText(id, 'Internal id') },
    });
    if (!internal) throw this.internalNotFoundError();
    const updateResult = await this.internalsRepo.update(
      { id: internal.id, isActive: !isActive },
      { isActive },
    );
    if (!updateResult.affected) {
      throw new BadRequestException({
        code: isActive ? 'INTERNAL_ALREADY_ACTIVE' : 'INTERNAL_ALREADY_INACTIVE',
        message: isActive ? 'Nhân sự đã được mở khoá.' : 'Nhân sự đã bị khoá.',
      });
    }
    return this.findOne(internal.id);
  }

  async findApplications(id: string, params: ListInternalApplicationsParams) {
    const internalId = this.requireText(id, 'Internal id');
    const exists = await this.internalsRepo.exist({ where: { id: internalId } });
    if (!exists) throw this.internalNotFoundError();

    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const sortOrder = params.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const qb = this.referralsRepo
      .createQueryBuilder('referral')
      .innerJoinAndSelect('referral.application', 'application')
      .innerJoinAndSelect('application.candidate', 'candidate')
      .leftJoinAndSelect('candidate.assignees', 'assignee')
      .innerJoinAndSelect('application.jobPosting', 'jobPosting')
      .where('referral.internalId = :internalId', { internalId })
      .andWhere('referral.sourceType = :sourceType', {
        sourceType: ApplicationReferralSourceType.INTERNAL,
      })
      .orderBy('referral.createdAt', sortOrder)
      .addOrderBy('referral.id', sortOrder)
      .skip((page - 1) * limit)
      .take(limit);

    const search = this.optionalText(params.search);
    if (search) {
      qb.andWhere("(candidate.name ILIKE :search ESCAPE E'\\\\' OR jobPosting.title ILIKE :search ESCAPE E'\\\\')", {
        search: `%${escapeLikePattern(search)}%`,
      });
    }
    if (params.processStatus) qb.andWhere('application.status = :processStatus', {
      processStatus: params.processStatus,
    });
    if (params.hrReceptionStatus) qb.andWhere('application.hrReviewStatus = :hrReceptionStatus', {
      hrReceptionStatus: params.hrReceptionStatus,
    });

    const [data, total] = await qb.getManyAndCount();
    return {
      data: data.map((referral) => this.toApplicationSummary(referral)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async resolveOrCreateActiveByEmail(
    value: string,
    manager?: EntityManager,
    createdById?: string | null,
  ): Promise<InternalEntity> {
    const email = normalizeInternalEmail(value);
    const repo = manager?.getRepository(InternalEntity) ?? this.internalsRepo;
    const existing = await repo.findOne({ where: { email } });
    if (existing) {
      if (!existing.isActive) throw this.invalidInternalEmailError();
      return existing;
    }

    try {
      return await repo.save(repo.create({
        email,
        isActive: true,
        createdById: createdById ?? null,
      }));
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      const concurrent = await repo.findOne({ where: { email } });
      if (concurrent?.isActive) return concurrent;
      throw this.invalidInternalEmailError();
    }
  }

  private buildSummaryQuery() {
    return this.internalsRepo
      .createQueryBuilder('internal')
      .leftJoinAndSelect('internal.createdBy', 'createdBy')
      .loadRelationCountAndMap('internal.applicationCount', 'internal.referrals');
  }

  private toSummary(internal: InternalEntity): InternalSummary {
    return {
      internalId: internal.id,
      name: internal.name,
      email: internal.email,
      phone: internal.phone,
      isActive: internal.isActive,
      applicationCount: this.extractApplicationCount(internal),
      createdBy: internal.createdBy
        ? {
          userId: internal.createdBy.id,
          name: internal.createdBy.name,
          email: internal.createdBy.email,
        }
        : null,
      createdAt: internal.createdAt,
      updatedAt: internal.updatedAt,
    };
  }

  private toApplicationSummary(referral: ApplicationReferralEntity): InternalApplicationSummary {
    const application = referral.application;
    if (!application?.candidate || !application.jobPosting) {
      throw new BadRequestException({
        code: 'INTERNAL_APPLICATION_INCOMPLETE',
        message: 'Internal application data is incomplete.',
      });
    }

    return {
      referralId: referral.id,
      applicationId: referral.applicationId,
      candidate: {
        candidateId: application.candidateId,
        fullName: application.candidate.name,
      },
      jobPosting: {
        jobPostingId: application.jobPostingId,
        title: application.jobPosting.title,
      },
      processStatus: application.status,
      hrReceptionStatus: application.hrReviewStatus,
      evaluation: referral.evaluation,
      appliedAt: referral.createdAt,
      assignees: (application.candidate.assignees ?? []).map((assignee) => ({
        userId: assignee.id,
        name: assignee.name,
        email: assignee.email,
      })),
      createdAt: referral.createdAt,
      updatedAt: referral.updatedAt,
    };
  }

  private extractApplicationCount(internal: InternalEntity) {
    const count = (internal as InternalEntity & { applicationCount?: number }).applicationCount;
    if (typeof count === 'number') return count;
    const numericCount = Number(count ?? 0);
    return Number.isFinite(numericCount) ? numericCount : 0;
  }

  private emailExistsError() {
    return new BadRequestException({
      code: 'INTERNAL_EMAIL_EXISTS',
      message: 'An Internal with this email already exists.',
    });
  }

  private internalNotFoundError() {
    return new BadRequestException({
      code: 'INTERNAL_NOT_FOUND',
      message: 'Internal not found.',
    });
  }

  private invalidInternalEmailError() {
    return new BadRequestException({
      code: 'INVALID_INTERNAL_EMAIL',
      message: 'Internal email is inactive or unavailable.',
    });
  }

  private isUniqueViolation(error: unknown) {
    if (!error || typeof error !== 'object') return false;
    const driverError = (error as { driverError?: { code?: string; constraint?: string } }).driverError;
    return driverError?.code === '23505' && (driverError.constraint ?? '').toLowerCase().includes('email');
  }

  private requireText(value: string, fieldName: string) {
    const normalized = value?.trim();
    if (!normalized) throw new BadRequestException(`${fieldName} is required`);
    return normalized;
  }

  private optionalText(value?: string | null) {
    const normalized = value?.trim();
    return normalized || null;
  }
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, '\\$&');
}
