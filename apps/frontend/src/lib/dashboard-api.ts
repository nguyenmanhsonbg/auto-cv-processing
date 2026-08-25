import { apiClient } from './api-client';
import { listFreelancers } from './freelancer-api';
import { listInternals } from './internal-api';

export interface DashboardOwnerOption {
  type: 'HR' | 'FREELANCER' | 'INTERNAL';
  id: string;
  label: string;
}

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
  target?: number | null;
  interviewed?: number;
}

export interface PositionDashboard {
  name: string;
  applications: number;
  hired: number;
  target: number | null;
}

export interface RecruiterDashboard {
  name: string;
  tth: number;
  hiredRate: number;
  hiredCount: number;
}

export interface DepartmentDashboard {
  dept: string;
  rate: number;
}

export interface SourcingDashboard {
  stage: string;
  pass: number;
  fail: number;
}

export interface QualityDashboard {
  name: string;
  value: number;
}

export interface LevelHiredDashboard {
  level: string;
  count: number;
}

export interface SlaDashboard {
  stage: string;
  standard: number | null;
  actual: number;
}

export interface NormRadarDashboard {
  metric: string;
  norm: number;
  actual: number;
}

export interface OfferStatusDashboard {
  status: string;
  count: number;
}

export interface TthDepartmentDashboard {
  dept: string;
  applyTth: number;
  finalTth: number;
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
  positions: PositionDashboard[];
  recruiters: RecruiterDashboard[];
  departments: DepartmentDashboard[];
  sourcing: SourcingDashboard[];
  quality: QualityDashboard[];
  levelHired: LevelHiredDashboard[];
  sla: SlaDashboard[];
  normRadar: NormRadarDashboard[];
  offerStatus: OfferStatusDashboard[];
  tthByDepartment: TthDepartmentDashboard[];
}

export interface DashboardFilters {
  startDate?: string;
  endDate?: string;
  recruiterId?: string;
  jobPostingId?: string;
  channel?: string;
  ownerType?: DashboardOwnerOption['type'];
  ownerId?: string;
}

export async function getPipelineDashboard(filters?: DashboardFilters): Promise<PipelineDashboard> {
  const params = new URLSearchParams();
  
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.recruiterId) params.append('recruiterId', filters.recruiterId);
  if (filters?.jobPostingId) params.append('jobPostingId', filters.jobPostingId);
  if (filters?.channel) params.append('channel', filters.channel);
  if (filters?.ownerType && filters?.ownerId) {
    params.append('ownerType', filters.ownerType);
    params.append('ownerId', filters.ownerId);
  }
  
  const queryString = params.toString();
  const url = queryString ? `/dashboard/pipeline?${queryString}` : '/dashboard/pipeline';
  
  return apiClient.get<PipelineDashboard>(url);
}

export async function getDashboardOwnerOptions(): Promise<DashboardOwnerOption[]> {
  const [users, freelancers, internals] = await Promise.all([
    apiClient.get<{ id: string; name: string; role: string }[]>('/auth/users/assignable'),
    listFreelancers({ limit: 100 }),
    listInternals({ limit: 100 }),
  ]);

  return [
    ...users
      .filter((user) => user.role === 'HR' || user.role === 'ADMIN')
      .map((user) => ({ type: 'HR' as const, id: user.id, label: `${user.name} (HR)` })),
    ...freelancers.data.map((freelancer) => ({
      type: 'FREELANCER' as const,
      id: freelancer.id,
      label: `${freelancer.name} (${freelancer.identifier})`,
    })),
    ...internals.data.map((internal) => ({
      type: 'INTERNAL' as const,
      id: internal.id,
      label: `${internal.name || internal.email} (Internal)`,
    })),
  ];
}

export interface RecruitmentImportSummary {
  candidates: number;
  applications: number;
  interviewRounds: number;
  offers: number;
  created: number;
  updated: number;
}

export async function importRecruitmentWorkbook(file: File): Promise<RecruitmentImportSummary> {
  const response = await apiClient.upload<{ success: boolean; data: RecruitmentImportSummary }>(
    '/recruitment-import/workbook',
    file,
  );
  return response.data;
}
