import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, RefreshCw, Search, X } from 'lucide-react';
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
import { getInternalSafeErrorMessage } from '@/lib/api-errors';
import {
  listApplications,
  type ApplicationListRecord,
  type RecruitmentPagination,
} from '@/lib/recruitment-api';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'APPLICATION_CREATED', label: 'Application created' },
  { value: 'CV_UPLOADED', label: 'CV uploaded' },
  { value: 'CV_SCAN_REQUESTED', label: 'CV scan requested' },
  { value: 'CV_SCAN_PASSED', label: 'CV scan passed' },
  { value: 'CV_SANITIZED', label: 'CV sanitized' },
  { value: 'CV_PARSED', label: 'CV parsed' },
  { value: 'MAPPING_DONE', label: 'Mapping done' },
  { value: 'FORM_SENT', label: 'Form sent' },
  { value: 'FORM_SUBMITTED', label: 'Form submitted' },
  { value: 'AI_SCREENING_DONE', label: 'AI done' },
  { value: 'WAITING_HR_REVIEW', label: 'Waiting HR review' },
  { value: 'HR_APPROVED', label: 'HR approved' },
  { value: 'HR_REJECTED', label: 'HR rejected' },
  { value: 'TALENT_POOL', label: 'Talent pool' },
];

const SOURCE_CHANNEL_OPTIONS = [
  { value: 'all', label: 'All channels' },
  { value: 'VCS_PORTAL', label: 'VCS Portal' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'LINKEDIN', label: 'LinkedIn' },
  { value: 'TOPCV', label: 'TopCV' },
  { value: 'VIETNAMWORKS', label: 'VietnamWorks' },
  { value: 'MANUAL', label: 'Manual' },
  { value: 'OTHER', label: 'Other' },
];

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

function valueOrDash(value?: string | number | null) {
  if (value === undefined || value === null || value === '') return '-';
  return String(value);
}

function scoreLabel(value?: number | null) {
  return typeof value === 'number' ? `${value}` : '-';
}

export function ApplicationListPage() {
  const [items, setItems] = useState<ApplicationListRecord[]>([]);
  const [pagination, setPagination] = useState<RecruitmentPagination | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [jobPostingInput, setJobPostingInput] = useState('');
  const [jobPostingId, setJobPostingId] = useState('');
  const [status, setStatus] = useState('all');
  const [sourceChannel, setSourceChannel] = useState('all');
  const [page, setPage] = useState(1);

  const loadApplications = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await listApplications({
        page,
        limit: PAGE_SIZE,
        search,
        status: status === 'all' ? undefined : status,
        sourceChannel: sourceChannel === 'all' ? undefined : sourceChannel,
        jobPostingId: jobPostingId || undefined,
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
  }, [jobPostingId, page, search, sourceChannel, status]);

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
    setJobPostingId(jobPostingInput.trim());
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setJobPostingInput('');
    setJobPostingId('');
    setStatus('all');
    setSourceChannel('all');
    setPage(1);
  };

  const totalPages = pagination?.totalPages ?? 1;
  const canPrevious = page > 1 && !loading;
  const canNext = page < totalPages && !loading;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Recruitment workspace</p>
          <h1 className="text-2xl font-semibold">Applications</h1>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadApplications()}
          disabled={loading}
        >
          <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <CardTitle className="text-lg">Application Work Queue</CardTitle>
          <form onSubmit={handleSearch} className="grid gap-3 xl:grid-cols-[1fr_260px_220px_220px_auto]">
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search candidate, email, phone, job, external ID"
              className="min-w-0"
            />
            <Input
              value={jobPostingInput}
              onChange={(event) => setJobPostingInput(event.target.value)}
              placeholder="Job posting ID"
              className="min-w-0"
            />
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
            <Select
              value={sourceChannel}
              onValueChange={(value) => {
                setSourceChannel(value);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_CHANNEL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button type="submit" variant="outline" disabled={loading}>
                <Search className="mr-2 h-4 w-4" />
                Search
              </Button>
              <Button type="button" variant="ghost" onClick={clearFilters} disabled={loading}>
                <X className="mr-2 h-4 w-4" />
                Clear
              </Button>
            </div>
          </form>
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
                <TableHead>Candidate</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Scores</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                    Loading applications...
                  </TableCell>
                </TableRow>
              )}

              {!loading && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                    No applications found.
                  </TableCell>
                </TableRow>
              )}

              {!loading && items.map((item) => (
                <TableRow key={item.applicationId}>
                  <TableCell className="font-medium">
                    <Link
                      to={`/recruitment/applications/${item.applicationId}`}
                      className="hover:underline"
                    >
                      {valueOrDash(item.candidate?.fullName)}
                    </Link>
                  </TableCell>
                  <TableCell>{valueOrDash(item.candidate?.email)}</TableCell>
                  <TableCell>{valueOrDash(item.candidate?.phone)}</TableCell>
                  <TableCell>
                    {item.jobPosting?.jobPostingId ? (
                      <Link
                        to={`/recruitment/job-postings/${item.jobPosting.jobPostingId}`}
                        className="hover:underline"
                      >
                        {valueOrDash(item.jobPosting.title)}
                      </Link>
                    ) : valueOrDash(item.jobPosting?.title)}
                  </TableCell>
                  <TableCell>
                    <Badge className={getApplicationStatusClassName(item.status)}>
                      {getApplicationStatusLabel(item.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>{valueOrDash(item.sourceChannel)}</TableCell>
                  <TableCell>
                    <span className="text-muted-foreground">
                      M {scoreLabel(item.mappingScore)} / AI {scoreLabel(item.aiScreeningScore)}
                    </span>
                  </TableCell>
                  <TableCell>{formatDate(item.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/recruitment/applications/${item.applicationId}`}>
                        <Eye className="mr-2 h-4 w-4" />
                        View
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
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
    </div>
  );
}
