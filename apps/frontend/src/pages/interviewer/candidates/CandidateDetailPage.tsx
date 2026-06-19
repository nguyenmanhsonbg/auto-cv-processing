import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { apiClient } from '@/lib/api-client';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { useAuthContext } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, CheckCircle, XCircle, ChevronDown, ChevronRight, Pencil, Upload, Loader2, FileText, Download, Eye, RefreshCw, AlertTriangle, ShieldAlert, TrendingDown, MapPin, Clock } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { UserRole, CandidateLevel, WebSocketEvents } from '@interview-assistant/shared';
import type { Candidate, VcsSignals, WorkExperience, ParsedProject, ProfileSectionScore, ProfileAnomalyDetection } from '@interview-assistant/shared';
import { MultiSelect } from '@/components/ui/multi-select';

interface UploadItem {
  fileIndex: number;
  fileName: string;
  stage: 'pending' | 'parsing' | 'analyzing' | 'saving' | 'done' | 'error';
  totalFiles: number;
  error?: string;
}

const STAGE_LABELS: Record<UploadItem['stage'], string> = {
  pending: 'Waiting…',
  parsing: 'Parsing…',
  analyzing: 'Analyzing…',
  saving: 'Saving…',
  done: 'Done',
  error: 'Failed',
};

const STAGE_PROGRESS: Record<UploadItem['stage'], number> = {
  pending: 5, parsing: 25, analyzing: 55, saving: 85, done: 100, error: 100,
};

interface Session {
  id: string;
  templatePosition: string;
  targetLevel: string;
  status: string;
  createdAt: string;
}

interface EditForm {
  name: string;
  email: string;
  phone: string;
  birthYear: string;
  position: string;
  level: string;
}

interface SheetData { name: string; rows: unknown[][]; }

