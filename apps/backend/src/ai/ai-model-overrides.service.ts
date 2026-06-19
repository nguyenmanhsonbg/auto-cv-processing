import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiModelOverrideEntity } from './entities/ai-model-override.entity';

@Injectable()
export class AiModelOverridesService {
  constructor(
    @InjectRepository(AiModelOverrideEntity)
    private readonly repo: Repository<AiModelOverrideEntity>,
  ) {}

  findAll() {
    return this.repo.find();
  }

  findByKey(promptKey: string) {
    return this.repo.findOne({ where: { promptKey } });
  }

  async upsert(promptKey: string, model: string): Promise<AiModelOverrideEntity> {
    const existing = await this.repo.findOne({ where: { promptKey } });
    if (existing) {
      existing.model = model;
      return this.repo.save(existing);
    }
    return this.repo.save(this.repo.create({ promptKey, model }));
  }

  async remove(promptKey: string): Promise<void> {
    await this.repo.delete({ promptKey });
  }

  async resetAll(): Promise<{ removed: number }> {
    const { affected } = await this.repo.createQueryBuilder().delete().execute();
    return { removed: affected ?? 0 };
  }
}
