import {
  PipelineFilterDataset,
  SubFilterKey,
  GrowthFlowData,
  GrowthSourceData,
  DepartmentTorData,
  QuotaDeptGapData,
  QuotaLevelFillData,
  QuotaForecastData,
} from '../types';

const MONTH_LABELS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8 (YTD)', 'T9 (F)', 'T10 (F)', 'T11 (F)', 'T12 (F)'];

export const PIPELINE_FILTER_DATASETS: Record<SubFilterKey, PipelineFilterDataset> = {
  hrbp: {
    title: 'PHỄU TUYỂN DỤNG (THEO HRBP & TA)',
    cr: 'Tỷ lệ: 37.3%',
    f1: '257',
    p1: '100% tổng',
    f2: '215',
    p2: '84% tổng',
    f3: '173',
    p3: '67% tổng',
    hold3: '(42 Hold)',
    f4: '111',
    p4: '43% tổng',
    f5: '96',
    p5: '37% tổng',
    fail: '42',
    reject: '48',
    tth1: '32.9d',
    tth2: '34.1d',
    subtitle: 'Lưu lượng ứng viên và phân bổ theo năng suất đội ngũ HRBP & TA',
    totalHiredTxt: '96 Hired (100%)',
    areaData: MONTH_LABELS.map((month, idx) => {
      const targets = [10, 12, 10, 15, 12, 18, 14, 15, 12, 14, 10, 12];
      const hired = [8, 11, 10, 14, 9, 17, 13, 14, null, null, null, null];
      const itv = [32, 40, 35, 48, 38, 55, 45, 49, null, null, null, null];
      const cv = [45, 52, 48, 65, 50, 72, 58, 62, null, null, null, null];
      return {
        month,
        target: targets[idx],
        hired: hired[idx],
        itv: itv[idx],
        cv: cv[idx],
      };
    }),
    positions: [
      { name: 'Security Spec', target: 25, hired: 21 },
      { name: 'AI Engineer', target: 18, hired: 14 },
      { name: 'Backend Dev', target: 30, hired: 28 },
      { name: 'Solution Arch', target: 12, hired: 9 },
      { name: 'Sales B2B', target: 20, hired: 16 },
    ],
    bubbleRecruiters: [
      { name: 'HRBP Tech', tth: 36, hiredRate: 44.5, hiredCount: 18, color: '#3b82f6', borderColor: '#60a5fa' },
      { name: 'HRBP Cyber', tth: 32, hiredRate: 42.0, hiredCount: 15, color: '#a855f7', borderColor: '#c084fc' },
      { name: 'HRBP Biz', tth: 24, hiredRate: 36.8, hiredCount: 12, color: '#f43f5e', borderColor: '#fb7185' },
      { name: 'TA Team 1', tth: 28, hiredRate: 31.5, hiredCount: 9, color: '#10b981', borderColor: '#34d399' },
      { name: 'TA Team 2', tth: 30, hiredRate: 28.0, hiredCount: 8, color: '#f59e0b', borderColor: '#fbbf24' },
    ],
    deptRates: [
      { dept: 'Khối Tech', rate: 88.5, color: '#3b82f6' },
      { dept: 'Khối Cyber', rate: 92.4, color: '#10b981' },
      { dept: 'Khối Biz', rate: 76.8, color: '#f43f5e' },
      { dept: 'Khối Vận Hành', rate: 82.0, color: '#a855f7' },
    ],
    sourcing: [
      { stage: 'Tiếp nhận CV', pass: 3850, fail: 0 },
      { stage: 'TA Sơ loại', pass: 1420, fail: 2430 },
      { stage: 'Gửi HĐCM', pass: 680, fail: 740 },
    ],
    finalQuality: [
      { name: 'Xuất sắc', value: 32, color: '#10b981' },
      { name: 'Tốt', value: 94, color: '#3b82f6' },
      { name: 'Đạt', value: 89, color: '#8b5cf6' },
      { name: 'Failed', value: 42, color: '#e11d48' },
      { name: 'None', value: 18, color: '#64748b' },
    ],
    levelHired: [
      { level: 'Quản lý', count: 8, color: '#f59e0b' },
      { level: '≥ Senior', count: 27, color: '#8b5cf6' },
      { level: 'Experienced', count: 42, color: '#3b82f6' },
      { level: '≤ Junior', count: 19, color: '#10b981' },
    ],
    sla: [
      { stage: 'CV→Sơ loại (2d)', standard: 2, actual: 1.8 },
      { stage: 'Duyệt→1st (5d)', standard: 5, actual: 6.2 },
      { stage: '1st→Final (5d)', standard: 5, actual: 5.4 },
      { stage: 'Final→Offer (7d)', standard: 7, actual: 8.5 },
    ],
    normRadar: [
      { metric: 'CV Tiếp nhận (10)', norm: 100, actual: 100 },
      { metric: '1st ITV (6)', norm: 60, actual: 48 },
      { metric: 'Final ITV (3)', norm: 30, actual: 22 },
      { metric: 'Hired (1)', norm: 10, actual: 9.2 },
    ],
    offerStatus: [
      { status: 'Hired', count: 96, color: '#10b981' },
      { status: 'Offering', count: 14, color: '#3b82f6' },
      { status: 'Offer Rejected', count: 33, color: '#e11d48' },
      { status: 'Onboard Rejected', count: 15, color: '#f97316' },
      { status: 'On-hold', count: 42, color: '#64748b' },
    ],
    tthDept: [
      { dept: 'Tech', applyTth: 42, finalTth: 18 },
      { dept: 'Cyber', applyTth: 38, finalTth: 16 },
      { dept: 'Biz', applyTth: 22, finalTth: 10 },
      { dept: 'Support', applyTth: 25, finalTth: 12 },
    ],
    channels: [
      { channel: 'Referral', rate: 42, color: '#f43f5e' },
      { channel: 'LinkedIn', rate: 28, color: '#3b82f6' },
      { channel: 'TopCV', rate: 14, color: '#10b981' },
      { channel: 'Headhunt', rate: 36, color: '#f59e0b' },
      { channel: 'CareerWeb', rate: 18, color: '#a855f7' },
    ],
  },

  vitri: {
    title: 'PHỄU TUYỂN DỤNG (THEO VỊ TRÍ TRỌNG ĐIỂM)',
    cr: 'Tỷ lệ: 41.2%',
    f1: '148',
    p1: '100% tổng',
    f2: '124',
    p2: '83.8% tổng',
    f3: '98',
    p3: '66.2% tổng',
    hold3: '(26 Hold)',
    f4: '68',
    p4: '45.9% tổng',
    f5: '61',
    p5: '41.2% tổng',
    fail: '24',
    reject: '28',
    tth1: '38.5d',
    tth2: '39.0d',
    subtitle: 'Lưu lượng và chỉ số chuyển đổi tập trung cho nhóm vị trí Hard-to-Fill',
    totalHiredTxt: '61 Hired (100%)',
    areaData: MONTH_LABELS.map((month, idx) => {
      const targets = [6, 8, 6, 9, 8, 11, 9, 10, 8, 9, 6, 8];
      const hired = [5, 7, 6, 8, 6, 10, 9, 10, null, null, null, null];
      const itv = [18, 24, 20, 28, 22, 34, 29, 31, null, null, null, null];
      const cv = [28, 34, 30, 42, 32, 48, 39, 41, null, null, null, null];
      return { month, target: targets[idx], hired: hired[idx], itv: itv[idx], cv: cv[idx] };
    }),
    positions: [
      { name: 'Lead Security', target: 12, hired: 10 },
      { name: 'Senior AI/ML', target: 10, hired: 8 },
      { name: 'Cloud DevOps', target: 15, hired: 14 },
      { name: 'Core Rust Dev', target: 8, hired: 6 },
      { name: 'Enterprise Sales', target: 10, hired: 8 },
    ],
    bubbleRecruiters: [
      { name: 'HRBP Tech', tth: 41, hiredRate: 52.0, hiredCount: 16, color: '#3b82f6', borderColor: '#60a5fa' },
      { name: 'HRBP Cyber', tth: 38, hiredRate: 48.5, hiredCount: 14, color: '#a855f7', borderColor: '#c084fc' },
      { name: 'HRBP Biz', tth: 26, hiredRate: 39.0, hiredCount: 10, color: '#f43f5e', borderColor: '#fb7185' },
      { name: 'TA Team 1', tth: 33, hiredRate: 35.0, hiredCount: 7, color: '#10b981', borderColor: '#34d399' },
      { name: 'TA Team 2', tth: 35, hiredRate: 30.2, hiredCount: 6, color: '#f59e0b', borderColor: '#fbbf24' },
    ],
    deptRates: [
      { dept: 'Khối Tech', rate: 91.2, color: '#3b82f6' },
      { dept: 'Khối Cyber', rate: 94.0, color: '#10b981' },
      { dept: 'Khối Biz', rate: 78.5, color: '#f43f5e' },
      { dept: 'Khối Vận Hành', rate: 80.0, color: '#a855f7' },
    ],
    sourcing: [
      { stage: 'Tiếp nhận CV', pass: 2250, fail: 0 },
      { stage: 'TA Sơ loại', pass: 920, fail: 1330 },
      { stage: 'Gửi HĐCM', pass: 410, fail: 510 },
    ],
    finalQuality: [
      { name: 'Xuất sắc', value: 22, color: '#10b981' },
      { name: 'Tốt', value: 58, color: '#3b82f6' },
      { name: 'Đạt', value: 44, color: '#8b5cf6' },
      { name: 'Failed', value: 18, color: '#e11d48' },
      { name: 'None', value: 6, color: '#64748b' },
    ],
    levelHired: [
      { level: 'Quản lý', count: 6, color: '#f59e0b' },
      { level: '≥ Senior', count: 35, color: '#8b5cf6' },
      { level: 'Experienced', count: 18, color: '#3b82f6' },
      { level: '≤ Junior', count: 2, color: '#10b981' },
    ],
    sla: [
      { stage: 'CV→Sơ loại (2d)', standard: 2, actual: 2.1 },
      { stage: 'Duyệt→1st (5d)', standard: 5, actual: 7.0 },
      { stage: '1st→Final (5d)', standard: 5, actual: 6.2 },
      { stage: 'Final→Offer (7d)', standard: 7, actual: 9.1 },
    ],
    normRadar: [
      { metric: 'CV Tiếp nhận (10)', norm: 100, actual: 100 },
      { metric: '1st ITV (6)', norm: 60, actual: 54 },
      { metric: 'Final ITV (3)', norm: 30, actual: 28 },
      { metric: 'Hired (1)', norm: 10, actual: 11.5 },
    ],
    offerStatus: [
      { status: 'Hired', count: 61, color: '#10b981' },
      { status: 'Offering', count: 7, color: '#3b82f6' },
      { status: 'Offer Rejected', count: 18, color: '#e11d48' },
      { status: 'Onboard Rejected', count: 9, color: '#f97316' },
      { status: 'On-hold', count: 26, color: '#64748b' },
    ],
    tthDept: [
      { dept: 'Tech', applyTth: 48, finalTth: 21 },
      { dept: 'Cyber', applyTth: 42, finalTth: 19 },
      { dept: 'Biz', applyTth: 26, finalTth: 12 },
      { dept: 'Support', applyTth: 28, finalTth: 14 },
    ],
    channels: [
      { channel: 'Referral', rate: 48, color: '#f43f5e' },
      { channel: 'LinkedIn', rate: 32, color: '#3b82f6' },
      { channel: 'TopCV', rate: 8, color: '#10b981' },
      { channel: 'Headhunt', rate: 44, color: '#f59e0b' },
      { channel: 'CareerWeb', rate: 12, color: '#a855f7' },
    ],
  },

  kenh: {
    title: 'PHỄU TUYỂN DỤNG (THEO NGUỒN & KÊNH SOURCING)',
    cr: 'Tỷ lệ: 34.6%',
    f1: '320',
    p1: '100% tổng',
    f2: '260',
    p2: '81.2% tổng',
    f3: '205',
    p3: '64.0% tổng',
    hold3: '(55 Hold)',
    f4: '135',
    p4: '42.1% tổng',
    f5: '111',
    p5: '34.6% tổng',
    fail: '60',
    reject: '64',
    tth1: '29.4d',
    tth2: '31.2d',
    subtitle: 'Lưu lượng và chi phí chuyển đổi phân bổ theo 5 kênh tuyển dụng chính',
    totalHiredTxt: '111 Hired (100%)',
    areaData: MONTH_LABELS.map((month, idx) => {
      const targets = [12, 14, 12, 18, 14, 20, 16, 18, 14, 16, 12, 14];
      const hired = [9, 12, 11, 16, 11, 19, 15, 18, null, null, null, null];
      const itv = [38, 46, 40, 56, 44, 62, 51, 58, null, null, null, null];
      const cv = [55, 62, 56, 78, 60, 85, 69, 74, null, null, null, null];
      return { month, target: targets[idx], hired: hired[idx], itv: itv[idx], cv: cv[idx] };
    }),
    positions: [
      { name: 'Referral Network', target: 30, hired: 28 },
      { name: 'LinkedIn Direct', target: 25, hired: 22 },
      { name: 'TopCV Boards', target: 20, hired: 14 },
      { name: 'Headhunt VIP', target: 15, hired: 13 },
      { name: 'Career Landing', target: 10, hired: 7 },
    ],
    bubbleRecruiters: [
      { name: 'Referral (Nội bộ)', tth: 22, hiredRate: 56.0, hiredCount: 20, color: '#f43f5e', borderColor: '#fb7185' },
      { name: 'LinkedIn Talent', tth: 31, hiredRate: 44.0, hiredCount: 16, color: '#3b82f6', borderColor: '#60a5fa' },
      { name: 'TopCV Sourcing', tth: 27, hiredRate: 26.5, hiredCount: 14, color: '#10b981', borderColor: '#34d399' },
      { name: 'Headhunting', tth: 38, hiredRate: 49.0, hiredCount: 11, color: '#f59e0b', borderColor: '#fbbf24' },
      { name: 'Career Web', tth: 29, hiredRate: 32.0, hiredCount: 8, color: '#a855f7', borderColor: '#c084fc' },
    ],
    deptRates: [
      { dept: 'Khối Tech', rate: 85.0, color: '#3b82f6' },
      { dept: 'Khối Cyber', rate: 90.5, color: '#10b981' },
      { dept: 'Khối Biz', rate: 74.2, color: '#f43f5e' },
      { dept: 'Khối Vận Hành', rate: 79.0, color: '#a855f7' },
    ],
    sourcing: [
      { stage: 'Tiếp nhận CV', pass: 4400, fail: 0 },
      { stage: 'TA Sơ loại', pass: 1580, fail: 2820 },
      { stage: 'Gửi HĐCM', pass: 740, fail: 840 },
    ],
    finalQuality: [
      { name: 'Xuất sắc', value: 38, color: '#10b981' },
      { name: 'Tốt', value: 112, color: '#3b82f6' },
      { name: 'Đạt', value: 110, color: '#8b5cf6' },
      { name: 'Failed', value: 60, color: '#e11d48' },
      { name: 'None', value: 22, color: '#64748b' },
    ],
    levelHired: [
      { level: 'Quản lý', count: 10, color: '#f59e0b' },
      { level: '≥ Senior', count: 31, color: '#8b5cf6' },
      { level: 'Experienced', count: 48, color: '#3b82f6' },
      { level: '≤ Junior', count: 22, color: '#10b981' },
    ],
    sla: [
      { stage: 'CV→Sơ loại (2d)', standard: 2, actual: 1.6 },
      { stage: 'Duyệt→1st (5d)', standard: 5, actual: 5.8 },
      { stage: '1st→Final (5d)', standard: 5, actual: 5.1 },
      { stage: 'Final→Offer (7d)', standard: 7, actual: 7.9 },
    ],
    normRadar: [
      { metric: 'CV Tiếp nhận (10)', norm: 100, actual: 100 },
      { metric: '1st ITV (6)', norm: 60, actual: 44 },
      { metric: 'Final ITV (3)', norm: 30, actual: 19 },
      { metric: 'Hired (1)', norm: 10, actual: 8.4 },
    ],
    offerStatus: [
      { status: 'Hired', count: 111, color: '#10b981' },
      { status: 'Offering', count: 18, color: '#3b82f6' },
      { status: 'Offer Rejected', count: 42, color: '#e11d48' },
      { status: 'Onboard Rejected', count: 22, color: '#f97316' },
      { status: 'On-hold', count: 55, color: '#64748b' },
    ],
    tthDept: [
      { dept: 'Tech', applyTth: 39, finalTth: 16 },
      { dept: 'Cyber', applyTth: 35, finalTth: 15 },
      { dept: 'Biz', applyTth: 20, finalTth: 9 },
      { dept: 'Support', applyTth: 23, finalTth: 11 },
    ],
    channels: [
      { channel: 'Referral', rate: 52, color: '#f43f5e' },
      { channel: 'LinkedIn', rate: 34, color: '#3b82f6' },
      { channel: 'TopCV', rate: 18, color: '#10b981' },
      { channel: 'Headhunt', rate: 42, color: '#f59e0b' },
      { channel: 'CareerWeb', rate: 22, color: '#a855f7' },
    ],
  },

  thoigian: {
    title: 'PHỄU TUYỂN DỤNG (THEO KỲ BÁO CÁO YTD 2026)',
    cr: 'Tỷ lệ: 37.3%',
    f1: '257',
    p1: '100% tổng',
    f2: '215',
    p2: '84% tổng',
    f3: '173',
    p3: '67% tổng',
    hold3: '(42 Hold)',
    f4: '111',
    p4: '43% tổng',
    f5: '96',
    p5: '37% tổng',
    fail: '42',
    reject: '48',
    tth1: '32.9d',
    tth2: '34.1d',
    subtitle: 'Toàn bộ chu kỳ tuyển dụng tích lũy từ 01/01/2026 đến 11/08/2026',
    totalHiredTxt: '96 Hired (100%)',
    areaData: MONTH_LABELS.map((month, idx) => {
      const targets = [10, 12, 10, 15, 12, 18, 14, 15, 12, 14, 10, 12];
      const hired = [8, 11, 10, 14, 9, 17, 13, 14, null, null, null, null];
      const itv = [32, 40, 35, 48, 38, 55, 45, 49, null, null, null, null];
      const cv = [45, 52, 48, 65, 50, 72, 58, 62, null, null, null, null];
      return { month, target: targets[idx], hired: hired[idx], itv: itv[idx], cv: cv[idx] };
    }),
    positions: [
      { name: 'Security Spec', target: 25, hired: 21 },
      { name: 'AI Engineer', target: 18, hired: 14 },
      { name: 'Backend Dev', target: 30, hired: 28 },
      { name: 'Solution Arch', target: 12, hired: 9 },
      { name: 'Sales B2B', target: 20, hired: 16 },
    ],
    bubbleRecruiters: [
      { name: 'HRBP Tech', tth: 36, hiredRate: 44.5, hiredCount: 18, color: '#3b82f6', borderColor: '#60a5fa' },
      { name: 'HRBP Cyber', tth: 32, hiredRate: 42.0, hiredCount: 15, color: '#a855f7', borderColor: '#c084fc' },
      { name: 'HRBP Biz', tth: 24, hiredRate: 36.8, hiredCount: 12, color: '#f43f5e', borderColor: '#fb7185' },
      { name: 'TA Team 1', tth: 28, hiredRate: 31.5, hiredCount: 9, color: '#10b981', borderColor: '#34d399' },
      { name: 'TA Team 2', tth: 30, hiredRate: 28.0, hiredCount: 8, color: '#f59e0b', borderColor: '#fbbf24' },
    ],
    deptRates: [
      { dept: 'Khối Tech', rate: 88.5, color: '#3b82f6' },
      { dept: 'Khối Cyber', rate: 92.4, color: '#10b981' },
      { dept: 'Khối Biz', rate: 76.8, color: '#f43f5e' },
      { dept: 'Khối Vận Hành', rate: 82.0, color: '#a855f7' },
    ],
    sourcing: [
      { stage: 'Tiếp nhận CV', pass: 3850, fail: 0 },
      { stage: 'TA Sơ loại', pass: 1420, fail: 2430 },
      { stage: 'Gửi HĐCM', pass: 680, fail: 740 },
    ],
    finalQuality: [
      { name: 'Xuất sắc', value: 32, color: '#10b981' },
      { name: 'Tốt', value: 94, color: '#3b82f6' },
      { name: 'Đạt', value: 89, color: '#8b5cf6' },
      { name: 'Failed', value: 42, color: '#e11d48' },
      { name: 'None', value: 18, color: '#64748b' },
    ],
    levelHired: [
      { level: 'Quản lý', count: 8, color: '#f59e0b' },
      { level: '≥ Senior', count: 27, color: '#8b5cf6' },
      { level: 'Experienced', count: 42, color: '#3b82f6' },
      { level: '≤ Junior', count: 19, color: '#10b981' },
    ],
    sla: [
      { stage: 'CV→Sơ loại (2d)', standard: 2, actual: 1.8 },
      { stage: 'Duyệt→1st (5d)', standard: 5, actual: 6.2 },
      { stage: '1st→Final (5d)', standard: 5, actual: 5.4 },
      { stage: 'Final→Offer (7d)', standard: 7, actual: 8.5 },
    ],
    normRadar: [
      { metric: 'CV Tiếp nhận (10)', norm: 100, actual: 100 },
      { metric: '1st ITV (6)', norm: 60, actual: 48 },
      { metric: 'Final ITV (3)', norm: 30, actual: 22 },
      { metric: 'Hired (1)', norm: 10, actual: 9.2 },
    ],
    offerStatus: [
      { status: 'Hired', count: 96, color: '#10b981' },
      { status: 'Offering', count: 14, color: '#3b82f6' },
      { status: 'Offer Rejected', count: 33, color: '#e11d48' },
      { status: 'Onboard Rejected', count: 15, color: '#f97316' },
      { status: 'On-hold', count: 42, color: '#64748b' },
    ],
    tthDept: [
      { dept: 'Tech', applyTth: 42, finalTth: 18 },
      { dept: 'Cyber', applyTth: 38, finalTth: 16 },
      { dept: 'Biz', applyTth: 22, finalTth: 10 },
      { dept: 'Support', applyTth: 25, finalTth: 12 },
    ],
    channels: [
      { channel: 'Referral', rate: 42, color: '#f43f5e' },
      { channel: 'LinkedIn', rate: 28, color: '#3b82f6' },
      { channel: 'TopCV', rate: 14, color: '#10b981' },
      { channel: 'Headhunt', rate: 36, color: '#f59e0b' },
      { channel: 'CareerWeb', rate: 18, color: '#a855f7' },
    ],
  },
};

