import {
  PipelineDashboard,
  PipelineFunnel,
  StageCount,
  ChannelHiring,
  LevelHiring,
  MonthlyTrend,
  TimeMetrics,
  DashboardFilters,
} from '@/lib/dashboard-api';

export type DashboardTab = 'tab-tangmoi' | 'tab-pipeline' | 'tab-dinhbien';

export type SubFilterKey = 'hrbp' | 'vitri' | 'kenh' | 'thoigian';

export const STAGE_LABELS: Record<string, string> = {
  APPLIED: 'Ứng tuyển',
  PRE_TEST_1: 'Test trước PV1',
  SCREEN_CV: 'Screen CV',
  INTERVIEW_1: 'Phỏng vấn V1',
  PRE_TEST_2: 'Test trước PV2',
  INTERVIEW_2: 'Phỏng vấn V2',
  OFFER_PENDING: 'Chờ Offer',
  OFFER_SENT: 'Đã gửi Offer',
  OFFER_REVISED: 'Offer sửa',
  HIRED: 'Đã tuyển',
  REJECTED: 'Từ chối',
  TALENT_POOL: 'Talent Pool',
};

export const CHANNEL_LABELS: Record<string, string> = {
  VCS_PORTAL: 'VCS Portal',
  FACEBOOK: 'Facebook',
  TOPCV: 'TopCV',
  ITVIEC: 'ITViec',
  VIETNAMWORKS: 'VietnamWorks',
  LINKEDIN: 'LinkedIn',
  MANUAL: 'Thủ công',
  OTHER: 'Khác',
  TOTAL: 'Tổng',
  UNKNOWN: 'Không xác định',
};

export const FINAL_QUALITY_LABELS: Record<string, string> = {
  GOOD: 'Đạt yêu cầu (Good)',
  POOR: 'Chưa đạt (Poor)',
  AVERAGE: 'Trung bình (Average)',
  EXCELLENT: 'Xuất sắc (Excellent)',
};

export const OFFER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Chờ duyệt',
  SENT: 'Đã gửi',
  REVISED: 'Đã sửa',
  ACCEPTED: 'Đã nhận việc',
  REJECTED_BY_CANDIDATE: 'Ứng viên từ chối',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Hết hạn',
};

export const SOURCING_STAGE_LABELS: Record<string, string> = {
  APPLICATION: 'Ứng tuyển',
  SCREEN_CV: 'Sàng lọc CV',
  INTERVIEW_1: 'Phỏng vấn V1',
  INTERVIEW_2: 'Phỏng vấn V2',
  OFFER: 'Offer',
};

export const SLA_STAGE_LABELS: Record<string, string> = {
  APPLY_TO_INTERVIEW_1: 'Apply ➔ PV1',
  INTERVIEW_1_TO_2: 'PV1 ➔ PV2',
  INTERVIEW_2_TO_OFFER: 'PV2 ➔ Offer',
  OFFER_TO_HIRED: 'Offer ➔ Hired',
};

export const NORM_METRIC_LABELS: Record<string, string> = {
  'Apply -> Screen': 'Apply ➔ Sàng lọc',
  'Screen -> ITV': 'Sàng lọc ➔ PV',
  'ITV -> Offer': 'PV ➔ Offer',
  'Offer -> Hired': 'Offer ➔ Nhận việc',
};

export const LEVEL_LABELS: Record<string, string> = {
  MANAGEMENT: 'Quản lý',
  DIRECTOR: 'Director',
  LEAD: 'Lead / PM',
  SENIOR: '≥ Senior',
  EXPERIENCED: 'Experienced',
  MIDDLE: 'Middle',
  JUNIOR: '≤ Junior',
  FRESHER: 'Fresher / Intern',
};

export const STAGE_COLORS: Record<string, string> = {
  APPLIED: '#64748b',
  PRE_TEST_1: '#3b82f6',
  SCREEN_CV: '#8b5cf6',
  INTERVIEW_1: '#06b6d4',
  PRE_TEST_2: '#10b981',
  INTERVIEW_2: '#22c55e',
  OFFER_PENDING: '#f59e0b',
  OFFER_SENT: '#eab308',
  OFFER_REVISED: '#f97316',
  HIRED: '#22c55e',
  REJECTED: '#ef4444',
  TALENT_POOL: '#6366f1',
};

export const CHART_COLORS = [
  '#3b82f6',
  '#8b5cf6',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#64748b',
];

export interface AreaTrendDataPoint {
  month: string;
  target: number;
  hired: number | null;
  itv: number | null;
  cv: number | null;
}

