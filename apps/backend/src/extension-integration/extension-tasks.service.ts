import { UserRole } from '@interview-assistant/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  CompleteExtensionTaskDto,
  CreateExtensionTaskDto,
  ExtensionTaskProgressDto,
  FailExtensionTaskDto,
} from './dto';
import {
  ExtensionInstanceEntity,
  ExtensionTaskEntity,
  ExtensionTaskEventEntity,
} from './entities';
import {
  ExtensionCapability,
  ExtensionTaskStatus,
  ExtensionTaskType,
} from './enums';
import { ExtensionInstancesService } from './extension-instances.service';

const TASK_LOCK_MS = 2 * 60_000;

@Injectable()
export class ExtensionTasksService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly extensionInstancesService: ExtensionInstancesService,
    @InjectRepository(ExtensionTaskEntity)
    private readonly tasksRepo: Repository<ExtensionTaskEntity>,
    @InjectRepository(ExtensionTaskEventEntity)
    private readonly taskEventsRepo: Repository<ExtensionTaskEventEntity>,
  ) {}

  async create(input: {
    actorUserId: string;
    actorRole: UserRole;
    dto: CreateExtensionTaskDto;
  }) {
    if (input.dto.assignedInstanceId) {
      await this.ensureVisibleInstance({
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        extensionInstanceId: input.dto.assignedInstanceId,
      });
    }

    const task = await this.tasksRepo.save(this.tasksRepo.create({
      type: input.dto.type,
      status: ExtensionTaskStatus.PENDING,
      requestedByUserId: input.actorUserId,
      assignedInstanceId: input.dto.assignedInstanceId ?? null,
      claimedByInstanceId: null,
      lockedUntil: null,
      payload: this.safeRecord(input.dto.payload),
      result: null,
      errorCode: null,
      errorMessage: null,
      attemptCount: 0,
      maxAttempts: input.dto.maxAttempts ?? 3,
      priority: input.dto.priority ?? 0,
      startedAt: null,
      finishedAt: null,
    }));

    await this.appendEvent({
      taskId: task.id,
      instanceId: null,
      eventType: 'TASK_CREATED',
      message: null,
      payload: null,
    });

    return task;
  }

  async claimNext(input: {
    ownerUserId: string;
    extensionInstanceId: string;
  }) {
    const instance = await this.extensionInstancesService.resolveOwnedActiveInstance(input);
    await this.extensionInstancesService.touch(instance);

    const task = await this.dataSource.transaction(async (manager) => {
      const now = new Date();
      const taskRepo = manager.getRepository(ExtensionTaskEntity);
      const qb = taskRepo
        .createQueryBuilder('task')
        .setLock('pessimistic_write')
        .where('task.status = :status', { status: ExtensionTaskStatus.PENDING })
        .andWhere(
          `(
            task.assignedInstanceId = :instanceId
            OR (task.assignedInstanceId IS NULL AND task.requestedByUserId = :ownerUserId)
          )`,
          { instanceId: instance.id, ownerUserId: instance.ownerUserId },
        )
        .andWhere('(task.lockedUntil IS NULL OR task.lockedUntil < :now)', { now })
        .orderBy('task.priority', 'DESC')
        .addOrderBy('task.createdAt', 'ASC');

      const supportedTypes = this.resolveSupportedTaskTypes(instance);
      if (supportedTypes.length > 0) {
        qb.andWhere('task.type IN (:...supportedTypes)', { supportedTypes });
      } else {
        qb.andWhere('1 = 0');
      }

      const nextTask = await qb.getOne();
      if (!nextTask) return null;

      nextTask.status = ExtensionTaskStatus.CLAIMED;
      nextTask.claimedByInstanceId = instance.id;
      nextTask.lockedUntil = new Date(now.getTime() + TASK_LOCK_MS);
      nextTask.attemptCount += 1;
      return taskRepo.save(nextTask);
    });

    if (task) {
      await this.appendEvent({
        taskId: task.id,
        instanceId: instance.id,
        eventType: 'TASK_CLAIMED',
        message: null,
        payload: null,
      });
    }

    return task;
  }

  async start(input: {
    ownerUserId: string;
    extensionInstanceId: string;
    taskId: string;
  }) {
    const { task, instance } = await this.resolveClaimedTask(input);
    task.status = ExtensionTaskStatus.RUNNING;
    task.startedAt = task.startedAt ?? new Date();
    task.lockedUntil = new Date(Date.now() + TASK_LOCK_MS);
    const savedTask = await this.tasksRepo.save(task);

    await this.appendEvent({
      taskId: task.id,
      instanceId: instance.id,
      eventType: 'TASK_STARTED',
      message: null,
      payload: null,
    });

    return savedTask;
  }

  async progress(input: {
    ownerUserId: string;
    extensionInstanceId: string;
    taskId: string;
    dto: ExtensionTaskProgressDto;
  }) {
    const { task, instance } = await this.resolveClaimedTask(input);
    task.lockedUntil = new Date(Date.now() + TASK_LOCK_MS);
    await this.tasksRepo.save(task);

    await this.appendEvent({
      taskId: task.id,
      instanceId: instance.id,
      eventType: input.dto.eventType,
      message: input.dto.message?.trim() || null,
      payload: this.safeRecord(input.dto.payload),
    });

    return task;
  }

  async complete(input: {
    ownerUserId: string;
    extensionInstanceId: string;
    taskId: string;
    dto: CompleteExtensionTaskDto;
  }) {
    const { task, instance } = await this.resolveClaimedTask(input);
    task.status = ExtensionTaskStatus.SUCCEEDED;
    task.result = this.safeRecord(input.dto.result);
    task.lockedUntil = null;
    task.errorCode = null;
    task.errorMessage = null;
    task.finishedAt = new Date();
    const savedTask = await this.tasksRepo.save(task);

    await this.appendEvent({
      taskId: task.id,
      instanceId: instance.id,
      eventType: 'TASK_SUCCEEDED',
      message: null,
      payload: task.result,
    });

    return savedTask;
  }

  async fail(input: {
    ownerUserId: string;
    extensionInstanceId: string;
    taskId: string;
    dto: FailExtensionTaskDto;
  }) {
    const { task, instance } = await this.resolveClaimedTask(input);
    task.errorCode = input.dto.errorCode.trim();
    task.errorMessage = input.dto.errorMessage.trim();
    task.result = this.safeRecord(input.dto.result);

    if (task.attemptCount < task.maxAttempts) {
      task.status = ExtensionTaskStatus.PENDING;
      task.claimedByInstanceId = null;
      task.lockedUntil = null;
    } else {
      task.status = ExtensionTaskStatus.FAILED;
      task.lockedUntil = null;
      task.finishedAt = new Date();
    }

    const savedTask = await this.tasksRepo.save(task);
    await this.appendEvent({
      taskId: task.id,
      instanceId: instance.id,
      eventType: 'TASK_FAILED',
      message: task.errorMessage,
      payload: { errorCode: task.errorCode, willRetry: savedTask.status === ExtensionTaskStatus.PENDING },
    });

    return savedTask;
  }

  toResponse(task: ExtensionTaskEntity | null) {
    if (!task) return null;

    return {
      id: task.id,
      type: task.type,
      status: task.status,
      requestedByUserId: task.requestedByUserId,
      assignedInstanceId: task.assignedInstanceId,
      claimedByInstanceId: task.claimedByInstanceId,
      lockedUntil: task.lockedUntil?.toISOString() ?? null,
      payload: task.payload,
      result: task.result,
      errorCode: task.errorCode,
      errorMessage: task.errorMessage,
      attemptCount: task.attemptCount,
      maxAttempts: task.maxAttempts,
      priority: task.priority,
      startedAt: task.startedAt?.toISOString() ?? null,
      finishedAt: task.finishedAt?.toISOString() ?? null,
      createdAt: task.createdAt?.toISOString() ?? null,
      updatedAt: task.updatedAt?.toISOString() ?? null,
    };
  }

  private async resolveClaimedTask(input: {
    ownerUserId: string;
    extensionInstanceId: string;
    taskId: string;
  }) {
    const instance = await this.extensionInstancesService.resolveOwnedActiveInstance(input);
    await this.extensionInstancesService.touch(instance);

    const task = await this.tasksRepo.findOne({
      where: [
        {
          id: input.taskId,
          claimedByInstanceId: instance.id,
          status: ExtensionTaskStatus.CLAIMED,
        },
        {
          id: input.taskId,
          claimedByInstanceId: instance.id,
          status: ExtensionTaskStatus.RUNNING,
        },
      ],
    });

    if (!task) {
      throw new BadRequestException({
        code: 'EXTENSION_TASK_NOT_CLAIMED',
        message: 'Extension task is not claimed by this instance.',
      });
    }

    return { task, instance };
  }

  private async ensureVisibleInstance(input: {
    actorUserId: string;
    actorRole: UserRole;
    extensionInstanceId: string;
  }) {
    const repo = this.dataSource.getRepository(ExtensionInstanceEntity);
    const instance = await repo.findOne({
      where: {
        id: input.extensionInstanceId,
        ...(input.actorRole === UserRole.ADMIN ? {} : { ownerUserId: input.actorUserId }),
      },
    });

    if (!instance) {
      throw new BadRequestException({
        code: 'EXTENSION_INSTANCE_NOT_FOUND',
        message: 'Assigned extension instance was not found.',
      });
    }
  }

  private resolveSupportedTaskTypes(instance: ExtensionInstanceEntity) {
    const capabilities = new Set(instance.capabilities ?? []);
    const taskTypes: ExtensionTaskType[] = [];
    if (capabilities.has(ExtensionCapability.AMIS_SYNC)) taskTypes.push(ExtensionTaskType.AMIS_SYNC);
    if (capabilities.has(ExtensionCapability.FACEBOOK_PUBLISH)) taskTypes.push(ExtensionTaskType.FACEBOOK_PUBLISH);
    if (capabilities.has(ExtensionCapability.FACEBOOK_VERIFY)) taskTypes.push(ExtensionTaskType.FACEBOOK_VERIFY);
    if (capabilities.has(ExtensionCapability.CV_UPLOAD_TO_AMIS)) taskTypes.push(ExtensionTaskType.CV_UPLOAD_TO_AMIS);
    return taskTypes;
  }

  private appendEvent(input: {
    taskId: string;
    instanceId: string | null;
    eventType: string;
    message: string | null;
    payload: Record<string, unknown> | null;
  }) {
    return this.taskEventsRepo.save(this.taskEventsRepo.create(input));
  }

  private safeRecord(value: unknown) {
    if (value == null) return null;
    if (typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  }
}
