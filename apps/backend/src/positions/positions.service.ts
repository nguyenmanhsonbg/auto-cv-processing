import { readFileSync } from 'fs';
import { join } from 'path';
import { Injectable, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parse } from 'yaml';
import { PositionEntity } from './entities/position.entity';
import { PaginatedResponse } from '@interview-assistant/shared';

@Injectable()
export class PositionsService implements OnModuleInit {
  constructor(
    @InjectRepository(PositionEntity)
    private repo: Repository<PositionEntity>,
  ) {}

  async onModuleInit() {
    await this.seed();
  }

  findAll() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findPaginated(params: { page?: number; limit?: number; search?: string; isActive?: boolean; sortBy?: string; sortOrder?: 'ASC' | 'DESC' }): Promise<PaginatedResponse<PositionEntity>> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;
    const sortOrder = params.sortOrder === 'DESC' ? 'DESC' : 'ASC';
    const allowedSorts: Record<string, string> = { name: 'pos.name', description: 'pos.description', createdAt: 'pos.createdAt' };
    const sortCol = allowedSorts[params.sortBy ?? ''] ?? 'pos.name';

    const qb = this.repo.createQueryBuilder('pos').orderBy(sortCol, sortOrder);

    if (params.search) {
      qb.andWhere('(pos.name ILIKE :search OR pos.description ILIKE :search)', { search: `%${params.search}%` });
    }
    if (params.isActive !== undefined) {
      qb.andWhere('pos.isActive = :isActive', { isActive: params.isActive });
    }

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  findActive() {
    return this.repo.find({ where: { isActive: true }, order: { name: 'ASC' } });
  }

  async findOne(id: string) {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new BadRequestException('Position not found');
    return p;
  }

  async create(data: { name: string; description?: string }) {
    const existing = await this.repo.findOne({ where: { name: data.name } });
    if (existing) throw new BadRequestException('Position with this name already exists');
    return this.repo.save(this.repo.create(data));
  }

  async update(id: string, data: { name?: string; description?: string; isActive?: boolean }) {
    const p = await this.findOne(id);
    Object.assign(p, data);
    p.isCustomized = true;
    return this.repo.save(p);
  }

  async remove(id: string) {
    const p = await this.findOne(id);
    await this.repo.remove(p);
    return { deleted: true };
  }

  async resetOne(id: string) {
    const p = await this.findOne(id);
    p.isCustomized = false;
    return this.repo.save(p);
  }

  async seed() {
    const defaults: string[] =
      parse(readFileSync(join(__dirname, '../assets/seed/positions.yaml'), 'utf8'));

    const allExisting = await this.repo.find();
    const existingNames = new Set(allExisting.map((p) => p.name));

    const toCreate = defaults
      .filter((name) => !existingNames.has(name))
      .map((name) => this.repo.create({ name }));

    if (toCreate.length) await this.repo.save(toCreate);
    return { created: toCreate.length, message: `${toCreate.length} positions seeded` };
  }
}
