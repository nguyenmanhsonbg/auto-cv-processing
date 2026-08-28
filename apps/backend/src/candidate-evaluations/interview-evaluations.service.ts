import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@interview-assistant/shared';
import {
  InterviewEvaluationAuditAction,
  InterviewEvaluationCriterionData,
  InterviewEvaluationFormData,
  InterviewEvaluationReviewerSection,
  InterviewEvaluationReviewerStatus,
  InterviewEvaluationRoundKey,
  InterviewEvaluationRoundStatus,
  InterviewEvaluationTemplate,
} from '@interview-assistant/shared';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { UserEntity } from '../auth/entities/user.entity';
import { hasUserRole } from '../auth/role-utils';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { CreateInterviewEvaluationDto } from './dto/create-interview-evaluation.dto';
import { AggregateInterviewEvaluationDto } from './dto/aggregate-interview-evaluation.dto';
import { SaveInterviewReviewDto } from './dto/save-interview-review.dto';
import { SyncInterviewEvaluationContextDto } from './dto/sync-interview-evaluation-context.dto';
import { InterviewEvaluationAuditEntity } from './entities/interview-evaluation-audit.entity';
import { InterviewEvaluationCaseEntity } from './entities/interview-evaluation-case.entity';
import { InterviewEvaluationReviewerEntity } from './entities/interview-evaluation-reviewer.entity';
import { InterviewEvaluationRoundEntity } from './entities/interview-evaluation-round.entity';
import { AmisRecruitmentBoardMemberEntity } from '../extension-integration/entities/amis-recruitment-board-member.entity';
import { AmisRecruitmentRoundEntity } from '../extension-integration/entities/amis-recruitment-round.entity';
import { RecruitmentExternalReferenceEntity } from '../extension-integration/entities/recruitment-external-reference.entity';
import {
  ExtensionExternalEntityType,
  ExtensionInternalEntityType,
  ExtensionSourceSystem,
} from '../extension-integration/enums';

export interface InterviewEvaluationActor {
  id: string;
  role: UserRole;
  roles?: readonly UserRole[];
  amisUserId?: string | null;
  amisRecruitmentId?: string | null;
}

export interface InterviewEvaluationHrbpAccess {
  required: boolean;
  allowed: boolean;
  expectedAmisUserId: string | null;
  expectedName: string | null;
}

const ROUND_ORDER: readonly InterviewEvaluationRoundKey[] = [
  InterviewEvaluationRoundKey.ECC,
  InterviewEvaluationRoundKey.ACC,
  InterviewEvaluationRoundKey.OFFER,
];

const ROUND_NAMES: Record<InterviewEvaluationRoundKey, string> = {
  [InterviewEvaluationRoundKey.ECC]: 'ECC',
  [InterviewEvaluationRoundKey.ACC]: 'ACC',
  [InterviewEvaluationRoundKey.OFFER]: 'Offer',
};

const AMIS_INTERVIEW_ROUND_TYPE = 3;

