import { apiClient } from './api-client';

export interface PipelineFunnel {
  totalFinalItv: number;
  passed: number;
  passedRate: number;
  offer: number;
  offerRate: number;
  hired: number;
  hiredRate: number;
}

export interface StageCount {
  stage: string;
  count: number;
  percentage: number;
}

export interface ChannelHiring {
  channel: string;
  total: number;
  hired: number;
  hiringRate: number;
}

export interface LevelHiring {
  level: string;
  hired: number;
  percentage: number;
}

export interface MonthlyTrend {
  month: string;
  newApplications: number;
  hired: number;
}

export interface TimeMetrics {
  avgTimeToHire: number;
  avgTimeFromFinal: number;
  avgTimeOfferToHire: number;
}

export interface PipelineDashboard {
  funnel: PipelineFunnel;
  stageDistribution: StageCount[];
  channelHiring: ChannelHiring[];
  levelHiring: LevelHiring[];
  monthlyTrend: MonthlyTrend[];
  timeMetrics: TimeMetrics;
  totalApplications: number;
  totalHired: number;
  asOf: string;
}

export interface DashboardFilters {
  startDate?: string;
  endDate?: string;
  recruiterId?: string;
  jobPostingId?: string;
}

export async function getPipelineDashboard(filters?: DashboardFilters): Promise<PipelineDashboard> {
  const params = new URLSearchParams();
  
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.recruiterId) params.append('recruiterId', filters.recruiterId);
  if (filters?.jobPostingId) params.append('jobPostingId', filters.jobPostingId);
  
  const queryString = params.toString();
  const url = queryString ? `/dashboard/pipeline?${queryString}` : '/dashboard/pipeline';
  
  return apiClient.get<PipelineDashboard>(url);
}
