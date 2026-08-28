import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApplicationEntity } from '../../applications/entities/application.entity';
import { AiScreeningResultEntity } from '../../ai-screening/entities/ai-screening-result.entity';
import { FormSessionEntity } from '../../form-sessions/entities/form-session.entity';
import { HrReviewDecisionEntity } from '../../hr-review/entities/hr-review-decision.entity';
import { InterviewRoundEntity } from '../../interview-rounds/entities/interview-round.entity';
import { OfferEntity } from '../../offers/entities/offer.entity';
import {
  ApplicationStage,
  AiScreeningStatus,
  InterviewGrade,
  InterviewResult,
  InterviewRoundType,
  MappingStatus,
  OfferStatus,
  OnboardingStatus,
  RecruitmentChannel,
} from '../../recruitment-common';
import {
  ChannelHiringDto,
  DepartmentDashboardDto,
  LevelHiredDashboardDto,
  LevelHiringDto,
  MonthlyTrendDto,
  OfferStatusDashboardDto,
  PostFinalMetricsDto,
  PipelineDashboardDto,
  PipelineDashboardQueryDto,
  PipelineFunnelDto,
  PositionDashboardDto,
  QualityDashboardDto,
  RecruiterDashboardDto,
  SlaDashboardDto,
  SourcingDashboardDto,
  StageCountDto,
  TthDepartmentDashboardDto,
  TimeMetricsDto,
  DashboardOwnerType,
  DashboardTrendsDto,
  TrendDimensionDto,
} from '../dto/pipeline-dashboard.dto';

type DashboardApplication = ApplicationEntity & {
  interviewRounds: InterviewRoundEntity[];
  offers: OfferEntity[];
  formSessions: FormSessionEntity[];
  aiScreeningResults: AiScreeningResultEntity[];
  hrReviews: HrReviewDecisionEntity[];
};

