import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Search } from 'lucide-react';
import { CandidateApplicationsTable } from '@/components/interview/CandidateApplicationsTable';
import {
  getCandidateStatusBadgeClassName,
} from '@/components/interview/candidate-display';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { getInternalSafeErrorMessage } from '@/lib/api-errors';
import {
  getInternal,
  listInternalApplications,
  updateInternalStatus,
  type InternalApplicationRecord,
  type InternalRecord,
} from '@/lib/internal-api';
import type { RecruitmentPagination } from '@/lib/recruitment-api';

const DEFAULT_PAGE_SIZE = 20;

export function InternalDetailPage() {
  const { internalId } = useParams<{ internalId: string }>();
  const [internal, setInternal] = useState<InternalRecord | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [applications, setApplications] = useState<InternalApplicationRecord[]>([]);
  const [pagination, setPagination] = useState<RecruitmentPagination | undefined>();
  const [tableLoading, setTableLoading] = useState(true);
  const [tableError, setTableError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const routeRequestRef = useRef({ internalId, token: 0 });
  const summaryLoadRef = useRef(0);
  const tableLoadRef = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  routeRequestRef.current.internalId = internalId;

  useLayoutEffect(() => {
    clearTimeout(searchTimer.current);
    routeRequestRef.current = {
      internalId,
      token: routeRequestRef.current.token + 1,
    };
    summaryLoadRef.current += 1;
    tableLoadRef.current += 1;
    setInternal(null);
    setSummaryError(null);
    setSummaryLoading(Boolean(internalId));
    setApplications([]);
    setPagination(undefined);
    setTableError(null);
    setTableLoading(Boolean(internalId));
    setSearchInput('');
    setSearch('');
    setPage(1);
    setStatusUpdating(false);
  }, [internalId]);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(searchTimer.current);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const loadInternal = useCallback(async () => {
    if (!internalId) {
      setInternal(null);
      setSummaryError('Internal id is required.');
      setSummaryLoading(false);
      return;
    }

    const loadId = ++summaryLoadRef.current;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const result = await getInternal(internalId);
      if (loadId !== summaryLoadRef.current) return;
      setInternal(result);
    } catch (err) {
      if (loadId !== summaryLoadRef.current) return;
      setInternal(null);
      setSummaryError(getInternalSafeErrorMessage(err));
    } finally {
      if (loadId === summaryLoadRef.current) setSummaryLoading(false);
    }
  }, [internalId]);

  const loadApplications = useCallback(async () => {
    if (!internalId) {
      setApplications([]);
      setPagination(undefined);
      setTableError('Internal id is required.');
      setTableLoading(false);
      return;
    }

    const loadId = ++tableLoadRef.current;
    setTableLoading(true);
    setTableError(null);
    try {
      const result = await listInternalApplications(internalId, {
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
      if (loadId === tableLoadRef.current) setTableLoading(false);
    }
  }, [internalId, limit, page, search]);

  useEffect(() => {
    void loadInternal();
  }, [loadInternal]);

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  const isCurrentRouteRequest = useCallback(
    (routeId: string, routeToken: number) => (
      routeRequestRef.current.internalId === routeId
      && routeRequestRef.current.token === routeToken
    ),
    [],
  );

  const handleToggleStatus = async (
    event: MouseEvent<HTMLButtonElement>,
    currentInternal: InternalRecord,
  ) => {
    event.preventDefault();
    if (currentInternal.isActive) {
      const confirmed = window.confirm(
        'Deactivate this Internal record?\n\nNew applications will no longer be attributed to this email, while existing history is preserved.',
      );
      if (!confirmed) return;
    }

    const requestInternalId = currentInternal.id;
    const requestRouteToken = routeRequestRef.current.token;
    setStatusUpdating(true);
    try {
      const updated = await updateInternalStatus(requestInternalId, !currentInternal.isActive);
      if (!isCurrentRouteRequest(requestInternalId, requestRouteToken)) return;
      setInternal(updated);
      toast({ title: currentInternal.isActive ? 'Internal deactivated' : 'Internal activated' });
    } catch (err) {
      if (!isCurrentRouteRequest(requestInternalId, requestRouteToken)) return;
      toast({
        title: currentInternal.isActive ? 'Deactivate failed' : 'Activate failed',
        description: getInternalSafeErrorMessage(err),
        variant: 'destructive',
      });
    } finally {
      if (isCurrentRouteRequest(requestInternalId, requestRouteToken)) setStatusUpdating(false);
    }
  };

  return (
    <InternalDetailView
      internalId={internalId}
      internal={internal}
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

interface InternalDetailViewProps {
  internalId?: string;
  internal: InternalRecord | null;
  summaryLoading: boolean;
  summaryError: string | null;
  applications: InternalApplicationRecord[];
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
  handleToggleStatus: (event: MouseEvent<HTMLButtonElement>, internal: InternalRecord) => void;
}

function InternalDetailView(props: InternalDetailViewProps) {
  if (!props.internalId) return <InternalMissingView />;

  const currentInternal = props.internal?.id === props.internalId ? props.internal : null;
  const currentPagination = props.pagination ?? {
    page: props.page,
    limit: props.limit,
    total: props.applications.length,
    totalPages: 1,
  };
  const hideTablePagination = props.tableLoading && !props.pagination && props.applications.length === 0;

  return (
    <div className="space-y-6">
      <InternalSummary
        internal={currentInternal}
        loading={props.summaryLoading}
        error={props.summaryError}
        statusUpdating={props.statusUpdating}
        onToggleStatus={props.handleToggleStatus}
      />
      <InternalApplicationsCard
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

function InternalMissingView() {
  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" className="w-fit px-0"><Link to="/candidates/internals"><ArrowLeft className="mr-2 h-4 w-4" />Back to internals</Link></Button>
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">Internal id is required.</div>
    </div>
  );
}

function InternalSummary({
  internal,
  loading,
  error,
  statusUpdating,
  onToggleStatus,
}: {
  internal: InternalRecord | null;
  loading: boolean;
  error: string | null;
  statusUpdating: boolean;
  onToggleStatus: (event: MouseEvent<HTMLButtonElement>, internal: InternalRecord) => void;
}) {
  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" className="w-fit px-0"><Link to="/candidates/internals"><ArrowLeft className="mr-2 h-4 w-4" />Back to internals</Link></Button>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="space-y-1"><p className="text-sm text-muted-foreground">Candidates / Internals</p><h1 className="text-2xl font-semibold">{internal?.name ?? internal?.email ?? 'Internal detail'}</h1></div>
          <InternalSummaryStatus internal={internal} loading={loading} />
          <p className="text-sm text-muted-foreground">Contact information is read-only after creation. Deactivating this record blocks new referrals and preserves history.</p>
        </div>
        {internal && <Button type="button" variant="outline" disabled={statusUpdating || loading} onClick={(event) => onToggleStatus(event, internal)}>{statusUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{internal.isActive ? 'Deactivate' : 'Activate'}</Button>}
      </div>
      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
    </div>
  );
}

function InternalSummaryStatus({ internal, loading }: { internal: InternalRecord | null; loading: boolean }) {
  if (loading && !internal) return <p className="text-sm text-muted-foreground">Loading internal summary...</p>;
  if (!internal) return <p className="text-sm text-muted-foreground">Internal summary unavailable.</p>;
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
      <span>{internal.email}</span><span>{internal.phone ?? '-'}</span><span>{internal.applicationCount} applications</span>
      <Badge className={getCandidateStatusBadgeClassName(internal.isActive)}>{internal.isActive ? 'Active' : 'Inactive'}</Badge>
    </div>
  );
}

function InternalApplicationsCard({
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
  applications: InternalApplicationRecord[];
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
        <div className="space-y-1"><CardTitle className="text-lg">Applications</CardTitle><p className="text-sm text-muted-foreground">Applications attributed to this internal email. Candidate contact details and CV links stay hidden.</p></div>
        <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search candidate or JD" className="pl-8" /></div>
      </CardHeader>
      <CardContent>
        {tableError && <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{tableError}</div>}
        <CandidateApplicationsTable
          applications={applications}
          pagination={pagination}
          loading={tableLoading}
        />
        {!hidePagination && <div className="mt-4"><DataTablePagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} limit={pagination.limit} onPageChange={onPageChange} onLimitChange={onLimitChange} /></div>}
      </CardContent>
    </Card>
  );
}

