import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Search } from 'lucide-react';
import { CandidateApplicationsTable } from '@/components/interview/CandidateApplicationsTable';
import {
  getCandidateStatusBadgeClassName,
  getCandidateStatusLabel,
} from '@/components/interview/candidate-display';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { getInternalSafeErrorMessage } from '@/lib/api-errors';
import {
  getFreelancer,
  listFreelancerApplications,
  updateFreelancerStatus,
  type FreelancerApplicationRecord,
  type FreelancerRecord,
} from '@/lib/freelancer-api';
import type { RecruitmentPagination } from '@/lib/recruitment-api';

const DEFAULT_PAGE_SIZE = 20;

export function FreelancerDetailPage() {
  const { freelancerId } = useParams<{ freelancerId: string }>();
  const [freelancer, setFreelancer] = useState<FreelancerRecord | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [applications, setApplications] = useState<FreelancerApplicationRecord[]>([]);
  const [pagination, setPagination] = useState<RecruitmentPagination | undefined>();
  const [tableLoading, setTableLoading] = useState(true);
  const [tableError, setTableError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const routeRequestRef = useRef({ freelancerId, token: 0 });
  const summaryLoadRef = useRef(0);
  const tableLoadRef = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  routeRequestRef.current.freelancerId = freelancerId;

  useLayoutEffect(() => {
    clearTimeout(searchTimer.current);
    routeRequestRef.current = {
      freelancerId,
      token: routeRequestRef.current.token + 1,
    };
    summaryLoadRef.current += 1;
    tableLoadRef.current += 1;
    setFreelancer(null);
    setSummaryError(null);
    setSummaryLoading(Boolean(freelancerId));
    setApplications([]);
    setPagination(undefined);
    setTableError(null);
    setTableLoading(Boolean(freelancerId));
    setSearchInput('');
    setSearch('');
    setPage(1);
    setStatusUpdating(false);
  }, [freelancerId]);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(searchTimer.current);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const loadFreelancer = useCallback(async () => {
    if (!freelancerId) {
      setFreelancer(null);
      setSummaryError('Freelancer id is required.');
      setSummaryLoading(false);
      return;
    }

    const loadId = ++summaryLoadRef.current;
    setSummaryLoading(true);
    setSummaryError(null);

    try {
      const result = await getFreelancer(freelancerId);
      if (loadId !== summaryLoadRef.current) return;
      setFreelancer(result);
    } catch (err) {
      if (loadId !== summaryLoadRef.current) return;
      setFreelancer(null);
      setSummaryError(getInternalSafeErrorMessage(err));
    } finally {
      if (loadId === summaryLoadRef.current) {
        setSummaryLoading(false);
      }
    }
  }, [freelancerId]);

  const loadApplications = useCallback(async () => {
    if (!freelancerId) {
      setApplications([]);
      setPagination(undefined);
      setTableError('Freelancer id is required.');
      setTableLoading(false);
      return;
    }

    const loadId = ++tableLoadRef.current;
    setTableLoading(true);
    setTableError(null);

    try {
      const result = await listFreelancerApplications(freelancerId, {
        page,
        limit,
        search: search || undefined,
      });

      if (loadId !== tableLoadRef.current) return;

      const total = result.pagination?.total ?? 0;
      if (result.data.length === 0 && page > 1 && total > 0) {
        setPage((current) => Math.max(1, current - 1));
        return;
      }

      setApplications(result.data);
      setPagination(result.pagination);
    } catch (err) {
      if (loadId !== tableLoadRef.current) return;
      setApplications([]);
      setPagination(undefined);
      setTableError(getInternalSafeErrorMessage(err));
    } finally {
      if (loadId === tableLoadRef.current) {
        setTableLoading(false);
      }
    }
  }, [freelancerId, limit, page, search]);

  useEffect(() => {
    void loadFreelancer();
  }, [loadFreelancer]);

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  const isCurrentRouteRequest = useCallback(
    (routeId: string, routeToken: number) => (
      routeRequestRef.current.freelancerId === routeId
      && routeRequestRef.current.token === routeToken
    ),
    [],
  );

  const handleToggleStatus = async (
    event: MouseEvent<HTMLButtonElement>,
    currentFreelancer: FreelancerRecord,
  ) => {
    event.preventDefault();

    if (currentFreelancer.isActive) {
      const confirmed = window.confirm(
        'Deactivate this freelancer?\n\nThey will no longer be able to create new referrals, but existing referral history will be preserved.',
      );
      if (!confirmed) return;
    }

    const requestFreelancerId = currentFreelancer.id;
    const requestRouteToken = routeRequestRef.current.token;
    setStatusUpdating(true);

    try {
      const updated = await updateFreelancerStatus(
        requestFreelancerId,
        !currentFreelancer.isActive,
      );
      if (!isCurrentRouteRequest(requestFreelancerId, requestRouteToken)) return;
      setFreelancer(updated);
      toast({
        title: currentFreelancer.isActive
          ? 'Freelancer deactivated'
          : 'Freelancer activated',
      });
    } catch (err) {
      if (!isCurrentRouteRequest(requestFreelancerId, requestRouteToken)) return;
      toast({
        title: currentFreelancer.isActive ? 'Deactivate failed' : 'Activate failed',
        description: getInternalSafeErrorMessage(err),
        variant: 'destructive',
      });
    } finally {
      if (isCurrentRouteRequest(requestFreelancerId, requestRouteToken)) {
        setStatusUpdating(false);
      }
    }
  };

  return (
    <FreelancerDetailView
      freelancerId={freelancerId}
      freelancer={freelancer}
      summaryLoading={summaryLoading}
      summaryError={summaryError}
      applications={applications}
      pagination={pagination}
      tableLoading={tableLoading}
      tableError={tableError}
      searchInput={searchInput}
      setSearchInput={setSearchInput}
      page={page}
      limit={limit}
      setPage={setPage}
      setLimit={setLimit}
      statusUpdating={statusUpdating}
      handleToggleStatus={handleToggleStatus}
    />
  );
}

interface FreelancerDetailViewProps {
  freelancerId?: string;
  freelancer: FreelancerRecord | null;
  summaryLoading: boolean;
  summaryError: string | null;
  applications: FreelancerApplicationRecord[];
  pagination?: RecruitmentPagination;
  tableLoading: boolean;
  tableError: string | null;
  searchInput: string;
  setSearchInput: (value: string) => void;
  page: number;
  limit: number;
  setPage: (value: number) => void;
  setLimit: (value: number) => void;
  statusUpdating: boolean;
  handleToggleStatus: (event: MouseEvent<HTMLButtonElement>, freelancer: FreelancerRecord) => void;
}

function FreelancerDetailView(props: FreelancerDetailViewProps) {
  if (!props.freelancerId) return <FreelancerMissingView />;

  const currentFreelancer = props.freelancer?.id === props.freelancerId ? props.freelancer : null;
  const currentPagination = props.pagination ?? {
    page: props.page,
    limit: props.limit,
    total: props.applications.length,
    totalPages: 1,
  };
  const hideTablePagination = props.tableLoading && !props.pagination && props.applications.length === 0;

  return (
    <div className="space-y-6">
      <FreelancerSummary
        freelancer={currentFreelancer}
        loading={props.summaryLoading}
        error={props.summaryError}
        statusUpdating={props.statusUpdating}
        onToggleStatus={props.handleToggleStatus}
      />
      <ApplicationsCard
        applications={props.applications}
        pagination={currentPagination}
        tableLoading={props.tableLoading}
        tableError={props.tableError}
        hidePagination={hideTablePagination}
        searchInput={props.searchInput}
        setSearchInput={props.setSearchInput}
        onPageChange={props.setPage}
        onLimitChange={props.setLimit}
      />
    </div>
  );
}

function FreelancerMissingView() {
  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" className="w-fit px-0">
        <Link to="/candidates/freelancers"><ArrowLeft className="mr-2 h-4 w-4" />Back to freelancers</Link>
      </Button>
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">Freelancer id is required.</div>
    </div>
  );
}

