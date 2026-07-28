import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Search } from 'lucide-react';
import {
  getApplicationStatusClassName,
  getApplicationStatusLabel,
} from '@/components/recruitment/ApplicationOverview';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

function getFreelancerStatusBadgeClassName(isActive: boolean) {
  return isActive
    ? 'bg-green-100 text-green-800'
    : 'bg-zinc-100 text-zinc-700';
}

function getFreelancerStatusLabel(isActive: boolean) {
  return isActive ? 'Hoạt động' : 'Ngừng hoạt động';
}

function valueOrDash(value?: string | null) {
  if (!value?.trim()) return '-';
  return value;
}

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

  if (!freelancerId) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" className="w-fit px-0">
          <Link to="/candidates/freelancers">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to freelancers
          </Link>
        </Button>
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          Freelancer id is required.
        </div>
      </div>
    );
  }

  const currentFreelancer = freelancer?.id === freelancerId ? freelancer : null;
  const currentPagination = pagination ?? {
    page,
    limit,
    total: applications.length,
    totalPages: 1,
  };
  const hideTablePagination = tableLoading && !pagination && applications.length === 0;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Button asChild variant="ghost" className="w-fit px-0">
          <Link to="/candidates/freelancers">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to freelancers
          </Link>
        </Button>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Candidates</p>
              <h1 className="text-2xl font-semibold">
                {currentFreelancer?.name ?? 'Freelancer detail'}
              </h1>
            </div>

            {summaryLoading && !currentFreelancer ? (
              <p className="text-sm text-muted-foreground">Loading freelancer summary...</p>
            ) : currentFreelancer ? (
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span>{currentFreelancer.email}</span>
                <span>•</span>
                <span className="font-medium text-foreground">
                  {currentFreelancer.identifier}
                </span>
                <Badge
                  className={getFreelancerStatusBadgeClassName(currentFreelancer.isActive)}
                >
                  {getFreelancerStatusLabel(currentFreelancer.isActive)}
                </Badge>
                <span>{currentFreelancer.applicationCount} applications</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Freelancer summary unavailable.
              </p>
            )}

            <p className="text-sm text-muted-foreground">
              Deactivating a freelancer blocks new referrals while preserving historical referrals.
            </p>
          </div>

          {currentFreelancer ? (
            <Button
              type="button"
              variant="outline"
              disabled={statusUpdating || summaryLoading}
              onClick={(event) => void handleToggleStatus(event, currentFreelancer)}
            >
              {statusUpdating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {currentFreelancer.isActive ? 'Deactivate' : 'Activate'}
            </Button>
          ) : null}
        </div>

        {summaryError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {summaryError}
          </div>
        ) : null}
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">Applications</CardTitle>
              <p className="text-sm text-muted-foreground">
                Minimal HR referral view. Candidate contact details, CV links, and sensitive fields stay hidden.
              </p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr]">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search candidate or JD"
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {tableError ? (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {tableError}
            </div>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">STT</TableHead>
                <TableHead>Tên ứng viên</TableHead>
                <TableHead>JD</TableHead>
                <TableHead>Trạng thái process</TableHead>
                <TableHead>HR tiếp nhận hồ sơ</TableHead>
                <TableHead>Đánh giá chung</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    Loading applications...
                  </TableCell>
                </TableRow>
              ) : null}

              {!tableLoading && applications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No applications found.
                  </TableCell>
                </TableRow>
              ) : null}

              {!tableLoading && applications.map((application, index) => (
                <TableRow key={application.referralId}>
                  <TableCell>
                    {(currentPagination.page - 1) * currentPagination.limit + index + 1}
                  </TableCell>
                  <TableCell className="font-medium">
                    {valueOrDash(application.candidateName)}
                  </TableCell>
                  <TableCell>{valueOrDash(application.jobPostingTitle)}</TableCell>
                  <TableCell>
                    {application.processStatus ? (
                      <Badge className={getApplicationStatusClassName(application.processStatus)}>
                        {getApplicationStatusLabel(application.processStatus)}
                      </Badge>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    {application.hrReceptionStatus ? (
                      <Badge className={getApplicationStatusClassName(application.hrReceptionStatus)}>
                        {getApplicationStatusLabel(application.hrReceptionStatus)}
                      </Badge>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell className="max-w-md whitespace-pre-wrap break-words">
                    {valueOrDash(application.evaluation)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {!hideTablePagination ? (
            <div className="mt-4">
              <DataTablePagination
                page={currentPagination.page}
                totalPages={currentPagination.totalPages}
                total={currentPagination.total}
                limit={currentPagination.limit}
                onPageChange={setPage}
                onLimitChange={setLimit}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
