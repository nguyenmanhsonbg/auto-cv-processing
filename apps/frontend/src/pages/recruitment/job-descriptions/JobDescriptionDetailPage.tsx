import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle,
  Edit,
  History,
  RefreshCw,
} from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { getInternalSafeErrorMessage } from '@/lib/api-errors';
import {
  createJobDescriptionVersion,
  getJobDescription,
  listLevels,
  listJobDescriptionVersions,
  listPositions,
  markJobDescriptionReady,
  updateJobDescription,
  type JobDescriptionPayload,
  type JobDescriptionRecord,
  type JobDescriptionVersionRecord,
  type RecruitmentReferenceRecord,
} from '@/lib/recruitment-api';
import { cn } from '@/lib/utils';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Ready',
  READY: 'Ready',
  ARCHIVED: 'Archived',
  JD_DRAFT: 'Draft',
  JD_READY: 'Ready',
  JD_ARCHIVED: 'Archived',
};

function newIdempotencyKey(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getJobDescriptionId(item?: JobDescriptionRecord | null) {
  return item?.id ?? item?.jobDescriptionId ?? '';
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
    case 'SUPERSEDED':
      return 'bg-amber-100 text-amber-800';
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

function relationLabel(
  relation?: JobDescriptionRecord['position'] | JobDescriptionRecord['level'],
  fallback?: string | null,
) {
  return relation?.displayName ?? relation?.name ?? fallback ?? '-';
}

function authorLabel(author?: JobDescriptionVersionRecord['createdBy'] | null) {
  return author?.name ?? author?.email ?? author?.id ?? '-';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function structuredText(value: unknown) {
  if (value === undefined || value === null || value === '') return '-';
  if (typeof value === 'string') return value;

  if (
    isRecord(value)
    && Object.keys(value).length === 1
    && typeof value.text === 'string'
  ) {
    return value.text;
  }

  return JSON.stringify(value, null, 2);
}

function snapshotTitle(snapshot: unknown) {
  if (!isRecord(snapshot)) return '-';

  const jobDescription = snapshot.jobDescription;
  if (isRecord(jobDescription) && typeof jobDescription.title === 'string') {
    return jobDescription.title;
  }

  return typeof snapshot.title === 'string' ? snapshot.title : '-';
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function StructuredSection({
  title,
  value,
}: {
  title: string;
  value: unknown;
}) {
  return (
    <section className="rounded-lg border p-4">
      <h2 className="text-base font-semibold">{title}</h2>
      <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-6 text-muted-foreground">
        {structuredText(value)}
      </pre>
    </section>
  );
}

export function JobDescriptionDetailPage() {
  const { id } = useParams();
  const [jobDescription, setJobDescription] = useState<JobDescriptionRecord | null>(null);
  const [versions, setVersions] = useState<JobDescriptionVersionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [changeNote, setChangeNote] = useState('');
  const [changeNoteError, setChangeNoteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [markReadySubmitting, setMarkReadySubmitting] = useState(false);
  const [positions, setPositions] = useState<RecruitmentReferenceRecord[]>([]);
  const [levels, setLevels] = useState<RecruitmentReferenceRecord[]>([]);
  const [referencesLoading, setReferencesLoading] = useState(false);
  const [referencesError, setReferencesError] = useState<string | null>(null);

  const loadVersions = useCallback(async () => {
    if (!id) return;
    setVersionsLoading(true);
    setVersionsError(null);

    try {
      const data = await listJobDescriptionVersions(id);
      setVersions(data);
    } catch (err) {
      setVersions([]);
      setVersionsError(getInternalSafeErrorMessage(err));
    } finally {
      setVersionsLoading(false);
    }
  }, [id]);

  const loadDetail = useCallback(async () => {
    if (!id) {
      setError('Job description id is missing.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getJobDescription(id);
      setJobDescription(data);
    } catch (err) {
      setJobDescription(null);
      setError(getInternalSafeErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  const reload = useCallback(async () => {
    await loadDetail();
    await loadVersions();
  }, [loadDetail, loadVersions]);

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
    void reload();
  }, [reload]);

  useEffect(() => {
    if (editOpen) {
      void loadReferences();
    }
  }, [editOpen, loadReferences]);

  const handleUpdate = async (payload: JobDescriptionPayload) => {
    if (!id) return;
    setSubmitting(true);

    try {
      await updateJobDescription(id, payload, newIdempotencyKey('jd-update'));
      toast({ title: 'Job description updated' });
      setEditOpen(false);
      await reload();
    } catch (err) {
      toast({
        title: 'Update failed',
        description: getInternalSafeErrorMessage(err),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateVersion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id) return;

    const normalizedChangeNote = changeNote.trim();
    if (!normalizedChangeNote) {
      setChangeNoteError('Change note is required.');
      return;
    }

    setSubmitting(true);
    setChangeNoteError(null);

    try {
      await createJobDescriptionVersion(
        id,
        normalizedChangeNote,
        newIdempotencyKey('jd-version'),
      );
      toast({ title: 'Version snapshot created' });
      setVersionOpen(false);
      setChangeNote('');
      await loadVersions();
    } catch (err) {
      toast({
        title: 'Create version failed',
        description: getInternalSafeErrorMessage(err),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkReady = async () => {
    if (!id) return;
    const confirmed = window.confirm('Mark this job description as ready?');
    if (!confirmed) return;

    setMarkReadySubmitting(true);
    try {
      await markJobDescriptionReady(id, newIdempotencyKey('jd-ready'));
      toast({ title: 'Job description marked ready' });
      await reload();
    } catch (err) {
      toast({
        title: 'Mark ready failed',
        description: getInternalSafeErrorMessage(err),
        variant: 'destructive',
      });
    } finally {
      setMarkReadySubmitting(false);
    }
  };

  const status = jobDescription?.status;
  const readyLike = status === 'ACTIVE' || status === 'READY' || status === 'JD_READY';
  const archivedLike = status === 'ARCHIVED' || status === 'JD_ARCHIVED';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link to="/recruitment/job-descriptions">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to list
            </Link>
          </Button>
          <div>
            <p className="text-sm text-muted-foreground">Recruitment workspace</p>
            <h1 className="text-2xl font-semibold">
              {jobDescription?.title ?? 'Job Description Detail'}
            </h1>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => void reload()}
            disabled={loading || versionsLoading}
          >
            <RefreshCw
              className={cn('mr-2 h-4 w-4', (loading || versionsLoading) && 'animate-spin')}
            />
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEditOpen(true);
              void loadReferences();
            }}
            disabled={!jobDescription || loading}
          >
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setVersionOpen(true)}
            disabled={!jobDescription || loading}
          >
            <History className="mr-2 h-4 w-4" />
            Snapshot
          </Button>
          <Button
            type="button"
            onClick={() => void handleMarkReady()}
            disabled={!jobDescription || readyLike || archivedLike || markReadySubmitting}
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            {markReadySubmitting ? 'Marking...' : 'Mark ready'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-lg border p-6 text-sm text-muted-foreground">
          Loading job description...
        </div>
      )}

      {!loading && jobDescription && (
        <>
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-lg">Overview</CardTitle>
                <Badge className={getStatusClassName(status)}>
                  {getStatusLabel(status)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailField
                  label="Position"
                  value={relationLabel(jobDescription.position, jobDescription.positionId)}
                />
                <DetailField
                  label="Level"
                  value={relationLabel(jobDescription.level, jobDescription.levelId)}
                />
                <DetailField label="Created" value={formatDate(jobDescription.createdAt)} />
                <DetailField label="Updated" value={formatDate(jobDescription.updatedAt)} />
              </div>
              <Separator />
              <DetailField
                label="Job description ID"
                value={getJobDescriptionId(jobDescription) || '-'}
              />
            </CardContent>
          </Card>

          <StructuredSection title="Mô tả tóm tắt" value={jobDescription.summary} />
          <StructuredSection title="Mô tả chung về công việc" value={jobDescription.description} />
          <StructuredSection title="Requirements" value={jobDescription.requirements} />
          <StructuredSection title="Benefits" value={jobDescription.benefits} />
        </>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg">Version History</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadVersions()}
              disabled={versionsLoading || !id}
            >
              <RefreshCw className={cn('mr-2 h-4 w-4', versionsLoading && 'animate-spin')} />
              Refresh versions
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {versionsError && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {versionsError}
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Snapshot title</TableHead>
                <TableHead>Created by</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versionsLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                    Loading versions...
                  </TableCell>
                </TableRow>
              )}

              {!versionsLoading && versions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                    No versions found.
                  </TableCell>
                </TableRow>
              )}

              {!versionsLoading && versions.map((version) => {
                const versionId =
                  version.id
                  ?? version.jobDescriptionVersionId
                  ?? `${version.versionNo ?? 'version'}-${version.createdAt ?? ''}`;

                return (
                  <TableRow key={versionId}>
                    <TableCell className="font-medium">
                      {version.versionNo ? `v${version.versionNo}` : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusClassName(version.status)}>
                        {getStatusLabel(version.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{snapshotTitle(version.snapshot)}</TableCell>
                    <TableCell>{authorLabel(version.createdBy)}</TableCell>
                    <TableCell>{formatDate(version.createdAt)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Job Description</DialogTitle>
            <DialogDescription>
              Update the draft job description before creating a version snapshot.
            </DialogDescription>
          </DialogHeader>
          <JobDescriptionForm
            mode="edit"
            initialValue={jobDescription}
            submitting={submitting}
            positionOptions={positions}
            levelOptions={levels}
            referenceOptionsLoading={referencesLoading}
            referenceOptionsError={referencesError}
            onCancel={() => setEditOpen(false)}
            onSubmit={handleUpdate}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={versionOpen}
        onOpenChange={(open) => {
          setVersionOpen(open);
          if (!open) {
            setChangeNoteError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Version Snapshot</DialogTitle>
            <DialogDescription>
              Store the current JD content as an immutable version for downstream recruitment flows.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateVersion} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="jd-change-note">Change note</Label>
              <Textarea
                id="jd-change-note"
                value={changeNote}
                onChange={(event) => setChangeNote(event.target.value)}
                rows={4}
                disabled={submitting}
              />
              {changeNoteError && (
                <p className="text-sm text-destructive">{changeNoteError}</p>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setVersionOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                <History className="mr-2 h-4 w-4" />
                {submitting ? 'Creating...' : 'Create snapshot'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
