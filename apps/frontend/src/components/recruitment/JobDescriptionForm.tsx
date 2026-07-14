import { type FormEvent, useEffect, useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import type {
  JobDescriptionPayload,
  JobDescriptionRecord,
  RecruitmentReferenceRecord,
} from '@/lib/recruitment-api';

const NO_REFERENCE_VALUE = '__none__';

interface JobDescriptionFormProps {
  mode: 'create' | 'edit';
  initialValue?: JobDescriptionRecord | null;
  submitting?: boolean;
  positionOptions?: RecruitmentReferenceRecord[];
  levelOptions?: RecruitmentReferenceRecord[];
  referenceOptionsLoading?: boolean;
  referenceOptionsError?: string | null;
  onSubmit: (payload: JobDescriptionPayload) => void | Promise<void>;
  onCancel?: () => void;
}

interface FormErrors {
  title?: string;
  summary?: string;
  description?: string;
  requirements?: string;
  benefits?: string;
}

function getReferenceId(option: Partial<RecruitmentReferenceRecord>) {
  return option.id ?? '';
}

function getReferenceLabel(option: Partial<RecruitmentReferenceRecord>) {
  return option.displayName ?? option.name ?? option.id ?? 'Untitled';
}

function ensureSelectedReferenceOption(
  options: RecruitmentReferenceRecord[],
  selectedId: string,
  selectedRelation?: JobDescriptionRecord['position'] | JobDescriptionRecord['level'] | null,
) {
  const normalizedOptions = options.filter((option) => Boolean(getReferenceId(option)));

  if (
    !selectedId
    || normalizedOptions.some((option) => getReferenceId(option) === selectedId)
  ) {
    return normalizedOptions;
  }

  return [
    {
      id: selectedId,
      name: selectedRelation?.name ?? selectedId,
      displayName: selectedRelation?.displayName ?? selectedRelation?.name ?? selectedId,
      description: selectedRelation?.description ?? null,
    },
    ...normalizedOptions,
  ];
}

function structuredValueToText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;

  if (
    typeof value === 'object'
    && !Array.isArray(value)
    && value !== null
    && Object.keys(value).length === 1
    && typeof (value as Record<string, unknown>).text === 'string'
  ) {
    return (value as { text: string }).text;
  }

  return JSON.stringify(value, null, 2);
}

function parseStructuredObject(
  value: string,
  fieldName: string,
  required: boolean,
): { value?: Record<string, unknown> | null; error?: string } {
  const trimmed = value.trim();

  if (!trimmed) {
    return required
      ? { error: `${fieldName} is required.` }
      : { value: null };
  }

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return { value: parsed as Record<string, unknown> };
      }

      return { error: `${fieldName} must be a JSON object.` };
    } catch {
      return { error: `${fieldName} contains invalid JSON.` };
    }
  }

  return { value: { text: trimmed } };
}

