import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  Copy,
  ExternalLink,
  Check,
  Hourglass,
  Printer,
  Sparkles,
} from 'lucide-react';
import {
  ApplicationOverview,
  getApplicationStatusClassName,
  getApplicationStatusLabel,
} from '@/components/recruitment/ApplicationOverview';
import { ApplicationAuditLog } from '@/components/recruitment/ApplicationAuditLog';
import { CvProcessingPanel } from '@/components/recruitment/CvProcessingPanel';
import { CvVersionHistory } from '@/components/recruitment/CvVersionHistory';
import { ParsedProfileView } from '@/components/recruitment/ParsedProfileView';
import { CandidateAiMatchPreview } from '@/components/recruitment/CandidateAiMatchPreview';
import { WorkflowTimeline } from '@/components/recruitment/WorkflowTimeline';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getInternalSafeErrorMessage } from '@/lib/api-errors';
import { createAiMatchPreviewPdfBlob, exportAiMatchPreviewToPdf, pdfBlobToBase64 } from '@/lib/print-ai-match-preview';
import {
  getApplication,
  getParsedProfile,
  listApplicationAuditLogs,
  listApplicationTimeline,
  listCvVersions,
  parseApplicationCv,
  runApplicationAiScreening,
  type ApplicationAiScreeningInsight,
  type ApplicationAiScreeningSummary,
  type ApplicationAuditLogRecord,
  type ApplicationDetailRecord,
  type ApplicationMappingSummary,
  type ApplicationTimelineRecord,
  type CvVersionRecord,
  type ParsedProfileRecord,
  type RecruitmentPagination,
} from '@/lib/recruitment-api';
import { cn } from '@/lib/utils';
import type { ParsedProfile } from '@interview-assistant/shared';
import { useToast } from '@/components/ui/use-toast';
import {
  getFormDetailsForAdmin,
  generateFormSession,
  type FormAdminDetails,
} from '@/lib/forms-api';

const EXTENSION_PDF_REQUEST_SOURCE = 'vcs-recruitment-extension';
const EXTENSION_PDF_REQUEST = 'VCS_EXPORT_AI_MATCH_PREVIEW_PDF_FROM_PAGE';
const EXTENSION_PDF_RESULT = 'VCS_EXPORT_AI_MATCH_PREVIEW_PDF_RESULT';

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

function DetailField({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-1 break-words font-medium">{value}</div>
    </div>
  );
}

function AssessmentBadge({ label }: { label?: string | null }) {
  if (!label) return null;

  return (
    <Badge variant="outline" className="shrink-0 text-[11px]">
      {label}
    </Badge>
  );
}

