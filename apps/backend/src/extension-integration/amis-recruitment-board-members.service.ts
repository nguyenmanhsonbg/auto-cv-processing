import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { UserEntity } from '../auth/entities/user.entity';
import { SyncAmisRecruitmentBoardMembersDto } from './dto/sync-amis-recruitment-board-members.dto';
import { AmisRecruitmentBoardMemberEntity } from './entities/amis-recruitment-board-member.entity';
import { ExtensionSourceSystem } from './enums';

export type AmisBoardMemberMappingStatus = 'MATCHED' | 'UNMATCHED';

export interface AmisRecruitmentBoardMemberResponse {
  id: string;
  amisBoardId: string | null;
  amisUserId: string;
  fullName: string;
  email: string | null;
  isAdmin: boolean;
  isViewOffer: boolean;
  isPushNotification: boolean;
  isActive: boolean;
  mappingStatus: AmisBoardMemberMappingStatus;
  localUserId: string | null;
  localUserRole: string | null;
  lastSyncedAt: string;
}

@Injectable()
export class AmisRecruitmentBoardMembersService {
  constructor(private readonly dataSource: DataSource) {}

  async sync(
    amisRecruitmentId: string,
    input: SyncAmisRecruitmentBoardMembersDto,
  ) {
    const normalizedRecruitmentId = amisRecruitmentId.trim();
    if (!normalizedRecruitmentId) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'amisRecruitmentId is required.',
      });
    }

    const members = this.normalizeMembers(input.members);
    const sourceUrl = input.sourceUrl?.trim() || null;
    const lastSyncedAt = new Date();

    return this.dataSource.transaction(async (manager) => {
      const boardRepository = manager.getRepository(AmisRecruitmentBoardMemberEntity);
      const userRepository = manager.getRepository(UserEntity);
      const existing = await boardRepository.find({
        where: {
          sourceSystem: ExtensionSourceSystem.AMIS,
          amisRecruitmentId: normalizedRecruitmentId,
        },
      });
      const incomingIds = new Set(members.map((member) => member.amisUserId));
      const mappedUsers = members.length > 0
        ? await userRepository.find({ where: { amisUserId: In([...incomingIds]) } })
        : [];
      const userByAmisId = new Map(mappedUsers.map((user) => [user.amisUserId, user]));

      const activeRecords = members.map((member) => {
        const record = existing.find((item) => item.amisUserId === member.amisUserId)
          ?? boardRepository.create({
            sourceSystem: ExtensionSourceSystem.AMIS,
            amisRecruitmentId: normalizedRecruitmentId,
            amisUserId: member.amisUserId,
          });
        record.amisBoardId = member.amisBoardId ?? null;
        record.fullName = member.fullName;
        record.email = member.email?.trim() || null;
        record.isAdmin = member.isAdmin;
        record.isViewOffer = member.isViewOffer;
        record.isPushNotification = member.isPushNotification;
        record.isActive = true;
        record.revokedAt = null;
        record.sourceUrl = sourceUrl ?? record.sourceUrl ?? null;
        record.lastSyncedAt = lastSyncedAt;
        return record;
      });

      const revokedRecords = existing
        .filter((record) => record.isActive && !incomingIds.has(record.amisUserId))
        .map((record) => {
          record.isActive = false;
          record.revokedAt = lastSyncedAt;
          record.sourceUrl = sourceUrl ?? record.sourceUrl;
          record.lastSyncedAt = lastSyncedAt;
          return record;
        });

      await boardRepository.save([...activeRecords, ...revokedRecords]);

      const savedRecords = await boardRepository.find({
        where: {
          sourceSystem: ExtensionSourceSystem.AMIS,
          amisRecruitmentId: normalizedRecruitmentId,
          isActive: true,
        },
        order: { createdAt: 'ASC' },
      });
      const responseMembers = savedRecords.map((record) => this.toResponse(
        record,
        userByAmisId.get(record.amisUserId),
      ));

      return {
        amisRecruitmentId: normalizedRecruitmentId,
        syncedCount: activeRecords.length,
        revokedCount: revokedRecords.length,
        matchedCount: responseMembers.filter((member) => member.mappingStatus === 'MATCHED').length,
        unmatchedCount: responseMembers.filter((member) => member.mappingStatus === 'UNMATCHED').length,
        lastSyncedAt: lastSyncedAt.toISOString(),
        members: responseMembers,
      };
    });
  }

  async listActive(amisRecruitmentId: string) {
    const normalizedRecruitmentId = amisRecruitmentId.trim();
    if (!normalizedRecruitmentId) return [];

    const records = await this.dataSource.getRepository(AmisRecruitmentBoardMemberEntity).find({
      where: {
        sourceSystem: ExtensionSourceSystem.AMIS,
        amisRecruitmentId: normalizedRecruitmentId,
        isActive: true,
      },
      order: { createdAt: 'ASC' },
    });
    const userIds = records.map((record) => record.amisUserId);
    const users = userIds.length > 0
      ? await this.dataSource.getRepository(UserEntity).find({ where: { amisUserId: In(userIds) } })
      : [];
    const userByAmisId = new Map(users.map((user) => [user.amisUserId, user]));
    return records.map((record) => this.toResponse(record, userByAmisId.get(record.amisUserId)));
  }

  private normalizeMembers(input: SyncAmisRecruitmentBoardMembersDto['members']) {
    const uniqueMembers = new Map<string, SyncAmisRecruitmentBoardMembersDto['members'][number]>();
    for (const member of input ?? []) {
      const amisUserId = member.amisUserId.trim();
      const fullName = member.fullName.trim();
      if (!amisUserId || !fullName || uniqueMembers.has(amisUserId)) continue;
      uniqueMembers.set(amisUserId, {
        ...member,
        amisUserId,
        fullName,
        email: member.email?.trim() || null,
      });
    }
    return [...uniqueMembers.values()];
  }

  private toResponse(
    record: AmisRecruitmentBoardMemberEntity,
    user?: UserEntity,
  ): AmisRecruitmentBoardMemberResponse {
    return {
      id: record.id,
      amisBoardId: record.amisBoardId,
      amisUserId: record.amisUserId,
      fullName: record.fullName,
      email: record.email,
      isAdmin: record.isAdmin,
      isViewOffer: record.isViewOffer,
      isPushNotification: record.isPushNotification,
      isActive: record.isActive,
      mappingStatus: user ? 'MATCHED' : 'UNMATCHED',
      localUserId: user?.id ?? null,
      localUserRole: user?.role ?? null,
      lastSyncedAt: record.lastSyncedAt.toISOString(),
    };
  }
}
