import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, ExternalLink, Plus, RefreshCw, Search } from 'lucide-react';
import { JobPostingForm } from '@/components/recruitment/JobPostingForm';
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
  createJobDescriptionVersion,
  createJobPosting,
  listJobPostings,
  listReadyJobDescriptionOptions,
  markJobDescriptionReady,
  type JobDescriptionPostingOption,
  type JobPostingPayload,
  type JobPostingRecord,
  type RecruitmentPagination,
} from '@/lib/recruitment-api';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHING', label: 'Publishing' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'PUBLISH_FAILED', label: 'Publish failed' },
  { value: 'MANUAL_REQUIRED', label: 'Manual required' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'ARCHIVED', label: 'Archived' },
];

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PUBLISHING: 'Publishing',
  PUBLISHED: 'Published',
  PUBLISH_FAILED: 'Publish failed',
  MANUAL_REQUIRED: 'Manual required',
  CLOSED: 'Closed',
  ARCHIVED: 'Archived',
};

function getJobPostingId(item: JobPostingRecord) {
  return item.id ?? item.jobPostingId ?? '';
}

function getStatusLabel(status?: string | null) {
  if (!status) return 'Unknown';
  return STATUS_LABELS[status] ?? status;
}

function getStatusClassName(status?: string | null) {
  switch (status) {
    case 'PUBLISHED':
      return 'bg-green-100 text-green-800';
    case 'PUBLISHING':
      return 'bg-blue-100 text-blue-800';
    case 'DRAFT':
      return 'bg-slate-100 text-slate-700';
    case 'MANUAL_REQUIRED':
      return 'bg-amber-100 text-amber-800';
    case 'PUBLISH_FAILED':
      return 'bg-red-100 text-red-800';
    case 'CLOSED':
    case 'ARCHIVED':
      return 'bg-zinc-100 text-zinc-700';
    default:
      return 'bg-secondary text-secondary-foreground';
  }
}

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