function AiAssessmentList({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items?: ApplicationAiScreeningInsight[];
  emptyLabel: string;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">{title}</h4>
      {items?.length ? (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div
              key={`${title}-${index}`}
              className="rounded-md border bg-muted/20 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">
                  {item.title || `${title} ${index + 1}`}
                </p>
                <AssessmentBadge label={item.confidence ?? item.severity} />
              </div>
              {item.evidence ? (
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {item.evidence}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      )}
    </div>
  );
}

function ApplicationAiMatchResult({
  mapping,
  aiScreening,
  parsedProfile,
  screeningLoading,
  onRunAiScreening,
}: {
  mapping?: ApplicationMappingSummary | null;
  aiScreening?: ApplicationAiScreeningSummary | null;
  parsedProfile?: ParsedProfileRecord | null;
  screeningLoading: boolean;
  onRunAiScreening: () => void;
}) {
  const hasAiResult = Boolean(
    aiScreening?.summary ||
      aiScreening?.score != null ||
      aiScreening?.recommendation ||
      aiScreening?.strengths?.length ||
      aiScreening?.gaps?.length ||
      aiScreening?.risks?.length,
  );

  return (
    <div className="max-h-[72vh] space-y-5 overflow-y-auto pr-1">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">CV-JD Mapping</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Score" value={scoreLabel(mapping?.score)} />
            <DetailField label="Status" value={valueOrDash(mapping?.status)} />
            <DetailField
              label="Recommendation"
              value={valueOrDash(mapping?.recommendation)}
            />
            <DetailField label="Updated" value={formatDate(mapping?.createdAt)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">AI Screening</CardTitle>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRunAiScreening}
              disabled={screeningLoading}
            >
              <Sparkles
                className={cn(
                  'mr-2 h-4 w-4',
                  screeningLoading && 'animate-pulse',
                )}
              />
              {screeningLoading ? 'Running...' : hasAiResult ? 'Refresh AI' : 'Run AI'}
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Score" value={scoreLabel(aiScreening?.score)} />
            <DetailField label="Status" value={valueOrDash(aiScreening?.status)} />
            <DetailField
              label="Recommendation"
              value={valueOrDash(aiScreening?.recommendation)}
            />
            <DetailField label="Updated" value={formatDate(aiScreening?.createdAt)} />
          </CardContent>
        </Card>
      </div>

      <ParsedProfileView profile={parsedProfile} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Candidate Assessment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {aiScreening?.summary ? (
            <div>
              <p className="text-sm text-muted-foreground">Summary</p>
              <p className="mt-1 text-sm leading-6">{aiScreening.summary}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Run AI screening to see candidate assessment and reviewer notes.
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <AiAssessmentList
              title="Strengths"
              items={aiScreening?.strengths}
              emptyLabel="No strengths recorded yet."
            />
            <AiAssessmentList
              title="Gaps"
              items={aiScreening?.gaps}
              emptyLabel="No gaps recorded yet."
            />
            <AiAssessmentList
              title="Risks"
              items={aiScreening?.risks}
              emptyLabel="No risks recorded yet."
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

void ApplicationAiMatchResult;

type FormDisplayStatus =
  | 'NOT_SENT'
  | 'MISSING_QUESTION_SET'
  | 'CREATED'
  | 'SENT'
  | 'OPENED'
  | 'SUBMITTED'
  | 'EXPIRED'
  | 'CANCELLED'
  | string;

function getFormDisplayStatus(formDetails?: FormAdminDetails | null): FormDisplayStatus {
  if (!formDetails) return 'NOT_SENT';
  if (!formDetails.questions?.length) return 'MISSING_QUESTION_SET';
  return formDetails.status;
}

function getFormStatusLabel(status: FormDisplayStatus) {
  const labels: Record<string, string> = {
    NOT_SENT: 'Not sent',
    MISSING_QUESTION_SET: 'Missing question set',
    CREATED: 'Created',
    SENT: 'Sent',
    OPENED: 'Opened',
    SUBMITTED: 'Submitted',
    EXPIRED: 'Expired',
    CANCELLED: 'Cancelled',
  };

  return labels[status] ?? status;
}

function getFormStatusClassName(status: FormDisplayStatus) {
  switch (status) {
    case 'SUBMITTED':
      return 'bg-green-500/10 text-green-500 border-green-500/20';
    case 'SENT':
      return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    case 'OPENED':
      return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    case 'EXPIRED':
    case 'MISSING_QUESTION_SET':
      return 'bg-red-500/10 text-red-500 border-red-500/20';
    case 'NOT_SENT':
    case 'CREATED':
    case 'CANCELLED':
      return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

export function ApplicationDetailPage() {
  const { toast } = useToast();
  const { applicationId } = useParams();
  const [application, setApplication] = useState<ApplicationDetailRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cvVersions, setCvVersions] = useState<CvVersionRecord[]>([]);
  const [cvLoading, setCvLoading] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);
  const [parsedProfile, setParsedProfile] = useState<ParsedProfileRecord | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<ApplicationTimelineRecord[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<ApplicationAuditLogRecord[]>([]);
  const [auditPagination, setAuditPagination] = useState<RecruitmentPagination | undefined>();
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [screeningLoading, setScreeningLoading] = useState(false);
  const [parseLoading, setParseLoading] = useState(false);
  const [matchResultOpen, setMatchResultOpen] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const aiMatchPreviewDialogRef = useRef<HTMLDivElement>(null);

  const [formDetails, setFormDetails] = useState<FormAdminDetails | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [lastGeneratedUrl, setLastGeneratedUrl] = useState<string | null>(null);

  const loadApplication = useCallback(async () => {
    if (!applicationId) {
      setError('Application id is missing.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getApplication(applicationId);
      setApplication(data);
    } catch (err) {
      setApplication(null);
      setError(getInternalSafeErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  const loadCvVersions = useCallback(async () => {
    if (!applicationId) {
      setCvError('Application id is missing.');
      return;
    }

    setCvLoading(true);
    setCvError(null);

    try {
      const data = await listCvVersions(applicationId);
      setCvVersions(data);
    } catch (err) {
      setCvVersions([]);
      setCvError(getInternalSafeErrorMessage(err));
    } finally {
      setCvLoading(false);
    }
  }, [applicationId]);

  const loadParsedProfile = useCallback(async () => {
    if (!applicationId) {
      setProfileError('Application id is missing.');
      return;
    }

    setProfileLoading(true);
    setProfileError(null);

    try {
      const data = await getParsedProfile(applicationId);
      setParsedProfile(data);
    } catch (err) {
      setParsedProfile(null);
      setProfileError(getInternalSafeErrorMessage(err));
    } finally {
      setProfileLoading(false);
    }
  }, [applicationId]);

  const loadTimeline = useCallback(async () => {
    if (!applicationId) {
      setTimelineError('Application id is missing.');
      return;
    }

    setTimelineLoading(true);
    setTimelineError(null);

    try {
      const data = await listApplicationTimeline(applicationId, { limit: 100, offset: 0 });
      setTimelineEvents(data);
    } catch (err) {
      setTimelineEvents([]);
      setTimelineError(getInternalSafeErrorMessage(err));
    } finally {
      setTimelineLoading(false);
    }
  }, [applicationId]);

  const loadAuditLogs = useCallback(async () => {
    if (!applicationId) {
      setAuditError('Application id is missing.');
      return;
    }

    setAuditLoading(true);
    setAuditError(null);

    try {
      const result = await listApplicationAuditLogs(applicationId, { page: 1, limit: 20 });
      setAuditLogs(result.data);
      setAuditPagination(result.pagination);
    } catch (err) {
      setAuditLogs([]);
      setAuditPagination(undefined);
      setAuditError(getInternalSafeErrorMessage(err));
    } finally {
      setAuditLoading(false);
    }
  }, [applicationId]);

  const loadFormDetails = useCallback(async () => {
    if (!applicationId) return;
    setFormLoading(true);
    setFormError(null);
    try {
      const data = await getFormDetailsForAdmin(applicationId);
      setFormDetails(data);
    } catch (err) {
      setFormDetails(null);
      setFormError(getInternalSafeErrorMessage(err));
    } finally {
      setFormLoading(false);
    }
  }, [applicationId]);

  const refreshAll = useCallback(() => {
    void loadApplication();
    void loadCvVersions();
    void loadParsedProfile();
    void loadTimeline();
    void loadAuditLogs();
    void loadFormDetails();
  }, [
    loadApplication,
    loadAuditLogs,
    loadCvVersions,
    loadParsedProfile,
    loadTimeline,
    loadFormDetails,
  ]);

  const runAiScreening = useCallback(async () => {
    if (!applicationId) return;

    setScreeningLoading(true);
    try {
      const updated = await runApplicationAiScreening(applicationId);
      setApplication(updated);
      // AI screening also generates and persists parsed-profile anomaly data.
      // Reload that resource so the preview does not keep rendering the old profile.
      await loadParsedProfile();
      toast({
        title: 'AI screening completed',
        description: 'CV-JD mapping, AI recommendation, and anomaly analysis have been refreshed.',
      });
      void loadTimeline();
      void loadAuditLogs();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'AI screening failed',
        description: getInternalSafeErrorMessage(err),
      });
    } finally {
      setScreeningLoading(false);
    }
  }, [applicationId, loadAuditLogs, loadParsedProfile, loadTimeline, toast]);

  const reparseCurrentCv = useCallback(async () => {
    const cvDocumentId = application?.cv?.currentCvDocumentId;
    if (!applicationId || !cvDocumentId) return;

    setParseLoading(true);
    try {
      await parseApplicationCv(applicationId, cvDocumentId);
      await loadParsedProfile();
      toast({
        title: 'CV parsed again',
        description: 'The parsed profile has been updated from the current CV.',
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'CV parse failed',
        description: getInternalSafeErrorMessage(err),
      });
    } finally {
      setParseLoading(false);
    }
  }, [application?.cv?.currentCvDocumentId, applicationId, loadParsedProfile, toast]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const candidate = application?.candidate;
  const jobPosting = application?.jobPosting;
  const cv = application?.cv;
  const mapping = application?.mapping;
  const form = application?.form;
  const aiScreening = application?.aiScreening;
  const sources = application?.sources ?? [];
  const formDisplayStatus = getFormDisplayStatus(formDetails);
  const isMissingQuestionSet = formDisplayStatus === 'MISSING_QUESTION_SET';

  const exportAiMatchPdf = useCallback(async () => {
    if (pdfExporting) return;

    setPdfExporting(true);
    try {
      await exportAiMatchPreviewToPdf({
        profile: (parsedProfile?.parsedData ?? parsedProfile?.profile) as ParsedProfile | undefined,
        mapping,
        screening: aiScreening,
        candidate,
        filename: `ai-match-preview-${candidate?.fullName ?? 'candidate'}.pdf`,
      });
      toast({
        title: 'Đã tải PDF',
        description: 'Bản preview AI Match đã được tải xuống.',
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Không thể xuất PDF',
        description: getInternalSafeErrorMessage(err),
      });
    } finally {
      setPdfExporting(false);
    }
  }, [aiScreening, candidate, mapping, parsedProfile, pdfExporting, toast]);

  useEffect(() => {
    const handleExtensionPdfRequest = (event: MessageEvent<unknown>) => {
      if (event.source !== window || typeof event.data !== 'object' || event.data === null) return;
      const message = event.data as { source?: unknown; type?: unknown; requestId?: unknown; applicationId?: unknown };
      if (
        message.source !== EXTENSION_PDF_REQUEST_SOURCE
        || message.type !== EXTENSION_PDF_REQUEST
        || typeof message.requestId !== 'string'
        || message.applicationId !== applicationId
      ) return;

      void (async () => {
        try {
          const blob = await createAiMatchPreviewPdfBlob({
            profile: (parsedProfile?.parsedData ?? parsedProfile?.profile) as ParsedProfile | undefined,
            mapping,
            screening: aiScreening,
            candidate,
          });
          const dataBase64 = await pdfBlobToBase64(blob);
          window.postMessage({
            source: 'vcs-recruitment-frontend',
            type: EXTENSION_PDF_RESULT,
            requestId: message.requestId,
            ok: true,
            dataBase64,
          }, window.location.origin);
        } catch (error) {
          window.postMessage({
            source: 'vcs-recruitment-frontend',
            type: EXTENSION_PDF_RESULT,
            requestId: message.requestId,
            ok: false,
            error: error instanceof Error ? error.message : 'Could not create AI Match Preview PDF.',
          }, window.location.origin);
        }
      })();
    };

    window.addEventListener('message', handleExtensionPdfRequest);
    return () => window.removeEventListener('message', handleExtensionPdfRequest);
  }, [aiScreening, applicationId, candidate, mapping, parsedProfile]);

  if (!loading && !application && error) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link to="/recruitment/applications">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to list
          </Link>
        </Button>
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6">
          <h1 className="text-lg font-semibold text-destructive">Application not found</h1>
          <p className="mt-2 text-sm text-destructive/80">{error}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            Check the application ID in the address bar and try again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link to="/recruitment/applications">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to list
            </Link>
          </Button>
          <div>
            <p className="text-sm text-muted-foreground">Recruitment workspace</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <h1 className="text-2xl font-semibold">
                {candidate?.fullName ?? 'Application Detail'}
              </h1>
              {application?.status && (
                <Badge className={getApplicationStatusClassName(application.status)}>
                  {getApplicationStatusLabel(application.status)}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setMatchResultOpen(true)}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Preview AI Match
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={refreshAll}
            disabled={loading || cvLoading || profileLoading || timelineLoading || auditLoading}
          >
            <RefreshCw
              className={cn(
                'mr-2 h-4 w-4',
                (loading || cvLoading || profileLoading || timelineLoading || auditLoading)
                  && 'animate-spin',
              )}
            />
            Refresh
          </Button>
        </div>
      </div>

      <Dialog open={matchResultOpen} onOpenChange={setMatchResultOpen}>
        <DialogContent ref={aiMatchPreviewDialogRef} className="ai-match-preview-dialog flex max-h-[90vh] max-w-4xl flex-col">
          <DialogHeader className="pr-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle>
                  AI Match Preview{candidate?.fullName ? ` - ${candidate.fullName}` : ''}
                </DialogTitle>
                <DialogDescription>
                  CV-JD matching and AI screening result for this application.
                </DialogDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ai-match-preview-export-button shrink-0"
                onClick={() => void exportAiMatchPdf()}
                disabled={pdfExporting}
              >
                <Printer className="mr-2 h-4 w-4" />
                {pdfExporting ? 'Đang tạo PDF...' : 'Xuất PDF'}
              </Button>
            </div>
          </DialogHeader>
          <CandidateAiMatchPreview
            profile={(parsedProfile?.parsedData ?? parsedProfile?.profile) as ParsedProfile | undefined}
            mapping={mapping}
            aiScreening={aiScreening}
            candidate={candidate}
          />
        </DialogContent>
      </Dialog>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-lg border p-6 text-sm text-muted-foreground">
          Loading application...
        </div>
      )}

      {!loading && application && (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="flex h-auto flex-wrap justify-start">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="candidate">Candidate</TabsTrigger>
            <TabsTrigger value="job">Job</TabsTrigger>
            <TabsTrigger value="cv-processing">CV Processing</TabsTrigger>
            <TabsTrigger value="parsed-profile">Parsed Profile</TabsTrigger>
            <TabsTrigger value="cv-versions">CV Versions</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="form-questionnaire">Questionnaire Form</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <ApplicationOverview application={application} />
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Process Snapshot</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailField label="CV scan" value={valueOrDash(cv?.scanStatus)} />
                <DetailField label="CV sanitize" value={valueOrDash(cv?.sanitizeStatus)} />
                <DetailField label="CV parse" value={valueOrDash(cv?.parseStatus)} />
                <DetailField label="Current CV" value={valueOrDash(cv?.currentCvDocumentId)} />
                <DetailField label="Mapping status" value={valueOrDash(mapping?.status)} />
                <DetailField label="Mapping recommendation" value={valueOrDash(mapping?.recommendation)} />
                <DetailField label="Form status" value={valueOrDash(form?.status)} />
                <DetailField label="AI status" value={valueOrDash(aiScreening?.status)} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="candidate">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Candidate Info</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailField label="Candidate ID" value={valueOrDash(candidate?.candidateId)} />
                <DetailField label="Full name" value={valueOrDash(candidate?.fullName)} />
                <DetailField label="Email" value={valueOrDash(candidate?.email)} />
                <DetailField label="Phone" value={valueOrDash(candidate?.phone)} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="job">
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Job Posting</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <DetailField
                      label="Posting"
                      value={
                        jobPosting?.jobPostingId ? (
                          <Link
                            to={`/recruitment/job-postings/${jobPosting.jobPostingId}`}
                            className="hover:underline"
                          >
                            {jobPosting.title ?? jobPosting.jobPostingId}
                          </Link>
                        ) : valueOrDash(jobPosting?.title)
                      }
                    />
                    <DetailField label="Posting ID" value={valueOrDash(jobPosting?.jobPostingId)} />
                    <DetailField
                      label="JD version"
                      value={valueOrDash(jobPosting?.jobDescriptionVersionId)}
                    />
                    <DetailField label="Application source" value={valueOrDash(application.source)} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="text-lg">Scoring Summary</CardTitle>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void runAiScreening()}
                      disabled={screeningLoading}
                    >
                      <Sparkles
                        className={cn(
                          'mr-2 h-4 w-4',
                          screeningLoading && 'animate-pulse',
                        )}
                      />
                      {screeningLoading ? 'Running...' : 'Run AI screening'}
                    </Button>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <DetailField label="Mapping score" value={scoreLabel(mapping?.score)} />
                    <DetailField label="Mapping status" value={valueOrDash(mapping?.status)} />
                    <DetailField label="AI score" value={scoreLabel(aiScreening?.score)} />
                    <DetailField label="AI recommendation" value={valueOrDash(aiScreening?.recommendation)} />
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">AI Candidate Assessment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {aiScreening?.summary ? (
                    <div>
                      <p className="text-sm text-muted-foreground">Summary</p>
                      <p className="mt-1 text-sm leading-6">{aiScreening.summary}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Run AI screening to see candidate assessment and reviewer notes.
                    </p>
                  )}

                  <div className="grid gap-4 lg:grid-cols-3">
                    <AiAssessmentList
                      title="Strengths"
                      items={aiScreening?.strengths}
                      emptyLabel="No strengths recorded yet."
                    />
                    <AiAssessmentList
                      title="Gaps"
                      items={aiScreening?.gaps}
                      emptyLabel="No gaps recorded yet."
                    />
                    <AiAssessmentList
                      title="Risks"
                      items={aiScreening?.risks}
                      emptyLabel="No risks recorded yet."
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="cv-processing">
            <CvProcessingPanel
              applicationId={application.applicationId}
              currentCv={cv}
              versions={cvVersions}
              loading={cvLoading}
              error={cvError}
              onRefresh={() => void loadCvVersions()}
            />
          </TabsContent>

          <TabsContent value="parsed-profile">
            <ParsedProfileView
              profile={parsedProfile}
              loading={profileLoading}
              error={profileError}
              onRefresh={() => void loadParsedProfile()}
              onReparse={() => void reparseCurrentCv()}
              reparseLoading={parseLoading}
              canReparse={Boolean(cv?.currentCvDocumentId && cv?.sanitizeStatus === 'SANITIZED')}
            />
          </TabsContent>

          <TabsContent value="cv-versions">
            <CvVersionHistory
              applicationId={application.applicationId}
              versions={cvVersions}
              loading={cvLoading}
              error={cvError}
              onRefresh={() => void loadCvVersions()}
            />
          </TabsContent>

          <TabsContent value="timeline">
            <WorkflowTimeline
              events={timelineEvents}
              loading={timelineLoading}
              error={timelineError}
              onRefresh={() => void loadTimeline()}
            />
          </TabsContent>

          <TabsContent value="audit">
            <ApplicationAuditLog
              logs={auditLogs}
              pagination={auditPagination}
              loading={auditLoading}
              error={auditError}
              onRefresh={() => void loadAuditLogs()}
            />
          </TabsContent>

          <TabsContent value="sources">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Application Sources</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>External lead</TableHead>
                      <TableHead>External application</TableHead>
                      <TableHead>Received</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sources.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                          No source records found.
                        </TableCell>
                      </TableRow>
                    )}

                    {sources.map((source) => (
                      <TableRow key={source.applicationSourceId ?? `${source.sourceType}-${source.receivedAt}`}>
                        <TableCell>{valueOrDash(source.sourceType)}</TableCell>
                        <TableCell>{valueOrDash(source.channel)}</TableCell>
                        <TableCell>{valueOrDash(source.externalLeadId)}</TableCell>
                        <TableCell>{valueOrDash(source.externalApplicationId)}</TableCell>
                        <TableCell>{formatDate(source.receivedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="form-questionnaire" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between pb-6 border-b">
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary animate-pulse" />
                    Bộ Câu Hỏi Khảo Sát Đăng Ký Ngành Nghề
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Sinh bộ 5 câu hỏi ngẫu nhiên và tạo link hết hạn sau 5 phút gửi cho ứng viên để làm bài kiểm tra nhanh.
                  </p>
                </div>
                <Button
                  onClick={async () => {
                    if (!applicationId) return;
                    try {
                      setFormLoading(true);
                      const res = await generateFormSession(applicationId);
                      setLastGeneratedUrl(res.formUrl);
                      toast({
                        title: 'Đã tạo link khảo sát thành công!',
                        description: 'Link khảo sát mới đã được thiết lập. Hãy copy link bên dưới.',
                      });
                      refreshAll();
                    } catch (err: any) {
                      toast({
                        variant: 'destructive',
                        title: 'Không thể tạo link khảo sát',
                        description: err.message || 'Vui lòng kiểm tra lại.',
                      });
                    } finally {
                      setFormLoading(false);
                    }
                  }}
                  disabled={formLoading}
                  className="bg-primary hover:bg-primary/95 text-white font-medium"
                >
                  <RefreshCw className={cn("mr-2 h-4 w-4", formLoading && "animate-spin")} />
                  Tạo Mới / Gửi Lại Link Khảo Sát
                </Button>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                {formLoading && !formDetails && (
                  <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin text-primary" />
                    Đang tải dữ liệu khảo sát...
                  </div>
                )}

                {formError && (
                  <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
                    {formError}
                  </div>
                )}

                {!formLoading && !formDetails && (
                  <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 border border-dashed rounded-lg bg-muted/30 border-border">
                    <Hourglass className="h-10 w-10 text-muted-foreground animate-pulse" />
                    <Badge className={getFormStatusClassName(formDisplayStatus)}>
                      {getFormStatusLabel(formDisplayStatus)}
                    </Badge>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">Ứng viên chưa được gửi link khảo sát</p>
                      <p className="text-xs text-muted-foreground">Hãy nhấn nút "Tạo Mới / Gửi Lại Link Khảo Sát" ở góc trên để bắt đầu.</p>
                    </div>
                  </div>
                )}

                {formDetails && (
                  <div className="space-y-6">
                    {/* Session Info Grid */}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg border bg-muted/30 border-border p-4 space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase">Trạng thái Form</p>
                        <div>
                          <Badge
                            className={getFormStatusClassName(formDisplayStatus)}
                          >
                            {getFormStatusLabel(formDisplayStatus)}
                          </Badge>
                        </div>
                      </div>

                      <div className="rounded-lg border bg-muted/30 border-border p-4 space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase">Ngày tạo</p>
                        <p className="text-sm font-bold text-foreground">{formatDate(formDetails.sentAt)}</p>
                      </div>

                      <div className="rounded-lg border bg-muted/30 border-border p-4 space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase">Hạn hiệu lực</p>
                        <p className="text-sm font-bold text-amber-500">{formatDate(formDetails.expiresAt)}</p>
                      </div>

                      <div className="rounded-lg border bg-muted/30 border-border p-4 space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase">Ngày nộp</p>
                        <p className="text-sm font-bold text-foreground">
                          {formDetails.submittedAt ? formatDate(formDetails.submittedAt) : 'Chưa hoàn thành'}
                        </p>
                      </div>
                    </div>

                    {/* Copied link banner */}
                    {lastGeneratedUrl && (
                      <div className="p-4 rounded-lg border bg-blue-500/5 border-blue-500/10 space-y-2">
                        <label className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">Link khảo sát vừa tạo (Chỉ hiển thị một lần)</label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            readOnly
                            value={lastGeneratedUrl}
                            className="w-full bg-muted border border-border rounded px-3 py-1.5 text-xs text-foreground font-mono focus:outline-none"
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              void navigator.clipboard.writeText(lastGeneratedUrl);
                              toast({
                                description: 'Đã copy link vào clipboard!',
                              });
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            asChild
                          >
                            <a href={lastGeneratedUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Questions & Answers Detail List */}
                    <div className="space-y-4 pt-4 border-t">
                      <h3 className="text-base font-semibold text-foreground">Bộ Câu Hỏi & Đáp Án Ứng Viên</h3>
                      {isMissingQuestionSet ? (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
                          Missing question set: form session exists but no questionnaire items were found. Please create and send a new questionnaire link.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {formDetails.questions.map((q, idx) => (
                          <div key={q.questionSetItemId} className="border rounded-lg p-4 bg-muted/30 border-border space-y-3">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted border border-border text-xs font-bold text-foreground">
                                  {idx + 1}
                                </span>
                                <h4 className="text-sm font-semibold text-foreground">{q.text}</h4>
                              </div>
                              <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">
                                {q.type}
                              </Badge>
                            </div>

                            {/* Options if MC/SC */}
                            {q.options && q.options.length > 0 && (
                              <div className="pl-8 grid gap-2 sm:grid-cols-2">
                                {q.options.map((opt) => {
                                  // Check if this option was chosen
                                  const ansVal = q.answer;
                                  const isChosen = Boolean(
                                    ansVal && (
                                      (Array.isArray(ansVal.selectedIds) && ansVal.selectedIds.includes(opt.id)) ||
                                      (ansVal.answer && Array.isArray(ansVal.answer.selectedIds) && ansVal.answer.selectedIds.includes(opt.id)) ||
                                      ansVal.text === opt.id ||
                                      (ansVal.answer && ansVal.answer.text === opt.id)
                                    )
                                  );

                                  return (
                                    <div
                                      key={opt.id}
                                      className={cn(
                                        "flex items-center space-x-2 text-xs rounded border p-2 bg-background",
                                        isChosen ? "border-green-500/30 bg-green-500/5 text-green-600 dark:text-green-400" : "border-border text-muted-foreground"
                                      )}
                                    >
                                      {isChosen ? (
                                        <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                      ) : (
                                        <span className="h-3.5 w-3.5 rounded-full border border-border shrink-0" />
                                      )}
                                      <span>{opt.text}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Candidate Answer Text */}
                            <div className="pl-8 pt-2">
                              {formDisplayStatus === 'SUBMITTED' ? (
                                <>
                                  {q.type === 'OPEN_ENDED' && q.answer && (
                                    <div className="bg-background border border-border rounded p-3 text-xs text-foreground whitespace-pre-wrap font-mono leading-relaxed">
                                      {q.answer.text || (q.answer.answer && (q.answer.answer as any).text) || '-'}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <span className="text-xs text-muted-foreground flex items-center gap-1.5 italic">
                                  <Hourglass className="h-3 w-3 animate-spin" />
                                  Chờ ứng viên hoàn thành trả lời...
                                </span>
                              )}
                            </div>
                          </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