export const GROWTH_FLOW_DATA: GrowthFlowData[] = [
  { month: 'T1', tangMoi: 14, nghiViec: -6 },
  { month: 'T2', tangMoi: 18, nghiViec: -8 },
  { month: 'T3', tangMoi: 12, nghiViec: -5 },
  { month: 'T4', tangMoi: 22, nghiViec: -9 },
  { month: 'T5', tangMoi: 16, nghiViec: -7 },
  { month: 'T6', tangMoi: 20, nghiViec: -8 },
  { month: 'T7', tangMoi: 15, nghiViec: -6 },
  { month: 'T8', tangMoi: 11, nghiViec: -5 },
];

export const GROWTH_SOURCE_DATA: GrowthSourceData[] = [
  { name: 'Tuyển mới (75%)', value: 96, color: '#3b82f6' },
  { name: 'Luân chuyển (18%)', value: 23, color: '#8b5cf6' },
  { name: 'Tái gia nhập (7%)', value: 9, color: '#10b981' },
];

export const DEPARTMENT_TOR_DATA: DepartmentTorData[] = [
  { dept: 'Tech', tor: 5.8, color: '#10b981' },
  { dept: 'Cyber', tor: 7.5, color: '#38bdf8' },
  { dept: 'Sales B2B', tor: 18.8, color: '#e11d48' },
  { dept: 'Marketing', tor: 14.2, color: '#f59e0b' },
  { dept: 'Backoffice', tor: 8.0, color: '#8b5cf6' },
];

