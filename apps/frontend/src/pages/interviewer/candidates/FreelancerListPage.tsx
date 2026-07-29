import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Check,
  Copy,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  createFreelancer,
  listFreelancers,
  updateFreelancerStatus,
  type CreateFreelancerResponse,
  type FreelancerRecord,
} from '@/lib/freelancer-api';
import type { RecruitmentPagination } from '@/lib/recruitment-api';
import { cn } from '@/lib/utils';

const DEFAULT_PAGE_SIZE = 20;
const COPY_RESET_DELAY_MS = 2000;

type StatusFilterValue = 'all' | 'active' | 'inactive';
type CopiedField = 'identifier' | 'password' | null;

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getStatusBadgeClassName(isActive: boolean) {
  return isActive
    ? 'bg-green-100 text-green-800'
    : 'bg-zinc-100 text-zinc-700';
}

function getStatusLabel(isActive: boolean) {
  return isActive ? 'Hoạt động' : 'Ngừng hoạt động';
}

export function FreelancerListPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<FreelancerRecord[]>([]);
  const [pagination, setPagination] = useState<RecruitmentPagination | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdFreelancer, setCreatedFreelancer] = useState<CreateFreelancerResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<CopiedField>(null);
  const latestLoadRef = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(searchTimer.current);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const loadFreelancers = useCallback(async () => {
    const loadId = ++latestLoadRef.current;
    setLoading(true);
    setError(null);

    try {
      const result = await listFreelancers({
        page,
        limit,
        search: search || undefined,
        isActive: statusFilter === 'all'
          ? undefined
          : statusFilter === 'active',
      });

      if (loadId !== latestLoadRef.current) return;

      const total = result.pagination?.total ?? 0;
      if (result.data.length === 0 && page > 1 && total > 0) {
        setPage((current) => Math.max(1, current - 1));
        return;
      }

      setItems(result.data);
      setPagination(result.pagination);
    } catch (err) {
      if (loadId !== latestLoadRef.current) return;

      setItems([]);
      setPagination(undefined);
      setError(getInternalSafeErrorMessage(err));
    } finally {
      if (loadId === latestLoadRef.current) {
        setLoading(false);
      }
    }
  }, [limit, page, search, statusFilter]);

  useEffect(() => {
    void loadFreelancers();
  }, [loadFreelancers]);

  const resetCreateDialog = () => {
    setCreateName('');
    setCreateEmail('');
    setCreateError(null);
    setCreatedFreelancer(null);
    setCopiedField(null);
  };

  const openCreateDialog = () => {
    resetCreateDialog();
    setCreateOpen(true);
  };

  const handleCreateDialogChange = (open: boolean) => {
    if (!open && submitting) return;

    setCreateOpen(open);
    if (!open) {
      resetCreateDialog();
    }
  };

  const handleCopy = async (value: string, field: Exclude<CopiedField, null>) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => {
        setCopiedField((current) => (current === field ? null : current));
      }, COPY_RESET_DELAY_MS);
    } catch {
      toast({
        title: 'Copy failed',
        variant: 'destructive',
      });
    }
  };

  const handleCreate = async () => {
    setSubmitting(true);
    setCreateError(null);

    try {
      const created = await createFreelancer({
        name: createName.trim(),
        email: createEmail.trim(),
      });
      setCreatedFreelancer(created);
      toast({ title: 'Freelancer created' });

      if (page === 1) {
        await loadFreelancers();
      } else {
        setPage(1);
      }
    } catch (err) {
      setCreateError(getInternalSafeErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (
    event: React.MouseEvent,
    freelancer: FreelancerRecord,
  ) => {
    event.stopPropagation();

    if (freelancer.isActive) {
      const confirmed = window.confirm(
        'Deactivate this freelancer?\n\nThey will no longer be able to create new referrals, but existing referral history will be preserved.',
      );
      if (!confirmed) return;
    }

    setStatusUpdatingId(freelancer.id);

    try {
      await updateFreelancerStatus(freelancer.id, !freelancer.isActive);
      toast({
        title: freelancer.isActive ? 'Freelancer deactivated' : 'Freelancer activated',
      });
      await loadFreelancers();
    } catch (err) {
      toast({
        title: freelancer.isActive ? 'Deactivate failed' : 'Activate failed',
        description: getInternalSafeErrorMessage(err),
        variant: 'destructive',
      });
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const currentPagination = pagination ?? {
    page,
    limit,
    total: items.length,
    totalPages: 1,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Candidates</p>
          <h1 className="text-2xl font-semibold">Freelancers</h1>
          <p className="text-sm text-muted-foreground">
            HR/Admin-only workspace. Deactivating a freelancer blocks new referrals while preserving existing history.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadFreelancers()}
            disabled={loading}
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
          <Button type="button" onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Create freelancer
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <CardTitle className="text-lg">Freelancer Management</CardTitle>
          <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search code, name, email"
                className="pl-8"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value: StatusFilterValue) => setStatusFilter(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã</TableHead>
                <TableHead>Tên</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Số application</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Ngày tạo</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    Loading freelancers...
                  </TableCell>
                </TableRow>
              )}

              {!loading && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No freelancers found.
                  </TableCell>
                </TableRow>
              )}

              {!loading && items.map((freelancer) => {
                const detailPath = `/candidates/freelancers/${freelancer.id}`;
                const isStatusUpdating = statusUpdatingId === freelancer.id;

                return (
                  <TableRow
                    key={freelancer.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(detailPath)}
                  >
                    <TableCell className="font-medium text-primary underline underline-offset-4">
                      {freelancer.identifier}
                    </TableCell>
                    <TableCell>{freelancer.name}</TableCell>
                    <TableCell>{freelancer.email}</TableCell>
                    <TableCell>{freelancer.applicationCount}</TableCell>
                    <TableCell>
                      <Badge className={getStatusBadgeClassName(freelancer.isActive)}>
                        {getStatusLabel(freelancer.isActive)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(freelancer.createdAt)}</TableCell>
                    <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link to={detailPath}>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isStatusUpdating}
                          onClick={(event) => void handleToggleStatus(event, freelancer)}
                        >
                          {isStatusUpdating ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          {freelancer.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

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
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={handleCreateDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Freelancer</DialogTitle>
            <DialogDescription>
              Create an HR-managed freelancer account. The initial password is shown only once after success.
            </DialogDescription>
          </DialogHeader>

          {createdFreelancer ? (
            <>
              <div className="space-y-4">
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                  Freelancer created successfully. Save the identifier and initial password now.
                  This password is only kept in this dialog and is cleared when you close it.
                </div>

                <div className="space-y-1">
                  <Label>Referral identifier</Label>
                  <div className="flex items-center gap-2">
                    <Input value={createdFreelancer.identifier} readOnly />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Copy referral identifier"
                      title="Copy referral identifier"
                      onClick={() => void handleCopy(createdFreelancer.identifier, 'identifier')}
                    >
                      {copiedField === 'identifier'
                        ? <Check className="h-4 w-4" />
                        : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>Initial password</Label>
                  <div className="flex items-center gap-2">
                    <Input value={createdFreelancer.initialPassword} readOnly />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Copy initial password"
                      title="Copy initial password"
                      onClick={() => void handleCopy(createdFreelancer.initialPassword, 'password')}
                    >
                      {copiedField === 'password'
                        ? <Check className="h-4 w-4" />
                        : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => handleCreateDialogChange(false)}>
                  Close
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setCreatedFreelancer(null);
                    setCreateName('');
                    setCreateEmail('');
                    setCreateError(null);
                    setCopiedField(null);
                  }}
                >
                  Create another
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-4">
                {createError && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    {createError}
                  </div>
                )}

                <div className="space-y-1">
                  <Label htmlFor="freelancer-name">Name</Label>
                  <Input
                    id="freelancer-name"
                    value={createName}
                    onChange={(event) => setCreateName(event.target.value)}
                    placeholder="Nguyen Van A"
                    disabled={submitting}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="freelancer-email">Email</Label>
                  <Input
                    id="freelancer-email"
                    type="email"
                    value={createEmail}
                    onChange={(event) => setCreateEmail(event.target.value)}
                    placeholder="freelancer@example.com"
                    disabled={submitting}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => handleCreateDialogChange(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={submitting || !createName.trim() || !createEmail.trim()}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Create
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