export function JobDescriptionForm({
  mode,
  initialValue,
  submitting = false,
  positionOptions = [],
  levelOptions = [],
  referenceOptionsLoading = false,
  referenceOptionsError = null,
  onSubmit,
  onCancel,
}: JobDescriptionFormProps) {
  const [title, setTitle] = useState('');
  const [positionId, setPositionId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState('');
  const [benefits, setBenefits] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    setTitle(initialValue?.title ?? '');
    setPositionId(initialValue?.positionId ?? '');
    setLevelId(initialValue?.levelId ?? '');
    setSummary(initialValue?.summary ?? '');
    setDescription(initialValue?.description ?? '');
    setRequirements(structuredValueToText(initialValue?.requirements));
    setBenefits(structuredValueToText(initialValue?.benefits));
    setErrors({});
  }, [initialValue]);

  const positionSelectOptions = ensureSelectedReferenceOption(
    positionOptions,
    positionId,
    initialValue?.position,
  );
  const levelSelectOptions = ensureSelectedReferenceOption(
    levelOptions,
    levelId,
    initialValue?.level,
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors: FormErrors = {};
    const normalizedTitle = title.trim();
    const normalizedSummary = summary.trim();
    const normalizedDescription = description.trim();
    const normalizedRequirements = requirements.trim();
    const parsedBenefits = parseStructuredObject(benefits, 'Benefits', false);

    if (!normalizedTitle) nextErrors.title = 'Title is required.';
    if (!normalizedSummary) nextErrors.summary = 'Mô tả tóm tắt là bắt buộc.';
    if (normalizedSummary.length > 500) {
      nextErrors.summary = 'Mô tả tóm tắt công việc tối đa 500 ký tự.';
    }
    if (!normalizedDescription) nextErrors.description = 'Mô tả chung về công việc là bắt buộc.';
    if (!normalizedRequirements) nextErrors.requirements = 'Requirements is required.';
    if (parsedBenefits.error) nextErrors.benefits = parsedBenefits.error;

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    void onSubmit({
      title: normalizedTitle,
      positionId: positionId.trim() || null,
      levelId: levelId.trim() || null,
      summary: normalizedSummary,
      description: normalizedDescription,
      requirements: normalizedRequirements,
      benefits: parsedBenefits.value ?? null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="jd-title">Title</Label>
          <Input
            id="jd-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Backend Developer"
            disabled={submitting}
          />
          {errors.title && <p className="text-sm text-destructive">{errors.title}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="jd-position">Position</Label>
          <Select
            value={positionId || NO_REFERENCE_VALUE}
            onValueChange={(value) => {
              setPositionId(value === NO_REFERENCE_VALUE ? '' : value);
            }}
            disabled={submitting || referenceOptionsLoading}
          >
            <SelectTrigger id="jd-position">
              <SelectValue placeholder="Select position" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_REFERENCE_VALUE}>No position</SelectItem>
              {positionSelectOptions.map((option) => {
                const optionId = getReferenceId(option);

                return (
                  <SelectItem key={optionId} value={optionId}>
                    {getReferenceLabel(option)}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="jd-level">Level</Label>
          <Select
            value={levelId || NO_REFERENCE_VALUE}
            onValueChange={(value) => {
              setLevelId(value === NO_REFERENCE_VALUE ? '' : value);
            }}
            disabled={submitting || referenceOptionsLoading}
          >
            <SelectTrigger id="jd-level">
              <SelectValue placeholder="Select level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_REFERENCE_VALUE}>No level</SelectItem>
              {levelSelectOptions.map((option) => {
                const optionId = getReferenceId(option);

                return (
                  <SelectItem key={optionId} value={optionId}>
                    {getReferenceLabel(option)}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {referenceOptionsLoading && (
        <p className="text-sm text-muted-foreground">Loading position and level options...</p>
      )}
      {referenceOptionsError && (
        <p className="text-sm text-destructive">{referenceOptionsError}</p>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="jd-summary">Mô tả tóm tắt</Label>
          <span className="text-xs text-muted-foreground">{summary.length}/500</span>
        </div>
        <Textarea
          id="jd-summary"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Mô tả tóm tắt công việc tối đa 500 ký tự"
          disabled={submitting}
        />
        {errors.summary && <p className="text-sm text-destructive">{errors.summary}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="jd-description">Mô tả chung về công việc</Label>
        <Textarea
          id="jd-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={5}
          placeholder="Nói về những công việc mà vị trí đang đảm nhận"
          disabled={submitting}
        />
        {errors.description && <p className="text-sm text-destructive">{errors.description}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="jd-requirements">Requirements</Label>
        <Textarea
          id="jd-requirements"
          value={requirements}
          onChange={(event) => setRequirements(event.target.value)}
          rows={6}
          placeholder="Plain text requirements"
          disabled={submitting}
        />
        {errors.requirements && <p className="text-sm text-destructive">{errors.requirements}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="jd-benefits">Benefits</Label>
        <Textarea
          id="jd-benefits"
          value={benefits}
          onChange={(event) => setBenefits(event.target.value)}
          rows={4}
          placeholder='Optional plain text or JSON object, for example: {"workingMode":"HYBRID"}'
          disabled={submitting}
        />
        {errors.benefits && <p className="text-sm text-destructive">{errors.benefits}</p>}
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
              ? 'Create draft'
              : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
