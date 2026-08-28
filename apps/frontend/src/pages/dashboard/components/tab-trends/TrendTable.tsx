import React from 'react';
import type { TrendDimension } from '@/lib/dashboard-api';

interface TrendTableProps {
  total: TrendDimension;
  rows: TrendDimension[];
  title: string;
  dimensionLabel: string;
}

const numberValue = (value: number): string => value ? String(value) : '—';
const percentageValue = (value: number): string => `${value}%`;
const daysValue = (value: number): string => value ? `${value}d` : '—';

const cells = (row: TrendDimension): { key: string; value: string }[] => [
  { key: 'total-final-itv', value: numberValue(row.totalFinalItv) },
  { key: 'fail-itv', value: numberValue(row.failItv) },
  { key: 'passed', value: numberValue(row.passed) },
  { key: 'passed-tot', value: numberValue(row.passedTot) },
  { key: 'passed-dat', value: numberValue(row.passedDat) },
  { key: 'passed-xuat-sac', value: numberValue(row.passedXuatSac) },
  { key: 'passed-khong-offer', value: numberValue(row.passedKhongOffer) },
  { key: 'total-offer', value: numberValue(row.totalOffer) },
  { key: 'offer-rejected', value: numberValue(row.offerRejected) },
  { key: 'onboard-rejected', value: numberValue(row.onboardRejected) },
  { key: 'onboarding-pending', value: numberValue(row.onboardingPending) },
  { key: 'offer-accepted', value: numberValue(row.offerAccepted) },
  { key: 'hired', value: numberValue(row.hired) },
  { key: 'final-to-fail-rate', value: percentageValue(row.finalToFailRate) },
  { key: 'final-to-offer-rate', value: percentageValue(row.finalToOfferRate) },
  { key: 'offer-to-hired-rate', value: percentageValue(row.offerToHiredRate) },
  { key: 'final-to-hired-rate', value: percentageValue(row.finalToHiredRate) },
  { key: 'management-hired', value: numberValue(row.managementHired) },
  { key: 'senior-hired', value: numberValue(row.seniorHired) },
  { key: 'experienced-hired', value: numberValue(row.experiencedHired) },
  { key: 'junior-hired', value: numberValue(row.juniorHired) },
  { key: 'apply-to-onboard-tth', value: daysValue(row.applyToOnboardTth) },
  { key: 'final-to-onboard-tth', value: daysValue(row.finalToOnboardTth) },
];

const GROUPS = [
  { label: 'Final Interview', columns: ['Tổng Final ITV', 'Fail', 'Passed'] },
  { label: 'Hiệu quả Final ITV', columns: ['Passed Tốt', 'Passed Đạt', 'Passed Xuất sắc', 'Passed Không Offer'] },
  { label: 'Hiệu quả Offer', columns: ['Vòng Offer', 'Offer Reject', 'Reject Onboard', 'Đang Offer', 'Offer Accept', 'Hired'] },
  { label: 'Tỷ lệ', columns: ['Final → Fail', 'Final → Offer', 'Offer → Hired', 'Final → Hired'] },
  { label: 'Chất lượng Hired', columns: ['Quản lý', '≥ Senior', 'Experienced', '≤ Junior'] },
  { label: 'Time to Hired', columns: ['TTH ứng tuyển', 'TTH Final ITV'] },
];

export const TrendTable: React.FC<Readonly<TrendTableProps>> = ({ total, rows, title, dimensionLabel }) => (
  <section className="rounded-xl border border-[#1f293d] bg-[#111827] p-4 shadow-xl">
    <div className="mb-3">
      <h2 className="text-xs font-bold uppercase tracking-wide text-white">{title}</h2>
      <p className="mt-1 text-[11px] text-slate-400">Các chỉ số được tính theo ngày phát sinh của từng sự kiện.</p>
    </div>
    <div className="trend-table-scroll overflow-x-auto">
      <table className="relative isolate min-w-[2200px] border-collapse text-[11px] text-slate-200">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr className="border-b border-slate-700 bg-slate-950/60 text-center text-[10px] uppercase tracking-wide text-slate-300">
            <th rowSpan={2} className="sticky left-0 top-0 z-30 min-w-[190px] whitespace-nowrap border-r border-slate-700 bg-[#111827] px-3 py-3 text-left align-middle shadow-[4px_0_8px_rgba(2,6,23,0.35)]">{dimensionLabel}</th>
            {GROUPS.map((group) => (
              <th key={group.label} colSpan={group.columns.length} className="border-r border-slate-700 px-2 py-2">{group.label}</th>
            ))}
          </tr>
          <tr className="border-b border-slate-700 bg-slate-950/40 text-center text-[10px] text-slate-400">
            {GROUPS.flatMap((group) => group.columns).map((column) => (
              <th key={column} className="min-w-[78px] border-r border-slate-800 px-2 py-2">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-slate-700 bg-indigo-950/30 font-bold text-white">
            <th scope="row" className="sticky left-0 z-20 border-r border-slate-700 bg-[#1e1b4b] px-3 py-2 text-left">{total.label}</th>
            {cells(total).map((cell) => <td key={`total-${cell.key}`} className="border-r border-slate-800 px-2 py-2 text-center">{cell.value}</td>)}
          </tr>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-slate-800/80 hover:bg-slate-800/40">
              <th scope="row" className="sticky left-0 z-10 border-r border-slate-800 bg-[#111827] px-3 py-2 text-left font-medium text-slate-200 shadow-[4px_0_8px_rgba(2,6,23,0.2)]">{row.label}</th>
              {cells(row).map((cell) => <td key={`${row.label}-${cell.key}`} className="border-r border-slate-800/70 px-2 py-2 text-center">{cell.value}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
);
