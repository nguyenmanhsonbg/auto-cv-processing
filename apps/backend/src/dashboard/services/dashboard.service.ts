import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApplicationEntity } from '../../applications/entities/application.entity';
import { CandidateEntity } from '../../candidates/entities/candidate.entity';
import { InterviewRoundEntity } from '../../interview-rounds/entities/interview-round.entity';
import {
  ApplicationStage,
  RecruitmentChannel,
  InterviewResult,
  InterviewRoundType,
} from '../../recruitment-common';
import { CandidateLevel } from '@interview-assistant/shared';
import {
  PipelineDashboardDto,
  PipelineFunnelDto,
  StageCountDto,
  ChannelHiringDto,
  LevelHiringDto,
  MonthlyTrendDto,
  TimeMetricsDto,
  PipelineDashboardQueryDto,
} from '../dto/pipeline-dashboard.dto';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepo: Repository<ApplicationEntity>,
    @InjectRepository(CandidateEntity)
    private readonly candidateRepo: Repository<CandidateEntity>,
    @InjectRepository(InterviewRoundEntity)
    private readonly interviewRoundRepo: Repository<InterviewRoundEntity>,
  ) {}

  /**
   * Get pipeline dashboard data
   */
  async getPipelineDashboard(query: PipelineDashboardQueryDto): Promise<PipelineDashboardDto> {
    // Build base query with filters
    const qb = this.applicationRepo.createQueryBuilder('app')
      .leftJoinAndSelect('app.candidate', 'candidate')
      .leftJoinAndSelect('app.interviewRounds', 'interviews');

    // Apply date filters
    if (query.startDate) {
      qb.andWhere('app.createdAt >= :startDate', { startDate: query.startDate });
    }
    if (query.endDate) {
      qb.andWhere('app.createdAt <= :endDate', { endDate: query.endDate + ' 23:59:59' });
    }

    // Apply recruiter filter
    if (query.recruiterId) {
      qb.andWhere('app.assignedRecruiterId = :recruiterId', { recruiterId: query.recruiterId });
    }

    // Apply job posting filter
    if (query.jobPostingId) {
      qb.andWhere('app.jobPostingId = :jobPostingId', { jobPostingId: query.jobPostingId });
    }

    const applications = await qb.getMany();

    // Calculate all metrics
    const funnel = this.calculateFunnel(applications);
    const stageDistribution = this.calculateStageDistribution(applications);
    const channelHiring = await this.calculateChannelHiring(query);
    const levelHiring = await this.calculateLevelHiring(query);
    const monthlyTrend = await this.calculateMonthlyTrend(query);
    const timeMetrics = await this.calculateTimeMetrics(query);

    return {
      funnel,
      stageDistribution,
      channelHiring,
      levelHiring,
      monthlyTrend,
      timeMetrics,
      totalApplications: applications.length,
      totalHired: funnel.hired,
      asOf: new Date(),
    };
  }

  /**
   * Calculate funnel metrics
   */
  private calculateFunnel(applications: ApplicationEntity[]): PipelineFunnelDto {
    const total = applications.length;
    
    // Applications that have reached interview stage (have interview rounds)
    const withInterview = applications.filter(app => 
      app.interviewRounds && app.interviewRounds.length > 0
    );
    const totalFinalItv = withInterview.length;

    // Passed interviews (at least one interview with PASS result)
    const passed = applications.filter(app =>
      app.interviewRounds?.some((r: InterviewRoundEntity) => r.result === InterviewResult.PASS)
    ).length;

    // Got offer (OFFER_SENT or OFFER_PENDING or HIRED)
    const offer = applications.filter(app =>
      [ApplicationStage.OFFER_PENDING, ApplicationStage.OFFER_SENT, ApplicationStage.OFFER_REVISED, ApplicationStage.HIRED].includes(app.currentStage as ApplicationStage)
    ).length;

    // Hired
    const hired = applications.filter(app =>
      app.currentStage === ApplicationStage.HIRED && app.hiredAt
    ).length;

    return {
      totalFinalItv,
      passed,
      passedRate: totalFinalItv ? Math.round((passed / totalFinalItv) * 100) : 0,
      offer,
      offerRate: passed ? Math.round((offer / passed) * 100) : 0,
      hired,
      hiredRate: offer ? Math.round((hired / offer) * 100) : 0,
    };
  }

  /**
   * Calculate stage distribution
   */
  private calculateStageDistribution(applications: ApplicationEntity[]): StageCountDto[] {
    const stageCounts = new Map<ApplicationStage, number>();

    // Initialize all stages
    Object.values(ApplicationStage).forEach(stage => {
      stageCounts.set(stage, 0);
    });

    // Count applications in each stage
    applications.forEach(app => {
      const stage = app.currentStage as ApplicationStage;
      if (stage) {
        stageCounts.set(stage, (stageCounts.get(stage) || 0) + 1);
      }
    });

    const total = applications.length;

    return Array.from(stageCounts.entries())
      .filter(([_, count]) => count > 0)
      .map(([stage, count]) => ({
        stage,
        count,
        percentage: total ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => {
        // Sort by stage order
        const stageOrder = Object.values(ApplicationStage);
        return stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage);
      });
  }

  /**
   * Calculate hiring by channel
   */
  private async calculateChannelHiring(query: PipelineDashboardQueryDto): Promise<ChannelHiringDto[]> {
    const qb = this.applicationRepo.createQueryBuilder('app')
      .select('app.source_channel', 'channel')
      .addSelect('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN app.current_stage = :hiredStage THEN 1 ELSE 0 END)', 'hired')
      .setParameter('hiredStage', ApplicationStage.HIRED)
      .groupBy('app.source_channel');

    if (query.startDate) {
      qb.andWhere('app.createdAt >= :startDate', { startDate: query.startDate });
    }
    if (query.endDate) {
      qb.andWhere('app.createdAt <= :endDate', { endDate: query.endDate + ' 23:59:59' });
    }

    const results = await qb.getRawMany();

    const channelData = results.map(r => ({
      channel: r.channel || 'UNKNOWN',
      total: parseInt(r.total),
      hired: parseInt(r.hired),
      hiringRate: parseInt(r.total) ? Math.round((parseInt(r.hired) / parseInt(r.total)) * 100) : 0,
    }));

    // Calculate total
    const total = channelData.reduce((sum, c) => sum + c.total, 0);
    const totalHired = channelData.reduce((sum, c) => sum + c.hired, 0);

    channelData.push({
      channel: 'TOTAL',
      total,
      hired: totalHired,
      hiringRate: total ? Math.round((totalHired / total) * 100) : 0,
    });

    return channelData;
  }

  /**
   * Calculate hiring by level
   */
  private async calculateLevelHiring(query: PipelineDashboardQueryDto): Promise<LevelHiringDto[]> {
    const qb = this.applicationRepo.createQueryBuilder('app')
      .leftJoin('app.candidate', 'candidate')
      .select('candidate.level', 'level')
      .addSelect('COUNT(*)', 'hired')
      .where('app.currentStage = :hiredStage', { hiredStage: ApplicationStage.HIRED })
      .groupBy('candidate.level');

    if (query.startDate) {
      qb.andWhere('app.createdAt >= :startDate', { startDate: query.startDate });
    }
    if (query.endDate) {
      qb.andWhere('app.createdAt <= :endDate', { endDate: query.endDate + ' 23:59:59' });
    }

    const results = await qb.getRawMany();

    const total = results.reduce((sum, r) => sum + parseInt(r.hired), 0);

    return results.map(r => ({
      level: r.level || 'UNKNOWN',
      hired: parseInt(r.hired),
      percentage: total ? Math.round((parseInt(r.hired) / total) * 100) : 0,
    }));
  }

  /**
   * Calculate monthly trend
   */
  private async calculateMonthlyTrend(query: PipelineDashboardQueryDto): Promise<MonthlyTrendDto[]> {
    // Get last 12 months
    const months: MonthlyTrendDto[] = [];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = date.toISOString().slice(0, 7); // YYYY-MM
      const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);

      const qb = this.applicationRepo.createQueryBuilder('app')
        .select('COUNT(*)', 'newApplications')
        .where('app.createdAt >= :startDate', { startDate: date.toISOString() })
        .andWhere('app.createdAt < :endDate', { endDate: nextMonth.toISOString() });

      const hiredQb = this.applicationRepo.createQueryBuilder('app')
        .select('COUNT(*)', 'hired')
        .where('app.currentStage = :hiredStage', { hiredStage: ApplicationStage.HIRED })
        .andWhere('app.hiredAt >= :startDate', { startDate: date.toISOString() })
        .andWhere('app.hiredAt < :endDate', { endDate: nextMonth.toISOString() });

      if (query.recruiterId) {
        qb.andWhere('app.assignedRecruiterId = :recruiterId', { recruiterId: query.recruiterId });
        hiredQb.andWhere('app.assignedRecruiterId = :recruiterId', { recruiterId: query.recruiterId });
      }

      const [newResult, hiredResult] = await Promise.all([
        qb.getRawOne(),
        hiredQb.getRawOne(),
      ]);

      months.push({
        month: monthStr,
        newApplications: parseInt(newResult?.newApplications || '0'),
        hired: parseInt(hiredResult?.hired || '0'),
      });
    }

    return months;
  }

  /**
   * Calculate time metrics (TTH - Time to Hire)
   */
  private async calculateTimeMetrics(query: PipelineDashboardQueryDto): Promise<TimeMetricsDto> {
    // Get hired applications with hiredAt
    const qb = this.applicationRepo.createQueryBuilder('app')
      .where('app.currentStage = :hiredStage', { hiredStage: ApplicationStage.HIRED })
      .andWhere('app.hiredAt IS NOT NULL');

    if (query.startDate) {
      qb.andWhere('app.createdAt >= :startDate', { startDate: query.startDate });
    }
    if (query.endDate) {
      qb.andWhere('app.createdAt <= :endDate', { endDate: query.endDate + ' 23:59:59' });
    }

    const hiredApps = await qb.getMany();

    if (hiredApps.length === 0) {
      return {
        avgTimeToHire: 0,
        avgTimeFromFinal: 0,
        avgTimeOfferToHire: 0,
      };
    }

    // Calculate average TTH (createdAt to hiredAt)
    let totalTTH = 0;
    let totalFromFinal = 0;
    let totalFromOffer = 0;
    let countFromFinal = 0;
    let countFromOffer = 0;

    for (const app of hiredApps) {
      if (app.createdAt && app.hiredAt) {
        const tth = (app.hiredAt.getTime() - app.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        totalTTH += tth;
      }

      // Get last interview round
      const lastInterview = await this.interviewRoundRepo.findOne({
        where: { 
          applicationId: app.id,
          roundType: InterviewRoundType.INTERVIEW_2,
        },
        order: { completedAt: 'DESC' },
      });

      if (lastInterview?.completedAt && app.hiredAt) {
        const days = (app.hiredAt.getTime() - lastInterview.completedAt.getTime()) / (1000 * 60 * 60 * 24);
        totalFromFinal += days;
        countFromFinal++;
      }

      // Estimate from offer (simplified - using hiredAt - 7 days)
      if (app.hiredAt) {
        const offerDate = new Date(app.hiredAt.getTime() - 7 * 24 * 60 * 60 * 1000);
        const days = (app.hiredAt.getTime() - offerDate.getTime()) / (1000 * 60 * 60 * 24);
        totalFromOffer += days;
        countFromOffer++;
      }
    }

    return {
      avgTimeToHire: Math.round(totalTTH / hiredApps.length),
      avgTimeFromFinal: countFromFinal ? Math.round(totalFromFinal / countFromFinal) : 0,
      avgTimeOfferToHire: countFromOffer ? Math.round(totalFromOffer / countFromOffer) : 7, // Default 7 days
    };
  }
}