@Injectable()
export class InterviewEvaluationsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ApplicationEntity)
    private readonly applicationsRepo: Repository<ApplicationEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(InterviewEvaluationCaseEntity)
    private readonly casesRepo: Repository<InterviewEvaluationCaseEntity>,
    @InjectRepository(InterviewEvaluationRoundEntity)
    private readonly roundsRepo: Repository<InterviewEvaluationRoundEntity>,
    @InjectRepository(InterviewEvaluationReviewerEntity)
    private readonly reviewersRepo: Repository<InterviewEvaluationReviewerEntity>,
    @InjectRepository(InterviewEvaluationAuditEntity)
    private readonly auditsRepo: Repository<InterviewEvaluationAuditEntity>,
    @InjectRepository(AmisRecruitmentBoardMemberEntity)
    private readonly amisBoardMembersRepo: Repository<AmisRecruitmentBoardMemberEntity>,
    @InjectRepository(RecruitmentExternalReferenceEntity)
    private readonly externalReferencesRepo: Repository<RecruitmentExternalReferenceEntity>,
  ) {}

  async getSummary(applicationId: string, actor: InterviewEvaluationActor) {
    const application = await this.findApplication(applicationId);
    const evaluationCase = await this.casesRepo.findOne({ where: { applicationId } });
    const hrbpAccess = this.getHrbpAccess(application, actor);

    if (!evaluationCase) {
      await this.assertAmisContext(application, actor, hasUserRole(actor, UserRole.COMMITTEE));
      return {
        hasCase: false,
        applicationId,
        candidate: this.candidateSummary(application),
        job: this.jobSummary(application),
        template: null,
        currentRound: {
          key: InterviewEvaluationRoundKey.ECC,
          name: 'Chưa khởi tạo',
          status: null,
        },
        reviewerProgress: { total: 0, submitted: 0 },
        canManage: this.canManage(actor),
        canView: this.canManage(actor) || hasUserRole(actor, UserRole.COMMITTEE),
        canReview: hrbpAccess.allowed || hasUserRole(actor, UserRole.COMMITTEE),
        hrbpAccess,
      };
    }

    const round = await this.findCurrentRound(evaluationCase);
    await this.ensureCommitteeReviewers(application, actor, round);
    await this.assertCaseAccess(evaluationCase, actor, round, application);
    const reviewers = await this.reviewersRepo.find({ where: { roundId: round.id } });
    return {
      hasCase: true,
      applicationId,
      caseId: evaluationCase.id,
      candidate: this.candidateSummary(application),
      job: this.jobSummary(application),
      template: evaluationCase.template,
      currentRound: this.roundSummary(round),
      reviewerProgress: this.progress(reviewers),
      canManage: this.canManage(actor),
      canView: true,
      canReview: hrbpAccess.allowed || hasUserRole(actor, UserRole.COMMITTEE),
      hrbpAccess,
    };
  }

  async getDetail(applicationId: string, actor: InterviewEvaluationActor, requestedRoundId?: string) {
    const application = await this.findApplication(applicationId);
    const evaluationCase = await this.casesRepo.findOne({ where: { applicationId } });
    if (!evaluationCase) {
      throw new BadRequestException('Interview evaluation case has not been created');
    }

    const rounds = await this.roundsRepo.find({
      where: { caseId: evaluationCase.id },
      order: { sortOrder: 'ASC' },
    });
    const currentRound = this.selectCurrentRound(rounds, evaluationCase.currentRoundId, requestedRoundId);
    await this.ensureCommitteeReviewers(application, actor, currentRound);
    await this.assertCaseAccess(evaluationCase, actor, currentRound, application);
    this.assertHrbpAccess(application, actor);
    const hrbpAccess = this.getHrbpAccess(application, actor);
    const reviewers = await this.reviewersRepo.find({
      where: { roundId: currentRound.id },
      order: { createdAt: 'ASC' },
    });
    const users = await this.usersRepo.findByIds(reviewers.map((reviewer) => reviewer.userId));
    const userMap = new Map(users.map((user) => [user.id, user]));
    const canManage = this.canManage(actor);
    const visibleRound = this.roundDetail(currentRound);
    const hrbpReviewer = reviewers.find(
      (reviewer) => reviewer.section === InterviewEvaluationReviewerSection.HRBP,
    );
    if (!canManage) {
      visibleRound.aggregateData = {};
      if (hasUserRole(actor, UserRole.COMMITTEE)) {
        visibleRound.hrbpData = hrbpReviewer?.formData ?? visibleRound.hrbpData;
        const ownCommitteeReviewer = reviewers.find(
          (reviewer) => reviewer.userId === actor.id
            && reviewer.section === InterviewEvaluationReviewerSection.COMMITTEE,
        );
        visibleRound.committeeData = this.mergeFormData(
          visibleRound.committeeData,
          ownCommitteeReviewer?.formData,
        );
      } else {
        visibleRound.hrbpData = {};
        visibleRound.committeeData = {};
      }
    }
    const audits = await this.auditsRepo.find({
      where: { caseId: evaluationCase.id },
      order: { createdAt: 'DESC' },
      take: 50,
    });

    return {
      case: {
        id: evaluationCase.id,
        applicationId,
        candidate: this.candidateSummary(application),
        job: this.jobSummary(application),
        template: evaluationCase.template,
        source: application.source,
        sourceChannel: application.sourceChannel,
        attractivePersonnelName: hrbpAccess.expectedName ?? null,
      },
      currentRound: visibleRound,
      rounds: rounds.map((round) => this.roundSummary(round)),
      reviewers: reviewers.map((reviewer) => this.reviewerResponse(
        reviewer,
        userMap.get(reviewer.userId),
        this.canViewReviewerFormData(reviewer, actor, canManage),
      )),
      audits: this.visibleAudits(audits, canManage),
      permissions: {
        canManage,
        canReview: hasUserRole(actor, UserRole.COMMITTEE)
          || this.getHrbpAccess(application, actor).allowed
          || reviewers.some((reviewer) => reviewer.userId === actor.id),
        canAggregate: canManage,
        canComplete: canManage,
      },
    };
  }

  async listAssignedEvaluations(actor: InterviewEvaluationActor) {
    if (!hasUserRole(actor, UserRole.COMMITTEE)) {
      throw new BadRequestException('Only committee members can access assigned evaluations');
    }

    const reviewers = await this.reviewersRepo.find({
      where: {
        userId: actor.id,
        section: InterviewEvaluationReviewerSection.COMMITTEE,
      },
      order: { updatedAt: 'DESC' },
    });
    if (reviewers.length === 0) return [];

    const roundIds = [...new Set(reviewers.map((reviewer) => reviewer.roundId))];
    const rounds = await this.roundsRepo.find({ where: { id: In(roundIds) } });
    const roundMap = new Map(rounds.map((round) => [round.id, round]));
    const caseIds = [...new Set(rounds.map((round) => round.caseId))];
    const evaluationCases = caseIds.length > 0
      ? await this.casesRepo.find({ where: { id: In(caseIds) } })
      : [];
    const caseMap = new Map(evaluationCases.map((evaluationCase) => [evaluationCase.id, evaluationCase]));
    const currentRounds = rounds.filter(
      (round) => caseMap.get(round.caseId)?.currentRoundId === round.id,
    );
    const currentCaseIds = new Set(currentRounds.map((round) => round.caseId));
    const applicationIds = evaluationCases
      .filter((evaluationCase) => currentCaseIds.has(evaluationCase.id))
      .map((evaluationCase) => evaluationCase.applicationId);
    const applications = applicationIds.length > 0
      ? await this.applicationsRepo.find({
        where: { id: In(applicationIds) },
        relations: ['candidate', 'jobPosting'],
      })
      : [];
    const applicationMap = new Map(applications.map((application) => [application.id, application]));
    const currentRoundIds = currentRounds.map((round) => round.id);
    const currentReviewers = currentRoundIds.length > 0
      ? await this.reviewersRepo.find({ where: { roundId: In(currentRoundIds) } })
      : [];
    const progressMap = new Map<string, { total: number; submitted: number }>();
    for (const reviewer of currentReviewers) {
      const currentProgress = progressMap.get(reviewer.roundId) ?? { total: 0, submitted: 0 };
      currentProgress.total += 1;
      if (reviewer.status === InterviewEvaluationReviewerStatus.SUBMITTED) currentProgress.submitted += 1;
      progressMap.set(reviewer.roundId, currentProgress);
    }

    return reviewers.flatMap((reviewer) => {
      const round = roundMap.get(reviewer.roundId);
      const evaluationCase = round ? caseMap.get(round.caseId) : undefined;
      const application = evaluationCase ? applicationMap.get(evaluationCase.applicationId) : undefined;
      if (
        !round
        || !evaluationCase
        || evaluationCase.currentRoundId !== round.id
        || !application
      ) return [];

      return [{
        applicationId: application.id,
        caseId: evaluationCase.id,
        candidate: this.candidateSummary(application),
        job: this.jobSummary(application),
        round: this.roundSummary(round),
        reviewer: {
          id: reviewer.id,
          status: reviewer.status,
          submittedAt: reviewer.submittedAt?.toISOString() ?? null,
        },
        reviewerProgress: progressMap.get(round.id) ?? { total: 0, submitted: 0 },
      }];
    });
  }

  async syncAmisInterviewContext(
    applicationId: string,
    dto: SyncInterviewEvaluationContextDto,
    actor: InterviewEvaluationActor,
  ) {
    this.assertManager(actor);
    if (dto.amisRoundType !== AMIS_INTERVIEW_ROUND_TYPE) {
      throw new BadRequestException('Only AMIS interview rounds can synchronize an evaluation context');
    }

    await this.findApplication(applicationId);
    const evaluationCase = await this.casesRepo.findOne({ where: { applicationId } });
    if (!evaluationCase) {
      return {
        synchronized: false,
        hasCase: false,
        applicationId,
        amisRoundId: dto.amisRoundId,
        amisRoundName: dto.amisRoundName,
      };
    }

    await this.dataSource.transaction(async (manager) => {
      const roundRepo = manager.getRepository(InterviewEvaluationRoundEntity);
      const rounds = await roundRepo.find({
        where: { caseId: evaluationCase.id },
        order: { sortOrder: 'ASC' },
      });
      if (rounds.length === 0) {
        throw new BadRequestException('Interview evaluation round not found');
      }

      const previousRound = this.selectCurrentRound(rounds, evaluationCase.currentRoundId);
      const canonicalRound = await this.consolidateRounds(manager, evaluationCase.id, rounds);
      const stageChanged = canonicalRound.amisRoundId !== dto.amisRoundId;
      const contextChanged = stageChanged
        || canonicalRound.roundName !== dto.amisRoundName
        || canonicalRound.amisSortOrder !== dto.amisSortOrder;

      canonicalRound.amisRoundId = dto.amisRoundId;
      canonicalRound.amisRoundType = dto.amisRoundType;
      canonicalRound.amisSortOrder = dto.amisSortOrder;
      canonicalRound.roundName = dto.amisRoundName;
      canonicalRound.sortOrder = dto.amisSortOrder;
      if (stageChanged) {
        canonicalRound.status = InterviewEvaluationRoundStatus.READY_TO_EVALUATE;
        canonicalRound.completedById = null;
        canonicalRound.completedAt = null;
      }
      if (contextChanged || rounds.length > 1) {
        canonicalRound.version = Math.max(...rounds.map((round) => round.version)) + 1;
      }
      await roundRepo.save(canonicalRound);
      evaluationCase.currentRoundId = canonicalRound.id;
      await manager.getRepository(InterviewEvaluationCaseEntity).save(evaluationCase);
      if (contextChanged || rounds.length > 1) {
        await this.recordAudit(manager, {
          caseId: evaluationCase.id,
          roundId: canonicalRound.id,
          actorId: actor.id,
          action: InterviewEvaluationAuditAction.ROUND_CONTEXT_SYNCHRONIZED,
          fromStatus: previousRound.status,
          toStatus: canonicalRound.status,
          metadata: {
            source: 'AMIS_STAGE_TRANSITION',
            fromRoundId: previousRound.amisRoundId,
            toRoundId: dto.amisRoundId,
            roundName: dto.amisRoundName,
            consolidatedRoundCount: rounds.length,
          },
        });
      }
    });

    const summary = await this.getSummary(applicationId, actor);
    return { synchronized: true, ...summary };
  }

  async createCase(
    applicationId: string,
    dto: CreateInterviewEvaluationDto,
    actor: InterviewEvaluationActor,
  ) {
    const application = await this.findApplication(applicationId);
    if (hasUserRole(actor, UserRole.COMMITTEE)) {
      await this.assertAmisContext(application, actor, true);
    } else {
      this.assertManager(actor);
      this.assertHrbpAccess(application, actor);
    }
    const template = dto.template ?? InterviewEvaluationTemplate.KNL;
    const legacyRoundKey = dto.roundKey ?? InterviewEvaluationRoundKey.ECC;
    const roundKey = dto.amisRoundId ? `AMIS_${dto.amisRoundId}` : legacyRoundKey;
    const roundName = dto.roundName?.trim() || ROUND_NAMES[legacyRoundKey];
    const reviewerAssignments = await this.resolveAmisReviewerAssignments(application, actor);

    await this.dataSource.transaction(async (manager) => {
      const caseRepo = manager.getRepository(InterviewEvaluationCaseEntity);
      const existing = await caseRepo.findOne({ where: { applicationId } });
      if (existing) {
        const currentRound = existing.currentRoundId
          ? await manager.getRepository(InterviewEvaluationRoundEntity).findOne({
            where: { id: existing.currentRoundId, caseId: existing.id },
          })
          : null;
        if (currentRound) {
          await this.appendReviewers(manager, currentRound.id, reviewerAssignments);
        }
        return;
      }

      const evaluationCase = await caseRepo.save(caseRepo.create({
        applicationId,
        candidateId: application.candidateId,
        jobPostingId: application.jobPostingId,
        jobDescriptionVersionId: application.jobDescriptionVersionId,
        template,
        createdById: actor.id,
        currentRoundId: null,
      }));
      const round = await manager.getRepository(InterviewEvaluationRoundEntity).save(
        manager.getRepository(InterviewEvaluationRoundEntity).create({
          caseId: evaluationCase.id,
          committeeId: null,
          roundKey,
          roundName,
          amisRoundId: dto.amisRoundId ?? null,
          amisRoundType: dto.amisRoundType ?? null,
          amisSortOrder: dto.amisSortOrder ?? null,
          sortOrder: dto.amisSortOrder ?? ROUND_ORDER.indexOf(legacyRoundKey) + 1,
          status: InterviewEvaluationRoundStatus.READY_TO_EVALUATE,
          version: 1,
          hrbpData: {},
          committeeData: {},
          aggregateData: {},
          completedById: null,
          completedAt: null,
        }),
      );
      evaluationCase.currentRoundId = round.id;
      await caseRepo.save(evaluationCase);

      await this.appendReviewers(manager, round.id, reviewerAssignments);

      await this.recordAudit(manager, {
        caseId: evaluationCase.id,
        roundId: round.id,
        actorId: actor.id,
        action: InterviewEvaluationAuditAction.CASE_CREATED,
        fromStatus: null,
        toStatus: round.status,
        metadata: {
          template,
          roundKey,
          roundName,
          reviewerUserIds: [
            ...reviewerAssignments.hrbpUserIds,
            ...reviewerAssignments.committeeUserIds,
          ],
        },
      });
      await this.recordAudit(manager, {
        caseId: evaluationCase.id,
        roundId: round.id,
        actorId: actor.id,
        action: InterviewEvaluationAuditAction.ROUND_CREATED,
        fromStatus: null,
        toStatus: round.status,
        metadata: { roundKey, roundName },
      });
    });
    return this.getDetail(applicationId, actor);
  }

  async saveReview(
    applicationId: string,
    roundId: string,
    section: InterviewEvaluationReviewerSection,
    dto: SaveInterviewReviewDto,
    actor: InterviewEvaluationActor,
  ) {
    return this.persistReview(applicationId, roundId, section, dto, actor, false);
  }

  async submitReview(
    applicationId: string,
    roundId: string,
    section: InterviewEvaluationReviewerSection,
    dto: SaveInterviewReviewDto,
    actor: InterviewEvaluationActor,
  ) {
    return this.persistReview(applicationId, roundId, section, dto, actor, true);
  }

  async aggregate(
    applicationId: string,
    roundId: string,
    dto: AggregateInterviewEvaluationDto,
    actor: InterviewEvaluationActor,
  ) {
    this.assertManager(actor);
    const evaluationCase = await this.findCaseForRound(applicationId, roundId);
    const round = await this.roundsRepo.findOne({ where: { id: roundId, caseId: evaluationCase.id } });
    if (!round) throw new BadRequestException('Interview evaluation round not found');
    this.assertVersion(round, dto.expectedVersion);
    const reviewers = await this.reviewersRepo.find({ where: { roundId } });
    const committeeReviewers = reviewers.filter(
      (reviewer) => reviewer.section === InterviewEvaluationReviewerSection.COMMITTEE,
    );
    const allCommitteeSubmitted = committeeReviewers.every(
      (reviewer) => reviewer.status === InterviewEvaluationReviewerStatus.SUBMITTED,
    );
    const hrSubmitted = reviewers.some(
      (reviewer) => reviewer.section === InterviewEvaluationReviewerSection.HRBP
        && reviewer.status === InterviewEvaluationReviewerStatus.SUBMITTED,
    );
    if (!hrSubmitted || !allCommitteeSubmitted) {
      throw new BadRequestException('HRBP and all assigned committee reviews must be submitted first');
    }

    const previousStatus = round.status;
    round.aggregateData = dto.formData;
    round.status = InterviewEvaluationRoundStatus.WAITING_AGGREGATION;
    round.version += 1;
    await this.roundsRepo.save(round);
    await this.recordAudit(this.dataSource.manager, {
      caseId: evaluationCase.id,
      roundId,
      actorId: actor.id,
      action: InterviewEvaluationAuditAction.AGGREGATION_SAVED,
      fromStatus: previousStatus,
      toStatus: round.status,
      metadata: { version: round.version },
    });
    return this.getDetail(applicationId, actor, roundId);
  }

  async saveAggregateDraft(
    applicationId: string,
    roundId: string,
    dto: AggregateInterviewEvaluationDto,
    actor: InterviewEvaluationActor,
  ) {
    this.assertManager(actor);
    const evaluationCase = await this.findCaseForRound(applicationId, roundId);
    const round = await this.roundsRepo.findOne({ where: { id: roundId, caseId: evaluationCase.id } });
    if (!round) throw new BadRequestException('Interview evaluation round not found');
    this.assertVersion(round, dto.expectedVersion);

    const previousStatus = round.status;
    round.aggregateData = dto.formData;
    round.version += 1;
    await this.roundsRepo.save(round);
    await this.recordAudit(this.dataSource.manager, {
      caseId: evaluationCase.id,
      roundId,
      actorId: actor.id,
      action: InterviewEvaluationAuditAction.AGGREGATION_DRAFT_SAVED,
      fromStatus: previousStatus,
      toStatus: round.status,
      metadata: { version: round.version },
    });
    return this.getDetail(applicationId, actor, roundId);
  }

  async complete(applicationId: string, roundId: string, actor: InterviewEvaluationActor) {
    this.assertManager(actor);
    const evaluationCase = await this.findCaseForRound(applicationId, roundId);
    const round = await this.roundsRepo.findOne({ where: { id: roundId, caseId: evaluationCase.id } });
    if (!round) throw new BadRequestException('Interview evaluation round not found');
    if (round.status !== InterviewEvaluationRoundStatus.WAITING_AGGREGATION) {
      throw new BadRequestException('Aggregate the interview evaluation before completing the round');
    }
    if (!round.aggregateData?.overall?.result || round.aggregateData.overall.result === 'PENDING') {
      throw new BadRequestException('A final interview result is required before completion');
    }
    round.status = InterviewEvaluationRoundStatus.COMPLETED;
    round.completedById = actor.id;
    round.completedAt = new Date();
    round.version += 1;
    await this.roundsRepo.save(round);
    await this.recordAudit(this.dataSource.manager, {
      caseId: evaluationCase.id,
      roundId,
      actorId: actor.id,
      action: InterviewEvaluationAuditAction.ROUND_COMPLETED,
      fromStatus: InterviewEvaluationRoundStatus.WAITING_AGGREGATION,
      toStatus: round.status,
      metadata: { result: round.aggregateData.overall.result },
    });
    return this.getDetail(applicationId, actor, roundId);
  }

  async createNextRound(applicationId: string, roundId: string, actor: InterviewEvaluationActor) {
    this.assertManager(actor);
    const evaluationCase = await this.findCaseForRound(applicationId, roundId);
    const currentRound = await this.roundsRepo.findOne({ where: { id: roundId, caseId: evaluationCase.id } });
    if (!currentRound || currentRound.status !== InterviewEvaluationRoundStatus.COMPLETED) {
      throw new BadRequestException('Only a completed round can move to the next round');
    }
    const nextKey = ROUND_ORDER[currentRound.sortOrder];
    if (!nextKey) throw new BadRequestException('There is no next round');

    await this.dataSource.transaction(async (manager) => {
      const roundRepo = manager.getRepository(InterviewEvaluationRoundEntity);
      const previousStatus = currentRound.status;
      const previousRoundKey = currentRound.roundKey;
      currentRound.roundKey = nextKey;
      currentRound.roundName = ROUND_NAMES[nextKey];
      currentRound.sortOrder += 1;
      currentRound.status = InterviewEvaluationRoundStatus.READY_TO_EVALUATE;
      currentRound.completedById = null;
      currentRound.completedAt = null;
      currentRound.version += 1;
      await roundRepo.save(currentRound);
      evaluationCase.currentRoundId = currentRound.id;
      await manager.getRepository(InterviewEvaluationCaseEntity).save(evaluationCase);
      await this.recordAudit(manager, {
        caseId: evaluationCase.id,
        roundId: currentRound.id,
        actorId: actor.id,
        action: InterviewEvaluationAuditAction.ROUND_CONTEXT_SYNCHRONIZED,
        fromStatus: previousStatus,
        toStatus: currentRound.status,
        metadata: { source: 'MANUAL_STAGE_TRANSITION', fromRoundKey: previousRoundKey, toRoundKey: nextKey },
      });
    });
    return this.getDetail(applicationId, actor);
  }

  private async persistReview(
    applicationId: string,
    roundId: string,
    section: InterviewEvaluationReviewerSection,
    dto: SaveInterviewReviewDto,
    actor: InterviewEvaluationActor,
    submit: boolean,
  ) {
    const application = await this.findApplication(applicationId);
    const evaluationCase = await this.findCaseForRound(applicationId, roundId);
    const round = await this.roundsRepo.findOne({ where: { id: roundId, caseId: evaluationCase.id } });
    if (!round) throw new BadRequestException('Interview evaluation round not found');
    await this.ensureCommitteeReviewers(application, actor, round);
    await this.assertCaseAccess(evaluationCase, actor, round, application);
    this.assertVersion(round, dto.expectedVersion);
    this.assertSectionRole(section, actor);
    if (section === InterviewEvaluationReviewerSection.HRBP) {
      this.assertHrbpAccess(application, actor);
    }
    let reviewer = await this.reviewersRepo.findOne({ where: { roundId, userId: actor.id, section } });
    if (!reviewer && section === InterviewEvaluationReviewerSection.COMMITTEE
      && hasUserRole(actor, UserRole.COMMITTEE)) {
      reviewer = await this.reviewersRepo.save(this.reviewersRepo.create({
        roundId,
        userId: actor.id,
        section,
        status: InterviewEvaluationReviewerStatus.PENDING,
        formData: {},
        submittedAt: null,
      }));
    }
    if (!reviewer && section === InterviewEvaluationReviewerSection.HRBP && this.canManage(actor)) {
      reviewer = await this.reviewersRepo.save(this.reviewersRepo.create({
        roundId,
        userId: actor.id,
        section,
        status: InterviewEvaluationReviewerStatus.PENDING,
        formData: {},
        submittedAt: null,
      }));
    }
    if (!reviewer) throw new BadRequestException('You are not assigned to this evaluation section');
    const previousStatus = round.status;
    reviewer.formData = this.scopeReviewFormData(reviewer.formData, dto.formData, section);
    reviewer.status = submit
      ? InterviewEvaluationReviewerStatus.SUBMITTED
      : InterviewEvaluationReviewerStatus.DRAFT;
    reviewer.submittedAt = submit ? new Date() : null;
    await this.reviewersRepo.save(reviewer);
    round.version += 1;
    if (section === InterviewEvaluationReviewerSection.HRBP) {
      round.hrbpData = this.scopeReviewFormData(round.hrbpData, dto.formData, section);
    } else {
      round.committeeData = this.scopeReviewFormData(round.committeeData, dto.formData, section);
    }
    const reviewers = await this.reviewersRepo.find({ where: { roundId } });
    round.status = reviewers.some(
      (roundReviewer) => roundReviewer.status === InterviewEvaluationReviewerStatus.SUBMITTED,
    )
      ? await this.statusAfterReviewerChange(round)
      : InterviewEvaluationRoundStatus.DRAFT;
    await this.roundsRepo.save(round);
    await this.recordAudit(this.dataSource.manager, {
      caseId: evaluationCase.id,
      roundId,
      actorId: actor.id,
      action: submit ? InterviewEvaluationAuditAction.REVIEW_SUBMITTED : InterviewEvaluationAuditAction.REVIEW_SAVED,
      fromStatus: previousStatus,
      toStatus: round.status,
      metadata: { section, version: round.version },
    });
    return this.getDetail(applicationId, actor, roundId);
  }

  private async statusAfterReviewerChange(round: InterviewEvaluationRoundEntity) {
    const reviewers = await this.reviewersRepo.find({ where: { roundId: round.id } });
    const hrbpSubmitted = reviewers.some(
      (reviewer) => reviewer.section === InterviewEvaluationReviewerSection.HRBP
        && reviewer.status === InterviewEvaluationReviewerStatus.SUBMITTED,
    );
    const committeeReviewers = await this.reviewersRepo.find({
      where: { roundId: round.id, section: InterviewEvaluationReviewerSection.COMMITTEE },
    });
    const allSubmitted = committeeReviewers.every(
      (reviewer) => reviewer.status === InterviewEvaluationReviewerStatus.SUBMITTED,
    );
    if (hrbpSubmitted && allSubmitted) return InterviewEvaluationRoundStatus.WAITING_AGGREGATION;
    if (hrbpSubmitted) return InterviewEvaluationRoundStatus.WAITING_COMMITTEE;
    return InterviewEvaluationRoundStatus.IN_REVIEW;
  }

  private scopeReviewFormData(
    existing: InterviewEvaluationFormData | null | undefined,
    incoming: InterviewEvaluationFormData,
    section: InterviewEvaluationReviewerSection,
  ) {
    const scoped = this.cloneFormData(existing);
    if (section === InterviewEvaluationReviewerSection.HRBP) {
      if (incoming.hrbp) scoped.hrbp = { ...scoped.hrbp, ...incoming.hrbp };
      if (incoming.final) {
        const currentSalaryDetails = scoped.final?.salaryDetails;
        const incomingSalaryDetails = incoming.final.salaryDetails;
        scoped.final = {
          ...scoped.final,
          ...incoming.final,
          ...(incomingSalaryDetails ? {
            salaryDetails: {
              ...currentSalaryDetails,
              ...incomingSalaryDetails,
              notes: { ...currentSalaryDetails?.notes, ...incomingSalaryDetails.notes },
            },
          } : {}),
        };
      }
      return scoped;
    }

    if (!incoming.committee) return scoped;
    scoped.committee = { ...scoped.committee, ...incoming.committee };
    if (incoming.committee.technicalCompetencies) {
      scoped.committee.technicalCompetencies = this.cloneCriterionMatrix(incoming.committee.technicalCompetencies);
    }
    if (incoming.committee.personalGrowth) {
      scoped.committee.personalGrowth = this.cloneCriterionMatrix(incoming.committee.personalGrowth);
    }
    return scoped;
  }

  private cloneCriterionMatrix(matrix?: Record<string, InterviewEvaluationCriterionData[]>) {
    return Object.fromEntries(
      Object.entries(matrix ?? {}).map(([key, rows]) => [key, rows.map((row) => ({ ...row }))]),
    );
  }

  private async findApplication(applicationId: string) {
    const application = await this.applicationsRepo.findOne({
      where: { id: applicationId },
      relations: ['candidate', 'jobPosting', 'jobDescriptionVersion', 'sources'],
    });
    if (!application) throw new BadRequestException('Application not found');
    return application;
  }

  private getHrbpAccess(
    application: ApplicationEntity,
    actor: InterviewEvaluationActor,
  ): InterviewEvaluationHrbpAccess {
    const source = this.findAmisApplicationSource(application, actor.amisRecruitmentId);
    const payload = this.isRecord(source?.rawPayload) ? source.rawPayload : {};
    const expectedAmisUserId = this.optionalText(
      payload.attractivePersonnelId
        ?? payload.AttractivePersonnelID
        ?? payload.AttractivePersonnelId,
    );
    const expectedName = this.optionalText(
      payload.attractivePersonnelName
        ?? payload.AttractivePersonnel
        ?? payload.AttractivePersonnelName,
    );
    const required = hasUserRole(actor, UserRole.HR);
    const currentAmisUserId = this.optionalText(actor.amisUserId)?.toLowerCase() ?? null;
    const allowed = hasUserRole(actor, UserRole.ADMIN)
      || (!required ? false : Boolean(
        expectedAmisUserId
        && currentAmisUserId
        && expectedAmisUserId.toLowerCase() === currentAmisUserId,
      ));

    return {
      required,
      allowed,
      expectedAmisUserId,
      expectedName,
    };
  }

  private findAmisApplicationSource(
    application: ApplicationEntity,
    amisRecruitmentId?: string | null,
  ) {
    const normalizedRecruitmentId = this.optionalText(amisRecruitmentId);
    const matchingSources = (application.sources ?? []).filter((source) => {
      if (!this.isRecord(source.rawPayload)) return false;
      if (source.rawPayload.sourceSystem !== ExtensionSourceSystem.AMIS) return false;
      if (!normalizedRecruitmentId) return true;
      return this.optionalText(source.rawPayload.recruitmentId) === normalizedRecruitmentId;
    });
    return [...matchingSources].sort(
      (left, right) => right.receivedAt.getTime() - left.receivedAt.getTime(),
    )[0] ?? null;
  }

  private assertHrbpAccess(application: ApplicationEntity, actor: InterviewEvaluationActor) {
    if (!hasUserRole(actor, UserRole.HR) || hasUserRole(actor, UserRole.ADMIN)) return;

    const access = this.getHrbpAccess(application, actor);
    if (access.allowed) return;

    throw new ForbiddenException({
      code: 'INTERVIEW_EVALUATION_HRBP_MISMATCH',
      message: access.expectedName
        ? `Chỉ có HRBP ${access.expectedName} có thể đánh giá form.`
        : 'Không xác định được HRBP của hồ sơ. Vui lòng đồng bộ lại dữ liệu AMIS.',
    });
  }

  private async assertAmisContext(
    application: ApplicationEntity,
    actor: InterviewEvaluationActor,
    requireInterviewStage: boolean,
  ) {
    const isCommittee = hasUserRole(actor, UserRole.COMMITTEE);
    const hasAmisContext = Boolean(actor.amisUserId || actor.amisRecruitmentId);
    if (!isCommittee && !hasAmisContext) return;

    const amisUserId = actor.amisUserId?.trim().toLowerCase();
    const amisRecruitmentId = actor.amisRecruitmentId?.trim();
    if (!amisRecruitmentId || (isCommittee && !amisUserId)) {
      throw new ForbiddenException({
        code: 'AMIS_SESSION_CONTEXT_REQUIRED',
        message: 'Phiên AMIS chưa được xác thực cho tài khoản Extension này.',
      });
    }

    const reference = await this.externalReferencesRepo.findOne({
      where: {
        sourceSystem: ExtensionSourceSystem.AMIS,
        externalEntityType: ExtensionExternalEntityType.JOB_POSTING,
        internalEntityType: ExtensionInternalEntityType.JOB_POSTING,
        internalEntityId: application.jobPostingId,
      },
    });
    if (!reference || reference.externalId !== amisRecruitmentId) {
      throw new ForbiddenException({
        code: 'AMIS_RECRUITMENT_CONTEXT_MISMATCH',
        message: 'JD AMIS hiện tại không khớp với ứng viên đang mở.',
      });
    }

    if (isCommittee) {
      const localUser = await this.usersRepo.findOne({
        where: { id: actor.id },
        relations: ['roleMemberships'],
      });
      if (!localUser || !localUser.amisUserId || localUser.amisUserId.trim().toLowerCase() !== amisUserId) {
        throw new ForbiddenException({
          code: 'AMIS_EXTENSION_ACCOUNT_MISMATCH',
          message: 'Tài khoản AMIS hiện tại không khớp với tài khoản Extension.',
        });
      }
      if (!hasUserRole({
        role: localUser.role,
        roles: localUser.roleMemberships?.map((membership) => membership.role),
      }, UserRole.COMMITTEE)) {
        throw new ForbiddenException({
          code: 'EXTENSION_COMMITTEE_ACCOUNT_INVALID',
          message: 'Tài khoản Extension không có quyền HĐCM hợp lệ.',
        });
      }
      const membership = await this.amisBoardMembersRepo.findOne({
        where: {
          sourceSystem: ExtensionSourceSystem.AMIS,
          amisRecruitmentId,
          amisUserId,
          isActive: true,
        },
      });
      if (!membership) {
        throw new ForbiddenException({
          code: 'AMIS_COMMITTEE_MEMBERSHIP_REQUIRED',
          message: 'Tài khoản HĐCM chưa được thêm vào Hội đồng tuyển dụng của JD.',
        });
      }
    }

    if (requireInterviewStage && !(await this.isInterviewOrLater(application, amisRecruitmentId))) {
      throw new ForbiddenException({
        code: 'AMIS_INTERVIEW_STAGE_REQUIRED',
        message: 'Ứng viên chưa tới vòng phỏng vấn hoặc chưa có dữ liệu vòng AMIS hợp lệ.',
      });
    }
  }

  private async isInterviewOrLater(application: ApplicationEntity, amisRecruitmentId: string) {
    const rounds = await this.dataSource.getRepository(AmisRecruitmentRoundEntity).find({
      where: {
        sourceSystem: ExtensionSourceSystem.AMIS,
        amisRecruitmentId,
        isActive: true,
      },
      order: { sortOrder: 'ASC' },
    });
    const firstInterviewRound = rounds.find((round) => round.roundType === AMIS_INTERVIEW_ROUND_TYPE);
    if (!firstInterviewRound) return false;

    const source = application.sources?.find((item) => {
      const payload = item.rawPayload;
      return this.isRecord(payload)
        && payload.sourceSystem === ExtensionSourceSystem.AMIS
        && payload.recruitmentId === amisRecruitmentId;
    });
    const payload = this.isRecord(source?.rawPayload) ? source.rawPayload : {};
    const currentRoundId = this.optionalText(payload.recruitmentRoundId);
    const currentRoundName = this.optionalText(payload.recruitmentRoundName);
    const currentRound = (currentRoundId
      ? rounds.find((round) => round.amisRoundId === currentRoundId)
      : undefined)
      ?? rounds.find((round) => round.roundName === currentRoundName);
    if (currentRound) return currentRound.sortOrder >= firstInterviewRound.sortOrder;
    return Boolean(this.optionalText(payload.interviewEvaluationStartedAt));
  }

  private async ensureCommitteeReviewers(
    application: ApplicationEntity,
    actor: InterviewEvaluationActor,
    round: InterviewEvaluationRoundEntity,
  ) {
    if (!hasUserRole(actor, UserRole.COMMITTEE)) return;
    await this.assertAmisContext(application, actor, true);
    const assignments = await this.resolveAmisReviewerAssignments(application, actor);
    if (!assignments.committeeUserIds.includes(actor.id)) assignments.committeeUserIds.push(actor.id);
    await this.appendReviewers(this.dataSource.manager, round.id, assignments);
  }

  private async findCaseForRound(applicationId: string, roundId: string) {
    const evaluationCase = await this.casesRepo.findOne({ where: { applicationId } });
    if (!evaluationCase) throw new BadRequestException('Interview evaluation case not found');
    const round = await this.roundsRepo.findOne({ where: { id: roundId, caseId: evaluationCase.id } });
    if (!round) throw new BadRequestException('Interview evaluation round not found');
    return evaluationCase;
  }

  private async findCurrentRound(evaluationCase: InterviewEvaluationCaseEntity) {
    if (evaluationCase.currentRoundId) {
      const current = await this.roundsRepo.findOne({ where: { id: evaluationCase.currentRoundId } });
      if (current) return current;
    }
    const round = await this.roundsRepo.findOne({
      where: { caseId: evaluationCase.id },
      order: { sortOrder: 'DESC' },
    });
    if (!round) throw new BadRequestException('Interview evaluation round not found');
    return round;
  }

  private selectCurrentRound(
    rounds: InterviewEvaluationRoundEntity[],
    currentRoundId: string | null,
    requestedRoundId?: string,
  ) {
    const requested = requestedRoundId ? rounds.find((round) => round.id === requestedRoundId) : undefined;
    const current = currentRoundId ? rounds.find((round) => round.id === currentRoundId) : undefined;
    const latest = rounds[rounds.length - 1];
    if (!requested && !current && !latest) throw new BadRequestException('Interview evaluation round not found');
    return requested ?? current ?? latest;
  }

  private async assertCaseAccess(
    evaluationCase: InterviewEvaluationCaseEntity,
    actor: InterviewEvaluationActor,
    selectedRound?: InterviewEvaluationRoundEntity,
    application?: ApplicationEntity,
  ) {
    const isCommittee = hasUserRole(actor, UserRole.COMMITTEE);
    if (application && (isCommittee || actor.amisUserId || actor.amisRecruitmentId)) {
      await this.assertAmisContext(application, actor, isCommittee);
    }
    // AMIS board membership is the authorization boundary for HĐCM. Reviewer
    // rows are retained for per-member progress/audit, but must not block a
    // board member from opening the shared evaluation form.
    if (isCommittee) return;
    if (this.canManage(actor)) return;
    const currentRound = selectedRound ?? await this.findCurrentRound(evaluationCase);
    const reviewer = await this.reviewersRepo.findOne({
      where: { roundId: currentRound.id, userId: actor.id },
    });
    if (!reviewer) throw new BadRequestException('You are not assigned to this interview evaluation');
    this.assertSectionRole(reviewer.section, actor);
  }

  private async resolveAmisReviewerAssignments(
    application: ApplicationEntity,
    actor: InterviewEvaluationActor,
  ) {
    const hrbpUserIds = new Set<string>();
    const committeeUserIds = new Set<string>();
    if (this.canManage(actor)) hrbpUserIds.add(actor.id);

    const reference = await this.externalReferencesRepo.findOne({
      where: {
        sourceSystem: ExtensionSourceSystem.AMIS,
        externalEntityType: ExtensionExternalEntityType.JOB_POSTING,
        internalEntityType: ExtensionInternalEntityType.JOB_POSTING,
        internalEntityId: application.jobPostingId,
      },
    });
    if (!reference) {
      return { hrbpUserIds: [...hrbpUserIds], committeeUserIds: [...committeeUserIds] };
    }

    const boardMembers = await this.amisBoardMembersRepo.find({
      where: {
        sourceSystem: ExtensionSourceSystem.AMIS,
        amisRecruitmentId: reference.externalId,
        isActive: true,
      },
    });
    const amisUserIds = [...new Set(boardMembers.map((member) => member.amisUserId))];
    if (amisUserIds.length === 0) {
      return { hrbpUserIds: [...hrbpUserIds], committeeUserIds: [...committeeUserIds] };
    }

    const users = await this.usersRepo.find({
      where: { amisUserId: In(amisUserIds) },
      relations: ['roleMemberships'],
    });
    for (const user of users) {
      const roles = {
        role: user.role,
        roles: user.roleMemberships?.map((membership) => membership.role),
      };
      if (hasUserRole(roles, UserRole.HR)) hrbpUserIds.add(user.id);
      if (hasUserRole(roles, UserRole.COMMITTEE)) committeeUserIds.add(user.id);
    }

    return { hrbpUserIds: [...hrbpUserIds], committeeUserIds: [...committeeUserIds] };
  }

  private async appendReviewers(
    manager: EntityManager,
    roundId: string,
    assignments: { hrbpUserIds: string[]; committeeUserIds: string[] },
  ) {
    const reviewerRepo = manager.getRepository(InterviewEvaluationReviewerEntity);
    const existing = await reviewerRepo.find({ where: { roundId } });
    const existingKeys = new Set(existing.map((reviewer) => this.reviewerKey(reviewer)));
    const reviewerInputs = [
      ...assignments.hrbpUserIds.map((userId) => ({
        userId,
        section: InterviewEvaluationReviewerSection.HRBP,
      })),
      ...assignments.committeeUserIds.map((userId) => ({
        userId,
        section: InterviewEvaluationReviewerSection.COMMITTEE,
      })),
    ].filter((input) => !existingKeys.has(`${input.userId}:${input.section}`));

    if (reviewerInputs.length === 0) return;
    await reviewerRepo.save(reviewerInputs.map((input) => reviewerRepo.create({
      roundId,
      userId: input.userId,
      section: input.section,
      status: InterviewEvaluationReviewerStatus.PENDING,
      formData: {},
      submittedAt: null,
    })));
  }

  private assertSectionRole(
    section: InterviewEvaluationReviewerSection,
    actor: InterviewEvaluationActor,
  ) {
    if (section === InterviewEvaluationReviewerSection.COMMITTEE && !hasUserRole(actor, UserRole.COMMITTEE)) {
      throw new BadRequestException('Only HĐCM accounts can edit the HĐCM evaluation section');
    }
    if (section === InterviewEvaluationReviewerSection.HRBP && !this.canManage(actor)) {
      throw new BadRequestException('Only HR or Admin accounts can edit the HRBP evaluation section');
    }
  }

  private assertManager(actor: InterviewEvaluationActor) {
    if (!this.canManage(actor)) throw new BadRequestException('Only HR or Admin can manage interview evaluations');
  }

  private canManage(actor: InterviewEvaluationActor) {
    return hasUserRole(actor, UserRole.ADMIN) || hasUserRole(actor, UserRole.HR);
  }

  private assertVersion(round: InterviewEvaluationRoundEntity, expectedVersion?: number) {
    if (expectedVersion !== undefined && expectedVersion !== round.version) {
      throw new BadRequestException('This evaluation was updated by another user; reload before saving');
    }
  }

  private async consolidateRounds(
    manager: EntityManager,
    caseId: string,
    rounds: InterviewEvaluationRoundEntity[],
  ) {
    const canonicalRound = rounds[0];
    if (!canonicalRound) throw new BadRequestException('Interview evaluation round not found');
    if (rounds.length === 1) return canonicalRound;

    const roundRepo = manager.getRepository(InterviewEvaluationRoundEntity);
    const reviewerRepo = manager.getRepository(InterviewEvaluationReviewerEntity);
    const auditRepo = manager.getRepository(InterviewEvaluationAuditEntity);
    const roundIds = rounds.map((round) => round.id);
    const reviewers = await reviewerRepo.find({
      where: { roundId: In(roundIds) },
      order: { createdAt: 'ASC' },
    });
    const canonicalReviewers = new Map<string, InterviewEvaluationReviewerEntity>();
    for (const reviewer of reviewers) {
      if (reviewer.roundId === canonicalRound.id) {
        canonicalReviewers.set(this.reviewerKey(reviewer), reviewer);
      }
    }

    for (const sourceRound of rounds.slice(1)) {
      canonicalRound.hrbpData = this.mergeFormData(canonicalRound.hrbpData, sourceRound.hrbpData);
      canonicalRound.committeeData = this.mergeFormData(canonicalRound.committeeData, sourceRound.committeeData);
      canonicalRound.aggregateData = this.mergeFormData(canonicalRound.aggregateData, sourceRound.aggregateData);
      canonicalRound.committeeId ??= sourceRound.committeeId;
    }

    for (const reviewer of reviewers) {
      if (reviewer.roundId === canonicalRound.id) {
        this.mergeReviewerIntoRound(canonicalRound, reviewer);
        continue;
      }

      const key = this.reviewerKey(reviewer);
      const canonicalReviewer = canonicalReviewers.get(key);
      if (!canonicalReviewer) {
        const copiedReviewer = reviewerRepo.create({
          roundId: canonicalRound.id,
          userId: reviewer.userId,
          section: reviewer.section,
          status: reviewer.status,
          formData: this.cloneFormData(reviewer.formData),
          submittedAt: reviewer.submittedAt,
        });
        const savedReviewer = await reviewerRepo.save(copiedReviewer);
        canonicalReviewers.set(key, savedReviewer);
        this.mergeReviewerIntoRound(canonicalRound, savedReviewer);
        continue;
      }

      canonicalReviewer.formData = this.mergeFormData(canonicalReviewer.formData, reviewer.formData);
      if (this.shouldUseReviewerState(reviewer, canonicalReviewer)) {
        canonicalReviewer.status = reviewer.status;
        canonicalReviewer.submittedAt = reviewer.submittedAt;
      }
      await reviewerRepo.save(canonicalReviewer);
      this.mergeReviewerIntoRound(canonicalRound, canonicalReviewer);
    }

    for (const duplicateRound of rounds.slice(1)) {
      await auditRepo.update(
        { caseId, roundId: duplicateRound.id },
        { roundId: canonicalRound.id },
      );
      await reviewerRepo.delete({ roundId: duplicateRound.id });
      await roundRepo.delete({ id: duplicateRound.id });
    }
    await roundRepo.save(canonicalRound);
    return canonicalRound;
  }

  private reviewerKey(reviewer: InterviewEvaluationReviewerEntity) {
    return `${reviewer.userId}:${reviewer.section}`;
  }

  private mergeReviewerIntoRound(
    round: InterviewEvaluationRoundEntity,
    reviewer: InterviewEvaluationReviewerEntity,
  ) {
    if (reviewer.section === InterviewEvaluationReviewerSection.HRBP) {
      round.hrbpData = this.mergeFormData(round.hrbpData, reviewer.formData);
      return;
    }
    round.committeeData = this.mergeFormData(round.committeeData, reviewer.formData);
  }

  private shouldUseReviewerState(
    source: InterviewEvaluationReviewerEntity,
    target: InterviewEvaluationReviewerEntity,
  ) {
    const sourceRank = this.reviewerStatusRank(source.status);
    const targetRank = this.reviewerStatusRank(target.status);
    return sourceRank > targetRank || (source.submittedAt !== null && target.submittedAt === null);
  }

  private reviewerStatusRank(status: InterviewEvaluationReviewerStatus) {
    if (status === InterviewEvaluationReviewerStatus.SUBMITTED) return 2;
    if (status === InterviewEvaluationReviewerStatus.DRAFT) return 1;
    return 0;
  }

  private mergeFormData(
    base: InterviewEvaluationFormData | null | undefined,
    source: InterviewEvaluationFormData | null | undefined,
  ) {
    const merged = this.cloneFormData(base);
    const sections: Array<keyof InterviewEvaluationFormData> = ['overall', 'hrbp', 'committee', 'final'];
    for (const section of sections) {
      const sourceSection = source?.[section];
      if (!sourceSection) continue;
      const mergedSection = { ...(merged[section] ?? {}) } as Record<string, unknown>;
      for (const [key, value] of Object.entries(sourceSection)) {
        if (!this.hasMeaningfulFormValue(mergedSection[key]) && this.hasMeaningfulFormValue(value)) {
          mergedSection[key] = value;
        }
      }
      (merged as Record<string, unknown>)[section] = mergedSection;
    }
    return merged;
  }

  private hasMeaningfulFormValue(value: unknown) {
    if (typeof value === 'string') return value.trim().length > 0 && value !== 'PENDING';
    if (typeof value === 'number') return value > 0;
    return value !== null && value !== undefined;
  }

  private cloneFormData(data: InterviewEvaluationFormData | null | undefined): InterviewEvaluationFormData {
    return {
      ...(data?.overall ? { overall: { ...data.overall } } : {}),
      ...(data?.hrbp ? { hrbp: { ...data.hrbp } } : {}),
      ...(data?.committee ? { committee: { ...data.committee } } : {}),
      ...(data?.final ? { final: { ...data.final } } : {}),
    };
  }

  private progress(reviewers: InterviewEvaluationReviewerEntity[]) {
    return {
      total: reviewers.length,
      submitted: reviewers.filter((reviewer) => reviewer.status === InterviewEvaluationReviewerStatus.SUBMITTED).length,
    };
  }

  private candidateSummary(application: ApplicationEntity) {
    return {
      id: application.candidate?.id ?? application.candidateId,
      name: application.candidate?.name ?? null,
      email: application.candidate?.email ?? null,
      phone: application.candidate?.phone ?? null,
      birthYear: application.candidate?.birthYear ?? null,
    };
  }

  private jobSummary(application: ApplicationEntity) {
    return {
      id: application.jobPosting?.id ?? application.jobPostingId,
      title: application.jobPosting?.title ?? null,
      jobDescriptionVersionId: application.jobDescriptionVersionId,
    };
  }

  private roundSummary(round: InterviewEvaluationRoundEntity) {
    return {
      id: round.id,
      committeeId: round.committeeId,
      key: round.roundKey,
      name: round.roundName,
      amisRoundId: round.amisRoundId,
      amisRoundType: round.amisRoundType,
      amisSortOrder: round.amisSortOrder,
      status: round.status,
      version: round.version,
      completedAt: round.completedAt?.toISOString() ?? null,
      nextRoundKey: round.amisRoundId ? undefined : ROUND_ORDER[round.sortOrder],
    };
  }

  private roundDetail(round: InterviewEvaluationRoundEntity) {
    return {
      ...this.roundSummary(round),
      hrbpData: round.hrbpData,
      committeeData: round.committeeData,
      aggregateData: round.aggregateData,
    };
  }

  private reviewerResponse(
    reviewer: InterviewEvaluationReviewerEntity,
    user: UserEntity | undefined,
    includeFormData: boolean,
  ) {
    return {
      id: reviewer.id,
      userId: reviewer.userId,
      name: user?.name ?? 'Unknown user',
      email: user?.email ?? null,
      section: reviewer.section,
      status: reviewer.status,
      formData: includeFormData ? reviewer.formData : undefined,
      submittedAt: reviewer.submittedAt?.toISOString() ?? null,
    };
  }

  private canViewReviewerFormData(
    reviewer: InterviewEvaluationReviewerEntity,
    actor: InterviewEvaluationActor,
    canManage: boolean,
  ) {
    if (canManage || reviewer.userId === actor.id) return true;
    if (!hasUserRole(actor, UserRole.COMMITTEE)) return false;
    if (reviewer.section === InterviewEvaluationReviewerSection.HRBP) return true;
    return reviewer.section === InterviewEvaluationReviewerSection.COMMITTEE
      && reviewer.status === InterviewEvaluationReviewerStatus.SUBMITTED;
  }

  private visibleAudits(audits: InterviewEvaluationAuditEntity[], canManage: boolean) {
    if (canManage) return audits;
    return audits.filter(
      (audit) => audit.action !== InterviewEvaluationAuditAction.AGGREGATION_SAVED
        && audit.action !== InterviewEvaluationAuditAction.AGGREGATION_DRAFT_SAVED
        && audit.action !== InterviewEvaluationAuditAction.ROUND_COMPLETED,
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private optionalText(value: unknown) {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const normalized = String(value).trim();
    return normalized || null;
  }

  private async recordAudit(
    manager: EntityManager,
    input: {
      caseId: string;
      roundId: string;
      actorId: string;
      action: InterviewEvaluationAuditAction;
      fromStatus: string | null;
      toStatus: string | null;
      metadata: Record<string, unknown>;
    },
  ) {
    await manager.getRepository(InterviewEvaluationAuditEntity).save(
      manager.getRepository(InterviewEvaluationAuditEntity).create({
        ...input,
      }),
    );
  }
}
