import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, Loader2, Plus, RefreshCw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  createInternal,
  listInternals,
  updateInternalStatus,
  type InternalRecord,
} from '@/lib/internal-api';
import type { RecruitmentPagination } from '@/lib/recruitment-api';
import { cn } from '@/lib/utils';

const DEFAULT_PAGE_SIZE = 20;
const INTERNAL_EMAIL_PATTERN = /^[^\s@]+@viettel\.com\.vn$/i;

type StatusFilterValue = 'all' | 'active' | 'inactive';

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
  return isActive ? 'bg-green-100 text-green-800' : 'bg-zinc-100 text-zinc-700';
}

function getStatusLabel(isActive: boolean) {
  return isActive ? 'Active' : 'Inactive';
}

export function InternalListPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<InternalRecord[]>([]);
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
  const [createPhone, setCreatePhone] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
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

  const loadInternals = useCallback(async () => {
    const loadId = ++latestLoadRef.current;
    setLoading(true);
    setError(null);

    try {
      const result = await listInternals({
        page,
        limit,
        search: search || undefined,
        isActive: statusFilter === 'all' ? undefined : statusFilter === 'active',
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
      if (loadId === latestLoadRef.current) setLoading(false);
    }
  }, [limit, page, search, statusFilter]);

  useEffect(() => {
    void loadInternals();
  }, [loadInternals]);

  const resetCreateDialog = () => {
    setCreateName('');
    setCreateEmail('');
    setCreatePhone('');
    setCreateError(null);
  };

  const handleCreateDialogChange = (open: boolean) => {
    if (!open && submitting) return;
    setCreateOpen(open);
    if (!open) resetCreateDialog();
  };

  const handleCreate = async () => {
    const name = createName.trim();
    const email = createEmail.trim().toLowerCase();
    const phone = createPhone.trim();
    if (!name) {
      setCreateError('Name is required.');
      return;
    }
    if (!INTERNAL_EMAIL_PATTERN.test(email)) {
      setCreateError('Email phải có đuôi @viettel.com.vn.');
      return;
    }
    if (!phone) {
      setCreateError('Phone is required.');
      return;
    }

    setSubmitting(true);
    setCreateError(null);
    try {
      await createInternal({ name, email, phone });
      toast({ title: 'Internal created' });
      handleCreateDialogChange(false);
      if (page === 1) await loadInternals();
      else setPage(1);
    } catch (err) {
      setCreateError(getInternalSafeErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (
    event: React.MouseEvent,
    internal: InternalRecord,
  ) => {
    event.stopPropagation();
    if (internal.isActive) {
      const confirmed = window.confirm(
        'Deactivate this Internal record?\n\nNew applications will no longer be attributed to this email, while existing history is preserved.',
      );
      if (!confirmed) return;
    }

    setStatusUpdatingId(internal.id);
    try {
      await updateInternalStatus(internal.id, !internal.isActive);
      toast({ title: internal.isActive ? 'Internal deactivated' : 'Internal activated' });
      await loadInternals();
    } catch (err) {
      toast({
        title: internal.isActive ? 'Deactivate failed' : 'Activate failed',
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
          <h1 className="text-2xl font-semibold">Internals</h1>
          <p className="text-sm text-muted-foreground">
            HR/Admin-only workspace. Internal records use a Viettel email and have no login account.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={() => void loadInternals()} disabled={loading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
          <Button type="button" onClick={() => { resetCreateDialog(); setCreateOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Create internal
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <CardTitle className="text-lg">Internal Management</CardTitle>
          <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search name, email, or phone"
                className="pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={(value: StatusFilterValue) => setStatusFilter(value)}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Applications</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created at</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Loading internals...</TableCell></TableRow>
              ) : null}
              {!loading && items.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No internals found.</TableCell></TableRow>
              ) : null}
              {!loading && items.map((internal) => {
                const detailPath = `/candidates/internals/${internal.id}`;
                const isStatusUpdating = statusUpdatingId === internal.id;
                return (
                  <TableRow
                    key={internal.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(detailPath)}
                  >
                    <TableCell className="font-medium">{internal.name ?? '-'}</TableCell>
                    <TableCell className="text-primary underline underline-offset-4">{internal.email}</TableCell>
                    <TableCell>{internal.phone ?? '-'}</TableCell>
                    <TableCell>{internal.applicationCount}</TableCell>
                    <TableCell><Badge className={getStatusBadgeClassName(internal.isActive)}>{getStatusLabel(internal.isActive)}</Badge></TableCell>
                    <TableCell>{formatDate(internal.createdAt)}</TableCell>
                    <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link to={detailPath}><Eye className="mr-2 h-4 w-4" />View</Link>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isStatusUpdating}
                          onClick={(event) => void handleToggleStatus(event, internal)}
                        >
                          {isStatusUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          {internal.isActive ? 'Deactivate' : 'Activate'}
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
            <DialogTitle>Create Internal</DialogTitle>
            <DialogDescription>
              Add an internal referral email. The email is stored as a management record only; no login account is created.
            </DialogDescription>
          </DialogHeader>
            <div className="space-y-4">
            {createError ? <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{createError}</div> : null}
            <div className="space-y-1">
              <Label htmlFor="internal-name">Name</Label>
              <Input
                id="internal-name"
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder="Nguyen Van A"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="internal-email">Viettel email</Label>
              <Input
                id="internal-email"
                type="email"
                value={createEmail}
                onChange={(event) => setCreateEmail(event.target.value)}
                placeholder="name@viettel.com.vn"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="internal-phone">Phone</Label>
              <Input
                id="internal-phone"
                value={createPhone}
                onChange={(event) => setCreatePhone(event.target.value)}
                placeholder="0988123456"
                disabled={submitting}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleCreateDialogChange(false)} disabled={submitting}>Cancel</Button>
            <Button type="button" onClick={() => void handleCreate()} disabled={submitting || !createName.trim() || !createEmail.trim() || !createPhone.trim()}>
              {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</> : <><Plus className="mr-2 h-4 w-4" />Create</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
