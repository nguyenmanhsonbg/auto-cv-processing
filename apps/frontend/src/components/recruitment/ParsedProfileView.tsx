import { ChevronDown, RefreshCw } from 'lucide-react';
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
  onReparse?: () => void;
  reparseLoading?: boolean;
  canReparse?: boolean;
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

function formatExperienceYears(source: Record<string, unknown>) {
  const raw = source.experienceYears ?? source.totalYearsExperience;
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return '-';
  if (value > 3 && value <= 3.5) return '3.5';
  if (value > 3.5) return String(Math.ceil(value));
  return String(value);
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

function cleanDisplayText(value: string) {
  const normalized = value.replace(/\u0000/g, '').trim();
  if (!normalized) return null;
  if (/^\[?\s*redacted\s*\]?$/i.test(normalized)) return null;
  return normalized;
}

function uniqueDisplayTexts(values: string[]) {
  return [...new Set(values.map(cleanDisplayText).filter((item): item is string => Boolean(item)))];
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

function firstText(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string') {
      const normalized = cleanDisplayText(value);
      if (normalized) return normalized;
    }
    if (typeof value === 'number') return String(value);
  }

  return undefined;
}

function splitDetailText(value: string) {
  const chunks = value
    .split(/\r?\n|[\u2022\u25e6\u25aa\u25cf]/)
    .map((item) => item.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);

  return uniqueDisplayTexts(
    chunks.flatMap((chunk) => {
      if (chunk.length < 220) return [chunk];

      const sentences = chunk.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g)
        ?.map((item) => item.trim())
        .filter(Boolean);

      return sentences && sentences.length > 1 ? sentences : [chunk];
    }),
  );
}

function textListFromValue(value: unknown) {
  if (Array.isArray(value)) {
    return uniqueDisplayTexts(
      value.flatMap((item) => {
        const formatted = formatArrayItem(item);
        return formatted ? splitDetailText(formatted) : [];
      }),
    );
  }

  if (typeof value === 'string' && value.trim()) {
    return splitDetailText(value.trim());
  }

  if (typeof value === 'number') return [String(value)];

  return [];
}

function textListFromKeys(source: Record<string, unknown>, keys: string[]) {
  return keys.flatMap((key) => textListFromValue(source[key]));
}

function rawItemsFromKeys(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value) && value.length > 0) return value;
    if (typeof value === 'string' && value.trim()) return [value];
  }

  return [];
}

function periodFromRecord(source: Record<string, unknown>) {
  const duration = firstText(source, ['duration', 'period', 'time']);
  if (duration) return duration;

  const start = firstText(source, ['startYear', 'startDate', 'from']);
  const end = source.endYear === null
    ? 'nay'
    : firstText(source, ['endYear', 'endDate', 'to']);

  if (!start && !end) return undefined;
  return `${start ?? '?'} - ${end ?? 'nay'}`;
}

interface ParsedProjectDetail {
  title: string;
  role?: string;
  period?: string;
  techstack: string[];
  details: string[];
  achievements: string[];
  rawDescription?: string;
}

interface WorkExperienceDetail {
  title: string;
  company?: string;
  role?: string;
  period?: string;
  summary?: string;
  responsibilities: string[];
  achievements: string[];
  rawDescription?: string;
  technologies: string[];
  projects: ParsedProjectDetail[];
}

function readProjectDetails(value: unknown): ParsedProjectDetail[] {
  if (!Array.isArray(value)) return [];

  return value.map((item, index) => {
    if (!isRecord(item)) {
      return {
        title: String(item),
        techstack: [],
        details: [],
        achievements: [],
      };
    }

    const title = firstText(item, ['name', 'projectName', 'title'])
      ?? `Dự án ${index + 1}`;
    const responsibilityDetails = textListFromKeys(item, [
      'responsibilities',
      'duties',
      'tasks',
      'workDone',
    ]);
    const descriptionDetails = textListFromKeys(item, [
      'description',
      'summary',
      'businessDescription',
    ]);

    return {
      title,
      role: firstText(item, ['role', 'position']),
      period: periodFromRecord(item),
      techstack: textListFromKeys(item, ['techstack', 'techStack', 'technologies', 'tools']),
      details: responsibilityDetails.length > 0 ? responsibilityDetails : descriptionDetails,
      achievements: textListFromKeys(item, ['achievements', 'outcomes', 'results']),
      rawDescription: firstText(item, ['rawDescription', 'sourceText', 'evidence']),
    };
  });
}

