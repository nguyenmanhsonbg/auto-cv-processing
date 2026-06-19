import { Injectable, OnModuleInit, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiPromptEntity } from './entities/ai-prompt.entity';
import { UpdateAiPromptDto } from './dto/update-ai-prompt.dto';
import { PROMPT_DEFAULTS } from './ai-prompts.defaults';
import { PaginatedResponse } from '@interview-assistant/shared';

@Injectable()
export class AiPromptsService implements OnModuleInit {
  constructor(
    @InjectRepository(AiPromptEntity)
    private readonly repo: Repository<AiPromptEntity>,
  ) {}

  /** Seed default prompts once on startup (skip if already present). */
  async onModuleInit() {
    await this.seedDefaults();
  }

  findAll() {
    return this.repo.find({ order: { key: 'ASC' } });
  }

  async findPaginated(params: { page?: number; limit?: number; search?: string; sortBy?: string; sortOrder?: 'ASC' | 'DESC' }): Promise<PaginatedResponse<AiPromptEntity>> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;
    const sortOrder = params.sortOrder === 'DESC' ? 'DESC' : 'ASC';
    const allowedSorts: Record<string, string> = { key: 'p.key', name: 'p.name', updatedAt: 'p.updatedAt' };
    const sortCol = allowedSorts[params.sortBy ?? ''] ?? 'p.key';

    const qb = this.repo.createQueryBuilder('p').orderBy(sortCol, sortOrder);

    if (params.search) {
      qb.andWhere('(p.key ILIKE :search OR p.name ILIKE :search OR p.description ILIKE :search)', { search: `%${params.search}%` });
    }

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Look up the active prompt for a given key. Returns null if not found. */
  findByKey(key: string): Promise<AiPromptEntity | null> {
    return this.repo.findOne({ where: { key, isActive: true } });
  }

  async update(id: string, dto: UpdateAiPromptDto) {
    const prompt = await this.repo.findOne({ where: { id } });
    if (!prompt) throw new BadRequestException('Prompt not found');
    Object.assign(prompt, dto);
    prompt.isCustomized = true;
    return this.repo.save(prompt);
  }

  /** Upsert defaults by key — skip rows that a user has manually customized. */
  async seedDefaults() {
    const allExisting = await this.repo.find();
    const byKey = new Map(allExisting.map((p) => [p.key, p]));

    const toSave: AiPromptEntity[] = [];
    for (const [key, defaults] of Object.entries(PROMPT_DEFAULTS)) {
      const existing = byKey.get(key);
      if (!existing) {
        toSave.push(this.repo.create({
          key,
          name: defaults.name,
          description: defaults.description,
          systemPrompt: defaults.systemPrompt,
          model: defaults.model || 'claude-sonnet-4.6',
        }));
      } else if (!existing.isCustomized) {
        existing.name = defaults.name;
        existing.description = defaults.description;
        existing.systemPrompt = defaults.systemPrompt;
        existing.model = defaults.model || 'claude-sonnet-4.6';
        toSave.push(existing);
      }
    }
    if (toSave.length) await this.repo.save(toSave);
  }

  /** Overwrite all prompt rows with the original defaults and clear isCustomized. */
  async resetToDefaults() {
    const allExisting = await this.repo.find();
    const byKey = new Map(allExisting.map((p) => [p.key, p]));

    const toSave: AiPromptEntity[] = [];
    for (const [key, defaults] of Object.entries(PROMPT_DEFAULTS)) {
      const existing = byKey.get(key);
      if (existing) {
        existing.name = defaults.name;
        existing.description = defaults.description;
        existing.systemPrompt = defaults.systemPrompt;
        existing.model = defaults.model || 'claude-sonnet-4.6';
        existing.isCustomized = false;
        toSave.push(existing);
      } else {
        toSave.push(this.repo.create({
          key,
          name: defaults.name,
          description: defaults.description,
          systemPrompt: defaults.systemPrompt,
          model: defaults.model || 'claude-sonnet-4.6',
        }));
      }
    }
    if (toSave.length) await this.repo.save(toSave);
    return { message: `${Object.keys(PROMPT_DEFAULTS).length} AI prompts reset to defaults` };
  }
}