function FreelancerSummary({
  freelancer,
  loading,
  error,
  statusUpdating,
  onToggleStatus,
}: {
  freelancer: FreelancerRecord | null;
  loading: boolean;
  error: string | null;
  statusUpdating: boolean;
  onToggleStatus: (event: MouseEvent<HTMLButtonElement>, freelancer: FreelancerRecord) => void;
}) {
  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" className="w-fit px-0">
        <Link to="/candidates/freelancers"><ArrowLeft className="mr-2 h-4 w-4" />Back to freelancers</Link>
      </Button>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="space-y-1"><p className="text-sm text-muted-foreground">Candidates</p><h1 className="text-2xl font-semibold">{freelancer?.name ?? 'Freelancer detail'}</h1></div>
          <FreelancerSummaryStatus freelancer={freelancer} loading={loading} />
          <p className="text-sm text-muted-foreground">Deactivating a freelancer blocks new referrals while preserving historical referrals.</p>
        </div>
        {freelancer && <Button type="button" variant="outline" disabled={statusUpdating || loading} onClick={(event) => onToggleStatus(event, freelancer)}>{statusUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{freelancer.isActive ? 'Deactivate' : 'Activate'}</Button>}
      </div>
      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
    </div>
  );
}

function FreelancerSummaryStatus({ freelancer, loading }: { freelancer: FreelancerRecord | null; loading: boolean }) {
  if (loading && !freelancer) return <p className="text-sm text-muted-foreground">Loading freelancer summary...</p>;
  if (!freelancer) return <p className="text-sm text-muted-foreground">Freelancer summary unavailable.</p>;
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
      <span>{freelancer.email}</span><span>•</span><span className="font-medium text-foreground">{freelancer.identifier}</span>
      <Badge className={getCandidateStatusBadgeClassName(freelancer.isActive)}>{getCandidateStatusLabel(freelancer.isActive)}</Badge>
      <span>{freelancer.applicationCount} applications</span>
    </div>
  );
}

function ApplicationsCard({
  applications,
  pagination,
  tableLoading,
  tableError,
  hidePagination,
  searchInput,
  setSearchInput,
  onPageChange,
  onLimitChange,
}: {
  applications: FreelancerApplicationRecord[];
  pagination: RecruitmentPagination;
  tableLoading: boolean;
  tableError: string | null;
  hidePagination: boolean;
  searchInput: string;
  setSearchInput: (value: string) => void;
  onPageChange: (value: number) => void;
  onLimitChange: (value: number) => void;
}) {
  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="space-y-1"><CardTitle className="text-lg">Applications</CardTitle><p className="text-sm text-muted-foreground">Minimal HR referral view. Candidate contact details, CV links, and sensitive fields stay hidden.</p></div>
        <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search candidate or JD" className="pl-8" /></div>
      </CardHeader>
      <CardContent>
        {tableError && <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{tableError}</div>}
        <CandidateApplicationsTable
          applications={applications}
          pagination={pagination}
          loading={tableLoading}
          headers={{
            number: 'STT',
            candidate: 'Tên ứng viên',
            process: 'Trạng thái process',
            hrReception: 'HR tiếp nhận hồ sơ',
            evaluation: 'Đánh giá chung',
          }}
        />
        {!hidePagination && <div className="mt-4"><DataTablePagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} limit={pagination.limit} onPageChange={onPageChange} onLimitChange={onLimitChange} /></div>}
      </CardContent>
    </Card>
  );
}