function readWorkExperienceDetails(source: Record<string, unknown>) {
  const primaryItems = rawItemsFromKeys(source, ['workExperience', 'experience']);
  const rawItems = primaryItems.length > 0
    ? primaryItems
    : rawItemsFromKeys(source, ['projects']);

  return rawItems.map((item, index): WorkExperienceDetail => {
    if (!isRecord(item)) {
      return {
        title: String(item),
        responsibilities: [],
        achievements: [],
        technologies: [],
        projects: [],
      };
    }

    const company = firstText(item, ['company', 'organization', 'employer', 'workplace']);
    const role = firstText(item, ['role', 'position', 'title']);
    const fallbackTitle = firstText(item, ['name', 'projectName']) ?? `Kinh nghiệm ${index + 1}`;
    const title = [role, company].filter(Boolean).join(' - ') || fallbackTitle;

    return {
      title,
      company,
      role,
      period: periodFromRecord(item),
      summary: firstText(item, ['summary', 'description']),
      responsibilities: textListFromKeys(item, [
        'responsibilities',
        'duties',
        'tasks',
        'workDone',
        'activities',
        'whatTheyDid',
      ]),
      achievements: textListFromKeys(item, ['achievements', 'outcomes', 'results']),
      rawDescription: firstText(item, ['rawDescription', 'sourceText', 'evidence']),
      technologies: textListFromKeys(item, [
        'technologies',
        'techstack',
        'techStack',
        'skills',
        'tools',
      ]),
      projects: readProjectDetails(item.projects),
    };
  });
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

function WorkExperienceList({
  values,
  emptyText,
}: {
  values: WorkExperienceDetail[];
  emptyText: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Work experience</p>
      {values.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {values.map((item, index) => {
            const hasDetails = Boolean(
              item.summary
              || item.responsibilities.length
              || item.achievements.length
              || item.rawDescription
              || item.technologies.length
              || item.projects.length,
            );

            return (
              <details
                key={`${item.title}-${index}`}
                className="group rounded-md border bg-muted/20"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    <span className="block break-words">{item.title}</span>
                    {(item.period || item.role || item.company) && (
                      <span className="mt-1 block break-words text-xs font-normal text-muted-foreground">
                        {[item.period, item.role, item.company].filter(Boolean).join(' - ')}
                      </span>
                    )}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>

                <div className="space-y-3 border-t px-3 py-3 text-sm">
                  {!hasDetails && (
                    <p className="text-muted-foreground">
                      Chưa có mô tả chi tiết từ CV cho kinh nghiệm này.
                    </p>
                  )}

                  {item.summary && <p className="break-words">{item.summary}</p>}

                  {item.responsibilities.length > 0 && (
                    <div className="space-y-1">
                      <p className="font-medium">Công việc đã làm</p>
                      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                        {item.responsibilities.map((responsibility, responsibilityIndex) => (
                          <li key={`${responsibility}-${responsibilityIndex}`} className="break-words">
                            {responsibility}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {item.achievements.length > 0 && (
                    <div className="space-y-1">
                      <p className="font-medium">Kết quả</p>
                      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                        {item.achievements.map((achievement, achievementIndex) => (
                          <li key={`${achievement}-${achievementIndex}`} className="break-words">
                            {achievement}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {item.technologies.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {item.technologies.map((technology, technologyIndex) => (
                        <Badge key={`${technology}-${technologyIndex}`} variant="secondary">
                          {technology}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {item.projects.length > 0 && (
                    <div className="space-y-2">
                      <p className="font-medium">Dự án liên quan</p>
                      {item.projects.map((project, projectIndex) => (
                        <div
                          key={`${project.title}-${projectIndex}`}
                          className="rounded-md border bg-background p-3"
                        >
                          <p className="break-words font-medium">{project.title}</p>
                          {(project.period || project.role) && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {[project.period, project.role].filter(Boolean).join(' - ')}
                            </p>
                          )}
                          {project.details.length > 0 && (
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                              {project.details.map((detail, detailIndex) => (
                                <li key={`${detail}-${detailIndex}`} className="break-words">
                                  {detail}
                                </li>
                              ))}
                            </ul>
                          )}
                          {project.achievements.length > 0 && (
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                              {project.achievements.map((achievement, achievementIndex) => (
                                <li key={`${achievement}-${achievementIndex}`} className="break-words">
                                  {achievement}
                                </li>
                              ))}
                            </ul>
                          )}
                          {project.techstack.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {project.techstack.map((technology, technologyIndex) => (
                                <Badge key={`${technology}-${technologyIndex}`} variant="outline">
                                  {technology}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {item.rawDescription && (
                    <div className="space-y-1">
                      <p className="font-medium">Trích từ CV</p>
                      <p className="whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-muted-foreground">
                        {item.rawDescription}
                      </p>
                    </div>
                  )}
                </div>
              </details>
            );
          })}
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
  onReparse,
  reparseLoading = false,
  canReparse = false,
}: ParsedProfileViewProps) {
  const payload = profilePayload(profile);
  const profileId = profile?.parsedProfileId ?? profile?.id;
  const skills = readStringArray(payload, ['skills', 'technicalSkills', 'techStack']);
  const education = readStringArray(payload, ['education', 'educations']);
  const workExperience = readWorkExperienceDetails(payload);
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
            <div className="flex flex-wrap gap-2">
              {onReparse && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canReparse || reparseLoading}
                  onClick={onReparse}
                  title={!canReparse ? 'A sanitized current CV is required' : 'Parse the current CV again'}
                >
                  <RefreshCw className={cn('mr-2 h-4 w-4', reparseLoading && 'animate-spin')} />
                  {reparseLoading ? 'Re-parsing...' : 'Re-parse CV'}
                </Button>
              )}
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
                  value={formatExperienceYears(payload)}
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
                <WorkExperienceList
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
