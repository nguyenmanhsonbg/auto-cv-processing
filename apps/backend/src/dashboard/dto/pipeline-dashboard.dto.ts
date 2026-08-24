import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { ApplicationStage, RecruitmentChannel } from '../../recruitment-common';

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
}
