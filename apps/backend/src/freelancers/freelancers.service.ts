import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginatedResponse, UserRole } from '@interview-assistant/shared';
import * as bcrypt from 'bcryptjs';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { UserEntity } from '../auth/entities/user.entity';
import {
  CleanCvFileAccessResult,
  CvDocumentsService,
} from '../cv-documents/cv-documents.service';
import { ApplicationStatus, HrReviewDecisionType } from '../recruitment-common';
import { InternalEntity } from '../internals/entities/internal.entity';
import { ApplicationReferralSourceType } from '../internals/internals.types';
import { FreelancerStatusFilter } from './dto/list-freelancers-query.dto';
import { ApplicationReferralEntity } from './entities/application-referral.entity';
import { FreelancerIdentifierCounterEntity } from './entities/freelancer-identifier-counter.entity';
import { FreelancerEntity } from './entities/freelancer.entity';
import { normalizeFreelancerPhone } from '../extension-integration/referral-source-summary.util';

export interface CreateFreelancerInput {
  name: string;
  email: string;
  phone?: string | null;
  createdById: string;
}

export interface ListFreelancersParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: FreelancerStatusFilter;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface ListFreelancerApplicationsParams {
  page?: number;
  limit?: number;
  search?: string;
  processStatus?: ApplicationStatus;
  hrReceptionStatus?: HrReviewDecisionType;
  sortOrder?: 'ASC' | 'DESC';
}

export interface CreateReferralInput {
  applicationId: string;
  freelancerId?: string | null;
  internalId?: string | null;
}

export interface UpdateFreelancerApplicationEvaluationInput {
  referralId: string;
  evaluation: string | null;
}

