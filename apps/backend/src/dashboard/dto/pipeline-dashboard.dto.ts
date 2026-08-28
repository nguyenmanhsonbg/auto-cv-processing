import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApplicationStage, RecruitmentChannel } from '../../recruitment-common';

export enum DashboardOwnerType {
  HR = 'HR',
  FREELANCER = 'FREELANCER',
  INTERNAL = 'INTERNAL',
}

export class PipelineFunnelDto {
  @ApiProperty({ description: 'Total Final ITV count' })
  totalFinalItv: number;

  @ApiProperty({ description: 'Passed count' })
  passed: number;

  @ApiProperty({ description: 'Passed percentage' })
  passedRate: number;

  @ApiProperty({ description: 'Offer count' })
  offer: number;

  @ApiProperty({ description: 'Offer percentage' })
  offerRate: number;

  @ApiProperty({ description: 'Hired count' })
  hired: number;

  @ApiProperty({ description: 'Hired percentage' })
  hiredRate: number;
}

export class StageCountDto {
  @ApiProperty({ description: 'Stage name' })
  stage: ApplicationStage;

  @ApiProperty({ description: 'Count of applications in this stage' })
  count: number;

  @ApiProperty({ description: 'Percentage of total' })
  percentage: number;
}

export class ChannelHiringDto {
  @ApiProperty({ description: 'Channel name' })
  channel: RecruitmentChannel | 'TOTAL';

  @ApiProperty({ description: 'Total applications from this channel' })
  total: number;

  @ApiProperty({ description: 'Hired count from this channel' })
  hired: number;

  @ApiProperty({ description: 'Hiring rate percentage' })
  hiringRate: number;
}

export class LevelHiringDto {
  @ApiProperty({ description: 'Level name' })
  level: string;

  @ApiProperty({ description: 'Total hired at this level' })
  hired: number;

  @ApiProperty({ description: 'Percentage of total' })
  percentage: number;
}

export class MonthlyTrendDto {
  @ApiProperty({ description: 'Month (YYYY-MM)' })
  month: string;

  @ApiProperty({ description: 'New applications in this month' })
  newApplications: number;

  @ApiProperty({ description: 'Hired count in this month' })
  hired: number;

  @ApiProperty({ description: 'Interviewed applications in this month' })
  interviewed: number;

  @ApiProperty({ description: 'Final interviews completed in this month' })
  finalInterviews: number;

  @ApiProperty({ description: 'Final interview failures in this month' })
  failItv: number;

  @ApiProperty({ description: 'Passed final interviews in this month' })
  passed: number;

  @ApiProperty({ description: 'Offers created or sent in this month' })
  totalOffer: number;

  @ApiProperty({ description: 'Accepted offers in this month' })
  offerAccepted: number;

  @ApiProperty({ description: 'Rejected offers in this month' })
  offerRejected: number;

  @ApiProperty({ description: 'Onboarding rejections in this month' })
  onboardRejected: number;

  @ApiPropertyOptional({ description: 'Monthly target when a target source exists' })
  target: number | null;
}

export class TimeMetricsDto {
  @ApiProperty({ description: 'Average time from apply to hire (days)' })
  avgTimeToHire: number;

  @ApiProperty({ description: 'Average time from final interview to hire (days)' })
  avgTimeFromFinal: number;

  @ApiProperty({ description: 'Average time from offer to hire (days)' })
  avgTimeOfferToHire: number;
}

export class PositionDashboardDto {
  name: string;
  applications: number;
  hired: number;
  target: number | null;
}

export class RecruiterDashboardDto {
  name: string;
  tth: number;
  hiredRate: number;
  hiredCount: number;
}

export class DepartmentDashboardDto {
  dept: string;
  rate: number;
}

export class SourcingDashboardDto {
  stage: string;
  pass: number;
  fail: number;
}

export class QualityDashboardDto {
  name: string;
  value: number;
}

export class LevelHiredDashboardDto {
  level: string;
  count: number;
}

export class SlaDashboardDto {
  stage: string;
  standard: number | null;
  actual: number;
}

export class NormRadarDashboardDto {
  metric: string;
  norm: number;
  actual: number;
}

export class OfferStatusDashboardDto {
  status: string;
  count: number;
}

export class TthDepartmentDashboardDto {
  dept: string;
  applyTth: number;
  finalTth: number;
}

export class PostFinalMetricsDto {
  totalFinalItv: number;
  failItv: number;
  passed: number;
  passedDat: number;
  passedTot: number;
  passedXuatSac: number;
  passedKhongOffer: number;
  totalOffer: number;
  offering: number;
  offerAccepted: number;
  offerRejected: number;
  hired: number;
  onboardRejected: number;
  onboardingPending: number;
  finalToFailRate: number;
  finalToOfferRate: number;
  offerToHiredRate: number;
  finalToHiredRate: number;
  applyToOnboardTth: number;
  finalToOnboardTth: number;
}

export class TrendDimensionDto {
  @ApiProperty({ description: 'Grouping label' })
  label: string;

  @ApiProperty({ description: 'Applications created in the selected period' })
  applications: number;

  @ApiProperty({ description: 'Final interview count' })
  totalFinalItv: number;

  @ApiProperty({ description: 'Final interview failures' })
  failItv: number;

  @ApiProperty({ description: 'Passed final interview count' })
  passed: number;

  @ApiProperty({ description: 'Passed final interview, Dat' })
  passedDat: number;

