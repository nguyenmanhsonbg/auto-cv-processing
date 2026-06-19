import { readFileSync } from 'fs';
import { join } from 'path';
import { Injectable, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parse } from 'yaml';
import { LevelEntity } from './entities/level.entity';
import { PaginatedResponse } from '@interview-assistant/shared';

@Injectable()
export class LevelsService implements OnModuleInit {
  constructor(
    @InjectRepository(LevelEntity)
    private repo: Repository<LevelEntity>,
  ) {}

  async onModuleInit() {
    await this.seed();
  }

  findAll() {
    return this.repo.find({ order: { orderIndex: 'ASC' } });
  }

  async findPaginated(params: { page?: number; limit?: number; search?: string; isActive?: boolean; sortBy?: string; sortOrder?: 'ASC' | 'DESC' }): Promise<PaginatedResponse<LevelEntity>> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;
    const sortOrder = params.sortOrder === 'DESC' ? 'DESC' : 'ASC';
    const allowedSorts: Record<string, string> = { name: 'lvl.name', displayName: 'lvl.displayName', orderIndex: 'lvl.orderIndex' };
    const sortCol = allowedSorts[params.sortBy ?? ''] ?? 'lvl.orderIndex';

    const qb = this.repo.createQueryBuilder('lvl').orderBy(sortCol, sortOrder);

    if (params.search) {
      qb.andWhere('(lvl.name ILIKE :search OR lvl.displayName ILIKE :search)', { search: `%${params.search}%` });
    }
    if (params.isActive !== undefined) {
      qb.andWhere('lvl.isActive = :isActive', { isActive: params.isActive });
    }

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  findActive() {
    return this.repo.find({ where: { isActive: true }, order: { orderIndex: 'ASC' } });
  }

  async findOne(id: string) {
    const l = await this.repo.findOne({ where: { id } });
    if (!l) throw new BadRequestException('Level not found');
    return l;
  }

  async create(data: { name: string; displayName: string; orderIndex?: number }) {
    const existing = await this.repo.findOne({ where: { name: data.name } });
    if (existing) throw new BadRequestException('Level with this name already exists');
    return this.repo.save(this.repo.create(data));
  }

  async update(id: string, data: { name?: string; displayName?: string; orderIndex?: number; isActive?: boolean }) {
    const l = await this.findOne(id);
    Object.assign(l, data);
    l.isCustomized = true;
    return this.repo.save(l);
  }

  async remove(id: string) {
    const l = await this.findOne(id);
    await this.repo.remove(l);
    return { deleted: true };
  }

  async resetOne(id: string) {
    const l = await this.findOne(id);
    const defaults: Array<{ name: string; displayName: string; orderIndex: number }> =
      parse(readFileSync(join(__dirname, '../assets/seed/levels.yaml'), 'utf8'));
    const seedEntry = defaults.find((d) => d.name === l.name);
    if (seedEntry) {
      l.displayName = seedEntry.displayName;
      l.orderIndex = seedEntry.orderIndex;
    }
    l.isCustomized = false;
    return this.repo.save(l);
  }

  async seed() {
    const defaults: Array<{ name: string; displayName: string; orderIndex: number }> =
      parse(readFileSync(join(__dirname, '../assets/seed/levels.yaml'), 'utf8'));

    const allExisting = await this.repo.find();
    const byName = new Map(allExisting.map((l) => [l.name, l]));

    const toSave: LevelEntity[] = [];
    let created = 0;
    for (const d of defaults) {
      const exists = byName.get(d.name);
      if (!exists) {
        toSave.push(this.repo.create(d));
        created++;
      } else if (!exists.isCustomized) {
        exists.displayName = d.displayName;
        exists.orderIndex = d.orderIndex;
        toSave.push(exists);
      }
    }
    if (toSave.length) await this.repo.save(toSave);
    return { created, message: `${created} levels seeded` };
  }
}
