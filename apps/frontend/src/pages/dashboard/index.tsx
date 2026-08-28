import { useState, useEffect } from 'react';
import { DashboardTab, PipelineDashboard, DashboardFilters, SubFilterKey } from './types';
import { DashboardHeader } from './components/common/DashboardHeader';
import { DashboardTabNav } from './components/common/DashboardTabNav';
import { ExportReportModal } from './components/common/ExportReportModal';
import { RecruitmentImportModal } from './components/common/RecruitmentImportModal';
import { GrowthTab } from './components/tab-growth';
import { PipelineTab } from './components/tab-pipeline';
import { QuotaTab } from './components/tab-quota';
import { TrendTab } from './components/tab-trends';
import {
  DashboardOwnerOption,
  DashboardScope,
  DashboardTrends,
  DASHBOARD_SCOPE_LABELS,
  getDashboardOwnerOptions,
  getDashboardPositionOptions,
  getPipelineDashboard,
  getDashboardTrends,
} from '@/lib/dashboard-api';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

function getInitialDashboardFilters(): DashboardFilters {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return { startDate: `${year}-01-01`, endDate: `${year}-${month}-${day}` };
}

export function AnalystDashboard() {
  const [activeTab, setActiveTab] = useState<DashboardTab>('tab-pipeline');
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [selectedScope, setSelectedScope] = useState<DashboardScope>('company');
  const [activeFilter, setActiveFilter] = useState<SubFilterKey>('hrbp');

  const [dashboard, setDashboard] = useState<PipelineDashboard | null>(null);
  const [trends, setTrends] = useState<DashboardTrends | null>(null);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [trendsError, setTrendsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DashboardFilters>(getInitialDashboardFilters);
  const [ownerOptions, setOwnerOptions] = useState<DashboardOwnerOption[]>([]);
  const [positionOptions, setPositionOptions] = useState<{ id: string; label: string }[]>([]);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPipelineDashboard(filters);
      setDashboard(data);
    } catch (err: unknown) {
      console.error('Failed to load pipeline dashboard from backend:', err);
      setError('Không thể tải dữ liệu Dashboard Tuyển Dụng từ máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [filters]);

  useEffect(() => {
    if (activeTab !== 'tab-xu-huong') return undefined;

    let cancelled = false;
    setTrendsLoading(true);
    setTrendsError(null);
    getDashboardTrends(filters)
      .then((data) => {
        if (!cancelled) setTrends(data);
      })
      .catch((err: unknown) => {
        console.error('Failed to load recruitment trends from backend:', err);
        if (!cancelled) setTrendsError('Không thể tải dữ liệu xu hướng tuyển dụng từ máy chủ.');
      })
      .finally(() => {
        if (!cancelled) setTrendsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, filters]);

  useEffect(() => {
    getDashboardOwnerOptions().then(setOwnerOptions).catch((err) => {
      console.error('Failed to load dashboard owner options:', err);
    });
    getDashboardPositionOptions().then(setPositionOptions).catch((err) => {
      console.error('Failed to load dashboard position options:', err);
    });
  }, []);

  const handleScopeChange = (scope: DashboardScope) => {
    setSelectedScope(scope);
    if (scope === 'company') {
      setActiveFilter('hrbp');
      setFilters(getInitialDashboardFilters());
      return;
    }
    const filterByScope: Record<Exclude<DashboardScope, 'company'>, SubFilterKey> = {
      owner: 'hrbp',
      position: 'vitri',
      channel: 'kenh',
      time: 'thoigian',
    };
    setActiveFilter(filterByScope[scope]);
  };

  const handleFilterChange = (key: SubFilterKey) => {
    setActiveFilter(key);
    const scopeByFilter: Record<SubFilterKey, DashboardScope> = {
      hrbp: 'owner',
      vitri: 'position',
      kenh: 'channel',
      thoigian: 'time',
    };
    setSelectedScope(scopeByFilter[key]);
  };

  const formatDate = (date: string | Date | undefined): string => {
    if (!date) return '11/08/2026';
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  if (loading && !dashboard) {
    return <DashboardLoadingSkeleton />;
  }

  if (error && !dashboard) {
    return (
      <div className="bg-[#0b0f19] text-[#e2e8f0] min-h-screen -m-6 p-6 flex flex-col items-center justify-center space-y-4">
        <div className="bg-[#111827] border border-rose-900/60 p-6 rounded-xl max-w-md w-full text-center space-y-3 shadow-2xl">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
          <h2 className="text-lg font-bold text-white">Lỗi Tải Dữ Liệu</h2>
          <p className="text-xs text-slate-400">{error}</p>
          <Button
            onClick={loadDashboard}
            className="bg-rose-700 hover:bg-rose-600 text-white text-xs gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Thử Lại
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0b0f19] text-[#e2e8f0] min-h-screen -m-4 sm:-m-6 md:-m-8 p-4 sm:p-6 md:p-8 antialiased">
      <div className="max-w-[1800px] mx-auto space-y-5">
        {/* Top Header */}
        <DashboardHeader
          onExportClick={() => setExportModalOpen(true)}
          onImportClick={() => setImportModalOpen(true)}
          asOfDate={formatDate(dashboard?.asOf)}
          selectedScope={selectedScope}
          onScopeChange={handleScopeChange}
          totalApplications={dashboard?.totalApplications}
          totalHired={dashboard?.totalHired}
          totalFinalItv={dashboard?.funnel.totalFinalItv}
        />

        {/* Main Navigation Tabs */}
        <DashboardTabNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {/* TAB 1: Theo dõi Tăng mới */}
        {activeTab === 'tab-tangmoi' && <GrowthTab />}

        {/* TAB 2: Pipeline Tuyển dụng */}
        {activeTab === 'tab-pipeline' && dashboard && (
          <PipelineTab
            dashboard={dashboard}
            activeFilter={activeFilter}
            onFilterChange={handleFilterChange}
            asOfDate={formatDate(dashboard.asOf)}
            selectedChannel={filters.channel}
            onChannelChange={(channel) => setFilters((current) => ({ ...current, channel: channel || undefined }))}
            ownerOptions={ownerOptions}
            selectedOwnerId={filters.ownerId}
            onOwnerChange={(owner) => setFilters((current) => ({
              ...current,
              ownerType: owner?.type,
              ownerId: owner?.id,
            }))}
            positionOptions={positionOptions}
            selectedPositionId={filters.positionId}
            onPositionChange={(positionId) => setFilters((current) => ({ ...current, positionId }))}
            startDate={filters.startDate}
            endDate={filters.endDate}
            onDateChange={(field, value) => setFilters((current) => ({ ...current, [field]: value }))}
          />
        )}

        {activeTab === 'tab-xu-huong' && (
          <TrendTab
            trends={trends}
            loading={trendsLoading}
            error={trendsError}
          />
        )}

        {/* TAB 4: Quản lý Nhu cầu & Định biên 2026 */}
        {activeTab === 'tab-dinhbien' && <QuotaTab />}
      </div>

      {/* Export Report Modal */}
      <ExportReportModal
        open={exportModalOpen}
        onOpenChange={setExportModalOpen}
        asOfDate={formatDate(dashboard?.asOf)}
        scope={DASHBOARD_SCOPE_LABELS[selectedScope]}
        dashboard={dashboard}
        filters={filters}
      />
      <RecruitmentImportModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        onImported={loadDashboard}
      />
    </div>
  );
}

function DashboardLoadingSkeleton() {
  return (
    <div className="bg-[#0b0f19] text-[#e2e8f0] min-h-screen -m-6 p-4 md:p-6 space-y-5">
      <div className="max-w-[1800px] mx-auto space-y-5">
        {/* Header Skeleton */}
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 flex justify-between items-center h-20">
          <div className="space-y-2">
            <Skeleton className="h-6 w-72 bg-slate-800" />
            <Skeleton className="h-4 w-40 bg-slate-800" />
          </div>
          <Skeleton className="h-9 w-32 bg-slate-800" />
        </div>

        {/* Tabs Skeleton */}
        <div className="flex gap-2">
          <Skeleton className="h-10 w-44 bg-slate-800 rounded-lg" />
          <Skeleton className="h-10 w-44 bg-slate-800 rounded-lg" />
          <Skeleton className="h-10 w-44 bg-slate-800 rounded-lg" />
        </div>

        {/* Cards Skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-[#111827] border border-slate-800 p-4 rounded-xl space-y-2 h-28">
              <Skeleton className="h-4 w-24 bg-slate-800" />
              <Skeleton className="h-8 w-16 bg-slate-800" />
              <Skeleton className="h-3 w-32 bg-slate-800" />
            </div>
          ))}
        </div>

        {/* Charts Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-[#111827] border border-slate-800 p-5 rounded-xl h-80">
            <Skeleton className="h-full w-full bg-slate-800" />
          </div>
          <div className="bg-[#111827] border border-slate-800 p-5 rounded-xl h-80">
            <Skeleton className="h-full w-full bg-slate-800" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default AnalystDashboard;