  @ApiProperty({ description: 'Passed final interview, Tot' })
  passedTot: number;

  @ApiProperty({ description: 'Passed final interview, Xuat sac' })
  passedXuatSac: number;

  @ApiProperty({ description: 'Passed final interview without offer' })
  passedKhongOffer: number;

  @ApiProperty({ description: 'Offer count' })
  totalOffer: number;

  @ApiProperty({ description: 'Pending offer count' })
  offering: number;

  @ApiProperty({ description: 'Accepted offer count' })
  offerAccepted: number;

  @ApiProperty({ description: 'Rejected offer count' })
  offerRejected: number;

  @ApiProperty({ description: 'Onboarding rejection count' })
  onboardRejected: number;

  @ApiProperty({ description: 'Pending onboarding count' })
  onboardingPending: number;

  @ApiProperty({ description: 'Hired count after successful onboarding' })
  hired: number;

  @ApiProperty({ description: 'Management hired count' })
  managementHired: number;

  @ApiProperty({ description: 'Senior hired count' })
  seniorHired: number;

  @ApiProperty({ description: 'Experienced hired count' })
  experiencedHired: number;

  @ApiProperty({ description: 'Junior hired count' })
  juniorHired: number;

  @ApiProperty({ description: 'Final interview failure rate' })
  finalToFailRate: number;

  @ApiProperty({ description: 'Final interview to offer rate' })
  finalToOfferRate: number;

  @ApiProperty({ description: 'Offer to hired rate' })
  offerToHiredRate: number;

  @ApiProperty({ description: 'Final interview to hired rate' })
  finalToHiredRate: number;

  @ApiProperty({ description: 'Average working days from application to hired' })
  applyToOnboardTth: number;

  @ApiProperty({ description: 'Average working days from final interview to hired' })
  finalToOnboardTth: number;
}

export class DashboardTrendsDto {
  @ApiProperty({ description: 'Data as of timestamp' })
  asOf: Date;

  @ApiProperty({ description: 'Final interview to onboarding summary' })
  summary: PostFinalMetricsDto;

  @ApiProperty({ description: 'Total for the selected scope' })
  total: TrendDimensionDto;

  @ApiProperty({ description: 'Trend grouped by position' })
  byPosition: TrendDimensionDto[];

  @ApiProperty({ description: 'Trend grouped by month' })
  byMonth: MonthlyTrendDto[];

  @ApiProperty({ description: 'Full trend table grouped by the 12 calendar months' })
  byMonthTable: TrendDimensionDto[];

  @ApiProperty({ description: 'Trend grouped by HRBP/recruiter' })
  byRecruiter: TrendDimensionDto[];

  @ApiProperty({ description: 'Trend grouped by recruitment channel' })
  byChannel: TrendDimensionDto[];
}

export class PipelineDashboardDto {
  @ApiProperty({ description: 'Overall funnel statistics' })
  funnel: PipelineFunnelDto;

  @ApiProperty({ description: 'Application count by stage' })
  stageDistribution: StageCountDto[];

  @ApiProperty({ description: 'Hiring by channel' })
  channelHiring: ChannelHiringDto[];

  @ApiProperty({ description: 'Hiring by level' })
  levelHiring: LevelHiringDto[];

  @ApiProperty({ description: 'Monthly trend data' })
  monthlyTrend: MonthlyTrendDto[];

  @ApiProperty({ description: 'Time metrics' })
  timeMetrics: TimeMetricsDto;

  @ApiProperty({ description: 'Total applications in pipeline' })
  totalApplications: number;

  @ApiProperty({ description: 'Total hired YTD' })
  totalHired: number;

  @ApiProperty({ description: 'Data as of timestamp' })
  asOf: Date;

  positions: PositionDashboardDto[];
  recruiters: RecruiterDashboardDto[];
  departments: DepartmentDashboardDto[];
  sourcing: SourcingDashboardDto[];
  quality: QualityDashboardDto[];
  levelHired: LevelHiredDashboardDto[];
  sla: SlaDashboardDto[];
  normRadar: NormRadarDashboardDto[];
  offerStatus: OfferStatusDashboardDto[];
  tthByDepartment: TthDepartmentDashboardDto[];
  postFinal: PostFinalMetricsDto;
}

export class PipelineDashboardQueryDto {
  @ApiPropertyOptional({ description: 'Filter by date range start (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Filter by date range end (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Filter by HRBP/Recruiter ID' })
  @IsOptional()
  @IsUUID()
  recruiterId?: string;

  @ApiPropertyOptional({ description: 'Filter by job posting ID' })
  @IsOptional()
  @IsUUID()
  jobPostingId?: string;

  @ApiPropertyOptional({ description: 'Filter by position ID' })
  @IsOptional()
  @IsUUID()
  positionId?: string;

  @ApiPropertyOptional({ enum: RecruitmentChannel, description: 'Filter by recruitment channel' })
  @IsOptional()
  @IsEnum(RecruitmentChannel)
  channel?: RecruitmentChannel;

  @ApiPropertyOptional({ enum: DashboardOwnerType, description: 'Filter owner type' })
  @IsOptional()
  @IsEnum(DashboardOwnerType)
  ownerType?: DashboardOwnerType;

  @ApiPropertyOptional({ description: 'Filter by HR, freelancer, or internal owner ID' })
  @IsOptional()
  @IsUUID()
  ownerId?: string;
}
