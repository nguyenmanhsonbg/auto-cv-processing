import { UserRole } from '@interview-assistant/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  HeartbeatExtensionInstanceDto,
  RegisterExtensionInstanceDto,
} from './dto';
import { ExtensionInstanceEntity } from './entities';
import {
  ExtensionCapability,
  ExtensionInstanceStatus,
} from './enums';

@Injectable()
export class ExtensionInstancesService {
  constructor(
    @InjectRepository(ExtensionInstanceEntity)
    private readonly instancesRepo: Repository<ExtensionInstanceEntity>,
  ) {}

  async register(input: {
    ownerUserId: string;
    dto: RegisterExtensionInstanceDto;
  }) {
    const installId = this.requireText(input.dto.installId, 'installId', 128);
    const now = new Date();
    const existing = await this.instancesRepo.findOne({
      where: {
        ownerUserId: input.ownerUserId,
        installId,
      },
    });

    if (existing) {
      if (existing.status === ExtensionInstanceStatus.DISABLED) {
        throw new BadRequestException({
          code: 'EXTENSION_INSTANCE_DISABLED',
          message: 'This extension instance has been disabled.',
        });
      }

      existing.displayName = this.optionalText(input.dto.displayName, 160) ?? existing.displayName;
      existing.version = this.optionalText(input.dto.version, 64) ?? existing.version;
      existing.capabilities = this.normalizeCapabilities(input.dto.capabilities);
      existing.metadata = this.safeMetadata(input.dto.metadata);
      existing.status = ExtensionInstanceStatus.ONLINE;
      existing.lastSeenAt = now;
      return this.instancesRepo.save(existing);
    }

    return this.instancesRepo.save(this.instancesRepo.create({
      ownerUserId: input.ownerUserId,
      installId,
      displayName: this.optionalText(input.dto.displayName, 160) ?? null,
      version: this.optionalText(input.dto.version, 64) ?? null,
      capabilities: this.normalizeCapabilities(input.dto.capabilities),
      status: ExtensionInstanceStatus.ONLINE,
      lastSeenAt: now,
      registeredAt: now,
      disabledAt: null,
      metadata: this.safeMetadata(input.dto.metadata),
    }));
  }

  async heartbeat(input: {
    ownerUserId: string;
    extensionInstanceId: string;
    dto: HeartbeatExtensionInstanceDto;
  }) {
    const instance = await this.resolveOwnedActiveInstance({
      ownerUserId: input.ownerUserId,
      extensionInstanceId: input.extensionInstanceId,
    });

    instance.version = this.optionalText(input.dto.version, 64) ?? instance.version;
    if (input.dto.capabilities) {
      instance.capabilities = this.normalizeCapabilities(input.dto.capabilities);
    }
    if (input.dto.metadata !== undefined) {
      instance.metadata = this.safeMetadata(input.dto.metadata);
    }
    instance.status = ExtensionInstanceStatus.ONLINE;
    instance.lastSeenAt = new Date();
    return this.instancesRepo.save(instance);
  }

  async listForUser(input: {
    actorUserId: string;
    actorRole: UserRole;
  }) {
    const where = input.actorRole === UserRole.ADMIN ? {} : { ownerUserId: input.actorUserId };
    return this.instancesRepo.find({
      where,
      order: { lastSeenAt: 'DESC', createdAt: 'DESC' },
    });
  }

  async disable(input: {
    actorUserId: string;
    actorRole: UserRole;
    extensionInstanceId: string;
  }) {
    const instance = await this.findVisibleInstance(input);
    instance.status = ExtensionInstanceStatus.DISABLED;
    instance.disabledAt = new Date();
    return this.instancesRepo.save(instance);
  }

  async resolveOptionalForUser(input: {
    ownerUserId: string;
    extensionInstanceId?: string | null;
  }) {
    const extensionInstanceId = this.optionalText(input.extensionInstanceId, 128);
    if (!extensionInstanceId) return null;

    return this.resolveOwnedActiveInstance({
      ownerUserId: input.ownerUserId,
      extensionInstanceId,
    });
  }

  async resolveOwnedActiveInstance(input: {
    ownerUserId: string;
    extensionInstanceId: string;
  }) {
    const instance = await this.instancesRepo.findOne({
      where: {
        id: input.extensionInstanceId,
        ownerUserId: input.ownerUserId,
      },
    });

    if (!instance) {
      throw new BadRequestException({
        code: 'EXTENSION_INSTANCE_NOT_FOUND',
        message: 'Extension instance was not found for this account.',
      });
    }

    if (instance.status === ExtensionInstanceStatus.DISABLED) {
      throw new BadRequestException({
        code: 'EXTENSION_INSTANCE_DISABLED',
        message: 'This extension instance has been disabled.',
      });
    }

    return instance;
  }

  async touch(instance: ExtensionInstanceEntity) {
    instance.status = ExtensionInstanceStatus.ONLINE;
    instance.lastSeenAt = new Date();
    return this.instancesRepo.save(instance);
  }

  toResponse(instance: ExtensionInstanceEntity) {
    return {
      id: instance.id,
      ownerUserId: instance.ownerUserId,
      installId: instance.installId,
      displayName: instance.displayName,
      version: instance.version,
      status: instance.status,
      capabilities: instance.capabilities ?? [],
      lastSeenAt: instance.lastSeenAt?.toISOString() ?? null,
      registeredAt: instance.registeredAt?.toISOString() ?? instance.createdAt?.toISOString(),
      disabledAt: instance.disabledAt?.toISOString() ?? null,
      metadata: instance.metadata,
      createdAt: instance.createdAt?.toISOString() ?? null,
      updatedAt: instance.updatedAt?.toISOString() ?? null,
    };
  }

  private async findVisibleInstance(input: {
    actorUserId: string;
    actorRole: UserRole;
    extensionInstanceId: string;
  }) {
    const instance = await this.instancesRepo.findOne({
      where: {
        id: input.extensionInstanceId,
        ...(input.actorRole === UserRole.ADMIN ? {} : { ownerUserId: input.actorUserId }),
      },
    });

    if (!instance) {
      throw new BadRequestException({
        code: 'EXTENSION_INSTANCE_NOT_FOUND',
        message: 'Extension instance was not found.',
      });
    }

    return instance;
  }

  private normalizeCapabilities(value: ExtensionCapability[] | undefined) {
    if (!value?.length) return [];
    return [...new Set(value.filter((item) => Object.values(ExtensionCapability).includes(item)))];
  }

  private safeMetadata(value: unknown) {
    if (value == null) return null;
    if (typeof value !== 'object' || Array.isArray(value)) return null;

    const source = value as Record<string, unknown>;
    return {
      browser: this.optionalText(source.browser, 80),
      platform: this.optionalText(source.platform, 80),
      timezone: this.optionalText(source.timezone, 80),
      userAgent: this.optionalText(source.userAgent, 240),
    };
  }

  private requireText(value: unknown, field: string, maxLength: number) {
    const normalizedValue = this.optionalText(value, maxLength);
    if (!normalizedValue) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `${field} is required.`,
      });
    }

    return normalizedValue;
  }

  private optionalText(value: unknown, maxLength: number) {
    if (typeof value !== 'string') return undefined;
    const normalizedValue = value.trim();
    if (!normalizedValue) return undefined;
    return normalizedValue.slice(0, maxLength);
  }
}