export const QUOTA_DEPT_GAP_DATA: QuotaDeptGapData[] = [
  { dept: 'Khối Tech', targetNc: 520, actualHc: 354 },
  { dept: 'Khối Cyber', targetNc: 280, actualHc: 209 },
  { dept: 'Khối Biz', targetNc: 150, actualHc: 89 },
  { dept: 'Khối Vận Hành', targetNc: 87, actualHc: 43 },
];

export const QUOTA_LEVEL_FILL_DATA: QuotaLevelFillData[] = [
  { level: 'Quản lý', rate: 85.2, color: '#10b981' },
  { level: 'Senior/Expert', rate: 62.4, color: '#e11d48' },
  { level: 'Experienced', rate: 71.8, color: '#f59e0b' },
  { level: 'Junior/Entry', rate: 88.0, color: '#38bdf8' },
];

export const QUOTA_FORECAST_DATA: QuotaForecastData[] = [
  { period: 'Hiện tại', standardPlan: 695, currentSlowPlan: 695 },
  { period: 'Tháng 9', standardPlan: 780, currentSlowPlan: 740 },
  { period: 'Tháng 10', standardPlan: 870, currentSlowPlan: 790 },
  { period: 'Tháng 11', standardPlan: 960, currentSlowPlan: 850 },
  { period: 'Tháng 12 (Target)', standardPlan: 1037, currentSlowPlan: 910 },
];
