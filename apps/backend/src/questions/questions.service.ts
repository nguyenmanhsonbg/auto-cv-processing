import { readFileSync } from 'fs';
import { join } from 'path';
import { Injectable, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { parse } from 'yaml';
import { QuestionEntity } from './entities/question.entity';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import {
  QuestionType,
  PaginatedResponse,
} from '@interview-assistant/shared';

@Injectable()
export class QuestionsService implements OnModuleInit {
  constructor(
    @InjectRepository(QuestionEntity)
    private readonly questionRepo: Repository<QuestionEntity>,
  ) {}

  async onModuleInit() {
    await this.seed();
  }

  async create(dto: CreateQuestionDto): Promise<QuestionEntity> {
    const question = this.questionRepo.create(dto);
    return this.questionRepo.save(question);
  }

  async findAll(filters?: {
    category?: string;
    /** Batch-filter by multiple categories (uses SQL IN — prevents N+1 vs calling findAll per category). */
    categories?: string[];
    subcategory?: string;
    targetLevel?: string;
    /** Batch-filter: match questions whose targetLevels array overlaps with any of these levels.
     *  Use this to implement "higher level includes lower level" semantics. */
    targetLevels?: string[];
    type?: QuestionType;
    isActive?: boolean;
  }): Promise<QuestionEntity[]> {
    const qb = this.questionRepo.createQueryBuilder('question');

    // Category filter — prefer batch IN query over single-category equality
    if (filters?.categories?.length) {
      qb.andWhere('question.category IN (:...categories)', { categories: filters.categories });
    } else if (filters?.category) {
      qb.andWhere('question.category = :category', { category: filters.category });
    }

    if (filters?.subcategory) {
      qb.andWhere('question.subcategory = :subcategory', {
        subcategory: filters.subcategory,
      });
    }

    // Level filter — prefer array-overlap for multi-level hierarchy over single-level ANY check
    if (filters?.targetLevels?.length) {
      // PostgreSQL array overlap: question's targetLevels contains at least one of the requested levels
      qb.andWhere('question."targetLevels" && ARRAY[:...targetLevels]::text[]', {
        targetLevels: filters.targetLevels,
      });
    } else if (filters?.targetLevel) {
      qb.andWhere(':targetLevel = ANY(question.targetLevels)', {
        targetLevel: filters.targetLevel,
      });
    }

    if (filters?.type) {
      qb.andWhere('question.type = :type', { type: filters.type });
    }
    if (filters?.isActive !== undefined) {
      qb.andWhere('question.isActive = :isActive', {
        isActive: filters.isActive,
      });
    }

    qb.orderBy('question.category', 'ASC')
      .addOrderBy('question.subcategory', 'ASC')
      .addOrderBy('question.difficulty', 'ASC');

    return qb.getMany();
  }

  async findPaginated(params: {
    page?: number; limit?: number; search?: string; category?: string; subcategory?: string;
    targetLevel?: string; type?: QuestionType; isActive?: boolean; sortBy?: string; sortOrder?: 'ASC' | 'DESC';
  }): Promise<PaginatedResponse<QuestionEntity>> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(2000, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;
    const sortOrder = params.sortOrder === 'DESC' ? 'DESC' : 'ASC';
    const allowedSorts: Record<string, string> = {
      text: 'question.text', category: 'question.category', subcategory: 'question.subcategory',
      type: 'question.type', difficulty: 'question.difficulty', createdAt: 'question.createdAt',
    };
    const sortCol = allowedSorts[params.sortBy ?? ''] ?? null;

    const qb = this.questionRepo.createQueryBuilder('question');

    if (params.search) {
      qb.andWhere('question.text ILIKE :search', { search: `%${params.search}%` });
    }
    if (params.category) {
      const cats = params.category.split(',').filter(Boolean);
      if (cats.length > 0) qb.andWhere('question.category IN (:...categories)', { categories: cats });
    }
    if (params.subcategory) {
      const subs = params.subcategory.split(',').filter(Boolean);
      if (subs.length > 0) qb.andWhere('question.subcategory IN (:...subcategories)', { subcategories: subs });
    }
    if (params.targetLevel) {
      const levels = params.targetLevel.split(',').filter(Boolean);
      if (levels.length === 1) {
        qb.andWhere(':tlevel = ANY(question.targetLevels)', { tlevel: levels[0] });
      } else if (levels.length > 1) {
        qb.andWhere(
          new Brackets((sub) => {
            levels.forEach((lv, idx) => sub.orWhere(`:tlevel${idx} = ANY(question.targetLevels)`, { [`tlevel${idx}`]: lv }));
          }),
        );
      }
    }
    if (params.type) {
      const types = params.type.split(',').filter(Boolean);
      if (types.length > 0) qb.andWhere('question.type IN (:...types)', { types });
    }
    if (params.isActive !== undefined) {
      qb.andWhere('question.isActive = :isActive', { isActive: params.isActive });
    }

    if (sortCol) {
      qb.orderBy(sortCol, sortOrder);
    } else {
      qb.orderBy('question.category', 'ASC')
        .addOrderBy('question.subcategory', 'ASC')
        .addOrderBy('question.difficulty', 'ASC');
    }

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string): Promise<QuestionEntity> {
    const question = await this.questionRepo.findOne({ where: { id } });
    if (!question) {
      throw new BadRequestException(`Question with id ${id} not found`);
    }
    return question;
  }

  async update(id: string, dto: UpdateQuestionDto): Promise<QuestionEntity> {
    const question = await this.findOne(id);
    Object.assign(question, dto);
    question.isCustomized = true;
    return this.questionRepo.save(question);
  }

  async resetOne(id: string): Promise<QuestionEntity> {
    const question = await this.findOne(id);
    const questions: Partial<QuestionEntity>[] = parse(
      readFileSync(join(__dirname, '../assets/seed/questions.yaml'), 'utf8'),
      { maxAliasCount: -1 },
    );
    const seedEntry = (question.code && questions.find((q) => q.code === question.code))
      || questions.find((q) => q.text === question.text)
      || null;
    if (seedEntry) {
      question.text = seedEntry.text ?? question.text;
      question.expectedAnswer = seedEntry.expectedAnswer ?? question.expectedAnswer;
      question.scoringGuide = seedEntry.scoringGuide ?? question.scoringGuide;
      question.difficulty = seedEntry.difficulty ?? question.difficulty;
      question.targetLevels = seedEntry.targetLevels ?? question.targetLevels;
      question.category = seedEntry.category ?? question.category;
      question.subcategory = seedEntry.subcategory ?? question.subcategory;
    }
    question.isCustomized = false;
    return this.questionRepo.save(question);
  }

  async remove(id: string): Promise<void> {
    const question = await this.findOne(id);
    await this.questionRepo.remove(question);
  }

  async seed(): Promise<{ created: number }> {
    const questions: Partial<QuestionEntity>[] = parse(
      readFileSync(join(__dirname, '../assets/seed/questions.yaml'), 'utf8'),
      { maxAliasCount: -1 }
    );

    // Load all existing rows in one query and index by code + text
    const allExisting = await this.questionRepo.find();
    const byCode = new Map<string, QuestionEntity>();
    const byText = new Map<string, QuestionEntity>();
    for (const row of allExisting) {
      if (row.code) byCode.set(row.code, row);
      byText.set(row.text, row);
    }

    const toSave: QuestionEntity[] = [];
    let created = 0;
    for (const q of questions) {
      const found = (q.code && byCode.get(q.code)) || byText.get(q.text!) || null;

      if (found) {
        if (!found.isCustomized) {
          if (q.code && !found.code) found.code = q.code;
          found.text = q.text ?? found.text;
          found.expectedAnswer = q.expectedAnswer ?? found.expectedAnswer;
          found.scoringGuide = q.scoringGuide ?? found.scoringGuide;
          found.difficulty = q.difficulty ?? found.difficulty;
          found.targetLevels = q.targetLevels ?? found.targetLevels;
          found.category = q.category ?? found.category;
          found.subcategory = q.subcategory ?? found.subcategory;
          toSave.push(found);
        }
      } else {
        toSave.push(this.questionRepo.create(q));
        created++;
      }
    }
    if (toSave.length) await this.questionRepo.save(toSave);
    return { created };
  }
}

