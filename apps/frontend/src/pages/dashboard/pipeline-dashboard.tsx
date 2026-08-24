import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  getPipelineDashboard,
  PipelineDashboard
} from '@/lib/dashboard-api';

// Stage labels mapping
const STAGE_LABELS: Record<string, string> = {
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

const CHANNEL_LABELS: Record<string, string> = {
  VCS_PORTAL: 'VCS Portal',
  FACEBOOK: 'Facebook',
  TOPCV: 'TopCV',
  ITVIEC: 'ItViec',
  VIETNAMWORKS: 'VietnamWorks',
  LINKEDIN: 'LinkedIn',
  MANUAL: 'Manual',
  OTHER: 'Khác',
  TOTAL: 'Tổng',
  UNKNOWN: 'Không xác định',
};

const STAGE_COLORS: Record<string, string> = {
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

const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#64748b'];

// Format date without date-fns
function formatDate(date: string | Date): string {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

export function PipelineDashboardPage() {
  const [dashboard, setDashboard] = useState<PipelineDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPipelineDashboard();
      setDashboard(data);
    } catch (err) {
      setError('Failed to load dashboard data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error || !dashboard) {
    return (
      <div className="p-6">
        <div className="text-red-500">{error || 'Failed to load dashboard'}</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Pipeline Tuyển Dụng</h1>
          <p className="text-muted-foreground">
            Cập nhật: {formatDate(dashboard.asOf)}
          </p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          Tổng ứng viên: {dashboard.totalApplications}
        </Badge>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Tổng Final ITV"
          value={dashboard.funnel.totalFinalItv}
          subtitle="Ứng viên phỏng vấn"
          color="blue"
        />
        <KPICard
          title="Passed ITV"
          value={dashboard.funnel.passed}
          subtitle={`${dashboard.funnel.passedRate}% tỷ lệ`}
          color="purple"
        />
        <KPICard
          title="Offer"
          value={dashboard.funnel.offer}
          subtitle={`${dashboard.funnel.offerRate}% tỷ lệ`}
          color="amber"
        />
        <KPICard
          title="Đã Tuyển"
          value={dashboard.funnel.hired}
          subtitle={`${dashboard.funnel.hiredRate}% tỷ lệ`}
          color="green"
        />
      </div>

      {/* Time Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Time to Hire (Apply → Hired)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              {dashboard.timeMetrics.avgTimeToHire}
            </div>
            <p className="text-xs text-muted-foreground">ngày trung bình</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">TTH (Final → Hired)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">
              {dashboard.timeMetrics.avgTimeFromFinal}
            </div>
            <p className="text-xs text-muted-foreground">ngày trung bình</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Đã tuyển YTD</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {dashboard.totalHired}
            </div>
            <p className="text-xs text-muted-foreground">ứng viên</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stage Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Phân bổ theo Stage</CardTitle>
            <CardDescription>Số lượng ứng viên theo từng giai đoạn</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboard.stageDistribution} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis 
                    dataKey="stage" 
                    type="category" 
                    width={100}
                    tickFormatter={(value) => STAGE_LABELS[value] || value}
                  />
                  <Tooltip 
                    formatter={(value: number) => [value]}
                    labelFormatter={(label) => STAGE_LABELS[label] || label}
                  />
                  <Bar 
                    dataKey="count" 
                    fill="#3b82f6" 
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Xu hướng theo Tháng</CardTitle>
            <CardDescription>Ứng viên mới và tuyển mới theo tháng</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dashboard.monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="month" 
                    tickFormatter={(value) => {
                      const [year, month] = value.split('-');
                      return `${month}/${year.slice(2)}`;
                    }}
                  />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={(label) => `Tháng ${label}`}
                  />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="newApplications" 
                    stroke="#3b82f6" 
                    fill="#3b82f6" 
                    fillOpacity={0.3}
                    name="Ứng viên mới"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="hired" 
                    stroke="#22c55e" 
                    fill="#22c55e" 
                    fillOpacity={0.3}
                    name="Đã tuyển"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Channel Hiring */}
        <Card>
          <CardHeader>
            <CardTitle>Tuyển dụng theo Kênh</CardTitle>
            <CardDescription>Hiệu quả theo nguồn ứng viên</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboard.channelHiring.filter(c => c.channel !== 'TOTAL')}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="channel" 
                    tickFormatter={(value) => CHANNEL_LABELS[value] || value}
                  />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: number, name: string) => [value, name === 'hired' ? 'Đã tuyển' : 'Tổng']}
                  />
                  <Bar dataKey="total" fill="#64748b" name="Tổng ứng viên" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="hired" fill="#22c55e" name="Đã tuyển" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Level Hiring */}
        <Card>
          <CardHeader>
            <CardTitle>Tuyển dụng theo Level</CardTitle>
            <CardDescription>Phân bổ theo cấp bậc ứng viên</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={dashboard.levelHiring}
                    dataKey="hired"
                    nameKey="level"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ level, percentage }) => `${level}: ${percentage}%`}
                  >
                    {dashboard.levelHiring.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stage Funnel */}
      <Card>
        <CardHeader>
          <CardTitle>Chi tiết Pipeline</CardTitle>
          <CardDescription>Tỷ lệ chuyển đổi qua các vòng</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {dashboard.stageDistribution.map((stage) => (
              <div key={stage.stage} className="flex items-center gap-4">
                <Badge 
                  variant="outline" 
                  className="min-w-[140px] justify-start"
                  style={{ borderColor: STAGE_COLORS[stage.stage] }}
                >
                  {STAGE_LABELS[stage.stage] || stage.stage}
                </Badge>
                <div className="flex-1">
                  <div className="h-6 bg-secondary rounded-md" 
                       style={{ 
                         width: `${Math.max(stage.percentage, 5)}%`,
                         backgroundColor: STAGE_COLORS[stage.stage] + '40'
                       }}
                  />
                </div>
                <div className="w-24 text-right font-mono">
                  {stage.count} ({stage.percentage}%)
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// KPI Card Component
function KPICard({ 
  title, 
  value, 
  subtitle, 
  color 
}: { 
  title: string; 
  value: number; 
  subtitle: string; 
  color: 'blue' | 'purple' | 'amber' | 'green';
}) {
  const colorClasses = {
    blue: { text: 'text-blue-600', border: 'border-blue-200' },
    purple: { text: 'text-purple-600', border: 'border-purple-200' },
    amber: { text: 'text-amber-600', border: 'border-amber-200' },
    green: { text: 'text-green-600', border: 'border-green-200' },
  };

  return (
    <Card className={`border-l-4 ${colorClasses[color].border}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${colorClasses[color].text}`}>
          {value}
        </div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

// Skeleton Loader
function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-[350px]" />
        ))}
      </div>
    </div>
  );
}

export default PipelineDashboardPage;
