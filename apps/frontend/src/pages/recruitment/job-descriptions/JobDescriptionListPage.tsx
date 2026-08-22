import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, Plus, RefreshCw, Search } from 'lucide-react';
import { JobDescriptionForm } from '@/components/recruitment/JobDescriptionForm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { secureRandomUUID } from '@/lib/secure-random';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  RecruitmentListFooter,
  RecruitmentTableBody,
} from '@/components/recruitment/RecruitmentListPrimitives';
import { toast } from '@/components/ui/use-toast';
import { getInternalSafeErrorMessage } from '@/lib/api-errors';
import {
  createJobDescription,
  listLevels,
  listJobDescriptions,
  listPositions,
  syncVcsPortalJobDescriptions,
  type JobDescriptionPayload,
  type JobDescriptionRecord,
  type RecruitmentReferenceRecord,
  type RecruitmentPagination,
} from '@/lib/recruitment-api';
import { cn } from '@/lib/utils';
import { formatRecruitmentLocalDateTime } from '@/lib/date-time';

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ACTIVE', label: 'Ready' },
  { value: 'READY', label: 'Ready (contract)' },
  { value: 'ARCHIVED', label: 'Archived' },
];

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Ready',
  READY: 'Ready',
  ARCHIVED: 'Archived',
  JD_DRAFT: 'Draft',
  JD_READY: 'Ready',
  JD_ARCHIVED: 'Archived',
};

function getJobDescriptionId(item: JobDescriptionRecord) {
  return item.id ?? item.jobDescriptionId ?? '';
}

function getStatusLabel(status?: string | null) {
  if (!status) return 'Unknown';
  return STATUS_LABELS[status] ?? status;
}

function getStatusClassName(status?: string | null) {
  switch (status) {
    case 'ACTIVE':
    case 'READY':
    case 'JD_READY':
      return 'bg-green-100 text-green-800';
    case 'DRAFT':
    case 'JD_DRAFT':
      return 'bg-blue-100 text-blue-800';
    case 'ARCHIVED':
    case 'JD_ARCHIVED':
      return 'bg-slate-100 text-slate-700';
    default:
      return 'bg-secondary text-secondary-foreground';
  }
}

function relationLabel(
  relation?: JobDescriptionRecord['position'] | JobDescriptionRecord['level'],
  fallback?: string | null,
) {
  return relation?.displayName ?? relation?.name ?? fallback ?? '-';
}

function newIdempotencyKey() {
  return secureRandomUUID();
}

