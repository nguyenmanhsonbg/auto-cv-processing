import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ExtensionSourceSystem } from './enums';
import { AmisRecruitmentRoundEntity } from './entities';
import {
  getInactiveAmisRecruitmentRoundIds,
  normalizeAmisRecruitmentRounds,
  type AmisRecruitmentRoundSyncInput,
} from './amis-recruitment-rounds.util';

export interface SyncAmisRecruitmentRoundsInput {
  sourceUrl?: string | null;
  rounds: AmisRecruitmentRoundSyncInput[];
}

export interface AmisRecruitmentRoundResponse {
  id: string;
  name: string;
  sortOrder: number;
  roundType: number | null;
  roundTypeId: string | null;
  color: string | null;
}

@Injectable()
export class AmisRecruitmentRoundsService {
  constructor(private readonly dataSource: DataSource) {}

  async sync(
    amisRecruitmentId: string,
    input: SyncAmisRecruitmentRoundsInput,
  ): Promise<AmisRecruitmentRoundResponse[]> {
    const normalizedRecruitmentId = amisRecruitmentId.trim();
    if (!normalizedRecruitmentId) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'amisRecruitmentId is required.',
      });
    }

    const rounds = normalizeAmisRecruitmentRounds(input.rounds);
    if (rounds.length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'At least one AMIS recruitment round is required.',
      });
    }

    const sourceUrl = input.sourceUrl?.trim() || null;
    const now = new Date();

    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(AmisRecruitmentRoundEntity);
      const existing = await repository.find({
        where: {
          sourceSystem: ExtensionSourceSystem.AMIS,
          amisRecruitmentId: normalizedRecruitmentId,
        },
      });
      const existingByRoundId = new Map(existing.map((round) => [round.amisRoundId, round]));

      const activeRecords = rounds.map((round) => {
        const record = existingByRoundId.get(round.amisRoundId) ?? repository.create({
          sourceSystem: ExtensionSourceSystem.AMIS,
          amisRecruitmentId: normalizedRecruitmentId,
          amisRoundId: round.amisRoundId,
        });

        record.roundName = round.name;
        record.sortOrder = round.sortOrder;
        record.roundType = round.roundType;
        record.roundTypeId = round.roundTypeId;
        record.color = round.color;
        record.isActive = true;
        record.sourceUrl = sourceUrl ?? record.sourceUrl ?? null;
        record.lastSyncedAt = now;
        return record;
      });

      const inactiveRoundIds = new Set(getInactiveAmisRecruitmentRoundIds(
        existing.map((round) => round.amisRoundId),
        rounds.map((round) => round.amisRoundId),
      ));
      const inactiveRecords = existing
        .filter((round) => inactiveRoundIds.has(round.amisRoundId) && round.isActive)
        .map((round) => {
          round.isActive = false;
          round.sourceUrl = sourceUrl ?? round.sourceUrl;
          round.lastSyncedAt = now;
          return round;
        });

      await repository.save([...activeRecords, ...inactiveRecords]);

      return activeRecords
        .sort((left, right) => left.sortOrder - right.sortOrder || left.roundName.localeCompare(right.roundName, 'vi'))
        .map((round) => this.toResponse(round));
    });
  }

  async list(amisRecruitmentId: string): Promise<AmisRecruitmentRoundResponse[]> {
    const normalizedRecruitmentId = amisRecruitmentId.trim();
    if (!normalizedRecruitmentId) return [];

    const rounds = await this.dataSource.getRepository(AmisRecruitmentRoundEntity).find({
      where: {
        sourceSystem: ExtensionSourceSystem.AMIS,
        amisRecruitmentId: normalizedRecruitmentId,
        isActive: true,
      },
      order: {
        sortOrder: 'ASC',
        roundName: 'ASC',
      },
    });

    return rounds.map((round) => this.toResponse(round));
  }

  private toResponse(round: AmisRecruitmentRoundEntity): AmisRecruitmentRoundResponse {
    return {
      id: round.amisRoundId,
      name: round.roundName,
      sortOrder: round.sortOrder,
      roundType: round.roundType,
      roundTypeId: round.roundTypeId,
      color: round.color,
    };
  }
}
