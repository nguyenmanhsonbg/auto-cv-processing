import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApplicationEntity } from '../../applications/entities/application.entity';
import { InterviewRoundEntity } from '../../interview-rounds/entities/interview-round.entity';
import { OfferEntity } from '../../offers/entities/offer.entity';
import {
  ApplicationStage,
  InterviewGrade,
  InterviewResult,
  InterviewRoundType,
  OfferStatus,
  RecruitmentChannel,
} from '../../recruitment-common';
import {
  ChannelHiringDto,
  DepartmentDashboardDto,
  LevelHiredDashboardDto,
  LevelHiringDto,
  MonthlyTrendDto,
  OfferStatusDashboardDto,
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
} from '../dto/pipeline-dashboard.dto';

type DashboardApplication = ApplicationEntity & {
  interviewRounds: InterviewRoundEntity[];
  offers: OfferEntity[];
};

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepo: Repository<ApplicationEntity>,
  ) {}

  async getPipelineDashboard(query: PipelineDashboardQueryDto): Promise<PipelineDashboardDto> {
    const applications = await this.loadApplications(query);
    const funnel = this.calculateFunnel(applications);

    return {
      funnel,
      stageDistribution: this.calculateStageDistribution(applications),
      channelHiring: this.calculateChannelHiring(applications),
      levelHiring: this.calculateLevelHiring(applications),
      monthlyTrend: this.calculateMonthlyTrend(applications),
      timeMetrics: this.calculateTimeMetrics(applications),
      totalApplications: applications.length,
      totalHired: funnel.hired,
      asOf: new Date(),
      positions: this.calculatePositions(applications),
      recruiters: this.calculateRecruiters(applications),
      departments: this.calculateDepartments(applications),
      sourcing: this.calculateSourcing(applications),
      quality: this.calculateQuality(applications),
      levelHired: this.calculateLevelHired(applications),
      sla: this.calculateSla(applications),
      normRadar: [],
      offerStatus: this.calculateOfferStatus(applications),
      tthByDepartment: this.calculateTthByDepartment(applications),
    };
  }

  private async loadApplications(query: PipelineDashboardQueryDto): Promise<DashboardApplication[]> {
    const qb = this.applicationRepo.createQueryBuilder('app')
      .leftJoinAndSelect('app.candidate', 'candidate')
      .leftJoinAndSelect('app.jobPosting', 'jobPosting')
      .leftJoinAndSelect('app.assignedRecruiter', 'assignedRecruiter')
      .leftJoinAndSelect('app.freelancerReferral', 'referral')
      .leftJoinAndSelect('referral.freelancer', 'freelancer')
      .leftJoinAndSelect('referral.internal', 'internal')
      .leftJoinAndSelect('app.interviewRounds', 'interviews')
      .leftJoinAndSelect('app.offers', 'offers');

    if (query.startDate) qb.andWhere('app.createdAt >= :startDate', { startDate: query.startDate });
    if (query.endDate) qb.andWhere('app.createdAt <= :endDate', { endDate: `${query.endDate} 23:59:59` });
    if (query.recruiterId) qb.andWhere('app.assignedRecruiterId = :recruiterId', { recruiterId: query.recruiterId });
    if (query.jobPostingId) qb.andWhere('app.jobPostingId = :jobPostingId', { jobPostingId: query.jobPostingId });
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

  private calculateFunnel(applications: DashboardApplication[]): PipelineFunnelDto {
    const finalItv = applications.filter((app) => app.interviewRounds?.some((round) => round.roundType === InterviewRoundType.INTERVIEW_2));
    const passed = finalItv.filter((app) => app.interviewRounds?.some((round) => round.roundType === InterviewRoundType.INTERVIEW_2 && round.result === InterviewResult.PASS)).length;
    const offer = applications.filter((app) => [ApplicationStage.OFFER_PENDING, ApplicationStage.OFFER_SENT, ApplicationStage.OFFER_REVISED, ApplicationStage.HIRED].includes(app.currentStage as ApplicationStage) || Boolean(app.offerStatus)).length;
    const hired = applications.filter((app) => this.isHired(app)).length;
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
    const order = Object.values(ApplicationStage);
    return [...counts.entries()]
      .map(([stage, count]) => ({ stage: stage as ApplicationStage, count, percentage: total ? Math.round((count / total) * 100) : 0 }))
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

  private calculateLevelHiring(applications: DashboardApplication[]): LevelHiringDto[] {
    const grouped = new Map<string, number>();
    applications.filter((app) => this.isHired(app)).forEach((app) => {
      const level = app.candidate?.level ?? 'UNKNOWN';
      grouped.set(level, (grouped.get(level) ?? 0) + 1);
    });
    const total = [...grouped.values()].reduce((sum, count) => sum + count, 0);
    return [...grouped.entries()].map(([level, hired]) => ({ level, hired, percentage: this.percent(hired, total) }));
  }

  private calculateMonthlyTrend(applications: DashboardApplication[]): MonthlyTrendDto[] {
    const months: MonthlyTrendDto[] = [];
    const monthlyTargets = [10, 12, 10, 15, 12, 18, 14, 15, 12, 14, 10, 12];
    const now = new Date();
    for (let offset = 11; offset >= 0; offset--) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const inMonth = (value: Date | null | undefined) => Boolean(value && value.getFullYear() === date.getFullYear() && value.getMonth() === date.getMonth());
      months.push({
        month: this.monthKey(date),
        newApplications: applications.filter((app) => inMonth(app.createdAt)).length,
        hired: applications.filter((app) => this.isHired(app) && inMonth(app.hiredAt)).length,
        interviewed: applications.filter((app) => app.interviewRounds?.some((round) => inMonth(round.completedAt) || inMonth(round.startedAt) || inMonth(round.scheduledAt))).length,
        target: monthlyTargets[11 - offset],
      });
    }
    return months;
  }

  private calculateTimeMetrics(applications: DashboardApplication[]): TimeMetricsDto {
    const hiredApps = applications.filter((app) => this.isHired(app));
    return {
      avgTimeToHire: this.average(hiredApps.map((app) => this.daysBetween(app.createdAt, app.hiredAt)).filter(this.isNumber)),
      avgTimeFromFinal: this.average(hiredApps.map((app) => this.daysBetween(this.finalInterview(app)?.completedAt, app.hiredAt)).filter(this.isNumber)),
      avgTimeOfferToHire: this.average(hiredApps.map((app) => this.daysBetween(this.latestOffer(app)?.sentAt, app.hiredAt)).filter(this.isNumber)),
    };
  }

  private calculatePositions(applications: DashboardApplication[]): PositionDashboardDto[] {
    const grouped = new Map<string, { applications: number; hired: number }>();
    applications.forEach((app) => {
      const name = app.jobPosting?.title ?? app.candidate?.position ?? 'UNKNOWN';
      const item = grouped.get(name) ?? { applications: 0, hired: 0 };
      item.applications++;
      if (this.isHired(app)) item.hired++;
      grouped.set(name, item);
    });
    return [...grouped.entries()].map(([name, item]) => ({ ...item, name, target: null }));
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
        tth: this.average(hired.map((app) => this.daysBetween(app.createdAt, app.hiredAt)).filter(this.isNumber)),
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

  private calculateSourcing(applications: DashboardApplication[]): SourcingDashboardDto[] {
    const result: SourcingDashboardDto[] = [
      { stage: 'APPLICATION', pass: applications.length, fail: 0 },
      { stage: 'INTERVIEW_1', pass: 0, fail: 0 },
      { stage: 'INTERVIEW_2', pass: 0, fail: 0 },
    ];
    applications.forEach((app) => app.interviewRounds?.forEach((round) => {
      const target = round.roundType === InterviewRoundType.INTERVIEW_1 ? result[1] : result[2];
      if (round.result === InterviewResult.PASS) target.pass++;
      if ([InterviewResult.FAIL, InterviewResult.NO_SHOW].includes(round.result as InterviewResult)) target.fail++;
    }));
    return result;
  }

  private calculateQuality(applications: DashboardApplication[]): QualityDashboardDto[] {
    const grouped = new Map<string, number>();
    applications.forEach((app) => {
      const grade = this.finalInterview(app)?.overallGrade;
      if (grade) grouped.set(grade, (grouped.get(grade) ?? 0) + 1);
    });
    return [...grouped.entries()].map(([name, value]) => ({ name, value }));
  }

  private calculateLevelHired(applications: DashboardApplication[]): LevelHiredDashboardDto[] {
    const grouped = new Map<string, number>();
    applications.filter((app) => this.isHired(app)).forEach((app) => {
      const level = app.candidate?.level ?? 'UNKNOWN';
      grouped.set(level, (grouped.get(level) ?? 0) + 1);
    });
    return [...grouped.entries()].map(([level, count]) => ({ level, count }));
  }

  private calculateSla(applications: DashboardApplication[]): SlaDashboardDto[] {
    const stages = [
      { stage: 'APPLY_TO_INTERVIEW_1', values: applications.map((app) => this.daysBetween(app.createdAt, this.firstInterview(app)?.scheduledAt)) },
      { stage: 'INTERVIEW_1_TO_INTERVIEW_2', values: applications.map((app) => this.daysBetween(this.firstInterview(app)?.completedAt, this.finalInterview(app)?.scheduledAt)) },
      { stage: 'INTERVIEW_2_TO_OFFER', values: applications.map((app) => this.daysBetween(this.finalInterview(app)?.completedAt, this.latestOffer(app)?.sentAt)) },
      { stage: 'OFFER_TO_HIRED', values: applications.map((app) => this.daysBetween(this.latestOffer(app)?.sentAt, app.hiredAt)) },
    ];
    return stages.map(({ stage, values }) => ({ stage, standard: null, actual: this.average(values.filter(this.isNumber)) })).filter((item) => item.actual > 0);
  }

  private calculateOfferStatus(applications: DashboardApplication[]): OfferStatusDashboardDto[] {
    const grouped = new Map<string, number>();
    applications.forEach((app) => {
      const status = this.latestOffer(app)?.status ?? app.offerStatus;
      if (status) grouped.set(status, (grouped.get(status) ?? 0) + 1);
    });
    return [...grouped.entries()].map(([status, count]) => ({ status, count }));
  }

  private calculateTthByDepartment(applications: DashboardApplication[]): TthDepartmentDashboardDto[] {
    const grouped = new Map<string, DashboardApplication[]>();
    applications.filter((app) => this.isHired(app)).forEach((app) => {
      const department = this.latestOffer(app)?.department ?? 'UNKNOWN';
      grouped.set(department, [...(grouped.get(department) ?? []), app]);
    });
    return [...grouped.entries()].map(([dept, apps]) => ({
      dept,
      applyTth: this.average(apps.map((app) => this.daysBetween(app.createdAt, app.hiredAt)).filter(this.isNumber)),
      finalTth: this.average(apps.map((app) => this.daysBetween(this.finalInterview(app)?.completedAt, app.hiredAt)).filter(this.isNumber)),
    }));
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

  private latestOffer(app: DashboardApplication): OfferEntity | null {
    return [...(app.offers ?? [])].sort((a, b) => b.version - a.version)[0] ?? null;
  }

  private daysBetween(from: Date | null | undefined, to: Date | null | undefined): number | null {
    if (!from || !to) return null;
    return Math.max(0, Math.round(((to.getTime() - from.getTime()) / 86_400_000) * 10) / 10);
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
