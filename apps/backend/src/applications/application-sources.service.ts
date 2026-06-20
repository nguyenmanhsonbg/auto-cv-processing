import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ApplicationSourceType, RecruitmentChannel } from '../recruitment-common';
import { ApplicationSourceEntity } from './entities/application-source.entity';

export interface CreateApplicationSourceInput {
  applicationId: string;
  sourceType: ApplicationSourceType;
  channel?: RecruitmentChannel | null;
  externalLeadId?: string | null;
  externalApplicationId?: string | null;
  rawPayload?: Record<string, unknown> | null;
}

@Injectable()
export class ApplicationSourcesService {
  constructor(
    @InjectRepository(ApplicationSourceEntity)
    private readonly applicationSourcesRepo: Repository<ApplicationSourceEntity>,
  ) {}

  findByApplication(applicationId: string, manager?: EntityManager) {
    return this.repo(manager).find({
      where: { applicationId: this.requireText(applicationId, 'Application id') },
      order: { receivedAt: 'DESC' },
    });
  }

  findLatestByApplication(applicationId: string, manager?: EntityManager) {
    return this.repo(manager).findOne({
      where: { applicationId: this.requireText(applicationId, 'Application id') },
      order: { receivedAt: 'DESC' },
    });
  }

  findByExternalReference(
    channel?: RecruitmentChannel | null,
    externalApplicationId?: string | null,
    manager?: EntityManager,
  ) {
    const normalizedChannel = this.normalizeChannel(channel);
    const normalizedExternalApplicationId = this.optionalText(externalApplicationId);
    if (!normalizedChannel || !normalizedExternalApplicationId) return null;

    return this.repo(manager).findOne({
      where: {
        channel: normalizedChannel,
        externalApplicationId: normalizedExternalApplicationId,
      },
      relations: [
        'application',
        'application.candidate',
        'application.jobPosting',
        'application.jobDescriptionVersion',
      ],
    });
  }

  async create(input: CreateApplicationSourceInput, manager?: EntityManager) {
    const repository = this.repo(manager);
    const channel = this.normalizeChannel(input.channel);
    const externalApplicationId = this.optionalText(input.externalApplicationId);

    if (channel && externalApplicationId) {
      const existing = await this.findByExternalReference(
        channel,
        externalApplicationId,
        manager,
      );
      if (existing) return existing;
    }

    const source = repository.create({
      applicationId: this.requireText(input.applicationId, 'Application id'),
      sourceType: this.normalizeSourceType(input.sourceType),
      channel,
      externalLeadId: this.optionalText(input.externalLeadId),
      externalApplicationId,
      rawPayload: this.normalizeRawPayload(input.rawPayload),
    });

    return repository.save(source);
  }

  private repo(manager?: EntityManager) {
    return manager?.getRepository(ApplicationSourceEntity) ?? this.applicationSourcesRepo;
  }

  private normalizeSourceType(value: ApplicationSourceType) {
    if (!Object.values(ApplicationSourceType).includes(value)) {
      throw new BadRequestException('Application source type is invalid');
    }
    return value;
  }

  private normalizeChannel(value?: RecruitmentChannel | null) {
    if (!value) return null;
    if (!Object.values(RecruitmentChannel).includes(value)) {
      throw new BadRequestException('Recruitment channel is invalid');
    }
    return value;
  }

  private normalizeRawPayload(value?: Record<string, unknown> | null) {
    if (value == null) return null;
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Application source raw payload must be an object');
    }
    return value;
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