export function CandidateDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const isAdmin = user?.role === UserRole.ADMIN;
  const isHr = user?.role === UserRole.HR;

  const [candidate, setCandidate] = useState<Candidate & { sessions?: Session[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({ name: '', email: '', phone: '', birthYear: '', position: '', level: '' });
  const [saving, setSaving] = useState(false);

  // File upload state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const wasConnectedRef = useRef(false);

  // PDF viewer state
  const [pdfViewOpen, setPdfViewOpen] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Excel viewer state
  const [xlsxViewOpen, setXlsxViewOpen] = useState(false);
  const [xlsxSheets, setXlsxSheets] = useState<SheetData[]>([]);
  const [xlsxLoading, setXlsxLoading] = useState(false);
  const [xlsxActiveSheet, setXlsxActiveSheet] = useState(0);

  // Re-analyze state
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeStage, setReanalyzeStage] = useState<string | null>(null);

  // Assignees state
  const [allUsers, setAllUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    return () => {
      getSocket().off(WebSocketEvents.UPLOAD_PROGRESS);
      if (!wasConnectedRef.current) disconnectSocket();
    };
  }, []);

  useEffect(() => {
    apiClient.get<{ id: string; name: string; email: string }[]>('/auth/users/assignable')
      .then(setAllUsers)
      .catch(() => {});
  }, []);

  const handleDownload = async (url: string, filename: string) => {
    try {
      const blob = await apiClient.downloadBlob(url);
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast({ title: 'Download failed', variant: 'destructive' });
    }
  };

  const handleViewPdf = async (url: string) => {
    setPdfLoading(true);
    setPdfViewOpen(true);
    try {
      const blob = await apiClient.downloadBlob(url);
      setPdfBlobUrl(URL.createObjectURL(blob));
    } catch {
      toast({ title: 'Failed to load PDF', variant: 'destructive' });
      setPdfViewOpen(false);
    } finally {
      setPdfLoading(false);
    }
  };

  const closePdfView = () => {
    setPdfViewOpen(false);
    if (pdfBlobUrl) { URL.revokeObjectURL(pdfBlobUrl); setPdfBlobUrl(null); }
  };

  const handleViewXlsx = async (url: string) => {
    setXlsxLoading(true);
    setXlsxViewOpen(true);
    setXlsxActiveSheet(0);
    try {
      const blob = await apiClient.downloadBlob(url);
      const arrayBuffer = await blob.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheets: SheetData[] = workbook.SheetNames.map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1 }),
      }));
      setXlsxSheets(sheets);
    } catch {
      toast({ title: 'Failed to load Excel file', variant: 'destructive' });
      setXlsxViewOpen(false);
    } finally {
      setXlsxLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFiles.length || !candidate?.id) return;

    const socket = getSocket();
    wasConnectedRef.current = socket.connected;
    if (!socket.connected) socket.connect();

    const socketId = await new Promise<string>((resolve) => {
      if (socket.connected && socket.id) { resolve(socket.id); return; }
      socket.once('connect', () => resolve(socket.id!));
    });

    setUploadItems(uploadFiles.map((f, i) => ({
      fileIndex: i, fileName: f.name, stage: 'pending', totalFiles: uploadFiles.length,
    })));
    setUploading(true);

    socket.on(WebSocketEvents.UPLOAD_PROGRESS, (payload: UploadItem) => {
      setUploadItems((prev) =>
        prev.map((item) => item.fileIndex === payload.fileIndex ? { ...item, ...payload } : item),
      );
    });

    try {
      await apiClient.uploadMulti<{ candidateId: string; errors: unknown[] }>(
        '/candidates/upload',
        uploadFiles,
        { socketId, candidateId: candidate.id },
      );
      toast({ title: 'Files uploaded — profile updated' });
      setUploadOpen(false);
      setUploadFiles([]);
      setUploadItems([]);
      loadCandidate();
    } catch (err) {
      toast({ title: 'Upload failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      socket.off(WebSocketEvents.UPLOAD_PROGRESS);
      if (!wasConnectedRef.current) disconnectSocket();
      setUploading(false);
    }
  };

  const loadCandidate = () => {
    apiClient
      .get<Candidate & { sessions?: Session[] }>(`/candidates/${slug}`)
      .then((data) => {
        setCandidate(data);
        setAssigneeIds((data.assignees ?? []).map(u => u.id));

        // If backend says analysis is still running (e.g. after a page reload), re-attach listener
        if (data.analyzeStatus === 'analyzing') {
          setReanalyzing(true);
          setReanalyzeStage('Analyzing…');
          const socket = getSocket();
          wasConnectedRef.current = socket.connected;
          if (!socket.connected) socket.connect();
          socket.on(WebSocketEvents.CANDIDATE_ANALYZE_PROGRESS, (payload: { stage: string }) => {
            const labels: Record<string, string> = {
              parsing: 'Parsing…', analyzing: 'Analyzing…', saving: 'Saving…', done: 'Done', error: 'Failed',
            };
            setReanalyzeStage(labels[payload.stage] ?? payload.stage);
            if (payload.stage === 'done' || payload.stage === 'error') {
              socket.off(WebSocketEvents.CANDIDATE_ANALYZE_PROGRESS);
              if (!wasConnectedRef.current) disconnectSocket();
              setReanalyzing(false);
              setReanalyzeStage(null);
              if (payload.stage === 'done') loadCandidate();
            }
          });
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadCandidate(); }, [slug]);

  const handleReanalyze = async () => {
    if (!slug) return;

    const socket = getSocket();
    wasConnectedRef.current = socket.connected;
    if (!socket.connected) socket.connect();

    const socketId = await new Promise<string>((resolve) => {
      if (socket.connected && socket.id) { resolve(socket.id); return; }
      socket.once('connect', () => resolve(socket.id!));
    });

    setReanalyzing(true);
    setReanalyzeStage('Parsing…');

    const STAGE_LABELS: Record<string, string> = {
      parsing: 'Parsing…',
      analyzing: 'Analyzing…',
      saving: 'Saving…',
      done: 'Done',
      error: 'Failed',
    };

    socket.on(WebSocketEvents.CANDIDATE_ANALYZE_PROGRESS, (payload: { stage: string; error?: string }) => {
      setReanalyzeStage(STAGE_LABELS[payload.stage] ?? payload.stage);
    });

    try {
      await apiClient.post(`/candidates/${slug}/analyze`, { socketId });
      toast({ title: 'Re-analysis complete — profile updated' });
      loadCandidate();
    } catch (err) {
      toast({ title: 'Re-analysis failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      socket.off(WebSocketEvents.CANDIDATE_ANALYZE_PROGRESS);
      if (!wasConnectedRef.current) disconnectSocket();
      setReanalyzing(false);
      setReanalyzeStage(null);
    }
  };

  const openEdit = () => {
    if (!candidate) return;
    setEditForm({
      name: candidate.name ?? '',
      email: (candidate as any).email ?? '',
      phone: (candidate as any).phone ?? '',
      birthYear: (candidate as any).birthYear?.toString() ?? '',
      position: (candidate as any).position ?? '',
      level: candidate.level ?? '',
    });
    setEditOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put(`/candidates/${slug}`, {
        name: editForm.name || undefined,
        email: editForm.email || undefined,
        phone: editForm.phone || undefined,
        birthYear: editForm.birthYear ? Number(editForm.birthYear) : undefined,
        position: editForm.position || undefined,
        level: editForm.level || undefined,
      });
      toast({ title: 'Candidate updated' });
      setEditOpen(false);
      loadCandidate();
    } catch (err) {
      toast({ title: 'Update failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = async (newIds: string[]) => {
    if (!candidate?.id) return;
    setAssigning(true);
    try {
      const updated = await apiClient.patch<Candidate>(`/candidates/${slug}/assign`, { userIds: newIds });
      setCandidate(prev => prev ? { ...prev, assignees: updated.assignees } : prev);
      setAssigneeIds((updated.assignees ?? []).map(u => u.id));
      toast({ title: 'Assignees updated' });
    } catch {
      toast({ title: 'Failed to update assignees', variant: 'destructive' });
    } finally {
      setAssigning(false);
    }
  };

  if (loading) return <div>Loading…</div>;
  if (!candidate) return <div>Candidate not found.</div>;

  const profile = candidate.parsedProfile;
  const signals = profile?.vcsSignals;
  const validation = profile?.aiValidation;
  const anomalyDetection = profile?.anomalyDetection;

  const getSectionScore = (section: ProfileSectionScore['section']) =>
    validation?.sectionScores?.find((s) => s.section === section);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">{candidate.name}</h1>
          <p className="text-muted-foreground">{(candidate as any).position} · {candidate.level}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={openEdit}>
              <Pencil className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Edit</span>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => { setUploadFiles([]); setUploadItems([]); setUploadOpen(true); }}>
            <Upload className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Upload Files</span>
          </Button>
          <div className="flex items-center gap-2">
            {reanalyzeStage && (
              <span className="hidden sm:inline text-xs text-muted-foreground">{reanalyzeStage}</span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleReanalyze}
              disabled={reanalyzing || (!candidate?.resumeUrl && !candidate?.profileXlsxUrl)}
              title={!candidate?.resumeUrl && !candidate?.profileXlsxUrl ? 'No stored files to analyze' : 'Re-run AI analysis on stored files'}
            >
              {reanalyzing ? <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 sm:mr-2" />}
              <span className="hidden sm:inline">Re-analyze</span>
            </Button>
          </div>
          {!isHr && (
            <Button size="sm" onClick={() => navigate(`/sessions/new?candidateId=${candidate.id}`)}>
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">New Session</span>
            </Button>
          )}
        </div>
      </div>

      {/* Basic Info */}
      <Card>
        <CardHeader><CardTitle>Candidate Information</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <InfoRow label="Name" value={candidate.name} />
            <InfoRow label="Email" value={candidate.email} />
            <InfoRow label="Phone" value={candidate.phone} />
            <InfoRow label="Birth Year" value={candidate.birthYear?.toString()} />
            <InfoRow label="Position" value={candidate.position} />
            <div className="flex gap-2 items-center">
              <span className="text-muted-foreground w-32">Level</span>
              <Badge variant="outline">{candidate.level}</Badge>
            </div>
            {(isAdmin || candidate.createdById === user?.id) && (
              <div className="flex gap-2 items-center col-span-full">
                <span className="text-muted-foreground w-32">Assigned To</span>
                <MultiSelect
                  options={allUsers.map(u => ({ value: u.id, label: `${u.name} (${u.email})` }))}
                  selected={assigneeIds}
                  onChange={handleAssign}
                  placeholder="Select assignees…"
                  className="w-80"
                />
                {assigning && <Loader2 className="h-4 w-4 animate-spin" />}
              </div>
            )}
            {candidate.resumeUrl && (
              <div className="flex gap-2 items-center col-span-full">
                <span className="text-muted-foreground w-32">Resume</span>
                <button onClick={() => handleDownload(candidate.resumeUrl!, 'resume.pdf')} className="flex items-center gap-1 text-blue-600 underline text-sm"><Download className="h-3.5 w-3.5" />Download PDF</button>
                <button onClick={() => handleViewPdf(candidate.resumeUrl!)} className="flex items-center gap-1 text-blue-600 underline text-sm"><Eye className="h-3.5 w-3.5" />View PDF</button>
              </div>
            )}
            {candidate.profileXlsxUrl && (
              <div className="flex gap-2 items-center col-span-full">
                <span className="text-muted-foreground w-32">Profile XLSX</span>
                <button onClick={() => handleDownload(candidate.profileXlsxUrl!, 'profile.xlsx')} className="flex items-center gap-1 text-blue-600 underline text-sm"><Download className="h-3.5 w-3.5" />Download XLSX</button>
                <button onClick={() => handleViewXlsx(candidate.profileXlsxUrl!)} className="flex items-center gap-1 text-blue-600 underline text-sm"><Eye className="h-3.5 w-3.5" />View XLSX</button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Upload Files Dialog */}
      <Dialog open={uploadOpen} onOpenChange={(open) => { if (!uploading) { setUploadOpen(open); if (!open) { setUploadFiles([]); setUploadItems([]); } } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Files</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload profile files (PDF, XLSX, DOCX) to update this candidate's parsed profile.
            </p>
            <label
              htmlFor="dialog-upload"
              className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                uploading
                  ? 'border-muted bg-muted/20 cursor-not-allowed'
                  : 'border-muted-foreground/30 hover:border-primary hover:bg-primary/5'
              }`}
            >
              <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                <Upload className="h-5 w-5" />
                <span className="text-sm">
                  {uploadFiles.length > 0
                    ? `${uploadFiles.length} file${uploadFiles.length !== 1 ? 's' : ''} selected`
                    : 'Click to select files'}
                </span>
                <span className="text-xs">.pdf · .xlsx · .xls · .docx</span>
              </div>
              <input
                id="dialog-upload"
                type="file"
                multiple
                accept=".pdf,.xlsx,.xls,.docx"
                className="hidden"
                disabled={uploading}
                onChange={(e) => { setUploadFiles(Array.from(e.target.files ?? [])); setUploadItems([]); }}
              />
            </label>

            {uploadItems.length > 0 && (
              <div className="space-y-2">
                {uploadItems.map((item) => (
                  <div key={item.fileIndex} className="space-y-1">
                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        <span className="truncate max-w-[260px]">{item.fileName}</span>
                      </span>
                      <span className={item.stage === 'error' ? 'text-destructive' : item.stage === 'done' ? 'text-green-600' : ''}>
                        {STAGE_LABELS[item.stage]}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          item.stage === 'error' ? 'bg-destructive' : item.stage === 'done' ? 'bg-green-500' : 'bg-primary'
                        }`}
                        style={{ width: `${STAGE_PROGRESS[item.stage]}%` }}
                      />
                    </div>
                    {item.stage === 'error' && item.error && (
                      <p className="text-xs text-destructive">{item.error}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={uploading || uploadFiles.length === 0}>
              {uploading
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading…</>
                : <><Upload className="h-4 w-4 mr-2" />Upload</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Viewer Dialog */}
      <Dialog open={pdfViewOpen} onOpenChange={(open) => { if (!open) closePdfView(); }}>
        <DialogContent className="max-w-5xl w-full h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>Resume — PDF Preview</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden px-6 pb-6">
            {pdfLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : pdfBlobUrl ? (
              <iframe src={pdfBlobUrl} className="w-full h-full rounded border" title="Resume PDF" />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* Excel Viewer Dialog */}
      <Dialog open={xlsxViewOpen} onOpenChange={setXlsxViewOpen}>
        <DialogContent className="max-w-5xl w-full h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Profile — Excel Preview</DialogTitle>
          </DialogHeader>
          {xlsxLoading ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : xlsxSheets.length > 0 ? (
            <>
              {xlsxSheets.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  {xlsxSheets.map((sheet, i) => (
                    <button
                      key={sheet.name}
                      onClick={() => setXlsxActiveSheet(i)}
                      className={`px-3 py-1 rounded text-sm border transition-colors ${
                        i === xlsxActiveSheet
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-foreground border-border hover:bg-muted'
                      }`}
                    >
                      {sheet.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex-1 overflow-auto">
                <table className="text-xs border-collapse w-full">
                  <tbody>
                    {xlsxSheets[xlsxActiveSheet]?.rows.map((row, ri) => (
                      <tr key={ri} className={ri === 0 ? 'bg-muted font-semibold' : 'hover:bg-muted/40'}>
                        {row.map((cell, ci) => (
                          <td key={ci} className="border border-border px-2 py-1 break-words whitespace-pre-wrap">
                            {String(cell ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Interested Information */}
      {signals && <InterestedInformationCard signals={signals} />}

      {/* Work Experience */}
      {profile?.workExperience && profile.workExperience.length > 0 && (
        <WorkExperienceCard
          workExperience={profile.workExperience}
          sectionScore={getSectionScore('workExperience')}
        />
      )}

      {/* Education & Skills */}
      {profile && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              🎓 Education &amp; Skills
              {getSectionScore('education') && (
                <SectionScoreBadge score={getSectionScore('education')!} />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
              <InfoRow label="Education" value={profile.education} />
              <InfoRow label="Total Experience" value={profile.totalYearsExperience != null ? `${profile.totalYearsExperience} years` : undefined} />
            </div>
            {profile.groupedSkills &&
              typeof profile.groupedSkills === 'object' &&
              Object.keys(profile.groupedSkills).length > 0
              ? <GroupedSkillsSection data={profile.groupedSkills} />
              : profile.skills && profile.skills.length > 0 && <TagSection label="Skills" items={profile.skills} />
            }
            {profile.certifications && profile.certifications.length > 0 && <TagSection label="Certifications" items={profile.certifications} />}
            {profile.experienceByLanguage &&
              typeof profile.experienceByLanguage === 'object' &&
              !Array.isArray(profile.experienceByLanguage) &&
              Object.keys(profile.experienceByLanguage).length > 0 && (
              <ExperienceByLanguage data={profile.experienceByLanguage as Record<string, number>} />
            )}
          </CardContent>
        </Card>
      )}

      {/* AI Validation */}
      {validation && (
        <AiAnalysisCard validation={validation} />
      )}

      {/* Anomaly Detection */}
      {anomalyDetection && (
        <AnomalyDetectionCard anomalyDetection={anomalyDetection} />
      )}

      {/* Sessions */}
      <Card>
        <CardHeader><CardTitle>Sessions ({candidate.sessions?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          {!candidate.sessions?.length ? (
            <p className="text-sm text-muted-foreground">No sessions yet.</p>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Position</TableHead>
                  <TableHead>Target Level</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidate.sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.templatePosition}</TableCell>
                    <TableCell>{s.targetLevel}</TableCell>
                    <TableCell><Badge variant="outline">{s.status}</Badge></TableCell>
                    <TableCell>{new Date(s.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Link to={`/sessions/${s.id}`} className="text-blue-600 text-sm underline">View</Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Admin Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Candidate</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Email</Label>
                <Input value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Birth Year</Label>
                <Input type="number" value={editForm.birthYear} onChange={(e) => setEditForm((f) => ({ ...f, birthYear: e.target.value }))} placeholder="1990" />
              </div>
              <div className="space-y-1">
                <Label>Position</Label>
                <Input value={editForm.position} onChange={(e) => setEditForm((f) => ({ ...f, position: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Level</Label>
              <Select value={editForm.level} onValueChange={(v) => setEditForm((f) => ({ ...f, level: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(CandidateLevel).map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !editForm.name.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Section Score Badge ──────────────────────────────────────

function SectionScoreBadge({ score }: { score: ProfileSectionScore }) {
  const colorClass =
    score.score >= 8 ? 'text-green-700 bg-green-50 border-green-200' :
    score.score >= 6 ? 'text-blue-700 bg-blue-50 border-blue-200' :
    score.score >= 4 ? 'text-orange-700 bg-orange-50 border-orange-200' :
                       'text-red-700 bg-red-50 border-red-200';
  const dot =
    score.score >= 8 ? '●' :
    score.score >= 6 ? '●' :
    score.score >= 4 ? '●' : '●';
  return (
    <span className={`text-xs font-normal px-2 py-0.5 rounded border ${colorClass}`}>
      {dot} {score.score}/10 {score.label}
    </span>
  );
}

// ── Work Experience Tree ──────────────────────────────────────

function companyTypeBadge(type?: string) {
  if (!type) return null;
  const styles: Record<string, string> = {
    PRODUCT: 'bg-blue-600 text-white',
    STARTUP: 'bg-purple-600 text-white',
    ENTERPRISE: 'bg-slate-600 text-white',
    OUTSOURCE: 'bg-orange-500 text-white',
  };
  return (
    <Badge className={`text-xs ${styles[type] ?? 'bg-slate-500 text-white'}`}>{type}</Badge>
  );
}

function yearRange(start?: number | null, end?: number | null) {
  if (!start && !end) return null;
  const from = start ?? '?';
  const to = end == null ? 'present' : end;
  return `${from} – ${to}`;
}

function ProjectRow({ project }: { project: ParsedProject & { description?: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-l-2 border-muted pl-3 ml-2">
      <button
        className="w-full flex items-center gap-2 py-1.5 text-left hover:bg-muted/30 rounded px-1 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        <span className="text-sm font-medium">{project.name}</span>
        {project.role && <span className="text-xs text-muted-foreground">· {project.role}</span>}
        <div className="ml-auto flex items-center gap-1.5">
          {(project.startYear != null || project.endYear != null) && (
            <span className="text-xs text-muted-foreground">{yearRange(project.startYear, project.endYear)}</span>
          )}
          {project.projectType && (
            <Badge variant="outline" className="text-xs">{project.projectType}</Badge>
          )}
        </div>
      </button>
      {open && (
        <div className="pl-6 pb-2 space-y-2 text-xs text-muted-foreground">
          {project.techstack && project.techstack.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {project.techstack.map((t) => (
                <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-1">
            {project.customerType && <span>Customer: {project.customerType}</span>}
            {project.teamSize && <span>Team: {project.teamSize}</span>}
            {project.scale && <span>Scale: {project.scale}</span>}
            {project.infrastructure && <span>Infra: {project.infrastructure}</span>}
            {project.platform && <span>Platform: {project.platform}</span>}
          </div>
          {project.description && (
            <p className="italic">{project.description}</p>
          )}
        </div>
      )}
    </div>
  );
}

function CompanyRow({ entry }: { entry: WorkExperience }) {
  const [open, setOpen] = useState(true);
  const range = yearRange(entry.startYear, entry.endYear);

  return (
    <div className="rounded-lg border bg-card">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors rounded-lg"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
        <span className="font-semibold text-sm flex-1">{entry.company}</span>
        {range && <span className="text-xs text-muted-foreground">{range}</span>}
        {companyTypeBadge(entry.companyType)}
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-1">
          {entry.role && (
            <p className="text-xs text-muted-foreground pl-7 pb-1">{entry.role}</p>
          )}
          {entry.projects && entry.projects.length > 0 ? (
            <div className="space-y-1 pl-4">
              {entry.projects.map((p, i) => (
                <ProjectRow key={i} project={p as ParsedProject & { description?: string }} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground pl-7 italic">No projects listed</p>
          )}
        </div>
      )}
    </div>
  );
}

function WorkExperienceCard({ workExperience, sectionScore }: { workExperience: WorkExperience[]; sectionScore?: ProfileSectionScore }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          💼 Work Experience
          {sectionScore && <SectionScoreBadge score={sectionScore} />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {workExperience.map((entry, i) => (
          <CompanyRow key={i} entry={entry} />
        ))}
      </CardContent>
    </Card>
  );
}

// ── Education & Skills helpers ────────────────────────────────

function ExperienceByLanguage({ data }: { data: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        className="flex items-center gap-1.5 font-semibold mb-1 hover:text-foreground/80 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Experience by Language
      </button>
      {open && (
        <div className="grid grid-cols-3 gap-2 pl-5">
          {Object.entries(data).map(([lang, yrs]) => (
            <div key={lang} className="flex justify-between border rounded px-3 py-1.5 text-xs">
              <span className="font-medium">{lang}</span>
              <span className="text-muted-foreground">{yrs}y</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── AI Analysis Card ──────────────────────────────────────────

const SECTION_LABELS: Record<string, string> = {
  education: 'Education',
  workExperience: 'Work Experience',
  skills: 'Skills',
  projects: 'Projects',
  seniority: 'Seniority',
};

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round((score / 10) * 100);
  const color =
    score >= 8 ? 'bg-green-500' :
    score >= 6 ? 'bg-blue-500' :
    score >= 4 ? 'bg-orange-400' :
                 'bg-red-400';
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AiAnalysisCard({ validation }: { validation: NonNullable<Candidate['parsedProfile']>['aiValidation'] }) {
  if (!validation) return null;
  const overallColor =
    validation.completenessScore >= 70 ? 'text-green-700 bg-green-50 border-green-200' :
    'text-orange-700 bg-orange-50 border-orange-200';
  const overallLabel =
    validation.completenessScore >= 80 ? 'Good' :
    validation.completenessScore >= 60 ? 'Fair' : 'Weak';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          🤖 AI Profile Analysis
          <span className={`text-sm font-normal px-2 py-0.5 rounded border ${overallColor}`}>
            Overall: {validation.completenessScore}/100 · {overallLabel}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {validation.summary && (
          <p className="text-muted-foreground leading-relaxed">{validation.summary}</p>
        )}

        {/* Section Scores */}
        {validation.sectionScores && validation.sectionScores.length > 0 && (
          <div>
            <p className="font-semibold mb-3">Category Scores</p>
            <div className="space-y-2">
              {validation.sectionScores.map((s) => {
                const labelColor =
                  s.score >= 8 ? 'text-green-700' :
                  s.score >= 6 ? 'text-blue-700' :
                  s.score >= 4 ? 'text-orange-600' : 'text-red-600';
                return (
                  <div key={s.section} className="grid grid-cols-[120px_1fr_60px_56px] items-center gap-2">
                    <span className="text-muted-foreground text-xs">{SECTION_LABELS[s.section] ?? s.section}</span>
                    <ScoreBar score={s.score} />
                    <span className="text-xs text-muted-foreground text-right">{s.score}/10</span>
                    <span className={`text-xs font-semibold ${labelColor}`}>{s.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {validation.highlights && validation.highlights.length > 0 && (
          <div>
            <p className="font-semibold mb-2 text-green-700">Highlights</p>
            <ul className="space-y-1">
              {validation.highlights.map((h, i) => (
                <li key={i} className="flex gap-2"><span className="text-green-600 mt-0.5">✓</span><span>{h}</span></li>
              ))}
            </ul>
          </div>
        )}
        {validation.concerns && validation.concerns.length > 0 && (
          <div>
            <p className="font-semibold mb-2 text-destructive">Concerns</p>
            <ul className="space-y-1">
              {validation.concerns.map((c, i) => (
                <li key={i} className="flex gap-2"><span className="text-destructive mt-0.5">!</span><span>{c}</span></li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Interested Information Card ──────────────────────────────────

const TOP_UNIVERSITY_LABELS: Record<string, string> = {
  HUST: 'HUST — Đại học Bách Khoa Hà Nội',
  UET: 'UET — Đại học Công Nghệ',
  PTIT: 'PTIT — Học viện Bưu chính Viễn thông',
};

function OkBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
      <CheckCircle className="h-3 w-3" /> OK
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
      <XCircle className="h-3 w-3" /> Not OK
    </span>
  );
}

function Evidence({ text }: { text?: string | null }) {
  if (!text) return null;
  return (
    <p className="text-xs text-muted-foreground italic mt-1 pl-1 border-l-2 border-muted">
      ↳ "{text}"
    </p>
  );
}

function SignalRow({ icon, label, ok, children }: { icon: string; label: string; ok: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm flex items-center gap-2">
          <span>{icon}</span>{label}
        </span>
        <OkBadge ok={ok} />
      </div>
      <div className="pl-6 space-y-1">{children}</div>
    </div>
  );
}

function InterestedInformationCard({ signals }: { signals: VcsSignals }) {
  return (
    <Card className="border-2 border-blue-300 shadow-md">
      <CardHeader className="bg-blue-50/60 rounded-t-lg pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          ★ Interested Information
        </CardTitle>
        <p className="text-xs text-muted-foreground">VCS hiring criteria — AI evaluated from CV content</p>
      </CardHeader>
      <CardContent className="pt-5 space-y-5 divide-y divide-muted">

        {/* Education */}
        <SignalRow icon="🎓" label="Education" ok={signals.university.ok}>
          {signals.university.name && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">{signals.university.name}</span>
              {signals.university.topMatch && (
                <Badge className="bg-green-600 text-white text-xs">
                  {TOP_UNIVERSITY_LABELS[signals.university.topMatch]}
                </Badge>
              )}
            </div>
          )}
          <Evidence text={signals.university.evidence} />
        </SignalRow>

        {/* Company Type */}
        <div className="pt-4">
          <SignalRow icon="🏢" label="Company Type" ok={signals.companyType.ok}>
            {signals.companyType.companies && signals.companyType.companies.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {signals.companyType.companies.map((c) => (
                  <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                ))}
              </div>
            )}
            <Evidence text={signals.companyType.evidence} />
          </SignalRow>
        </div>

        {/* Advanced Skills */}
        <div className="pt-4">
          <SignalRow icon="⚡" label="Advanced Skills" ok={signals.advancedSkills.ok}>
            {signals.advancedSkills.items && signals.advancedSkills.items.length > 0 ? (
              <div className="space-y-2">
                {signals.advancedSkills.items.map((item, i) => (
                  <div key={i}>
                    <Badge className="bg-blue-600 text-white text-xs">{item.skill}</Badge>
                    <Evidence text={item.evidence} />
                  </div>
                ))}
              </div>
            ) : (
              <Evidence text={signals.advancedSkills.evidence} />
            )}
          </SignalRow>
        </div>

        {/* Technical Challenges */}
        <div className="pt-4">
          <SignalRow icon="🚀" label="Technical Challenges" ok={signals.technicalChallenges.ok}>
            {signals.technicalChallenges.items && signals.technicalChallenges.items.length > 0 ? (
              <div className="space-y-2">
                {signals.technicalChallenges.items.map((item, i) => (
                  <div key={i}>
                    <p className="text-sm flex gap-1.5 items-start">
                      <span className="text-blue-500 mt-0.5 shrink-0">→</span>
                      <span>
                        {item.challenge}
                        {item.projectSize && (
                          <span className="ml-1.5 text-xs text-muted-foreground font-medium">({item.projectSize})</span>
                        )}
                      </span>
                    </p>
                    <Evidence text={item.evidence} />
                  </div>
                ))}
              </div>
            ) : (
              <Evidence text={signals.technicalChallenges.evidence} />
            )}
          </SignalRow>
        </div>

        {/* Senior Roles */}
        <div className="pt-4">
          <SignalRow icon="👑" label="Senior Roles" ok={signals.seniorRoles.ok}>
            {signals.seniorRoles.items && signals.seniorRoles.items.length > 0 ? (
              <div className="space-y-2">
                {signals.seniorRoles.items.map((item, i) => (
                  <div key={i}>
                    <p className="text-sm flex gap-1.5 items-start">
                      <span className="text-yellow-500 mt-0.5 shrink-0">★</span>
                      <span>
                        {item.role}
                        {item.projectSize && (
                          <span className="ml-1.5 text-xs text-muted-foreground font-medium">({item.projectSize})</span>
                        )}
                      </span>
                    </p>
                    <Evidence text={item.evidence} />
                  </div>
                ))}
              </div>
            ) : (
              <Evidence text={signals.seniorRoles.evidence} />
            )}
          </SignalRow>
        </div>

      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 items-start">
      <span className="text-muted-foreground w-32 shrink-0">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function TagSection({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="font-semibold mb-2">{label}</p>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <Badge key={item} variant="secondary" className="text-xs">{item}</Badge>
        ))}
      </div>
    </div>
  );
}

function GroupedSkillsSection({ data }: { data: Record<string, string[]> }) {
  const entries = Object.entries(data).filter(([, items]) => items.length > 0);
  return (
    <div>
      <p className="font-semibold mb-2">Skills</p>
      <div className="space-y-2">
        {entries.map(([category, items]) => (
          <div key={category}>
            <p className="text-xs text-muted-foreground mb-1">{category}</p>
            <div className="flex flex-wrap gap-1">
              {items.map((item) => (
                <Badge key={item} variant="secondary" className="text-xs">{item}</Badge>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Anomaly Detection Card ──────────────────────────────────────

function RiskLevelBadge({ level }: { level: 'minimal' | 'low' | 'moderate' | 'elevated' | 'high' }) {
  const styles = {
    minimal: 'text-green-700 bg-green-50 border-green-200',
    low: 'text-blue-700 bg-blue-50 border-blue-200',
    moderate: 'text-orange-700 bg-orange-50 border-orange-200',
    elevated: 'text-red-700 bg-red-50 border-red-200',
    high: 'text-red-900 bg-red-100 border-red-300',
  };
  const icons = {
    minimal: '✓',
    low: 'ℹ',
    moderate: '⚠',
    elevated: '⚠',
    high: '⨯',
  };
  return (
    <span className={`text-xs font-normal px-2 py-0.5 rounded border ${styles[level]}`}>
      {icons[level]} {level.toUpperCase()}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: 'low' | 'medium' | 'high' }) {
  const styles = {
    low: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    medium: 'bg-orange-100 text-orange-800 border-orange-300',
    high: 'bg-red-100 text-red-800 border-red-300',
  };
  return (
    <Badge variant="outline" className={`text-xs ${styles[severity]}`}>
      {severity}
    </Badge>
  );
}

function AnomalyTypeLabel({ type }: { type: string }) {
  const labels: Record<string, string> = {
    career_transition: 'Career Transition',
    skill_mismatch: 'Skill Mismatch',
    geographic_pattern: 'Geographic Pattern',
    timeline_inconsistency: 'Timeline Inconsistency',
  };
  const icons: Record<string, typeof TrendingDown> = {
    career_transition: TrendingDown,
    skill_mismatch: ShieldAlert,
    geographic_pattern: MapPin,
    timeline_inconsistency: Clock,
  };
  const Icon = icons[type] || AlertTriangle;
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4" />
      <span className="font-medium">{labels[type] || type}</span>
    </div>
  );
}

function AnomalyDetectionCard({ anomalyDetection }: { anomalyDetection: ProfileAnomalyDetection }) {
  const { overallRiskScore, riskLevel, anomalies, summary, analyzedAt } = anomalyDetection;

  // Risk level color for progress bar
  const riskColors = {
    minimal: 'bg-green-500',
    low: 'bg-blue-500',
    moderate: 'bg-orange-500',
    elevated: 'bg-red-500',
    high: 'bg-red-700',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Anomaly Detection
          </span>
          <RiskLevelBadge level={riskLevel} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Risk Score */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Overall Risk Score</span>
            <span className="text-lg font-bold">{overallRiskScore}/100</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${riskColors[riskLevel]}`}
              style={{ width: `${overallRiskScore}%` }}
            />
          </div>
        </div>

        {/* Summary */}
        <div className="bg-muted p-3 rounded-md">
          <p className="text-sm">{summary}</p>
        </div>

        {/* Anomalies List */}
        {anomalies.length > 0 ? (
          <div className="space-y-3">
            <p className="font-semibold">Detected Anomalies ({anomalies.length})</p>
            {anomalies.map((anomaly, idx) => (
              <div key={idx} className="border rounded-md p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <AnomalyTypeLabel type={anomaly.type} />
                  <SeverityBadge severity={anomaly.severity} />
                </div>
                <p className="text-sm">{anomaly.description}</p>
                {anomaly.evidence && (
                  <blockquote className="border-l-4 border-muted pl-3 italic text-sm text-muted-foreground">
                    {anomaly.evidence}
                  </blockquote>
                )}
                {anomaly.affectedFields.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <span className="text-xs text-muted-foreground">Affected fields:</span>
                    {anomaly.affectedFields.map((field, i) => (
                      <code key={i} className="text-xs bg-muted px-1 rounded">
                        {field}
                      </code>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-md">
            <CheckCircle className="h-5 w-5" />
            <span className="font-medium">No anomalies detected</span>
          </div>
        )}

        {/* Analyzed timestamp */}
        <p className="text-xs text-muted-foreground">
          Analyzed: {new Date(analyzedAt).toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}
