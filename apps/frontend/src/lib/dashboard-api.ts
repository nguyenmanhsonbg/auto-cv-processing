import { apiClient } from './api-client';
import { listFreelancers } from './freelancer-api';
import { listInternals } from './internal-api';
import { listPositions } from './recruitment-api';

export interface DashboardOwnerOption {
  type: 'HR' | 'FREELANCER' | 'INTERNAL';
  id: string;
  label: string;
}

export type DashboardScope = 'company' | 'owner' | 'position' | 'channel' | 'time';

export const DASHBOARD_SCOPE_LABELS: Record<DashboardScope, string> = {
  company: 'Toàn Công ty',
  owner: 'Theo HRBP & TA',
  position: 'Theo Vị trí',
  channel: 'Theo Kênh tuyển dụng',
  time: 'Theo Thời gian',
};

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
  finalInterviews: number;
  failItv: number;
  passed: number;
  totalOffer: number;
  offerAccepted: number;
  offerRejected: number;
  onboardRejected: number;
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

export interface PostFinalMetrics {
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

export interface TrendDimension {
  label: string;
  applications: number;
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
  onboardRejected: number;
  onboardingPending: number;
  hired: number;
  managementHired: number;
  seniorHired: number;
  experiencedHired: number;
  juniorHired: number;
  finalToFailRate: number;
  finalToOfferRate: number;
  offerToHiredRate: number;
  finalToHiredRate: number;
  applyToOnboardTth: number;
  finalToOnboardTth: number;
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
  postFinal: PostFinalMetrics;
}

export interface DashboardTrends {
  asOf: string;
  summary: PostFinalMetrics;
  total: TrendDimension;
  byPosition: TrendDimension[];
  byMonth: MonthlyTrend[];
  byMonthTable: TrendDimension[];
  byRecruiter: TrendDimension[];
  byChannel: TrendDimension[];
}

export interface DashboardFilters {
  startDate?: string;
  endDate?: string;
  recruiterId?: string;
  jobPostingId?: string;
  positionId?: string;
  channel?: string;
  ownerType?: DashboardOwnerOption['type'];
  ownerId?: string;
}

export interface DashboardPositionOption {
  id: string;
  label: string;
}

function buildDashboardQuery(filters?: DashboardFilters): string {
  const params = new URLSearchParams();

  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.recruiterId) params.append('recruiterId', filters.recruiterId);
  if (filters?.jobPostingId) params.append('jobPostingId', filters.jobPostingId);
  if (filters?.positionId) params.append('positionId', filters.positionId);
  if (filters?.channel) params.append('channel', filters.channel);
  if (filters?.ownerType && filters?.ownerId) {
    params.append('ownerType', filters.ownerType);
    params.append('ownerId', filters.ownerId);
  }

  return params.toString();
}

export async function getPipelineDashboard(filters?: DashboardFilters): Promise<PipelineDashboard> {
  const queryString = buildDashboardQuery(filters);
  const url = queryString ? `/dashboard/pipeline?${queryString}` : '/dashboard/pipeline';

  return apiClient.get<PipelineDashboard>(url);
}

export async function getDashboardTrends(filters?: DashboardFilters): Promise<DashboardTrends> {
  const queryString = buildDashboardQuery(filters);
  const url = queryString ? `/dashboard/trends?${queryString}` : '/dashboard/trends';

  return apiClient.get<DashboardTrends>(url);
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

export async function getDashboardPositionOptions(): Promise<DashboardPositionOption[]> {
  const result = await listPositions({
    page: 1,
    limit: 100,
    status: 'ACTIVE',
    sortBy: 'name',
    sortOrder: 'ASC',
  });
  return result.data.map((position) => ({ id: position.id, label: position.name }));
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