function relatedJobTitle(item: JobPostingRecord) {
  return item.jobDescription?.title
    ?? item.jobDescriptionVersion?.jobDescription?.title
    ?? item.jobDescriptionId
    ?? '-';
}

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `posting-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function JobPostingListPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<JobPostingRecord[]>([]);
  const [pagination, setPagination] = useState<RecruitmentPagination | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [jobDescriptionOptions, setJobDescriptionOptions] = useState<JobDescriptionPostingOption[]>([]);
  const [jobDescriptionOptionsLoading, setJobDescriptionOptionsLoading] = useState(false);
  const [jobDescriptionOptionsError, setJobDescriptionOptionsError] = useState<string | null>(null);

  const loadJobPostings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await listJobPostings({
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
    void loadJobPostings();
  }, [loadJobPostings]);

  const loadJobDescriptionOptions = useCallback(async () => {
    setJobDescriptionOptionsLoading(true);
    setJobDescriptionOptionsError(null);

    try {
      const options = await listReadyJobDescriptionOptions();
      setJobDescriptionOptions(options);
    } catch (err) {
      setJobDescriptionOptions([]);
      setJobDescriptionOptionsError(getInternalSafeErrorMessage(err));
    } finally {
      setJobDescriptionOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobDescriptionOptions();
  }, [loadJobDescriptionOptions]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const prepareJobDescriptionVersion = async (payload: JobPostingPayload) => {
    if (payload.jobDescriptionVersionId) return payload.jobDescriptionVersionId;

    if (!payload.jobDescriptionId) {
      throw new Error('Job description is required.');
    }

    const selectedOption = jobDescriptionOptions.find(
      (option) => option.jobDescriptionId === payload.jobDescriptionId,
    );
    if (selectedOption?.status === 'ARCHIVED' || selectedOption?.status === 'JD_ARCHIVED') {
      throw new Error('Archived job description cannot be used for posting.');
    }

    if (
      selectedOption?.status !== 'ACTIVE'
      && selectedOption?.status !== 'READY'
      && selectedOption?.status !== 'JD_READY'
    ) {
      await markJobDescriptionReady(payload.jobDescriptionId, newIdempotencyKey());
    }

    const version = await createJobDescriptionVersion(
      payload.jobDescriptionId,
      'Snapshot created from job posting flow.',
      newIdempotencyKey(),
    );
    const versionId = version.id ?? version.jobDescriptionVersionId;
    if (!versionId) {
      throw new Error('Created job description version id is missing.');
    }

    await loadJobDescriptionOptions();
    return versionId;
  };

  const handleCreate = async (payload: JobPostingPayload) => {
    setSubmitting(true);
    try {
      const jobDescriptionVersionId = await prepareJobDescriptionVersion(payload);
      const created = await createJobPosting(
        {
          ...payload,
          jobDescriptionVersionId,
        },
        newIdempotencyKey(),
      );
      toast({ title: 'Job posting created' });
      setCreateOpen(false);
      await loadJobPostings();

      const createdId = getJobPostingId(created);
      if (createdId) {
        navigate(`/recruitment/job-postings/${createdId}`);
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

  const totalPages = pagination?.totalPages ?? 1;
  const canPrevious = page > 1 && !loading;
  const canNext = page < totalPages && !loading;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Recruitment workspace</p>
          <h1 className="text-2xl font-semibold">Job Postings</h1>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadJobPostings()}
            disabled={loading}
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
          <Button
            type="button"
            onClick={() => {
              setCreateOpen(true);
              void loadJobDescriptionOptions();
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create posting
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <CardTitle className="text-lg">Posting Management</CardTitle>
          <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
            <form onSubmit={handleSearch} className="flex gap-2">
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search title or slug"
                className="min-w-0"
              />
              <Button type="submit" variant="outline" disabled={loading}>
                <Search className="mr-2 h-4 w-4" />
                Search
              </Button>
            </form>
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
                <TableHead>Status</TableHead>
                <TableHead>Public slug</TableHead>
                <TableHead>JD</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Open</TableHead>
                <TableHead>Close</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    Loading job postings...
                  </TableCell>
                </TableRow>
              )}

              {!loading && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    No job postings found.
                  </TableCell>
                </TableRow>
              )}

              {!loading && items.map((item) => {
                const id = getJobPostingId(item);

                return (
                  <TableRow key={id || item.publicSlug || item.title}>
                    <TableCell className="font-medium">
                      {id ? (
                        <Link
                          to={`/recruitment/job-postings/${id}`}
                          className="hover:underline"
                        >
                          {item.title}
                        </Link>
                      ) : (
                        item.title
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusClassName(item.status)}>
                        {getStatusLabel(item.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {item.publicSlug ? (
                        <Link
                          to={`/jobs/${item.publicSlug}`}
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          {item.publicSlug}
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      ) : '-'}
                    </TableCell>
                    <TableCell>{relatedJobTitle(item)}</TableCell>
                    <TableCell>{item.jobDescriptionVersionId ?? '-'}</TableCell>
                    <TableCell>{formatDate(item.openAt)}</TableCell>
                    <TableCell>{formatDate(item.closeAt)}</TableCell>
                    <TableCell className="text-right">
                      {id ? (
                        <Button asChild variant="outline" size="sm">
                          <Link to={`/recruitment/job-postings/${id}`}>
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
              })}
            </TableBody>
          </Table>

          <div className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              {pagination
                ? `Page ${pagination.page} of ${pagination.totalPages} - ${pagination.total} total`
                : `${items.length} result${items.length === 1 ? '' : 's'}`}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canPrevious}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canNext}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create Job Posting</DialogTitle>
            <DialogDescription>
              Create a public-facing posting from an active job description version.
            </DialogDescription>
          </DialogHeader>
          <JobPostingForm
            mode="create"
            submitting={submitting}
            jobDescriptionOptions={jobDescriptionOptions}
            jobDescriptionOptionsLoading={jobDescriptionOptionsLoading}
            jobDescriptionOptionsError={jobDescriptionOptionsError}
            onCancel={() => setCreateOpen(false)}
            onSubmit={handleCreate}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
