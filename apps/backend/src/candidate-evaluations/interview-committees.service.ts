import { BadRequestException, Injectable } from '@nestjs/common';
import { UserRole } from '@interview-assistant/shared';
import { DataSource, In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { UserEntity } from '../auth/entities/user.entity';
import { CreateInterviewCommitteeDto } from './dto/create-interview-committee.dto';
import { UpdateInterviewCommitteeDto } from './dto/update-interview-committee.dto';
import { UpdateInterviewCommitteeMembersDto } from './dto/update-interview-committee-members.dto';
import { InterviewCommitteeMemberEntity } from './entities/interview-committee-member.entity';
import { InterviewCommitteeEntity } from './entities/interview-committee.entity';

export interface CommitteeActor {
  id: string;
}

@Injectable()
export class InterviewCommitteesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(InterviewCommitteeEntity)
    private readonly committeesRepo: Repository<InterviewCommitteeEntity>,
    @InjectRepository(InterviewCommitteeMemberEntity)
    private readonly membersRepo: Repository<InterviewCommitteeMemberEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
  ) {}

  async list(activeOnly = false) {
    const committees = await this.committeesRepo.find({
      where: activeOnly ? { isActive: true } : undefined,
      order: { name: 'ASC' },
    });
    return this.withMembers(committees);
  }

  async listAssignableUsers() {
    const users = await this.usersRepo.find({
      where: { role: UserRole.COMMITTEE },
      order: { name: 'ASC' },
    });
    return users.map((user) => this.userSummary(user));
  }

  async create(dto: CreateInterviewCommitteeDto, actor: CommitteeActor) {
    const name = this.normalizeName(dto.name);
    await this.assertNameAvailable(name);
    const committee = await this.committeesRepo.save(this.committeesRepo.create({
      name,
      description: this.normalizeDescription(dto.description),
      isActive: true,
      createdById: actor.id,
    }));
    return this.withMembers([committee]).then((items) => items[0]);
  }

  async update(id: string, dto: UpdateInterviewCommitteeDto) {
    const committee = await this.findCommittee(id);
    if (dto.name !== undefined) {
      const name = this.normalizeName(dto.name);
      if (name !== committee.name) await this.assertNameAvailable(name, id);
      committee.name = name;
    }
    if (dto.description !== undefined) committee.description = this.normalizeDescription(dto.description);
    if (dto.isActive !== undefined) committee.isActive = dto.isActive;
    await this.committeesRepo.save(committee);
    return this.withMembers([committee]).then((items) => items[0]);
  }

  async replaceMembers(id: string, dto: UpdateInterviewCommitteeMembersDto) {
    await this.findCommittee(id);
    const userIds = [...new Set(dto.userIds)];
    const users = userIds.length > 0
      ? await this.usersRepo.find({ where: { id: In(userIds) } })
      : [];
    if (users.length !== userIds.length || users.some((user) => user.role !== UserRole.COMMITTEE)) {
      throw new BadRequestException('Every committee member must have the HĐCM role');
    }

    await this.dataSource.transaction(async (manager) => {
      const membersRepo = manager.getRepository(InterviewCommitteeMemberEntity);
      await membersRepo.delete({ committeeId: id });
      if (userIds.length > 0) {
        await membersRepo.save(userIds.map((userId) => membersRepo.create({ committeeId: id, userId })));
      }
    });
    const committee = await this.findCommittee(id);
    return this.withMembers([committee]).then((items) => items[0]);
  }

  private async findCommittee(id: string) {
    const committee = await this.committeesRepo.findOne({ where: { id } });
    if (!committee) throw new BadRequestException('Interview committee not found');
    return committee;
  }

  private async assertNameAvailable(name: string, ignoredId?: string) {
    const existing = await this.committeesRepo.findOne({ where: { name } });
    if (existing && existing.id !== ignoredId) {
      throw new BadRequestException('An interview committee with this name already exists');
    }
  }

  private async withMembers(committees: InterviewCommitteeEntity[]) {
    const committeeIds = committees.map((committee) => committee.id);
    const members = committeeIds.length > 0
      ? await this.membersRepo.find({ where: { committeeId: In(committeeIds) }, order: { createdAt: 'ASC' } })
      : [];
    const userIds = [...new Set(members.map((member) => member.userId))];
    const users = userIds.length > 0 ? await this.usersRepo.find({ where: { id: In(userIds) } }) : [];
    const userMap = new Map(users.map((user) => [user.id, user]));
    const membersMap = new Map<string, InterviewCommitteeMemberEntity[]>();
    for (const member of members) {
      const current = membersMap.get(member.committeeId) ?? [];
      current.push(member);
      membersMap.set(member.committeeId, current);
    }

    return committees.map((committee) => {
      const committeeMembers = (membersMap.get(committee.id) ?? [])
        .map((member) => userMap.get(member.userId))
        .filter((user): user is UserEntity => user !== undefined);
      return {
        id: committee.id,
        name: committee.name,
        description: committee.description,
        isActive: committee.isActive,
        memberCount: committeeMembers.length,
        members: committeeMembers.map((user) => this.userSummary(user)),
        createdAt: committee.createdAt.toISOString(),
        updatedAt: committee.updatedAt.toISOString(),
      };
    });
  }

  private userSummary(user: UserEntity) {
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }

  private normalizeName(name: string) {
    const normalized = name.trim();
    if (!normalized) throw new BadRequestException('Committee name is required');
    return normalized;
  }

  private normalizeDescription(description?: string | null) {
    const normalized = description?.trim();
    return normalized || null;
  }
}