export function JobDescriptionListPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<JobDescriptionRecord[]>([]);
  const [pagination, setPagination] = useState<RecruitmentPagination | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [positions, setPositions] = useState<RecruitmentReferenceRecord[]>([]);
  const [levels, setLevels] = useState<RecruitmentReferenceRecord[]>([]);
  const [referencesLoading, setReferencesLoading] = useState(false);
  const [referencesError, setReferencesError] = useState<string | null>(null);
  const [syncingPortal, setSyncingPortal] = useState(false);

  const loadJobDescriptions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await listJobDescriptions({
        page,
        limit: PAGE_SIZE,
        search,
        status: status === 'all' ? undefined : status,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      });
      setItems(result.data);
      setPagination(result.pagination);
    } catch (err) {
      setItems([]);
      setPagination(undefined);
      setError(getInternalSafeErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    void loadJobDescriptions();
  }, [loadJobDescriptions]);

  const loadReferences = useCallback(async () => {
    setReferencesLoading(true);
    setReferencesError(null);

    try {
      const [positionsResult, levelsResult] = await Promise.all([
        listPositions({
          page: 1,
          limit: 100,
          status: 'ACTIVE',
          sortBy: 'name',
          sortOrder: 'ASC',
        }),
        listLevels({
          page: 1,
          limit: 100,
          status: 'ACTIVE',
          sortBy: 'orderIndex',
          sortOrder: 'ASC',
        }),
      ]);

      setPositions(positionsResult.data);
      setLevels(levelsResult.data);
    } catch (err) {
      setPositions([]);
      setLevels([]);
      setReferencesError(getInternalSafeErrorMessage(err));
    } finally {
      setReferencesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReferences();
  }, [loadReferences]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleSyncPortal = async () => {
    setSyncingPortal(true);
    try {
      const result = await syncVcsPortalJobDescriptions();
      toast({
        title: 'Đồng bộ portal thành công',
        description: `Đã tạo ${result.createdCount}, cập nhật ${result.updatedCount} JD.`,
      });
      await loadJobDescriptions();
    } catch (err) {
      toast({
        title: 'Đồng bộ portal thất bại',
        description: getInternalSafeErrorMessage(err),
        variant: 'destructive',
      });
    } finally {
      setSyncingPortal(false);
    }
  };

  const handleCreate = async (payload: JobDescriptionPayload) => {
    setSubmitting(true);
    try {
      const created = await createJobDescription(payload, newIdempotencyKey());
      toast({ title: 'Job description created' });
      setCreateOpen(false);
      await loadJobDescriptions();

      const createdId = getJobDescriptionId(created);
      if (createdId) {
        navigate(`/recruitment/job-descriptions/${createdId}`);
      }
    } catch (err) {
      toast({
        title: 'Create failed',
        description: getInternalSafeErrorMessage(err),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Recruitment workspace</p>
          <h1 className="text-2xl font-semibold">Job Descriptions</h1>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadJobDescriptions()}
            disabled={loading || syncingPortal}
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
          <Button
            type="button"
            onClick={() => {
              setCreateOpen(true);
              void loadReferences();
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create JD
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <CardTitle className="text-lg">JD Management</CardTitle>
          <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
            <form onSubmit={handleSearch} className="flex gap-2">
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search title, summary, or description"
                className="min-w-0"
              />
              <Button type="submit" variant="outline" disabled={loading}>
                <Search className="mr-2 h-4 w-4" />
                Search
              </Button>
            </form>
            <div className="flex gap-2">
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleSyncPortal()}
                disabled={loading || syncingPortal}
                className="shrink-0"
              >
                <RefreshCw className={cn('mr-2 h-4 w-4', syncingPortal && 'animate-spin')} />
                Đồng bộ portal
              </Button>
            </div>
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
                <TableHead>Title</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <RecruitmentTableBody
              items={items}
              loading={loading}
              colSpan={7}
              loadingMessage="Loading job descriptions..."
              emptyMessage="No job descriptions found."
              getRowKey={(item) => getJobDescriptionId(item) || item.title}
              renderRow={(item) => {
                const id = getJobDescriptionId(item);

                return (
                  <TableRow key={id || item.title}>
                    <TableCell className="font-medium">
                      {id ? (
                        <Link
                          to={`/recruitment/job-descriptions/${id}`}
                          className="hover:underline"
                        >
                          {item.title}
                        </Link>
                      ) : (
                        item.title
                      )}
                    </TableCell>
                    <TableCell>{relationLabel(item.position, item.positionId)}</TableCell>
                    <TableCell>{relationLabel(item.level, item.levelId)}</TableCell>
                    <TableCell>
                      <Badge className={getStatusClassName(item.status)}>
                        {getStatusLabel(item.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatRecruitmentLocalDateTime(item.createdAt)}</TableCell>
                    <TableCell>{formatRecruitmentLocalDateTime(item.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      {id ? (
                        <Button asChild variant="outline" size="sm">
                          <Link to={`/recruitment/job-descriptions/${id}`}>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </Link>
                        </Button>
                      ) : (
                        <Button type="button" variant="outline" size="sm" disabled>
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              }}
            />
          </Table>

          <RecruitmentListFooter
            itemCount={items.length}
            page={page}
            pagination={pagination}
            loading={loading}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Job Description</DialogTitle>
            <DialogDescription>
              Create a draft job description for the recruitment workspace.
            </DialogDescription>
          </DialogHeader>
          <JobDescriptionForm
            mode="create"
            submitting={submitting}
            positionOptions={positions}
            levelOptions={levels}
            referenceOptionsLoading={referencesLoading}
            referenceOptionsError={referencesError}
            onCancel={() => setCreateOpen(false)}
            onSubmit={handleCreate}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
