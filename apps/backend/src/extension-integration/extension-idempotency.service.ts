import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExtensionIdempotencyRecordEntity } from './entities';
import {
  ExtensionIdempotencyStatus,
  ExtensionSourceSystem,
} from './enums';

export enum ExtensionIdempotencyDecision {
  NEW = 'NEW',
  REPLAY_SUCCEEDED = 'REPLAY_SUCCEEDED',
}

export type ExtensionIdempotencyAssertResult =
  | {
    decision: ExtensionIdempotencyDecision.NEW;
    record: null;
  }
  | {
    decision: ExtensionIdempotencyDecision.REPLAY_SUCCEEDED;
    record: ExtensionIdempotencyRecordEntity;
  };

@Injectable()
export class ExtensionIdempotencyService {
  constructor(
    @InjectRepository(ExtensionIdempotencyRecordEntity)
    private readonly idempotencyRecordsRepo: Repository<ExtensionIdempotencyRecordEntity>,
  ) {}

  findByKey(idempotencyKey: string) {
    return this.idempotencyRecordsRepo.findOne({ where: { idempotencyKey } });
  }

  async createProcessingRecord(input: {
    idempotencyKey: string;
    sourceSystem: ExtensionSourceSystem;
    requestHash: string;
    actorUserId?: string;
  }) {
    const record = this.idempotencyRecordsRepo.create({
      idempotencyKey: input.idempotencyKey,
      sourceSystem: input.sourceSystem,
      requestHash: input.requestHash,
      status: ExtensionIdempotencyStatus.PROCESSING,
      responseData: null,
      actorUserId: input.actorUserId ?? null,
    });

    return this.idempotencyRecordsRepo.save(record);
  }

  async assertKeyCanBeUsed(input: {
    idempotencyKey: string;
    sourceSystem: ExtensionSourceSystem;
    requestHash: string;
  }): Promise<ExtensionIdempotencyAssertResult> {
    const record = await this.findByKey(input.idempotencyKey);
    if (!record) {
      return {
        decision: ExtensionIdempotencyDecision.NEW,
        record: null,
      };
    }

    if (
      record.sourceSystem !== input.sourceSystem
      || record.requestHash !== input.requestHash
    ) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_CONFLICT',
        message: 'Idempotency-Key was already used for a different request body.',
      });
    }

    if (record.status === ExtensionIdempotencyStatus.SUCCEEDED) {
      return {
        decision: ExtensionIdempotencyDecision.REPLAY_SUCCEEDED,
        record,
      };
    }

    if (record.status === ExtensionIdempotencyStatus.PROCESSING) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: 'Request with this Idempotency-Key is already processing.',
      });
    }

    throw new ConflictException({
      code: 'IDEMPOTENCY_REQUEST_FAILED_RETRY_WITH_NEW_KEY',
      message: 'Previous request with this Idempotency-Key failed. Retry with a new Idempotency-Key.',
    });
  }

  async markSucceeded(input: {
    idempotencyKey: string;
    responseData: unknown;
  }) {
    const record = await this.findByKey(input.idempotencyKey);
    if (!record) return null;

    record.status = ExtensionIdempotencyStatus.SUCCEEDED;
    record.responseData = input.responseData === undefined
      ? null
      : input.responseData as Record<string, unknown>;

    return this.idempotencyRecordsRepo.save(record);
  }

  async markFailed(input: {
    idempotencyKey: string;
  }) {
    const record = await this.findByKey(input.idempotencyKey);
    if (!record) return null;

    record.status = ExtensionIdempotencyStatus.FAILED;
    // TODO BE-EXT-05+: Add errorCode/errorMessage/attemptCount once retry policy is confirmed.
    return this.idempotencyRecordsRepo.save(record);
  }
}
