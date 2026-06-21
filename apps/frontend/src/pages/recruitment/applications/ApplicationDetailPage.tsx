import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import {
  ApplicationOverview,
  getApplicationStatusClassName,
  getApplicationStatusLabel,
} from '@/components/recruitment/ApplicationOverview';
import { ApplicationAuditLog } from '@/components/recruitment/ApplicationAuditLog';
import { CvProcessingPanel } from '@/components/recruitment/CvProcessingPanel';
import { CvVersionHistory } from '@/components/recruitment/CvVersionHistory';
import { ParsedProfileView } from '@/components/recruitment/ParsedProfileView';
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
import { getInternalSafeErrorMessage } from '@/lib/api-errors';
import {
  getApplication,
  getParsedProfile,
  listApplicationAuditLogs,
  listApplicationTimeline,
  listCvVersions,
  type ApplicationAuditLogRecord,
  type ApplicationDetailRecord,
  type ApplicationTimelineRecord,
  type CvVersionRecord,
  type ParsedProfileRecord,
  type RecruitmentPagination,
} from '@/lib/recruitment-api';
import { cn } from '@/lib/utils';

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

export function ApplicationDetailPage() {
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

  const refreshAll = useCallback(() => {
    void loadApplication();
    void loadCvVersions();
    void loadParsedProfile();
    void loadTimeline();
    void loadAuditLogs();
  }, [
    loadApplication,
    loadAuditLogs,
    loadCvVersions,
    loadParsedProfile,
    loadTimeline,
  ]);

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
                <CardHeader>
                  <CardTitle className="text-lg">Scoring Summary</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <DetailField label="Mapping score" value={scoreLabel(mapping?.score)} />
                  <DetailField label="Mapping status" value={valueOrDash(mapping?.status)} />
                  <DetailField label="AI score" value={scoreLabel(aiScreening?.score)} />
                  <DetailField label="AI recommendation" value={valueOrDash(aiScreening?.recommendation)} />
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
        </Tabs>
      )}
    </div>
  );
}