export interface PositionStat {
  name: string;
  target: number | null;
  hired: number;
}

export interface RecruiterBubbleData {
  name: string;
  tth: number;
  hiredRate: number;
  hiredCount: number;
  color: string;
  borderColor: string;
}

export interface SourcingStageData {
  stage: string;
  pass: number;
  fail: number;
}

export interface FinalQualityData {
  name: string;
  value: number;
  color: string;
}

export interface LevelHiredData {
  level: string;
  count: number;
  color: string;
}

export interface SlaStageData {
  stage: string;
  standard: number | null;
  actual: number;
}

export interface NormRadarData {
  metric: string;
  norm: number;
  actual: number;
}

export interface OfferStatusData {
  status: string;
  count: number;
  color: string;
}

export interface TthDeptData {
  dept: string;
  applyTth: number;
  finalTth: number;
}

export interface ChannelHiringData {
  channel: string;
  rate: number;
  color: string;
}

export interface PipelineFilterDataset {
  title: string;
  cr: string;
  f1: string;
  p1: string;
  f2: string;
  p2: string;
  f3: string;
  p3: string;
  hold3: string;
  f4: string;
  p4: string;
  f5: string;
  p5: string;
  fail: string;
  reject: string;
  tth1: string;
  tth2: string;
  subtitle: string;
  totalHiredTxt: string;
  areaData: AreaTrendDataPoint[];
  positions: PositionStat[];
  bubbleRecruiters: RecruiterBubbleData[];
  deptRates: { dept: string; rate: number; color: string }[];
  sourcing: SourcingStageData[];
  finalQuality: FinalQualityData[];
  levelHired: LevelHiredData[];
  sla: SlaStageData[];
  normRadar: NormRadarData[];
  offerStatus: OfferStatusData[];
  tthDept: TthDeptData[];
  channels: ChannelHiringData[];
}

export interface GrowthFlowData {
  month: string;
  tangMoi: number;
  nghiViec: number;
}

export interface GrowthSourceData {
  name: string;
  value: number;
  color: string;
}

export interface DepartmentTorData {
  dept: string;
  tor: number;
  color: string;
}

export interface QuotaDeptGapData {
  dept: string;
  targetNc: number;
  actualHc: number;
}

export interface QuotaLevelFillData {
  level: string;
  rate: number;
  color: string;
}

export interface QuotaForecastData {
  period: string;
  standardPlan: number;
  currentSlowPlan: number;
}

export interface PipelineChartData {
  positions: PositionStat[];
  recruiters: RecruiterBubbleData[];
  departments: { dept: string; rate: number; color: string }[];
  sourcing: SourcingStageData[];
  quality: FinalQualityData[];
  levelHired: LevelHiredData[];
  sla: SlaStageData[];
  normRadar: NormRadarData[];
  offerStatus: OfferStatusData[];
  tthByDepartment: TthDeptData[];
  channels: ChannelHiringData[];
}

const CHART_COLORS_BY_INDEX = ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#64748b'];

function chartColor(index: number): string {
  return CHART_COLORS_BY_INDEX[index % CHART_COLORS_BY_INDEX.length];
}

export function adaptPipelineDashboard(dashboard: PipelineDashboard): PipelineChartData {
  return {
    positions: dashboard.positions.map((item) => ({
      name: item.name,
      target: item.target,
      hired: item.hired,
    })),
    recruiters: dashboard.recruiters.map((item, index) => ({
      ...item,
      color: chartColor(index),
      borderColor: chartColor(index),
    })),
    departments: dashboard.departments.map((item, index) => ({ ...item, color: chartColor(index) })),
    sourcing: dashboard.sourcing,
    quality: dashboard.quality.map((item, index) => ({ ...item, color: chartColor(index) })),
    levelHired: dashboard.levelHired.map((item, index) => ({ ...item, color: chartColor(index) })),
    sla: dashboard.sla,
    normRadar: dashboard.normRadar,
    offerStatus: dashboard.offerStatus.map((item, index) => ({ ...item, color: chartColor(index) })),
    tthByDepartment: dashboard.tthByDepartment,
    channels: dashboard.channelHiring
      .filter((item) => item.channel !== 'TOTAL')
      .map((item, index) => ({ channel: item.channel, rate: item.hiringRate, color: chartColor(index) })),
  };
}

export type {
  PipelineDashboard,
  PipelineFunnel,
  StageCount,
  ChannelHiring,
  LevelHiring,
  MonthlyTrend,
  TimeMetrics,
  DashboardFilters,
};
