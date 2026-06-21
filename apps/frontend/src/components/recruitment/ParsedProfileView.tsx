import { RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { ParsedProfileRecord } from '@/lib/recruitment-api';
import { cn } from '@/lib/utils';

interface ParsedProfileViewProps {
  profile?: ParsedProfileRecord | null;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function profilePayload(profile?: ParsedProfileRecord | null) {
  const payload = profile?.parsedData ?? profile?.profile;
  return isRecord(payload) ? payload : {};
}

function readString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number') return String(value);
  }

  return '-';
}

function readStringArray(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) {
      return value
        .map(formatArrayItem)
        .filter((item): item is string => Boolean(item));
    }

    if (typeof value === 'string' && value.trim()) {
      return [value];
    }
  }

  return [];
}

function formatArrayItem(item: unknown) {
  if (typeof item === 'string' || typeof item === 'number') {
    return String(item);
  }

  if (!isRecord(item)) return null;

  const summaryKeys = [
    'name',
    'title',
    'role',
    'position',
    'company',
    'school',
    'degree',
    'field',
    'duration',
    'years',
  ];
  const parts = summaryKeys
    .map((key) => item[key])
    .filter((value): value is string | number => (
      typeof value === 'string' || typeof value === 'number'
    ))
    .map((value) => String(value).trim())
    .filter(Boolean);

  return parts.length > 0 ? parts.join(' - ') : null;
}

function readRecordEntries(source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (!isRecord(value)) return [];

  return Object.entries(value)
    .filter(([, item]) => (
      typeof item === 'string'
      || typeof item === 'number'
      || typeof item === 'boolean'
    ))
    .map(([entryKey, item]) => ({
      key: entryKey,
      value: String(item),
    }));
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

function valueOrDash(value?: string | number | boolean | null) {
  if (value === undefined || value === null || value === '') return '-';
  return String(value);
}

function safeExtractedKeys(source: Record<string, unknown>) {
  const blocked = new Set([
    'rawText',
    'normalizedText',
    'error',
    'stack',
    'storageKey',
    'storagePath',
    'filePath',
  ]);

  return Object.keys(source).filter((key) => !blocked.has(key));
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
      <p className="mt-1 break-words font-medium">{value}</p>
    </div>
  );
}

function ChipList({
  label,
  values,
  emptyText,
}: {
  label: string;
  values: string[];
  emptyText: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{label}</p>
      {values.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {values.map((value) => (
            <Badge key={value} variant="secondary">
              {value}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function ParsedProfileView({
  profile,
  loading = false,
  error,
  onRefresh,
}: ParsedProfileViewProps) {
  const payload = profilePayload(profile);
  const profileId = profile?.parsedProfileId ?? profile?.id;
  const skills = readStringArray(payload, ['skills', 'technicalSkills', 'techStack']);
  const education = readStringArray(payload, ['education', 'educations']);
  const workExperience = readStringArray(payload, [
    'workExperience',
    'experience',
    'projects',
  ]);
  const languages = readStringArray(payload, ['languages']);
  const warnings = profile?.warnings ?? readStringArray(payload, ['warnings']);
  const experienceByLanguage = readRecordEntries(payload, 'experienceByLanguage');
  const extractedKeys = safeExtractedKeys(payload);
  const hasHiddenText = Boolean(
    profile?.rawText
    || profile?.normalizedText
    || payload.rawText
    || payload.normalizedText,
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg">Parsed Profile</CardTitle>
            {onRefresh && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={onRefresh}
              >
                <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
                Refresh
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {loading && (
            <div className="rounded-md border p-4 text-sm text-muted-foreground">
              Loading parsed profile...
            </div>
          )}

          {!loading && !profile && (
            <div className="rounded-md border p-4 text-sm text-muted-foreground">
              No parsed profile is available for this application.
            </div>
          )}

          {profile && (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailField label="Profile ID" value={valueOrDash(profileId)} />
                <DetailField label="CV document" value={valueOrDash(profile.cvDocumentId)} />
                <DetailField label="Candidate ID" value={valueOrDash(profile.candidateId)} />
                <DetailField label="Parser version" value={valueOrDash(profile.parserVersion)} />
                <DetailField label="Created" value={formatDate(profile.createdAt)} />
                <DetailField
                  label="Text hash recorded"
                  value={valueOrDash(profile.normalizedTextHashRecorded ?? Boolean(profile.normalizedTextHash))}
                />
                <DetailField label="Parse confidence" value={valueOrDash(profile.parseConfidence)} />
                <DetailField label="Status" value={valueOrDash(profile.status)} />
              </div>

              <Separator />

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailField
                  label="Name"
                  value={readString(payload, ['name', 'fullName', 'candidateName'])}
                />
                <DetailField label="Email" value={readString(payload, ['email'])} />
                <DetailField label="Phone" value={readString(payload, ['phone', 'phoneNumber'])} />
                <DetailField
                  label="Experience years"
                  value={readString(payload, ['experienceYears', 'totalYearsExperience'])}
                />
                <DetailField label="Level" value={readString(payload, ['level', 'seniority'])} />
                <DetailField
                  label="Current company"
                  value={readString(payload, ['currentCompany', 'company'])}
                />
              </div>

              <Separator />

              <div className="grid gap-5 lg:grid-cols-2">
                <ChipList
                  label="Skills"
                  values={skills}
                  emptyText="No skills extracted."
                />
                <ChipList
                  label="Education"
                  values={education}
                  emptyText="No education extracted."
                />
                <ChipList
                  label="Work experience"
                  values={workExperience}
                  emptyText="No work experience summary extracted."
                />
                <ChipList
                  label="Languages"
                  values={languages}
                  emptyText="No languages extracted."
                />
              </div>

              {experienceByLanguage.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Experience by language</p>
                    <div className="flex flex-wrap gap-2">
                      {experienceByLanguage.map((entry) => (
                        <Badge key={entry.key} variant="secondary">
                          {entry.key}: {entry.value}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {warnings.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Parser warnings</p>
                    <div className="space-y-2">
                      {warnings.map((warning) => (
                        <div
                          key={warning}
                          className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
                        >
                          {warning}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <Separator />

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Extracted field keys</p>
                {extractedKeys.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No structured fields recorded.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {extractedKeys.map((key) => (
                      <Badge key={key} variant="outline">
                        {key}
                      </Badge>
                    ))}
                  </div>
                )}
                {hasHiddenText && (
                  <p className="text-sm text-muted-foreground">
                    Raw and normalized CV text are hidden from this UI.
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
