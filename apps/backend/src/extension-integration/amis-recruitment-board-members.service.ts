import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@interview-assistant/shared';
import { DataSource, In, Repository } from 'typeorm';
import { UserEntity } from '../auth/entities/user.entity';
import { hasUserRole } from '../auth/role-utils';
import { InternalEntity } from '../internals/entities/internal.entity';
import { SyncAmisRecruitmentBoardMembersDto } from './dto/sync-amis-recruitment-board-members.dto';
import { SyncAmisCurrentUserIdentityDto } from './dto/sync-amis-current-user-identity.dto';
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

export interface AmisRecruitmentAccessActor {
  id: string;
  role: UserRole;
  roles?: readonly UserRole[];
}

export type AmisIdentityMatchMethod = 'EMAIL' | 'PHONE' | 'EMAIL_AND_PHONE';

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

  async syncCurrentIdentity(
    actor: AmisRecruitmentAccessActor,
    input: SyncAmisCurrentUserIdentityDto,
  ) {
    if (!hasUserRole(actor, UserRole.COMMITTEE)) {
      throw new ForbiddenException({
        code: 'EXTENSION_COMMITTEE_ROLE_REQUIRED',
        message: 'Chỉ tài khoản HĐCM mới được xác minh mapping AMIS.',
      });
    }

    const amisUserId = input.amisUserId.trim().toLowerCase();
    const incomingEmail = this.normalizeEmail(input.email);
    const incomingPhone = this.normalizePhone(input.phone);
    if (!incomingEmail && !incomingPhone) {
      throw new ForbiddenException({
        code: 'AMIS_CONTACT_UNAVAILABLE',
        message: 'AMIS không trả về email hoặc số điện thoại để xác minh tài khoản.',
      });
    }

    return this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(UserEntity);
      const internalRepository = manager.getRepository(InternalEntity);
      const localUser = await userRepository.findOne({
        where: { id: actor.id },
        relations: ['roleMemberships'],
      });
      if (!localUser || !hasUserRole({
        role: localUser.role,
        roles: localUser.roleMemberships?.map((membership) => membership.role),
      }, UserRole.COMMITTEE)) {
        throw new ForbiddenException({
          code: 'EXTENSION_COMMITTEE_ACCOUNT_INVALID',
          message: 'Tài khoản Extension không có quyền HĐCM hợp lệ.',
        });
      }

      const internal = await this.findInternalAccountForUser(
        internalRepository,
        localUser,
      );
      if (!internal || !internal.isActive) {
        throw new ForbiddenException({
          code: 'INTERNAL_ACCOUNT_NOT_FOUND',
          message: 'Không tìm thấy account nhân sự nội bộ đang hoạt động để mapping.',
        });
      }
      if (internal.userId && internal.userId !== localUser.id) {
        throw new ForbiddenException({
          code: 'INTERNAL_ACCOUNT_ALREADY_LINKED',
          message: 'Account nội bộ đã được liên kết với account Extension khác.',
        });
      }

      const matchMethod = this.resolveIdentityMatchMethod(
        internal,
        incomingEmail,
        incomingPhone,
      );
      if (!matchMethod) {
        throw new ForbiddenException({
          code: 'AMIS_CONTACT_MISMATCH',
          message: 'Email hoặc số điện thoại AMIS không khớp account nội bộ.',
        });
      }

      const mappedUser = await userRepository.findOne({ where: { amisUserId } });
      if (mappedUser && mappedUser.id !== localUser.id) {
        throw new ForbiddenException({
          code: 'AMIS_USER_ALREADY_MAPPED',
          message: 'Tài khoản AMIS này đã được mapping với account Extension khác.',
        });
      }
      if (
        localUser.amisUserId
        && localUser.amisUserId.trim().toLowerCase() !== amisUserId
      ) {
        throw new ForbiddenException({
          code: 'AMIS_EXTENSION_ACCOUNT_ALREADY_BOUND',
          message: 'Account Extension đã được mapping với một tài khoản AMIS khác.',
        });
      }

      if (!internal.userId) {
        internal.userId = localUser.id;
        await internalRepository.save(internal);
      }

      localUser.amisUserId = amisUserId;
      localUser.amisFullName = this.normalizeOptionalValue(input.fullName) ?? localUser.amisFullName;
      localUser.amisEmail = incomingEmail ?? localUser.amisEmail;
      localUser.amisPhone = incomingPhone ?? localUser.amisPhone;
      localUser.amisTenantId = this.normalizeOptionalValue(input.tenantId) ?? localUser.amisTenantId;
      localUser.amisIdentityVerifiedAt = new Date();
      await userRepository.save(localUser);

      return {
        matched: true,
        userId: localUser.id,
        amisUserId: localUser.amisUserId,
        matchMethod,
        verifiedAt: localUser.amisIdentityVerifiedAt.toISOString(),
      };
    });
  }

  async assertCurrentAmisAccountAccess(
    amisRecruitmentId: string,
    actor: AmisRecruitmentAccessActor,
    currentAmisUserId?: string | null,
  ) {
    if (!hasUserRole(actor, UserRole.COMMITTEE)) return;

    const normalizedRecruitmentId = amisRecruitmentId.trim();
    const normalizedAmisUserId = currentAmisUserId?.trim().toLowerCase();
    if (!normalizedAmisUserId) {
      throw new ForbiddenException({
        code: 'AMIS_SESSION_USER_UNAVAILABLE',
        message: 'Không xác định được tài khoản AMIS hiện tại. Vui lòng mở lại JD trên AMIS.',
      });
    }

    const localUser = await this.dataSource.getRepository(UserEntity).findOne({
      where: { id: actor.id },
      relations: ['roleMemberships'],
    });
    if (!localUser || !hasUserRole({
      role: localUser.role,
      roles: localUser.roleMemberships?.map((membership) => membership.role),
    }, UserRole.COMMITTEE)) {
      throw new ForbiddenException({
        code: 'EXTENSION_COMMITTEE_ACCOUNT_INVALID',
        message: 'Tài khoản Extension không có quyền HĐCM hợp lệ.',
      });
    }
    if (!localUser.amisUserId || localUser.amisUserId.trim().toLowerCase() !== normalizedAmisUserId) {
      throw new ForbiddenException({
        code: 'AMIS_EXTENSION_ACCOUNT_MISMATCH',
        message: 'Tài khoản AMIS hiện tại không khớp với tài khoản HĐCM Extension.',
      });
    }

    const membership = await this.dataSource.getRepository(AmisRecruitmentBoardMemberEntity).findOne({
      where: {
        sourceSystem: ExtensionSourceSystem.AMIS,
        amisRecruitmentId: normalizedRecruitmentId,
        amisUserId: normalizedAmisUserId,
        isActive: true,
      },
    });
    if (!membership) {
      throw new ForbiddenException({
        code: 'AMIS_COMMITTEE_MEMBERSHIP_REQUIRED',
        message: 'Tài khoản HĐCM này chưa được thêm vào Hội đồng tuyển dụng của JD.',
      });
    }
  }

  private async findInternalAccountForUser(
    repository: Repository<InternalEntity>,
    user: UserEntity,
  ) {
    const linkedInternal = await repository.findOne({ where: { userId: user.id } });
    if (linkedInternal) return linkedInternal;
    return repository.findOne({ where: { email: this.normalizeEmail(user.email) ?? user.email } });
  }

  private resolveIdentityMatchMethod(
    internal: InternalEntity,
    incomingEmail: string | null,
    incomingPhone: string | null,
  ): AmisIdentityMatchMethod | null {
    const internalEmail = this.normalizeEmail(internal.email);
    const internalPhone = this.normalizePhone(internal.phone);
    const emailMatches = Boolean(incomingEmail && internalEmail && incomingEmail === internalEmail);
    const phoneMatches = Boolean(incomingPhone && internalPhone && incomingPhone === internalPhone);
    const emailConflicts = Boolean(incomingEmail && internalEmail && incomingEmail !== internalEmail);
    const phoneConflicts = Boolean(incomingPhone && internalPhone && incomingPhone !== internalPhone);

    if (emailConflicts || phoneConflicts || (!emailMatches && !phoneMatches)) return null;
    if (emailMatches && phoneMatches) return 'EMAIL_AND_PHONE';
    return emailMatches ? 'EMAIL' : 'PHONE';
  }

  private normalizeEmail(value?: string | null) {
    const normalized = value?.trim().toLowerCase();
    return normalized || null;
  }

  private normalizePhone(value?: string | null) {
    const digits = value?.replace(/\D/g, '') ?? '';
    if (digits.length === 11 && digits.startsWith('84')) return `0${digits.slice(2)}`;
    return digits || null;
  }

  private normalizeOptionalValue(value?: string | null) {
    const normalized = value?.trim();
    return normalized || null;
  }

  private normalizeMembers(input: SyncAmisRecruitmentBoardMembersDto['members']) {
    const uniqueMembers = new Map<string, SyncAmisRecruitmentBoardMembersDto['members'][number]>();
    for (const member of input ?? []) {
      const amisUserId = member.amisUserId.trim().toLowerCase();
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
