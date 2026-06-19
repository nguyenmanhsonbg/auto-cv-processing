import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import slugify from 'slugify';
import { CandidateEntity } from './entities/candidate.entity';
import { UserEntity } from '../auth/entities/user.entity';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { CandidateLevel, PaginatedResponse } from '@interview-assistant/shared';

@Injectable()
export class CandidatesService {
  constructor(
    @InjectRepository(CandidateEntity)
    private readonly candidateRepo: Repository<CandidateEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async create(dto: CreateCandidateDto, createdById: string): Promise<CandidateEntity> {
    const slug = await this.ensureUniqueSlug(this.generateSlug(dto.name));
    const candidate = this.candidateRepo.create({ ...dto, slug, createdById });
    return this.candidateRepo.save(candidate);
  }

  /**
   * Generate a URL-friendly slug from a candidate name
   * Converts Unicode characters to ASCII equivalents (e.g., "Nguyễn" → "nguyen")
   */
  private generateSlug(name: string): string {
    return slugify(name, {
      lower: true,      // Convert to lowercase
      strict: true,     // Strip special characters
      trim: true,       // Trim leading/trailing replacement chars
    });
  }

  /**
   * Ensure slug is unique by appending numeric suffixes if needed
   */
  private async ensureUniqueSlug(baseSlug: string): Promise<string> {
    let slug = baseSlug;
    let suffix = 1;

    while (await this.candidateRepo.findOne({ where: { slug } })) {
      slug = `${baseSlug}-${suffix}`;
      suffix++;
    }

    return slug;
  }

  /**
   * Find candidate by slug
   */
  async findBySlug(slug: string): Promise<CandidateEntity | null> {
    return this.candidateRepo.findOne({
      where: { slug },
      relations: ['sessions', 'createdBy', 'assignees'],
    });
  }

  /**
   * Find candidate by ID or slug (dual-mode lookup for backward compatibility)
   */
  async findByIdOrSlug(
    idOrSlug: string,
    scope?: { userId: string; isAdmin: boolean },
  ): Promise<CandidateEntity> {
    // UUID regex pattern
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    let candidate: CandidateEntity | null;

    if (uuidRegex.test(idOrSlug)) {
      // It's a UUID - lookup by ID
      candidate = await this.candidateRepo.findOne({
        where: { id: idOrSlug },
        relations: ['sessions', 'createdBy', 'assignees'],
      });
    } else {
      // It's a slug - lookup by slug
      candidate = await this.findBySlug(idOrSlug);
    }

    if (!candidate) {
      throw new BadRequestException(`Candidate with identifier ${idOrSlug} not found`);
    }

    if (scope && !scope.isAdmin) {
      const isCreator = candidate.createdById === scope.userId;
      const isAssignee = candidate.assignees?.some(u => u.id === scope.userId) ?? false;
      const isLegacyNull = !candidate.createdById;
      if (!isCreator && !isAssignee && !isLegacyNull) {
        throw new BadRequestException(`Candidate with identifier ${idOrSlug} not found`);
      }
    }

    return candidate;
  }

  async findAll(
    filters?: { level?: CandidateLevel; position?: string },
    scope?: { userId: string; isAdmin: boolean },
  ): Promise<CandidateEntity[]> {
    const qb = this.candidateRepo
      .createQueryBuilder('candidate')
      .leftJoinAndSelect('candidate.createdBy', 'createdBy')
      .leftJoinAndSelect('candidate.assignees', 'assignees');

    // Non-admin users only see their own candidates or candidates assigned to them
    // (nulls are admin-era data visible to all)
    if (scope && !scope.isAdmin) {
      qb.leftJoin('candidate.assignees', 'assigneeFilter')
        .andWhere('(candidate.createdById = :uid OR assigneeFilter.id = :uid OR candidate.createdById IS NULL)', { uid: scope.userId });
    }
    if (filters?.level) {
      qb.andWhere('candidate.level = :level', { level: filters.level });
    }
    if (filters?.position) {
      qb.andWhere('candidate.position ILIKE :position', {
        position: `%${filters.position}%`,
      });
    }

    qb.orderBy('candidate.createdAt', 'DESC');
    return qb.getMany();
  }

  async findPaginated(
    params: { page?: number; limit?: number; search?: string; level?: CandidateLevel; sortBy?: string; sortOrder?: 'ASC' | 'DESC' },
    scope?: { userId: string; isAdmin: boolean },
  ): Promise<PaginatedResponse<CandidateEntity>> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;
    const sortOrder = params.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const allowedSorts: Record<string, string> = {
      name: 'candidate.name', email: 'candidate.email', position: 'candidate.position',
      level: 'candidate.level', createdAt: 'candidate.createdAt',
    };
    const sortCol = allowedSorts[params.sortBy ?? ''] ?? 'candidate.createdAt';

    const qb = this.candidateRepo
      .createQueryBuilder('candidate')
      .leftJoinAndSelect('candidate.createdBy', 'createdBy')
      .leftJoinAndSelect('candidate.assignees', 'assignees');

    if (scope && !scope.isAdmin) {
      qb.leftJoin('candidate.assignees', 'assigneeFilter')
        .andWhere('(candidate.createdById = :uid OR assigneeFilter.id = :uid OR candidate.createdById IS NULL)', { uid: scope.userId });
    }
    if (params.search) {
      qb.andWhere(
        '(candidate.name ILIKE :search OR candidate.email ILIKE :search OR candidate.position ILIKE :search)',
        { search: `%${params.search}%` },
      );
    }
    if (params.level) {
      const levels = params.level.split(',').filter(Boolean);
      if (levels.length > 0) qb.andWhere('candidate.level IN (:...levels)', { levels });
    }

    qb.orderBy(sortCol, sortOrder);
    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(
    id: string,
    scope?: { userId: string; isAdmin: boolean },
  ): Promise<CandidateEntity> {
    const candidate = await this.candidateRepo.findOne({
      where: { id },
      relations: ['sessions', 'createdBy', 'assignees'],
    });
    if (!candidate) {
      throw new BadRequestException(`Candidate with id ${id} not found`);
    }
    if (scope && !scope.isAdmin) {
      const isCreator = candidate.createdById === scope.userId;
      const isAssignee = candidate.assignees?.some(u => u.id === scope.userId) ?? false;
      const isLegacyNull = !candidate.createdById;
      if (!isCreator && !isAssignee && !isLegacyNull) {
        throw new BadRequestException(`Candidate with id ${id} not found`);
      }
    }
    return candidate;
  }

  async update(
    id: string,
    dto: UpdateCandidateDto,
    scope?: { userId: string; isAdmin: boolean },
  ): Promise<CandidateEntity> {
    const candidate = await this.findOne(id, scope);
    Object.assign(candidate, dto);
    return this.candidateRepo.save(candidate);
  }

  async remove(id: string, scope?: { userId: string; isAdmin: boolean }): Promise<void> {
    const candidate = await this.findOne(id, scope);

    try {
      await this.candidateRepo.remove(candidate);
    } catch (error: any) {
      // Check if it's a foreign key constraint error
      if (error?.code === '23503' || error?.message?.includes('foreign key constraint')) {
        throw new BadRequestException(
          'Cannot delete candidate with active sessions. Please delete or reassign the sessions first.',
        );
      }
      throw error;
    }
  }

  async assign(
    id: string,
    userIds: string[],
    scope: { userId: string; isAdmin: boolean },
  ): Promise<CandidateEntity> {
    const candidate = await this.findOne(id, scope);
    if (userIds.length === 0) {
      candidate.assignees = [];
    } else {
      candidate.assignees = await this.userRepo.findByIds(userIds);
    }
    return this.candidateRepo.save(candidate);
  }

  async updateResumeUrl(id: string, resumeUrl: string): Promise<CandidateEntity> {
    const candidate = await this.findOne(id);
    candidate.resumeUrl = resumeUrl;
    return this.candidateRepo.save(candidate);
  }

  async updateProfileXlsxUrl(
    id: string,
    profileXlsxUrl: string,
  ): Promise<CandidateEntity> {
    const candidate = await this.findOne(id);
    candidate.profileXlsxUrl = profileXlsxUrl;
    return this.candidateRepo.save(candidate);
  }

  async findByEmail(
    email: string,
    scope: { userId: string; isAdmin: boolean },
  ): Promise<CandidateEntity | null> {
    const qb = this.candidateRepo
      .createQueryBuilder('c')
      .where('c.email = :email', { email });
    if (!scope.isAdmin) {
      qb.leftJoin('c.assignees', 'assigneeFilter')
        .andWhere('(c.createdById = :uid OR assigneeFilter.id = :uid OR c.createdById IS NULL)', { uid: scope.userId });
    }
    return qb.getOne();
  }

  async upsertFromUpload(
    profile: Record<string, unknown>,
    resumeUrl: string | null,
    profileXlsxUrl: string | null,
    createdById: string,
    scope: { userId: string; isAdmin: boolean },
    candidateId?: string,
  ): Promise<CandidateEntity> {
    // Normalize email to lowercase to prevent duplicate candidates from mixed-case extraction
    const rawEmail = profile['email'] as string | undefined;
    if (rawEmail) profile['email'] = rawEmail.toLowerCase();

    let existing: CandidateEntity | null = null;
    if (candidateId) {
      existing = await this.findOne(candidateId, scope);
    } else {
      const email = profile['email'] as string | undefined;
      if (email) existing = await this.findByEmail(email, scope);
    }

    if (existing) {
      const merged: Record<string, unknown> = { ...(existing.parsedProfile as Record<string, unknown> ?? {}) };
      for (const [key, value] of Object.entries(profile)) {
        if (value != null) merged[key] = value;
      }
      existing.parsedProfile = merged;
      if (resumeUrl) existing.resumeUrl = resumeUrl;
      if (profileXlsxUrl) existing.profileXlsxUrl = profileXlsxUrl;
      const incomingLevel = profile['level'] as CandidateLevel | undefined;
      if (incomingLevel && Object.values(CandidateLevel).includes(incomingLevel)) {
        existing.level = incomingLevel;
      }
      return this.candidateRepo.save(existing);
    }

    const name = (profile['name'] as string | undefined)?.trim() || 'Unknown';
    const slug = await this.ensureUniqueSlug(this.generateSlug(name));

    return this.candidateRepo.save(
      this.candidateRepo.create({
        name,
        slug,
        email: (profile['email'] as string | undefined) || undefined,
        phone: (profile['phone'] as string | undefined) || undefined,
        birthYear: (profile['birthYear'] as number | undefined) || undefined,
        position: (profile['position'] as string | undefined) || 'Backend Developer',
        level: (() => {
          const l = profile['level'] as string | undefined;
          return (l && Object.values(CandidateLevel).includes(l as CandidateLevel))
            ? (l as CandidateLevel)
            : CandidateLevel.ENTRY;
        })(),
        resumeUrl: resumeUrl ?? undefined,
        profileXlsxUrl: profileXlsxUrl ?? undefined,
        parsedProfile: profile,
        createdById,
      }),
    );
  }

  async setAnalyzeStatus(id: string, status: 'idle' | 'analyzing'): Promise<void> {
    await this.candidateRepo.update(id, { analyzeStatus: status });
  }

  async updateParsedProfile(
    id: string,
    incoming: Record<string, unknown>,
  ): Promise<CandidateEntity> {
    const candidate = await this.findOne(id);
    // Merge: existing values are preserved when incoming is null/undefined for that field
    const existing = (candidate.parsedProfile as Record<string, unknown>) ?? {};
    const merged: Record<string, unknown> = { ...existing };
    for (const [key, value] of Object.entries(incoming)) {
      if (value !== null && value !== undefined) {
        merged[key] = value;
      }
    }
    candidate.parsedProfile = merged;
    return this.candidateRepo.save(candidate);
  }

  /**
   * Backfill slugs for existing candidates that don't have one
   */
  async backfillSlugs(): Promise<{ updated: number; total: number }> {
    const candidates = await this.candidateRepo.find({
      where: { slug: null as any },
    });

    let updated = 0;
    for (const candidate of candidates) {
      const slug = await this.ensureUniqueSlug(this.generateSlug(candidate.name));
      candidate.slug = slug;
      await this.candidateRepo.save(candidate);
      updated++;
    }

    const total = await this.candidateRepo.count();
    return { updated, total };
  }
}
