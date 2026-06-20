import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { ApplicationStatus } from '../recruitment-common';
import { WorkflowEventEntity } from './entities/workflow-event.entity';

export interface RecordWorkflowEventInput {
  applicationId: string;
  fromStatus?: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  eventType: string;
  actorType: string;
  actorId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface RecordWorkflowTransitionInput
  extends Omit<RecordWorkflowEventInput, 'fromStatus'> {
  expectedFromStatus?: ApplicationStatus | null;
}

export interface FindApplicationTimelineOptions {
  limit?: number;
  offset?: number;
  includeMetadata?: boolean;
}

export interface ApplicationTimelineItem {
  id: string;
  eventType: string;
  fromStatus: ApplicationStatus | null;
  status: ApplicationStatus;
  actorType: string;
  actorId: string | null;
  message: string;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
}

@Injectable()
export class WorkflowStateService {
  private static readonly DEFAULT_TIMELINE_LIMIT = 100;
  private static readonly MAX_TIMELINE_LIMIT = 500;

  constructor(
    @InjectRepository(WorkflowEventEntity)
    private readonly workflowEventsRepo: Repository<WorkflowEventEntity>,
    @InjectRepository(ApplicationEntity)
    private readonly applicationsRepo: Repository<ApplicationEntity>,
  ) {}

  async findTimelineByApplicationId(
    applicationId: string,
    options: FindApplicationTimelineOptions = {},
    manager?: EntityManager,
  ): Promise<ApplicationTimelineItem[]> {
    const normalizedApplicationId = this.requireText(applicationId, 'Application id');
    await this.assertApplicationExists(normalizedApplicationId, manager);

    const events = await this.workflowRepo(manager).find({
      where: { applicationId: normalizedApplicationId },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: this.normalizeLimit(options.limit),
      skip: this.normalizeOffset(options.offset),
    });

    return events.map((event) => this.toTimelineItem(event, options.includeMetadata));
  }

  findEventsByApplicationId(
    applicationId: string,
    options: FindApplicationTimelineOptions = {},
    manager?: EntityManager,
  ) {
    return this.workflowRepo(manager).find({
      where: { applicationId: this.requireText(applicationId, 'Application id') },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: this.normalizeLimit(options.limit),
      skip: this.normalizeOffset(options.offset),
    });
  }

  async recordEvent(input: RecordWorkflowEventInput, manager?: EntityManager) {
    const applicationId = this.requireText(input.applicationId, 'Application id');
    await this.assertApplicationExists(applicationId, manager);

    const event = this.workflowRepo(manager).create({
      applicationId,
      fromStatus: this.normalizeStatus(input.fromStatus, 'From status', true),
      toStatus: this.normalizeStatus(input.toStatus, 'To status'),
      eventType: this.requireText(input.eventType, 'Workflow event type'),
      actorType: this.requireText(input.actorType, 'Workflow actor type'),
      actorId: this.optionalText(input.actorId),
      metadata: this.normalizeMetadata(input.metadata),
    });

    return this.workflowRepo(manager).save(event);
  }

  async recordStatusTransition(
    input: RecordWorkflowTransitionInput,
    manager?: EntityManager,
  ) {
    const applicationId = this.requireText(input.applicationId, 'Application id');
    const application = await this.applicationRepo(manager).findOne({
      where: { id: applicationId },
    });
    if (!application) throw new BadRequestException('Application not found');

    const expectedFromStatus = this.normalizeStatus(
      input.expectedFromStatus,
      'Expected from status',
      true,
    );
    if (expectedFromStatus && application.status !== expectedFromStatus) {
      throw new BadRequestException('Application status does not match expected transition');
    }

    const toStatus = this.normalizeStatus(input.toStatus, 'To status');
    const fromStatus = application.status;
    application.status = toStatus;
    await this.applicationRepo(manager).save(application);

    return this.recordEvent(
      {
        ...input,
        applicationId,
        fromStatus,
        toStatus,
      },
      manager,
    );
  }

  private toTimelineItem(
    event: WorkflowEventEntity,
    includeMetadata?: boolean,
  ): ApplicationTimelineItem {
    const item: ApplicationTimelineItem = {
      id: event.id,
      eventType: event.eventType,
      fromStatus: event.fromStatus,
      status: event.toStatus,
      actorType: event.actorType,
      actorId: event.actorId,
      message: this.buildTimelineMessage(event),
      createdAt: event.createdAt,
    };

    if (includeMetadata) {
      item.metadata = event.metadata;
    }

    return item;
  }

  private buildTimelineMessage(event: WorkflowEventEntity) {
    const label = event.eventType
      .toLowerCase()
      .split('_')
      .filter(Boolean)
      .join(' ');
    return `${label.charAt(0).toUpperCase()}${label.slice(1)}.`;
  }

  private async assertApplicationExists(applicationId: string, manager?: EntityManager) {
    const exists = await this.applicationRepo(manager).exist({
      where: { id: applicationId },
    });
    if (!exists) throw new BadRequestException('Application not found');
  }

  private workflowRepo(manager?: EntityManager) {
    return manager?.getRepository(WorkflowEventEntity) ?? this.workflowEventsRepo;
  }

  private applicationRepo(manager?: EntityManager) {
    return manager?.getRepository(ApplicationEntity) ?? this.applicationsRepo;
  }

  private normalizeStatus(
    value: ApplicationStatus | null | undefined,
    fieldName: string,
  ): ApplicationStatus;
  private normalizeStatus(
    value: ApplicationStatus | null | undefined,
    fieldName: string,
    nullable: true,
  ): ApplicationStatus | null;
  private normalizeStatus(
    value: ApplicationStatus | null | undefined,
    fieldName: string,
    nullable = false,
  ) {
    if (value == null) {
      if (nullable) return null;
      throw new BadRequestException(`${fieldName} is required`);
    }
    if (!Object.values(ApplicationStatus).includes(value)) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }
    return value;
  }

  private normalizeMetadata(value?: Record<string, unknown> | null) {
    if (value == null) return null;
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Workflow metadata must be an object');
    }
    return value;
  }

  private normalizeLimit(value?: number) {
    if (value == null) return WorkflowStateService.DEFAULT_TIMELINE_LIMIT;
    if (!Number.isInteger(value) || value < 1) {
      throw new BadRequestException('Timeline limit is invalid');
    }
    return Math.min(value, WorkflowStateService.MAX_TIMELINE_LIMIT);
  }

  private normalizeOffset(value?: number) {
    if (value == null) return 0;
    if (!Number.isInteger(value) || value < 0) {
      throw new BadRequestException('Timeline offset is invalid');
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