export interface FreelancerUserSummary {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface FreelancerSummary {
  freelancerId: string;
  identifier: string;
  phone: string | null;
  isActive: boolean;
  applicationCount: number;
  user: FreelancerUserSummary;
  createdBy: Omit<FreelancerUserSummary, 'role'> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FreelancerCreateResult extends FreelancerSummary {
  initialPassword: string;
}

export interface FreelancerApplicationSummary {
  referralId: string;
  applicationId: string;
  candidate: {
    candidateId: string;
    fullName: string;
  };
  jobPosting: {
    jobPostingId: string;
    title: string;
  };
  processStatus: ApplicationStatus;
  hrReceptionStatus: HrReviewDecisionType | null;
  evaluation: string | null;
  appliedAt: Date;
  assignees: Array<{
    userId: string;
    name: string;
    email: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class FreelancersService {
  private static readonly IDENTIFIER_COUNTER_ID = 1;
  private static readonly IDENTIFIER_MAX = 999_999;

  constructor(
    private readonly dataSource: DataSource,
    private readonly cvDocumentsService: CvDocumentsService,
    @InjectRepository(FreelancerEntity)
    private readonly freelancersRepo: Repository<FreelancerEntity>,
    @InjectRepository(FreelancerIdentifierCounterEntity)
    private readonly countersRepo: Repository<FreelancerIdentifierCounterEntity>,
    @InjectRepository(ApplicationReferralEntity)
    private readonly referralsRepo: Repository<ApplicationReferralEntity>,
    @InjectRepository(ApplicationEntity)
    private readonly applicationsRepo: Repository<ApplicationEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(InternalEntity)
    private readonly internalsRepo: Repository<InternalEntity>,
  ) {}

  async create(input: CreateFreelancerInput): Promise<FreelancerCreateResult> {
    const name = this.requireText(input.name, 'Freelancer name');
    const email = this.requireText(input.email, 'Freelancer email');
    const phone = normalizeFreelancerPhone(input.phone);
    const createdById = this.requireText(input.createdById, 'Created by user id');

    try {
      return await this.dataSource.transaction(async (manager) => {
        const usersRepo = manager.getRepository(UserEntity);
        const freelancersRepo = manager.getRepository(FreelancerEntity);
        const countersRepo = manager.getRepository(FreelancerIdentifierCounterEntity);

        const counter = await this.resolveIdentifierCounterForUpdate(manager);

        const createdBy = await usersRepo.findOne({ where: { id: createdById } });
        if (!createdBy) throw new BadRequestException('Created by user not found');

        const existingUser = await usersRepo.findOne({ where: { email } });
        if (existingUser) {
          const existingFreelancer = await freelancersRepo.findOne({
            where: { userId: existingUser.id },
          });
          if (existingFreelancer && !existingFreelancer.isActive) {
            existingUser.name = name;
            existingUser.password = await bcrypt.hash(existingFreelancer.identifier, 10);
            await usersRepo.save(existingUser);

            existingFreelancer.phone = phone;
            existingFreelancer.isActive = true;
            await freelancersRepo.save(existingFreelancer);

            const restoredFreelancer = await freelancersRepo.findOne({
              where: { id: existingFreelancer.id },
              relations: { user: true, createdBy: true },
            });
            if (!restoredFreelancer) throw this.freelancerNotFoundError();

            return {
              ...this.toFreelancerSummary(restoredFreelancer),
              initialPassword: restoredFreelancer.identifier,
            };
          }
          throw this.duplicateEmailError();
        }

        const nextNumber = counter.lastIssuedNumber + 1;
        if (nextNumber > FreelancersService.IDENTIFIER_MAX) {
          throw new BadRequestException({
            code: 'FREELANCER_IDENTIFIER_LIMIT_REACHED',
            message: 'Freelancer identifier limit has been reached.',
          });
        }

        counter.lastIssuedNumber = nextNumber;
        await countersRepo.save(counter);
        const identifier = this.toFreelancerIdentifier(counter.lastIssuedNumber);
        const password = await bcrypt.hash(identifier, 10);
        const user = await usersRepo.save(
          usersRepo.create({
            email,
            name,
            password,
            role: UserRole.FREELANCER,
          }),
        );

        const freelancer = await freelancersRepo.save(
          freelancersRepo.create({
            userId: user.id,
            identifier,
            phone,
            isActive: true,
            createdById: createdBy.id,
          }),
        );

        const savedFreelancer = await freelancersRepo.findOne({
          where: { id: freelancer.id },
          relations: { user: true, createdBy: true },
        });
        if (!savedFreelancer) throw this.freelancerNotFoundError();

        return {
          ...this.toFreelancerSummary(savedFreelancer),
          initialPassword: identifier,
        };
      });
    } catch (error) {
      if (this.isUserEmailUniqueViolation(error)) {
        throw this.duplicateEmailError();
      }
      throw error;
    }
  }

  async findPaginated(
    params: ListFreelancersParams,
  ): Promise<PaginatedResponse<FreelancerSummary>> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;
    const sortOrder = params.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const allowedSorts: Record<string, string> = {
      identifier: 'freelancer.identifier',
      name: 'user.name',
      email: 'user.email',
      createdAt: 'freelancer.createdAt',
      updatedAt: 'freelancer.updatedAt',
    };
    const sortCol = allowedSorts[params.sortBy ?? ''] ?? 'freelancer.createdAt';

    const qb = this.buildFreelancerSummaryQuery()
      .orderBy(sortCol, sortOrder)
      .addOrderBy('freelancer.id', sortOrder)
      .skip(skip)
      .take(limit);

    this.applyFreelancerFilters(qb, params);

    const [data, total] = await qb.getManyAndCount();
    return {
      data: data.map((freelancer) => this.toFreelancerSummary(freelancer)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<FreelancerSummary> {
    const freelancerId = this.requireText(id, 'Freelancer id');
    const freelancer = await this.buildFreelancerSummaryQuery()
      .where('freelancer.id = :freelancerId', { freelancerId })
      .getOne();

    if (!freelancer) throw this.freelancerNotFoundError();
    return this.toFreelancerSummary(freelancer);
  }

  async updateStatus(id: string, isActive: boolean): Promise<FreelancerSummary> {
    const freelancerId = this.requireText(id, 'Freelancer id');
    const freelancer = await this.freelancersRepo.findOne({ where: { id: freelancerId } });
    if (!freelancer) throw this.freelancerNotFoundError();

    const updateResult = await this.freelancersRepo.update(
      { id: freelancerId, isActive: !isActive },
      { isActive },
    );
    if (!updateResult.affected) {
      throw new BadRequestException({
        code: isActive ? 'FREELANCER_ALREADY_ACTIVE' : 'FREELANCER_ALREADY_INACTIVE',
        message: isActive ? 'Nhân sự đã được mở khoá.' : 'Nhân sự đã bị khoá.',
      });
    }
    return this.findOne(freelancerId);
  }

  async findApplications(
    id: string,
    params: ListFreelancerApplicationsParams,
  ): Promise<PaginatedResponse<FreelancerApplicationSummary>> {
    const freelancerId = this.requireText(id, 'Freelancer id');
    const exists = await this.freelancersRepo.exist({ where: { id: freelancerId } });
    if (!exists) throw this.freelancerNotFoundError();
    return this.findApplicationsByFreelancerId(freelancerId, params);
  }

  async findMySummary(userId: string, role: UserRole = UserRole.FREELANCER): Promise<FreelancerSummary> {
    if (role === UserRole.INTERNAL) {
      const internal = await this.internalsRepo.findOne({
        where: { userId: this.requireText(userId, 'User id'), isActive: true },
        relations: { user: true, createdBy: true },
      });
      if (!internal?.user) throw this.freelancerNotFoundError();

      return {
        freelancerId: internal.id,
        identifier: 'INTERNAL',
        phone: internal.phone,
        isActive: internal.isActive,
        applicationCount: await this.referralsRepo.count({
          where: { internalId: internal.id, sourceType: ApplicationReferralSourceType.INTERNAL },
        }),
        user: {
          userId: internal.user.id,
          name: internal.user.name,
          email: internal.user.email,
          role: internal.user.role,
        },
        createdBy: internal.createdBy
          ? { userId: internal.createdBy.id, name: internal.createdBy.name, email: internal.createdBy.email }
          : null,
        createdAt: internal.createdAt,
        updatedAt: internal.updatedAt,
      };
    }

    const freelancer = await this.buildFreelancerSummaryQuery()
      .where('freelancer.userId = :userId', {
        userId: this.requireText(userId, 'User id'),
      })
      .andWhere('freelancer.isActive = :isActive', { isActive: true })
      .getOne();

    if (!freelancer) throw this.freelancerNotFoundError();
    return this.toFreelancerSummary(freelancer);
  }

  async findMyApplications(
    userId: string,
    params: ListFreelancerApplicationsParams,
    role: UserRole = UserRole.FREELANCER,
  ): Promise<PaginatedResponse<FreelancerApplicationSummary>> {
    if (role === UserRole.INTERNAL) {
      const internal = await this.internalsRepo.findOne({
        where: { userId: this.requireText(userId, 'User id'), isActive: true },
      });
      if (!internal) throw this.freelancerNotFoundError();
      return this.findApplicationsByOwnerId(
        'internalId',
        internal.id,
        ApplicationReferralSourceType.INTERNAL,
        params,
      );
    }

    const freelancer = await this.resolveActiveByUserIdOrThrow(userId);
    return this.findApplicationsByFreelancerId(freelancer.id, params);
  }

  async updateMyApplicationEvaluation(
    userId: string,
    input: UpdateFreelancerApplicationEvaluationInput,
    role: UserRole = UserRole.FREELANCER,
  ): Promise<FreelancerApplicationSummary> {
    const owner = role === UserRole.INTERNAL
      ? await this.internalsRepo.findOne({
        where: { userId: this.requireText(userId, 'User id'), isActive: true },
      })
      : await this.resolveActiveByUserIdOrThrow(userId);
    if (!owner) throw this.freelancerNotFoundError();
    const referralId = this.requireText(input.referralId, 'Referral id');

    const referral = await this.referralsRepo.findOne({
      where: {
        id: referralId,
        ...(role === UserRole.INTERNAL
          ? { internalId: owner.id, sourceType: ApplicationReferralSourceType.INTERNAL }
          : { freelancerId: owner.id, sourceType: ApplicationReferralSourceType.FREELANCER }),
      },
      relations: {
        application: {
          candidate: true,
          jobPosting: true,
        },
      },
    });
    if (!referral) {
      throw new BadRequestException({
        code: 'FREELANCER_APPLICATION_NOT_FOUND',
        message: 'Freelancer application referral not found.',
      });
    }

    referral.evaluation = this.normalizeNullableText(input.evaluation, 2000);
    const savedReferral = await this.referralsRepo.save(referral);
    return this.toFreelancerApplicationSummary(savedReferral);
  }

  async getMyApplicationCv(
    userId: string,
    referralIdInput: string,
    accessMode: 'inline' | 'attachment',
    role: UserRole = UserRole.FREELANCER,
  ): Promise<CleanCvFileAccessResult> {
    const owner = role === UserRole.INTERNAL
      ? await this.internalsRepo.findOne({
        where: { userId: this.requireText(userId, 'User id'), isActive: true },
      })
      : await this.resolveActiveByUserIdOrThrow(userId);
    if (!owner) throw this.freelancerNotFoundError();
    const referralId = this.requireText(referralIdInput, 'Referral id');

    const referral = await this.referralsRepo.findOne({
      where: {
        id: referralId,
        ...(role === UserRole.INTERNAL
          ? { internalId: owner.id, sourceType: ApplicationReferralSourceType.INTERNAL }
          : { freelancerId: owner.id, sourceType: ApplicationReferralSourceType.FREELANCER }),
      },
      relations: {
        application: true,
      },
    });
    if (!referral) {
      throw new BadRequestException({
        code: 'FREELANCER_APPLICATION_NOT_FOUND',
        message: 'Freelancer application referral not found.',
      });
    }

    if (!referral.application?.currentCvDocumentId) {
      throw new BadRequestException({
        code: 'CURRENT_CV_NOT_AVAILABLE',
        message: 'Current CV is not available for this application.',
      });
    }

    return this.cvDocumentsService.getCleanCvFileForAccess({
      applicationId: referral.applicationId,
      cvDocumentId: referral.application.currentCvDocumentId,
      actorId: userId,
      actorRole: role,
      accessMode,
    });
  }

  async resolveActiveByIdentifier(identifier: string, manager?: EntityManager) {
    if (!/^FL[0-9]{6}$/.test(identifier)) return null;

    const repo = manager?.getRepository(FreelancerEntity) ?? this.freelancersRepo;
    return repo.findOne({
      where: {
        identifier,
        isActive: true,
      },
      relations: { user: true },
    });
  }

  async createReferral(
    manager: EntityManager,
    input: CreateReferralInput,
  ): Promise<ApplicationReferralEntity> {
    const applicationId = this.requireText(input.applicationId, 'Application id');
    const freelancerId = this.optionalText(input.freelancerId);
    const internalId = this.optionalText(input.internalId);
    if (Boolean(freelancerId) === Boolean(internalId)) {
      throw new BadRequestException({
        code: 'REFERRAL_SOURCE_CONFLICT',
        message: 'Exactly one referral source is required.',
      });
    }
    const applicationsRepo = manager.getRepository(ApplicationEntity);
    const freelancersRepo = manager.getRepository(FreelancerEntity);
    const internalsRepo = manager.getRepository(InternalEntity);
    const referralsRepo = manager.getRepository(ApplicationReferralEntity);

    const application = await applicationsRepo.findOne({ where: { id: applicationId } });
    if (!application) {
      throw new BadRequestException({
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application not found.',
      });
    }

    if (freelancerId) {
      const freelancer = await freelancersRepo.findOne({
        where: { id: freelancerId, isActive: true },
      });
      if (!freelancer) throw this.freelancerNotFoundError();
    } else {
      const internal = await internalsRepo.findOne({
        where: { id: internalId as string, isActive: true },
      });
      if (!internal) {
        throw new BadRequestException({
          code: 'INVALID_INTERNAL_EMAIL',
          message: 'Internal email is inactive or unavailable.',
        });
      }
    }

    try {
      return await referralsRepo.save(
        referralsRepo.create({
          applicationId,
          sourceType: freelancerId
            ? ApplicationReferralSourceType.FREELANCER
            : ApplicationReferralSourceType.INTERNAL,
          freelancerId: freelancerId ?? null,
          internalId: internalId ?? null,
          evaluation: null,
        }),
      );
    } catch (error) {
      if (this.isApplicationReferralUniqueViolation(error)) {
        throw new BadRequestException({
          code: 'APPLICATION_REFERRAL_EXISTS',
          message: 'Application already has a referral source.',
        });
      }
      throw error;
    }
  }

  private async findApplicationsByFreelancerId(
    freelancerId: string,
    params: ListFreelancerApplicationsParams,
  ): Promise<PaginatedResponse<FreelancerApplicationSummary>> {
    return this.findApplicationsByOwnerId(
      'freelancerId',
      freelancerId,
      ApplicationReferralSourceType.FREELANCER,
      params,
    );
  }

  private async findApplicationsByOwnerId(
    ownerColumn: 'freelancerId' | 'internalId',
    ownerId: string,
    sourceType: ApplicationReferralSourceType,
    params: ListFreelancerApplicationsParams,
  ): Promise<PaginatedResponse<FreelancerApplicationSummary>> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const sortOrder = params.sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const qb = this.referralsRepo
      .createQueryBuilder('referral')
      .innerJoinAndSelect('referral.application', 'application')
      .innerJoinAndSelect('application.candidate', 'candidate')
      .leftJoinAndSelect('candidate.assignees', 'assignee')
      .innerJoinAndSelect('application.jobPosting', 'jobPosting')
      .where(`referral.${ownerColumn} = :ownerId`, { ownerId })
      .andWhere('referral.sourceType = :sourceType', { sourceType })
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

    if (params.processStatus) {
      qb.andWhere('application.status = :processStatus', {
        processStatus: params.processStatus,
      });
    }

    if (params.hrReceptionStatus) {
      qb.andWhere('application.hrReviewStatus = :hrReceptionStatus', {
        hrReceptionStatus: params.hrReceptionStatus,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return {
      data: data.map((referral) => this.toFreelancerApplicationSummary(referral)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private buildFreelancerSummaryQuery() {
    return this.freelancersRepo
      .createQueryBuilder('freelancer')
      .leftJoinAndSelect('freelancer.user', 'user')
      .leftJoinAndSelect('freelancer.createdBy', 'createdBy')
      .loadRelationCountAndMap('freelancer.applicationCount', 'freelancer.referrals');
  }

  private applyFreelancerFilters(
    qb: ReturnType<FreelancersService['buildFreelancerSummaryQuery']>,
    params: ListFreelancersParams,
  ) {
    const search = this.optionalText(params.search);
    if (search) {
      qb.andWhere(
        '(freelancer.identifier ILIKE :search OR user.name ILIKE :search OR user.email ILIKE :search)',
        {
          search: `%${escapeLikePattern(search)}%`,
        },
      );
    }

    if (params.status === FreelancerStatusFilter.ACTIVE) {
      qb.andWhere('freelancer.isActive = :isActive', { isActive: true });
    }

    if (params.status === FreelancerStatusFilter.INACTIVE) {
      qb.andWhere('freelancer.isActive = :isActive', { isActive: false });
    }
  }

  private async resolveActiveByUserIdOrThrow(userId: string) {
    const freelancer = await this.freelancersRepo.findOne({
      where: {
        userId: this.requireText(userId, 'User id'),
        isActive: true,
      },
      relations: { user: true },
    });
    if (!freelancer) throw this.freelancerNotFoundError();
    return freelancer;
  }

  private toFreelancerSummary(freelancer: FreelancerEntity): FreelancerSummary {
    if (!freelancer.user) {
      throw new BadRequestException({
        code: 'FREELANCER_USER_NOT_FOUND',
        message: 'Freelancer user account not found.',
      });
    }

    return {
      freelancerId: freelancer.id,
      identifier: freelancer.identifier,
      phone: freelancer.phone ?? null,
      isActive: freelancer.isActive,
      applicationCount: this.extractApplicationCount(freelancer),
      user: {
        userId: freelancer.userId,
        name: freelancer.user.name,
        email: freelancer.user.email,
        role: freelancer.user.role,
      },
      createdBy: freelancer.createdBy
        ? {
            userId: freelancer.createdBy.id,
            name: freelancer.createdBy.name,
            email: freelancer.createdBy.email,
          }
        : null,
      createdAt: freelancer.createdAt,
      updatedAt: freelancer.updatedAt,
    };
  }

  private toFreelancerApplicationSummary(
    referral: ApplicationReferralEntity,
  ): FreelancerApplicationSummary {
    const application = referral.application;
    if (!application?.candidate || !application.jobPosting) {
      throw new BadRequestException({
        code: 'FREELANCER_APPLICATION_INCOMPLETE',
        message: 'Freelancer application data is incomplete.',
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

  private extractApplicationCount(freelancer: FreelancerEntity) {
    const count = (freelancer as FreelancerEntity & { applicationCount?: number }).applicationCount;
    if (typeof count === 'number') return count;
    const numericCount = Number(count ?? 0);
    return Number.isFinite(numericCount) ? numericCount : 0;
  }

  private toFreelancerIdentifier(sequence: number) {
    return `FL${String(sequence).padStart(6, '0')}`;
  }

  private async resolveIdentifierCounterForUpdate(
    manager: EntityManager,
  ): Promise<FreelancerIdentifierCounterEntity> {
    const countersRepo = manager.getRepository(FreelancerIdentifierCounterEntity);
    const counter = await this.findIdentifierCounterForUpdate(countersRepo);
    if (counter) return counter;

    const lastIssuedNumber = await this.getMaxIssuedFreelancerIdentifierNumber(manager);
    await countersRepo
      .createQueryBuilder()
      .insert()
      .values({
        id: FreelancersService.IDENTIFIER_COUNTER_ID,
        lastIssuedNumber,
      })
      .orIgnore()
      .execute();

    const initializedCounter = await this.findIdentifierCounterForUpdate(countersRepo);
    if (!initializedCounter) {
      throw new BadRequestException({
        code: 'FREELANCER_IDENTIFIER_COUNTER_UNAVAILABLE',
        message: 'Freelancer identifier counter is unavailable.',
      });
    }
    return initializedCounter;
  }

  private findIdentifierCounterForUpdate(
    countersRepo: Repository<FreelancerIdentifierCounterEntity>,
  ) {
    return countersRepo
      .createQueryBuilder('counter')
      .setLock('pessimistic_write')
      .where('counter.id = :id', {
        id: FreelancersService.IDENTIFIER_COUNTER_ID,
      })
      .getOne();
  }

  private async getMaxIssuedFreelancerIdentifierNumber(manager: EntityManager) {
    const raw = await manager
      .getRepository(FreelancerEntity)
      .createQueryBuilder('freelancer')
      .select("MAX(CAST(SUBSTRING(freelancer.identifier FROM 3) AS integer))", 'max')
      .where('freelancer.identifier ~ :pattern', { pattern: '^FL[0-9]{6}$' })
      .getRawOne<{ max: string | number | null }>();

    const max = Number(raw?.max ?? 0);
    return Number.isFinite(max) && max > 0 ? max : 0;
  }

  private duplicateEmailError() {
    return new BadRequestException({
      code: 'USER_EMAIL_EXISTS',
      message: 'Email này đã có người đăng ký.',
    });
  }

  private freelancerNotFoundError() {
    return new BadRequestException({
      code: 'FREELANCER_NOT_FOUND',
      message: 'Freelancer not found.',
    });
  }

  private normalizeNullableText(value: string | null | undefined, maxLength: number) {
    const normalized = this.optionalText(value);
    if (!normalized) return null;
    if (normalized.length > maxLength) {
      throw new BadRequestException({
        code: 'FREELANCER_EVALUATION_TOO_LONG',
        message: `Freelancer evaluation must be ${maxLength} characters or fewer.`,
      });
    }
    return normalized;
  }

  private isUserEmailUniqueViolation(error: unknown) {
    const driverError = this.extractDriverError(error);
    if (!driverError || driverError.code !== '23505') return false;

    const constraint = driverError.constraint?.toLowerCase() ?? '';
    const detail = driverError.detail?.toLowerCase() ?? '';
    return constraint.includes('email') || detail.includes('(email)');
  }

  private isApplicationReferralUniqueViolation(error: unknown) {
    const driverError = this.extractDriverError(error);
    if (!driverError || driverError.code !== '23505') return false;

    const constraint = driverError.constraint ?? '';
    const detail = driverError.detail?.toLowerCase() ?? '';
    return constraint === 'UQ_application_referrals_application_id'
      || detail.includes('(application_id)');
  }

  private extractDriverError(error: unknown) {
    if (!error || typeof error !== 'object') return null;

    const driverError = (error as { driverError?: unknown }).driverError;
    if (!driverError || typeof driverError !== 'object') return null;

    return driverError as {
      code?: string;
      constraint?: string;
      detail?: string;
    };
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