interface DashboardDateWindow {
  start?: Date;
  end?: Date;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepo: Repository<ApplicationEntity>,
  ) {}

  async getPipelineDashboard(query: PipelineDashboardQueryDto): Promise<PipelineDashboardDto> {
    const applications = await this.loadApplications(query);
    const dateWindow = this.toDateWindow(query);
    const applicationScopedApplications = applications.filter((app) =>
      this.inDateWindow(app.createdAt, dateWindow),
    );
    const funnel = this.calculateFunnel(applications, dateWindow);

    return {
      funnel,
      stageDistribution: this.calculateStageDistribution(applicationScopedApplications),
      channelHiring: this.calculateChannelHiring(applicationScopedApplications),
      levelHiring: this.calculateLevelHiring(applications, dateWindow),
      monthlyTrend: this.calculateMonthlyTrend(applications, dateWindow),
      timeMetrics: this.calculateTimeMetrics(applications, dateWindow),
      totalApplications: applicationScopedApplications.length,
      totalHired: funnel.hired,
      asOf: new Date(),
      positions: this.calculatePositions(applicationScopedApplications),
      recruiters: this.calculateRecruiters(applicationScopedApplications),
      departments: this.calculateDepartments(applicationScopedApplications),
      sourcing: this.calculateSourcing(applications, dateWindow),
      quality: this.calculateQuality(applications, dateWindow),
      levelHired: this.calculateLevelHired(applications, dateWindow),
      sla: this.calculateSla(applications, dateWindow),
      normRadar: this.calculateNormRadar(applications, dateWindow),
      offerStatus: this.calculateOfferStatus(applications, dateWindow),
      tthByDepartment: this.calculateTthByDepartment(applications, dateWindow),
      postFinal: this.calculatePostFinalMetrics(applications, dateWindow),
    };
  }

  async getDashboardTrends(query: PipelineDashboardQueryDto): Promise<DashboardTrendsDto> {
    const applications = await this.loadApplications(query);
    const dateWindow = this.toDateWindow(query);

    return {
      asOf: new Date(),
      summary: this.calculatePostFinalMetrics(applications, dateWindow),
      total: this.toTrendDimension('Tổng phạm vi', applications, dateWindow),
      byPosition: this.calculateTrendDimensions(applications, dateWindow, (app) => this.getPositionName(app)),
      byMonth: this.calculateMonthlyTrend(applications, dateWindow),
      byMonthTable: this.calculateMonthlyTrendDimensions(applications, dateWindow),
      byRecruiter: this.calculateTrendDimensions(
        applications,
        dateWindow,
        (app) => app.assignedRecruiter?.name ?? 'UNASSIGNED',
      ),
      byChannel: this.calculateTrendDimensions(
        applications,
        dateWindow,
        (app) => app.sourceChannel ?? 'UNKNOWN',
      ),
    };
  }

  private async loadApplications(query: PipelineDashboardQueryDto): Promise<DashboardApplication[]> {
    const qb = this.applicationRepo.createQueryBuilder('app')
      .leftJoinAndSelect('app.candidate', 'candidate')
      .leftJoinAndSelect('app.jobPosting', 'jobPosting')
      .leftJoinAndSelect('app.jobDescriptionVersion', 'application_job_description_version')
      .leftJoinAndSelect('application_job_description_version.jobDescription', 'application_job_description')
      .leftJoinAndSelect('application_job_description.position', 'application_position')
      .leftJoinAndSelect('app.assignedRecruiter', 'assignedRecruiter')
      .leftJoinAndSelect('app.freelancerReferral', 'referral')
      .leftJoinAndSelect('referral.freelancer', 'freelancer')
      .leftJoinAndSelect('referral.internal', 'internal')
      .leftJoinAndSelect('app.interviewRounds', 'interviews')
      .leftJoinAndSelect('app.offers', 'offers')
      .leftJoinAndSelect('app.formSessions', 'formSessions')
      .leftJoinAndSelect('app.aiScreeningResults', 'aiScreeningResults')
      .leftJoinAndSelect('app.hrReviews', 'hrReviews');

    if (query.recruiterId) qb.andWhere('app.assignedRecruiterId = :recruiterId', { recruiterId: query.recruiterId });
    if (query.jobPostingId) qb.andWhere('app.jobPostingId = :jobPostingId', { jobPostingId: query.jobPostingId });
    if (query.positionId) {
      qb.andWhere(
        `(
          application_job_description_version.snapshot #>> '{jobDescription,positionId}' = :positionId
          OR (
            application_job_description_version.snapshot #>> '{jobDescription,positionId}' IS NULL
            AND application_job_description.position_id::text = :positionId
          )
        )`,
        { positionId: query.positionId },
      );
    }
    if (query.channel) qb.andWhere('app.sourceChannel = :channel', { channel: query.channel });
    if (query.ownerId && query.ownerType === DashboardOwnerType.HR) {
      qb.andWhere('app.assignedRecruiterId = :ownerId', { ownerId: query.ownerId });
    }
    if (query.ownerId && query.ownerType === DashboardOwnerType.FREELANCER) {
      qb.andWhere('referral.freelancerId = :ownerId', { ownerId: query.ownerId });
    }
    if (query.ownerId && query.ownerType === DashboardOwnerType.INTERNAL) {
      qb.andWhere('referral.internalId = :ownerId', { ownerId: query.ownerId });
    }

    return qb.getMany() as Promise<DashboardApplication[]>;
  }

  private calculateFunnel(applications: DashboardApplication[], dateWindow: DashboardDateWindow): PipelineFunnelDto {
    const finalItv = applications.filter((app) => this.inDateWindow(this.finalInterview(app)?.completedAt, dateWindow));
    const passed = finalItv.filter((app) => this.finalInterview(app)?.result === InterviewResult.PASS).length;
    const offer = applications.filter((app) => this.hasOfferEventInWindow(app, dateWindow)).length;
    const hired = applications.filter((app) => this.isHired(app) && this.inDateWindow(app.hiredAt, dateWindow)).length;
    return {
      totalFinalItv: finalItv.length,
      passed,
      passedRate: finalItv.length ? Math.round((passed / finalItv.length) * 100) : 0,
      offer,
      offerRate: passed ? Math.round((offer / passed) * 100) : 0,
      hired,
      hiredRate: offer ? Math.round((hired / offer) * 100) : 0,
    };
  }

  private calculateStageDistribution(applications: DashboardApplication[]): StageCountDto[] {
    const counts = new Map<string, number>();
    applications.forEach((app) => {
      if (app.currentStage) counts.set(app.currentStage, (counts.get(app.currentStage) ?? 0) + 1);
    });
    const total = applications.length;
    const order = [
      ApplicationStage.APPLIED,
      ApplicationStage.SCREEN_CV,
      ApplicationStage.PRE_TEST_1,
      ApplicationStage.INTERVIEW_1,
      ApplicationStage.PRE_TEST_2,
      ApplicationStage.INTERVIEW_2,
      ApplicationStage.OFFER_PENDING,
      ApplicationStage.ONBOARDING,
      ApplicationStage.HIRED,
      ApplicationStage.REJECTED,
      ApplicationStage.TALENT_POOL,
    ];
    const normalizedCounts = new Map<string, number>();
    counts.forEach((count, stage) => {
      const normalizedStage = [ApplicationStage.OFFER_SENT, ApplicationStage.OFFER_REVISED].includes(stage as ApplicationStage)
        ? ApplicationStage.OFFER_PENDING
        : stage;
      normalizedCounts.set(normalizedStage, (normalizedCounts.get(normalizedStage) ?? 0) + count);
    });
    return [...normalizedCounts.entries()]
      .map(([stage, count]) => ({
        stage: stage as ApplicationStage,
        count,
        percentage: total ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage));
  }

  private calculateChannelHiring(applications: DashboardApplication[]): ChannelHiringDto[] {
    const grouped = new Map<string, { total: number; hired: number }>();
    applications.forEach((app) => {
      const channel = app.sourceChannel ?? 'UNKNOWN';
      const item = grouped.get(channel) ?? { total: 0, hired: 0 };
      item.total++;
      if (this.isHired(app)) item.hired++;
      grouped.set(channel, item);
    });
    const data = [...grouped.entries()].map(([channel, item]) => ({ channel: channel as ChannelHiringDto['channel'], total: item.total, hired: item.hired, hiringRate: this.percent(item.hired, item.total) }));
    const total = data.reduce((sum, item) => sum + item.total, 0);
    const hired = data.reduce((sum, item) => sum + item.hired, 0);
    data.push({ channel: 'TOTAL', total, hired, hiringRate: this.percent(hired, total) });
    return data;
  }

  private calculateLevelHiring(applications: DashboardApplication[], dateWindow: DashboardDateWindow): LevelHiringDto[] {
    const grouped = new Map<string, number>();
    applications.filter((app) => this.isHired(app) && this.inDateWindow(app.hiredAt, dateWindow)).forEach((app) => {
      const level = this.normalizeOfferLevel(this.latestOffer(app)?.level);
      grouped.set(level, (grouped.get(level) ?? 0) + 1);
    });
    const total = [...grouped.values()].reduce((sum, count) => sum + count, 0);
    return [...grouped.entries()].map(([level, hired]) => ({ level, hired, percentage: this.percent(hired, total) }));
  }

  private calculateMonthlyTrend(
    applications: DashboardApplication[],
    dateWindow: DashboardDateWindow,
  ): MonthlyTrendDto[] {
    const months: MonthlyTrendDto[] = [];
    const monthlyTargets = [10, 12, 10, 15, 12, 18, 14, 15, 12, 14, 10, 12];
    const now = new Date();
    const lastMonth = dateWindow.end
      ? new Date(dateWindow.end.getFullYear(), dateWindow.end.getMonth(), 1)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const firstMonth = dateWindow.start
      ? new Date(dateWindow.start.getFullYear(), dateWindow.start.getMonth(), 1)
      : new Date(lastMonth.getFullYear(), lastMonth.getMonth() - 11, 1);
    let date = firstMonth;
    let index = 0;

    while (date <= lastMonth) {
      const inMonth = (value: Date | null | undefined) => Boolean(
        value
        && value.getFullYear() === date.getFullYear()
        && value.getMonth() === date.getMonth(),
      );
      const finalApplications = applications.filter((app) => inMonth(this.finalInterview(app)?.completedAt));
      const passedApplications = finalApplications.filter((app) => this.finalInterview(app)?.result === InterviewResult.PASS);
      const offerEvents = applications
        .map((app) => ({ app, offer: this.offerInMonth(app, date) }))
        .filter((item): item is { app: DashboardApplication; offer: OfferEntity } => item.offer !== null);
      const rejectedOfferStatuses = [
        OfferStatus.REJECTED_BY_CANDIDATE,
        OfferStatus.CANCELLED,
        OfferStatus.EXPIRED,
      ];

      months.push({
        month: this.monthKey(date),
        newApplications: applications.filter((app) => inMonth(app.createdAt)).length,
        hired: applications.filter((app) => this.isHired(app) && inMonth(app.hiredAt)).length,
        interviewed: applications.filter((app) => app.interviewRounds?.some((round) => inMonth(round.completedAt) || inMonth(round.startedAt) || inMonth(round.scheduledAt))).length,
        finalInterviews: finalApplications.length,
        failItv: finalApplications.length - passedApplications.length,
        passed: passedApplications.length,
        totalOffer: offerEvents.length,
        offerAccepted: offerEvents.filter((item) => item.offer.status === OfferStatus.ACCEPTED).length,
        offerRejected: offerEvents.filter((item) => rejectedOfferStatuses.includes(item.offer.status)).length,
        onboardRejected: applications.filter((app) => app.onboardingStatus === OnboardingStatus.REJECTED && inMonth(app.onboardingRejectedAt)).length,
        target: monthlyTargets[Math.min(index, monthlyTargets.length - 1)] ?? null,
      });
      date = new Date(date.getFullYear(), date.getMonth() + 1, 1);
      index++;
    }
    return months;
  }

  private calculateMonthlyTrendDimensions(
    applications: DashboardApplication[],
    dateWindow: DashboardDateWindow,
  ): TrendDimensionDto[] {
    const year = dateWindow.end?.getFullYear() ?? dateWindow.start?.getFullYear() ?? new Date().getFullYear();

    return Array.from({ length: 12 }, (_, month) => {
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
      const monthWindow = this.intersectDateWindows({ start: monthStart, end: monthEnd }, dateWindow);
      return this.toTrendDimension(`Tháng ${month + 1}/${year}`, applications, monthWindow);
    });
  }

  private intersectDateWindows(
    first: DashboardDateWindow,
    second: DashboardDateWindow,
  ): DashboardDateWindow {
    const start = first.start && second.start && first.start > second.start ? first.start : first.start ?? second.start;
    const end = first.end && second.end && first.end < second.end ? first.end : first.end ?? second.end;
    return { start, end };
  }

  private calculateNormRadar(
    applications: DashboardApplication[],
    dateWindow: DashboardDateWindow,
  ) {
    const applied = applications.filter((app) => this.inDateWindow(app.createdAt, dateWindow)).length;
    const firstInterview = applications.filter((app) => this.inDateWindow(this.interviewEventDate(this.firstInterview(app)), dateWindow)).length;
    const finalInterview = applications.filter((app) => this.inDateWindow(this.finalInterview(app)?.completedAt, dateWindow)).length;
    const hired = applications.filter((app) => this.isHired(app) && this.inDateWindow(app.hiredAt, dateWindow)).length;
    const actual = (value: number) => applied ? Math.round((value / applied) * 100) : 0;

    return [
      { metric: 'APPLICATION', norm: 100, actual: actual(applied) },
      { metric: 'INTERVIEW_1', norm: 60, actual: actual(firstInterview) },
      { metric: 'INTERVIEW_2', norm: 30, actual: actual(finalInterview) },
      { metric: 'HIRED', norm: 10, actual: actual(hired) },
    ];
  }

  private calculateTimeMetrics(applications: DashboardApplication[], dateWindow: DashboardDateWindow): TimeMetricsDto {
    const hiredApps = applications.filter((app) => this.isHired(app) && this.inDateWindow(app.hiredAt, dateWindow));
    return {
      avgTimeToHire: this.average(hiredApps.map((app) => this.workingDaysBetween(app.createdAt, app.hiredAt)).filter(this.isNumber)),
      avgTimeFromFinal: this.average(hiredApps.map((app) => this.workingDaysBetween(this.finalInterview(app)?.completedAt, app.hiredAt)).filter(this.isNumber)),
      avgTimeOfferToHire: this.average(hiredApps.map((app) => this.workingDaysBetween(this.latestOfferSentAt(app), app.hiredAt)).filter(this.isNumber)),
    };
  }

  private calculatePositions(applications: DashboardApplication[]): PositionDashboardDto[] {
    const grouped = new Map<string, { applications: number; hired: number }>();
    applications.forEach((app) => {
      const name = this.getPositionName(app);
      const item = grouped.get(name) ?? { applications: 0, hired: 0 };
      item.applications++;
      if (this.isHired(app)) item.hired++;
      grouped.set(name, item);
    });
    return [...grouped.entries()].map(([name, item]) => ({ ...item, name, target: null }));
  }

  private getPositionName(app: DashboardApplication): string {
    const snapshot = app.jobDescriptionVersion?.snapshot;
    const snapshotPosition = this.getSnapshotPositionName(snapshot);
    return snapshotPosition
      ?? app.jobDescriptionVersion?.jobDescription?.position?.name
      ?? app.jobPosting?.jobDescription?.position?.name
      ?? app.jobPosting?.title
      ?? app.candidate?.position
      ?? 'UNKNOWN';
  }

  private getSnapshotPositionName(snapshot: Record<string, unknown> | null | undefined): string | null {
    if (!snapshot || typeof snapshot.position !== 'object' || snapshot.position === null) return null;
    const position = snapshot.position as Record<string, unknown>;
    return typeof position.name === 'string' && position.name.trim() ? position.name.trim() : null;
  }

  private calculateRecruiters(applications: DashboardApplication[]): RecruiterDashboardDto[] {
    const grouped = new Map<string, DashboardApplication[]>();
    applications.forEach((app) => {
      const name = app.assignedRecruiter?.name ?? 'UNASSIGNED';
      grouped.set(name, [...(grouped.get(name) ?? []), app]);
    });
    return [...grouped.entries()].map(([name, apps]) => {
      const hired = apps.filter((app) => this.isHired(app));
      return {
        name,
        hiredCount: hired.length,
        hiredRate: this.percent(hired.length, apps.length),
        tth: this.average(hired.map((app) => this.workingDaysBetween(app.createdAt, app.hiredAt)).filter(this.isNumber)),
      };
    });
  }

  private calculateDepartments(applications: DashboardApplication[]): DepartmentDashboardDto[] {
    const grouped = new Map<string, { total: number; hired: number }>();
    applications.forEach((app) => {
      const department = this.latestOffer(app)?.department ?? 'UNKNOWN';
      const item = grouped.get(department) ?? { total: 0, hired: 0 };
      item.total++;
      if (this.isHired(app)) item.hired++;
      grouped.set(department, item);
    });
    return [...grouped.entries()].map(([dept, item]) => ({ dept, rate: this.percent(item.hired, item.total) }));
  }

  private calculateSourcing(applications: DashboardApplication[], dateWindow: DashboardDateWindow): SourcingDashboardDto[] {
    const result: SourcingDashboardDto[] = [
      { stage: 'APPLICATION', pass: applications.filter((app) => this.inDateWindow(app.createdAt, dateWindow)).length, fail: 0 },
      { stage: 'SCREEN_CV', pass: 0, fail: 0 },
      { stage: 'INTERVIEW_1', pass: 0, fail: 0 },
      { stage: 'INTERVIEW_2', pass: 0, fail: 0 },
    ];
    applications.forEach((app) => {
      if (this.inDateWindow(this.screeningEventDate(app), dateWindow)) {
        const screened = app.mappingStatus === MappingStatus.DONE
          || app.aiScreeningStatus === AiScreeningStatus.DONE;
        if (screened) result[1].pass++;
        else result[1].fail++;
      }
      [InterviewRoundType.INTERVIEW_1, InterviewRoundType.INTERVIEW_2].forEach((roundType, index) => {
        const round = this.latestRoundInWindow(app, roundType, dateWindow);
        if (!round) return;
        const target = result[index + 2];
        if (round.result === InterviewResult.PASS) target.pass++;
        if ([InterviewResult.FAIL, InterviewResult.NO_SHOW].includes(round.result as InterviewResult)) target.fail++;
      });
    });
    return result;
  }

  private calculateQuality(applications: DashboardApplication[], dateWindow: DashboardDateWindow): QualityDashboardDto[] {
    const grouped = new Map<string, number>();
    applications.forEach((app) => {
      const finalInterview = this.finalInterview(app);
      if (!finalInterview || !this.inDateWindow(finalInterview.completedAt, dateWindow)) return;
      const category = this.finalQualityCategory(finalInterview);
      grouped.set(category, (grouped.get(category) ?? 0) + 1);
    });
    return [...grouped.entries()].map(([name, value]) => ({ name, value }));
  }

  private calculateLevelHired(applications: DashboardApplication[], dateWindow: DashboardDateWindow): LevelHiredDashboardDto[] {
    const grouped = new Map<string, number>();
    applications.filter((app) => this.isHired(app) && this.inDateWindow(app.hiredAt, dateWindow)).forEach((app) => {
      const level = this.normalizeOfferLevel(this.latestOffer(app)?.level);
      grouped.set(level, (grouped.get(level) ?? 0) + 1);
    });
    return [...grouped.entries()].map(([level, count]) => ({ level, count }));
  }

  private calculateSla(applications: DashboardApplication[], dateWindow: DashboardDateWindow): SlaDashboardDto[] {
    const stages = [
      { stage: 'APPLY_TO_SCREEN_CV', standard: 2, values: applications.filter((app) => this.inDateWindow(this.screeningEventDate(app), dateWindow)).map((app) => this.workingDaysBetween(app.createdAt, this.screeningEventDate(app))) },
      { stage: 'SCREEN_CV_TO_INTERVIEW_1', standard: 5, values: applications.filter((app) => this.inDateWindow(this.firstInterview(app)?.scheduledAt, dateWindow)).map((app) => this.workingDaysBetween(this.screeningEventDate(app), this.firstInterview(app)?.scheduledAt)) },
      { stage: 'INTERVIEW_1_TO_INTERVIEW_2', standard: 5, values: applications.filter((app) => this.inDateWindow(this.finalInterview(app)?.scheduledAt, dateWindow)).map((app) => this.workingDaysBetween(this.firstInterview(app)?.completedAt, this.finalInterview(app)?.scheduledAt)) },
      { stage: 'INTERVIEW_2_TO_OFFER', standard: 7, values: applications.filter((app) => this.inDateWindow(this.latestOfferSentAt(app), dateWindow)).map((app) => this.workingDaysBetween(this.finalInterview(app)?.completedAt, this.latestOfferSentAt(app))) },
    ];
    return stages.map(({ stage, standard, values }) => ({ stage, standard, actual: this.average(values.filter(this.isNumber)) })).filter((item) => item.actual > 0);
  }

  private calculateOfferStatus(applications: DashboardApplication[], dateWindow: DashboardDateWindow): OfferStatusDashboardDto[] {
    const grouped = new Map<string, number>();
    applications.forEach((app) => {
      if (this.isHired(app) && this.inDateWindow(app.hiredAt, dateWindow)) {
        this.increment(grouped, 'HIRED');
        return;
      }
      if (app.onboardingStatus === OnboardingStatus.REJECTED && this.inDateWindow(app.onboardingRejectedAt, dateWindow)) {
        this.increment(grouped, 'ONBOARDING_REJECTED');
        return;
      }
      if (app.onboardingStatus === OnboardingStatus.PENDING && this.inDateWindow(app.onboardingConfirmedAt ?? app.updatedAt, dateWindow)) {
        this.increment(grouped, 'ONBOARDING');
        return;
      }
      const offer = this.latestOfferInWindow(app, dateWindow);
      const status = offer?.status ?? (this.hasOfferEventInWindow(app, dateWindow) ? app.offerStatus : null);
      const statusGroup = this.offerStatusGroup(status);
      if (statusGroup) this.increment(grouped, statusGroup);

      const finalInterview = this.finalInterview(app);
      if (finalInterview?.result === InterviewResult.PASS
        && this.inDateWindow(finalInterview.completedAt, dateWindow)
        && !this.hasOfferEventInWindow(app, dateWindow)) {
        this.increment(grouped, 'PASSED_NO_OFFER');
      }
    });
    return [...grouped.entries()].map(([status, count]) => ({ status, count }));
  }

  private calculateTthByDepartment(applications: DashboardApplication[], dateWindow: DashboardDateWindow): TthDepartmentDashboardDto[] {
    const grouped = new Map<string, DashboardApplication[]>();
    applications.filter((app) => this.isHired(app) && this.inDateWindow(app.hiredAt, dateWindow)).forEach((app) => {
      const department = this.latestOffer(app)?.department ?? 'UNKNOWN';
      grouped.set(department, [...(grouped.get(department) ?? []), app]);
    });
    return [...grouped.entries()].map(([dept, apps]) => ({
      dept,
      applyTth: this.average(apps.map((app) => this.workingDaysBetween(app.createdAt, app.hiredAt)).filter(this.isNumber)),
      finalTth: this.average(apps.map((app) => this.workingDaysBetween(this.finalInterview(app)?.completedAt, app.hiredAt)).filter(this.isNumber)),
    }));
  }

  private calculatePostFinalMetrics(
    applications: DashboardApplication[],
    dateWindow: DashboardDateWindow,
  ): PostFinalMetricsDto {
    const finalApplications = applications.filter((app) =>
      this.inDateWindow(this.finalInterview(app)?.completedAt, dateWindow),
    );
    const passedApplications = finalApplications.filter((app) =>
      this.finalInterview(app)?.result === InterviewResult.PASS,
    );
    const offerApplications = applications.filter((app) => this.hasOfferEventInWindow(app, dateWindow));
    const offeringApplications = offerApplications.filter((app) => {
      const status = this.latestOfferInWindow(app, dateWindow)?.status;
      return [OfferStatus.PENDING, OfferStatus.SENT, OfferStatus.REVISED].includes(status as OfferStatus);
    });
    const acceptedApplications = offerApplications.filter((app) =>
      this.latestOfferInWindow(app, dateWindow)?.status === OfferStatus.ACCEPTED,
    );
    const rejectedApplications = offerApplications.filter((app) => [
      OfferStatus.REJECTED_BY_CANDIDATE,
      OfferStatus.CANCELLED,
      OfferStatus.EXPIRED,
    ].includes(this.latestOfferInWindow(app, dateWindow)?.status as OfferStatus));
    const hiredApplications = applications.filter((app) =>
      this.isHired(app) && this.inDateWindow(app.hiredAt, dateWindow),
    );
    const onboardRejected = applications.filter((app) =>
      app.onboardingStatus === OnboardingStatus.REJECTED
      && this.inDateWindow(app.onboardingRejectedAt, dateWindow),
    ).length;
    const onboardingPending = applications.filter((app) =>
      app.onboardingStatus === OnboardingStatus.PENDING
      && this.inDateWindow(app.onboardingConfirmedAt ?? app.updatedAt, dateWindow),
    ).length;
    const passedWithoutOffer = passedApplications.filter((app) =>
      !this.hasOfferEventInWindow(app, dateWindow),
    ).length;
    const finalQualityCounts = passedApplications.reduce(
      (counts, app) => {
        const category = this.finalQualityCategory(this.finalInterview(app)!);
        if (category === 'PASSED_EXCELLENT') counts.passedXuatSac++;
        else if (category === 'PASSED_GOOD') counts.passedTot++;
        else counts.passedDat++;
        return counts;
      },
      { passedDat: 0, passedTot: 0, passedXuatSac: 0 },
    );
    const failItv = finalApplications.length - passedApplications.length;

    return {
      totalFinalItv: finalApplications.length,
      failItv,
      passed: passedApplications.length,
      ...finalQualityCounts,
      passedKhongOffer: passedWithoutOffer,
      totalOffer: offerApplications.length,
      offering: offeringApplications.length,
      offerAccepted: acceptedApplications.length,
      offerRejected: rejectedApplications.length,
      hired: hiredApplications.length,
      onboardRejected,
      onboardingPending,
      finalToFailRate: this.percent(failItv, finalApplications.length),
      finalToOfferRate: this.percent(offerApplications.length, finalApplications.length),
      offerToHiredRate: this.percent(hiredApplications.length, offerApplications.length),
      finalToHiredRate: this.percent(hiredApplications.length, finalApplications.length),
      applyToOnboardTth: this.average(hiredApplications
        .map((app) => this.workingDaysBetween(app.createdAt, app.hiredAt))
        .filter(this.isNumber)),
      finalToOnboardTth: this.average(hiredApplications
        .map((app) => this.workingDaysBetween(this.finalInterview(app)?.completedAt, app.hiredAt))
        .filter(this.isNumber)),
    };
  }

  private calculateTrendDimensions(
    applications: DashboardApplication[],
    dateWindow: DashboardDateWindow,
    getLabel: (app: DashboardApplication) => string,
  ): TrendDimensionDto[] {
    const grouped = new Map<string, DashboardApplication[]>();
    applications.forEach((app) => {
      const label = getLabel(app).trim() || 'UNKNOWN';
      const group = grouped.get(label) ?? [];
      group.push(app);
      grouped.set(label, group);
    });

    return [...grouped.entries()]
      .map(([label, group]) => this.toTrendDimension(label, group, dateWindow))
      .filter((row) => row.applications > 0 || row.totalFinalItv > 0 || row.totalOffer > 0 || row.hired > 0)
      .sort((a, b) => b.applications - a.applications || a.label.localeCompare(b.label));
  }

  private toTrendDimension(
    label: string,
    applications: DashboardApplication[],
    dateWindow: DashboardDateWindow,
  ): TrendDimensionDto {
    const metrics = this.calculatePostFinalMetrics(applications, dateWindow);
    const hiredByLevel = new Map(
      this.calculateLevelHired(applications, dateWindow).map((item) => [item.level, item.count]),
    );

    return {
      label,
      applications: applications.filter((app) => this.inDateWindow(app.createdAt, dateWindow)).length,
      totalFinalItv: metrics.totalFinalItv,
      failItv: metrics.failItv,
      passed: metrics.passed,
      passedDat: metrics.passedDat,
      passedTot: metrics.passedTot,
      passedXuatSac: metrics.passedXuatSac,
      passedKhongOffer: metrics.passedKhongOffer,
      totalOffer: metrics.totalOffer,
      offering: metrics.offering,
      offerAccepted: metrics.offerAccepted,
      offerRejected: metrics.offerRejected,
      onboardRejected: metrics.onboardRejected,
      onboardingPending: metrics.onboardingPending,
      hired: metrics.hired,
      managementHired: hiredByLevel.get('MANAGEMENT') ?? 0,
      seniorHired: hiredByLevel.get('SENIOR') ?? 0,
      experiencedHired: hiredByLevel.get('EXPERIENCED') ?? 0,
      juniorHired: hiredByLevel.get('JUNIOR') ?? 0,
      finalToFailRate: metrics.finalToFailRate,
      finalToOfferRate: metrics.finalToOfferRate,
      offerToHiredRate: metrics.offerToHiredRate,
      finalToHiredRate: metrics.finalToHiredRate,
      applyToOnboardTth: metrics.applyToOnboardTth,
      finalToOnboardTth: metrics.finalToOnboardTth,
    };
  }

  private isHired(app: DashboardApplication): boolean {
    return app.currentStage === ApplicationStage.HIRED && Boolean(app.hiredAt);
  }

  private firstInterview(app: DashboardApplication): InterviewRoundEntity | null {
    return app.interviewRounds?.find((round) => round.roundType === InterviewRoundType.INTERVIEW_1) ?? null;
  }

  private finalInterview(app: DashboardApplication): InterviewRoundEntity | null {
    const rounds = app.interviewRounds?.filter((round) => round.roundType === InterviewRoundType.INTERVIEW_2) ?? [];
    return rounds.sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0))[0] ?? null;
  }

  private latestRoundInWindow(
    app: DashboardApplication,
    roundType: InterviewRoundType,
    dateWindow: DashboardDateWindow,
  ): InterviewRoundEntity | null {
    return [...(app.interviewRounds ?? [])]
      .filter((round) => round.roundType === roundType)
      .filter((round) => this.inDateWindow(this.interviewEventDate(round), dateWindow))
      .sort((a, b) => (this.interviewEventDate(b)?.getTime() ?? 0) - (this.interviewEventDate(a)?.getTime() ?? 0))[0] ?? null;
  }

  private latestOffer(app: DashboardApplication): OfferEntity | null {
    return [...(app.offers ?? [])].sort((a, b) => b.version - a.version)[0] ?? null;
  }

  private latestOfferSentAt(app: DashboardApplication): Date | null {
    return [...(app.offers ?? [])]
      .filter((offer) => Boolean(offer.sentAt))
      .sort((a, b) => (b.sentAt?.getTime() ?? 0) - (a.sentAt?.getTime() ?? 0))[0]?.sentAt ?? null;
  }

  private offerInMonth(app: DashboardApplication, month: Date): OfferEntity | null {
    return [...(app.offers ?? [])]
      .filter((offer) => this.isSameMonth(this.offerEventDate(offer), month))
      .sort((a, b) => b.version - a.version)[0] ?? null;
  }

  private isSameMonth(value: Date | null | undefined, month: Date): boolean {
    return Boolean(
      value
      && value.getFullYear() === month.getFullYear()
      && value.getMonth() === month.getMonth(),
    );
  }

  private interviewEventDate(round: InterviewRoundEntity | null): Date | null {
    return round?.completedAt ?? round?.startedAt ?? round?.scheduledAt ?? null;
  }

  private screeningEventDate(app: DashboardApplication): Date | null {
    const dates = [
      ...(app.formSessions ?? []).flatMap((session) => [session.sentAt, session.submittedAt]),
      ...(app.aiScreeningResults ?? []).map((result) => result.createdAt),
      ...(app.hrReviews ?? []).map((review) => review.createdAt),
    ].filter((value): value is Date => value instanceof Date);
    if (dates.length > 0) return dates.sort((a, b) => a.getTime() - b.getTime())[0];
    return app.currentStage === ApplicationStage.SCREEN_CV ? app.updatedAt : null;
  }

  private offerStatusGroup(status: OfferStatus | null | undefined): string | null {
    if (!status) return null;
    if ([OfferStatus.PENDING, OfferStatus.SENT, OfferStatus.REVISED].includes(status)) return 'OFFERING';
    if (status === OfferStatus.ACCEPTED) return 'ACCEPTED';
    if ([OfferStatus.REJECTED_BY_CANDIDATE, OfferStatus.CANCELLED, OfferStatus.EXPIRED].includes(status)) return 'REJECTED';
    return null;
  }

  private increment(grouped: Map<string, number>, key: string): void {
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }

  private workingDaysBetween(from: Date | null | undefined, to: Date | null | undefined): number | null {
    if (!from || !to) return null;
    if (to.getTime() <= from.getTime()) return 0;

    let cursor = new Date(from);
    let workingMilliseconds = 0;
    while (cursor.getTime() < to.getTime()) {
      const day = cursor.getDay();
      const nextDay = new Date(cursor);
      nextDay.setHours(24, 0, 0, 0);
      const segmentEnd = Math.min(nextDay.getTime(), to.getTime());
      if (day !== 0 && day !== 6) workingMilliseconds += segmentEnd - cursor.getTime();
      cursor = nextDay;
    }

    return Math.round((workingMilliseconds / 86_400_000) * 10) / 10;
  }

  private toDateWindow(query: PipelineDashboardQueryDto): DashboardDateWindow {
    return {
      start: query.startDate ? new Date(`${query.startDate}T00:00:00`) : undefined,
      end: query.endDate ? new Date(`${query.endDate}T23:59:59.999`) : undefined,
    };
  }

  private inDateWindow(value: Date | null | undefined, window: DashboardDateWindow): boolean {
    if (!value) return false;
    if (window.start && value < window.start) return false;
    if (window.end && value > window.end) return false;
    return true;
  }

  private offerEventDate(offer: OfferEntity): Date {
    if (offer.status === OfferStatus.ACCEPTED || offer.status === OfferStatus.REJECTED_BY_CANDIDATE) {
      return offer.respondedAt ?? offer.updatedAt ?? offer.createdAt;
    }
    if (offer.status === OfferStatus.SENT) return offer.sentAt ?? offer.updatedAt ?? offer.createdAt;
    return offer.createdAt ?? offer.updatedAt;
  }

  private hasOfferEventInWindow(app: DashboardApplication, window: DashboardDateWindow): boolean {
    const hasOfferRecord = (app.offers ?? []).some((offer) =>
      this.inDateWindow(this.offerEventDate(offer), window),
    );
    if (hasOfferRecord) return true;
    return Boolean(app.offerStatus) && this.inDateWindow(app.updatedAt, window);
  }

  private latestOfferInWindow(app: DashboardApplication, window: DashboardDateWindow): OfferEntity | null {
    return [...(app.offers ?? [])]
      .filter((offer) => this.inDateWindow(this.offerEventDate(offer), window))
      .sort((a, b) => b.version - a.version)[0] ?? null;
  }

  private normalizeOfferLevel(level?: string | null): string {
    const normalized = level?.trim().toUpperCase();
    if (!normalized) return 'UNKNOWN';
    if (['MANAGER', 'DIRECTOR', 'LEAD', 'PM'].includes(normalized)) return 'MANAGEMENT';
    if (['SENIOR', 'SPECIALIST', 'EXPERT'].includes(normalized)) return 'SENIOR';
    if (['EXPERIENCED', 'MIDDLE', 'PROFESSIONAL'].includes(normalized)) return 'EXPERIENCED';
    if (['JUNIOR', 'ENTRY', 'ENTRY LEVEL', 'FRESHER', 'INTERN'].includes(normalized)) return 'JUNIOR';
    return 'UNKNOWN';
  }

  private finalQualityCategory(finalInterview: InterviewRoundEntity): string {
    if (finalInterview.result !== InterviewResult.PASS || finalInterview.overallGrade === InterviewGrade.POOR) {
      return 'FAIL_ITV';
    }
    if (finalInterview.overallGrade === InterviewGrade.EXCELLENT) return 'PASSED_EXCELLENT';
    if (finalInterview.overallGrade === InterviewGrade.GOOD) return 'PASSED_GOOD';
    return 'PASSED_AVERAGE';
  }

  private average(values: number[]): number {
    return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : 0;
  }

  private percent(value: number, total: number): number {
    return total ? Math.round((value / total) * 100) : 0;
  }

  private monthKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private isNumber(value: number | null): value is number {
    return value !== null && Number.isFinite(value);
  }
}
