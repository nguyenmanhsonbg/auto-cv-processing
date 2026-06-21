import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  JobDescriptionPostingOption,
  JobPostingPayload,
  JobPostingRecord,
} from '@/lib/recruitment-api';

const NO_JOB_DESCRIPTION_VALUE = '__no_job_description__';

interface JobPostingFormProps {
  mode: 'create' | 'edit';
  initialValue?: JobPostingRecord | null;
  submitting?: boolean;
  jobDescriptionOptions?: JobDescriptionPostingOption[];
  jobDescriptionOptionsLoading?: boolean;
  jobDescriptionOptionsError?: string | null;
  onSubmit: (payload: JobPostingPayload) => void | Promise<void>;
  onCancel?: () => void;
}

interface FormErrors {
  jobDescriptionId?: string;
  jobDescriptionVersionId?: string;
  title?: string;
  publicSlug?: string;
  openAt?: string;
  closeAt?: string;
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function formatDateTimeLocal(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function dateTimeLocalToIso(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function optionLabel(option: JobDescriptionPostingOption) {
  return option.versionNo ? `${option.title} - v${option.versionNo}` : option.title;
}

function optionMeta(option: JobDescriptionPostingOption) {
  const position = option.position?.name ?? option.position?.displayName;
  const level = option.level?.displayName ?? option.level?.name;
  const details = [position, level].filter(Boolean).join(' / ');
  const status = option.readyForPosting ? 'Ready for posting' : option.readinessLabel;
  return [details, status].filter(Boolean).join(' - ');
}

function fallbackVersionLabel(initialValue?: JobPostingRecord | null) {
  const title = initialValue?.jobDescriptionVersion?.jobDescription?.title
    ?? initialValue?.jobDescription?.title;
  const versionNo = initialValue?.jobDescriptionVersion?.versionNo;

  if (title && versionNo) return `${title} - v${versionNo}`;
  if (title) return title;
  return initialValue?.jobDescriptionVersionId ?? 'Fixed JD version';
}

export function JobPostingForm({
  mode,
  initialValue,
  submitting = false,
  jobDescriptionOptions = [],
  jobDescriptionOptionsLoading = false,
  jobDescriptionOptionsError = null,
  onSubmit,
  onCancel,
}: JobPostingFormProps) {
  const initialVersionId = useMemo(
    () => initialValue?.jobDescriptionVersionId ?? '',
    [initialValue],
  );
  const initialJobDescriptionId = useMemo(
    () => (
      initialValue?.jobDescriptionId
      ?? initialValue?.jobDescriptionVersion?.jobDescriptionId
      ?? ''
    ),
    [initialValue],
  );
  const [jobDescriptionId, setJobDescriptionId] = useState('');
  const [jobDescriptionVersionId, setJobDescriptionVersionId] = useState('');
  const [title, setTitle] = useState('');
  const [publicSlug, setPublicSlug] = useState('');
  const [openAt, setOpenAt] = useState('');
  const [closeAt, setCloseAt] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    setJobDescriptionId(
      initialValue?.jobDescriptionId
      ?? initialValue?.jobDescriptionVersion?.jobDescriptionId
      ?? '',
    );
    setJobDescriptionVersionId(initialValue?.jobDescriptionVersionId ?? '');
    setTitle(initialValue?.title ?? '');
    setPublicSlug(initialValue?.publicSlug ?? '');
    setOpenAt(formatDateTimeLocal(initialValue?.openAt));
    setCloseAt(formatDateTimeLocal(initialValue?.closeAt));
    setSlugTouched(Boolean(initialValue?.publicSlug));
    setErrors({});
  }, [initialValue]);

  const displayedJobDescriptionOptions = useMemo(() => {
    if (
      !initialJobDescriptionId
      || jobDescriptionOptions.some((option) => option.jobDescriptionId === initialJobDescriptionId)
    ) {
      return jobDescriptionOptions;
    }

    return [
      {
        jobDescriptionId: initialJobDescriptionId,
        jobDescriptionVersionId: initialVersionId || undefined,
        title: fallbackVersionLabel(initialValue),
        versionNo: initialValue?.jobDescriptionVersion?.versionNo,
        status: initialValue?.jobDescription?.status
          ?? initialValue?.jobDescriptionVersion?.jobDescription?.status
          ?? null,
        readyForPosting: true,
      },
      ...jobDescriptionOptions,
    ];
  }, [initialJobDescriptionId, initialValue, initialVersionId, jobDescriptionOptions]);

  const selectedJobDescriptionOption = useMemo(
    () => displayedJobDescriptionOptions.find(
      (option) => option.jobDescriptionId === jobDescriptionId,
    ),
    [displayedJobDescriptionOptions, jobDescriptionId],
  );

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!slugTouched) {
      setPublicSlug(slugify(value));
    }
  };

  const handleSlugChange = (value: string) => {
    setSlugTouched(true);
    setPublicSlug(slugify(value));
  };

  const handleJobDescriptionSelect = (value: string) => {
    if (value === NO_JOB_DESCRIPTION_VALUE) return;

    const option = displayedJobDescriptionOptions.find((item) => item.jobDescriptionId === value);
    if (!option || option.status === 'ARCHIVED' || option.status === 'JD_ARCHIVED') return;

    setJobDescriptionId(option.jobDescriptionId);
    setJobDescriptionVersionId(option.jobDescriptionVersionId ?? '');
    if (!slugTouched) {
      setTitle(option.title);
      setPublicSlug(slugify(option.title));
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors: FormErrors = {};
    const normalizedTitle = title.trim();
    const normalizedSlug = publicSlug.trim();
    const normalizedJobDescriptionId = jobDescriptionId.trim();
    const normalizedVersionId = jobDescriptionVersionId.trim();
    const parsedOpenAt = dateTimeLocalToIso(openAt);
    const parsedCloseAt = dateTimeLocalToIso(closeAt);

    if (mode === 'create' && !normalizedJobDescriptionId) {
      nextErrors.jobDescriptionId = 'Job description is required.';
    }
    if (
      mode === 'create'
      && (
        selectedJobDescriptionOption?.status === 'ARCHIVED'
        || selectedJobDescriptionOption?.status === 'JD_ARCHIVED'
      )
    ) {
      nextErrors.jobDescriptionId = 'Archived job description cannot be used for posting.';
    }
    if (!normalizedTitle) nextErrors.title = 'Title is required.';
    if (!normalizedSlug) nextErrors.publicSlug = 'Public slug is required.';
    if (parsedOpenAt === undefined) nextErrors.openAt = 'Open time is invalid.';
    if (parsedCloseAt === undefined) nextErrors.closeAt = 'Close time is invalid.';
    if (parsedOpenAt && parsedCloseAt && new Date(parsedCloseAt) <= new Date(parsedOpenAt)) {
      nextErrors.closeAt = 'Close time must be after open time.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    void onSubmit({
      jobDescriptionId: normalizedJobDescriptionId || undefined,
      jobDescriptionVersionId: normalizedVersionId || undefined,
      title: normalizedTitle,
      publicSlug: normalizedSlug,
      openAt: parsedOpenAt ?? null,
      closeAt: parsedCloseAt ?? null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="posting-version">Job Description</Label>
        <Select
          value={jobDescriptionId || NO_JOB_DESCRIPTION_VALUE}
          onValueChange={handleJobDescriptionSelect}
          disabled={submitting || mode === 'edit' || jobDescriptionOptionsLoading}
        >
          <SelectTrigger id="posting-version">
            <SelectValue
              placeholder={
                jobDescriptionOptionsLoading
                  ? 'Loading job descriptions...'
                  : (initialVersionId || initialJobDescriptionId) && mode === 'edit'
                    ? fallbackVersionLabel(initialValue)
                    : 'Select job description'
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_JOB_DESCRIPTION_VALUE} disabled>
              {jobDescriptionOptionsLoading ? 'Loading job descriptions...' : 'Select job description'}
            </SelectItem>
            {displayedJobDescriptionOptions.length === 0 ? (
              <SelectItem value="__empty_job_descriptions__" disabled>
                No job descriptions found
              </SelectItem>
            ) : (
              displayedJobDescriptionOptions.map((option) => {
                const meta = optionMeta(option);
                const disabled = option.status === 'ARCHIVED' || option.status === 'JD_ARCHIVED';

                return (
                  <SelectItem
                    key={option.jobDescriptionId}
                    value={option.jobDescriptionId}
                    disabled={disabled}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{optionLabel(option)}</span>
                      {meta && (
                        <span className="truncate text-xs text-muted-foreground">
                          {meta}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                );
              })
            )}
          </SelectContent>
        </Select>
        {mode === 'edit' && initialVersionId && (
          <p className="text-xs text-muted-foreground">
            Posting version is fixed after creation.
          </p>
        )}
        {mode === 'create' && selectedJobDescriptionOption?.readinessLabel && (
          <p className="text-xs text-amber-700">
            {selectedJobDescriptionOption.readinessLabel}.
          </p>
        )}
        {mode === 'create' && jobDescriptionOptionsError && (
          <p className="text-sm text-destructive">{jobDescriptionOptionsError}</p>
        )}
        {errors.jobDescriptionId && (
          <p className="text-sm text-destructive">{errors.jobDescriptionId}</p>
        )}
        {errors.jobDescriptionVersionId && (
          <p className="text-sm text-destructive">{errors.jobDescriptionVersionId}</p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="posting-title">Title</Label>
          <Input
            id="posting-title"
            value={title}
            onChange={(event) => handleTitleChange(event.target.value)}
            placeholder="Senior Backend Developer"
            disabled={submitting}
          />
          {errors.title && <p className="text-sm text-destructive">{errors.title}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="posting-slug">Public slug</Label>
          <Input
            id="posting-slug"
            value={publicSlug}
            onChange={(event) => handleSlugChange(event.target.value)}
            placeholder="senior-backend-developer"
            disabled={submitting}
          />
          {errors.publicSlug && (
            <p className="text-sm text-destructive">{errors.publicSlug}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="posting-open-at">Open at</Label>
          <Input
            id="posting-open-at"
            type="datetime-local"
            value={openAt}
            onChange={(event) => setOpenAt(event.target.value)}
            disabled={submitting}
          />
          {errors.openAt && <p className="text-sm text-destructive">{errors.openAt}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="posting-close-at">Close at</Label>
          <Input
            id="posting-close-at"
            type="datetime-local"
            value={closeAt}
            onChange={(event) => setCloseAt(event.target.value)}
            disabled={submitting}
          />
          {errors.closeAt && <p className="text-sm text-destructive">{errors.closeAt}</p>}
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          <Save className="mr-2 h-4 w-4" />
          {submitting
            ? 'Saving...'
            : mode === 'create'
              ? 'Create posting'
              : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
