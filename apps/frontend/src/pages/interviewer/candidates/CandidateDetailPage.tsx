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
import { Plus, ChevronDown, ChevronRight, Pencil, Upload, Loader2, FileText, Download, Eye, RefreshCw, AlertTriangle, ShieldAlert, TrendingDown } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { UserRole, CandidateLevel, WebSocketEvents } from '@interview-assistant/shared';
import type { Candidate, VcsSignals, WorkExperience, ParsedProject, ProfileSectionScore, ProfileAnomalyDetection } from '@interview-assistant/shared';
import { MultiSelect } from '@/components/ui/multi-select';
import { stableKeyedItems } from '@/lib/stable-keyed-items';

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

  return (
    <CandidateDetailView
      loading={loading}
      candidate={candidate}
      user={user}
      isAdmin={isAdmin}
      isHr={isHr}
      navigate={navigate}
      onOpenEdit={openEdit}
      onOpenUpload={() => {
        setUploadFiles([]);
        setUploadItems([]);
        setUploadOpen(true);
      }}
      onReanalyze={handleReanalyze}
      reanalyzing={reanalyzing}
      reanalyzeStage={reanalyzeStage}
      uploadOpen={uploadOpen}
      setUploadOpen={setUploadOpen}
      uploadFiles={uploadFiles}
      setUploadFiles={setUploadFiles}
      uploading={uploading}
      uploadItems={uploadItems}
      setUploadItems={setUploadItems}
      onUpload={handleUpload}
      pdfViewOpen={pdfViewOpen}
      closePdfView={closePdfView}
      pdfLoading={pdfLoading}
      pdfBlobUrl={pdfBlobUrl}
      handleViewPdf={handleViewPdf}
      xlsxViewOpen={xlsxViewOpen}
      setXlsxViewOpen={setXlsxViewOpen}
      xlsxLoading={xlsxLoading}
      xlsxSheets={xlsxSheets}
      xlsxActiveSheet={xlsxActiveSheet}
      setXlsxActiveSheet={setXlsxActiveSheet}
      handleDownload={handleDownload}
      handleViewXlsx={handleViewXlsx}
      allUsers={allUsers}
      assigneeIds={assigneeIds}
      handleAssign={handleAssign}
      assigning={assigning}
      editOpen={editOpen}
      setEditOpen={setEditOpen}
      editForm={editForm}
      setEditForm={setEditForm}
      saving={saving}
      handleSave={handleSave}
    />
  );
}

type CandidateRecord = Candidate & { sessions?: Session[] };

interface CandidateDetailViewProps {
  loading: boolean;
  candidate: CandidateRecord | null;
  user: any;
  isAdmin: boolean;
  isHr: boolean;
  navigate: (to: string) => void;
  onOpenEdit: () => void;
  onOpenUpload: () => void;
  onReanalyze: () => void;
  reanalyzing: boolean;
  reanalyzeStage: string | null;
  uploadOpen: boolean;
  setUploadOpen: (open: boolean) => void;
  uploadFiles: File[];
  setUploadFiles: (files: File[]) => void;
  uploading: boolean;
  uploadItems: UploadItem[];
  setUploadItems: (items: UploadItem[]) => void;
  onUpload: () => void;
  pdfViewOpen: boolean;
  closePdfView: () => void;
  pdfLoading: boolean;
  pdfBlobUrl: string | null;
  handleViewPdf: (url: string) => void;
  xlsxViewOpen: boolean;
  setXlsxViewOpen: (open: boolean) => void;
  xlsxLoading: boolean;
  xlsxSheets: SheetData[];
  xlsxActiveSheet: number;
  setXlsxActiveSheet: (index: number) => void;
  handleDownload: (url: string, filename: string) => void;
  handleViewXlsx: (url: string) => void;
  allUsers: { id: string; name: string; email: string }[];
  assigneeIds: string[];
  handleAssign: (ids: string[]) => void;
  assigning: boolean;
  editOpen: boolean;
  setEditOpen: (open: boolean) => void;
  editForm: EditForm;
  setEditForm: any;
  saving: boolean;
  handleSave: () => void;
}

function CandidateDetailView(props: CandidateDetailViewProps) {
  if (props.loading) return <div>Loading...</div>;
  if (!props.candidate) return <div>Candidate not found.</div>;

  const candidate = props.candidate;
  const profile = candidate.parsedProfile;
  const validation = profile?.aiValidation;
  const getSectionScore = (section: ProfileSectionScore['section']) =>
    validation?.sectionScores?.find((score: ProfileSectionScore) => score.section === section);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <CandidateHeader {...props} candidate={candidate} />
      <BasicInfoCard {...props} candidate={candidate} />
      <UploadFilesDialog {...props} />
      <PdfViewerDialog {...props} />
      <XlsxViewerDialog {...props} />
      {profile?.vcsSignals && <InterestedInformationCard signals={profile.vcsSignals} />}
      {profile?.workExperience?.length ? (
        <WorkExperienceCard workExperience={profile.workExperience} sectionScore={getSectionScore('workExperience')} />
      ) : null}
      {profile && <EducationSkillsCard profile={profile} getSectionScore={getSectionScore} />}
      {validation && <AiAnalysisCard validation={validation} />}
      {profile?.anomalyDetection && <AnomalyDetectionCard anomalyDetection={profile.anomalyDetection} />}
      <SessionsCard candidate={candidate} />
      <EditCandidateDialog {...props} />
    </div>
  );
}

function CandidateHeader({
  candidate,
  isAdmin,
  isHr,
  onOpenEdit,
  onOpenUpload,
  onReanalyze,
  reanalyzing,
  reanalyzeStage,
  navigate,
}: CandidateDetailViewProps & { candidate: CandidateRecord }) {
  const hasStoredFiles = Boolean(candidate.resumeUrl || candidate.profileXlsxUrl);
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">{candidate.name}</h1>
        <p className="text-muted-foreground">{(candidate as any).position} - {candidate.level}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {isAdmin && <Button variant="outline" size="sm" onClick={onOpenEdit}><Pencil className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Edit</span></Button>}
        <Button variant="outline" size="sm" onClick={onOpenUpload}><Upload className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Upload Files</span></Button>
        <div className="flex items-center gap-2">
          {reanalyzeStage && <span className="hidden sm:inline text-xs text-muted-foreground">{reanalyzeStage}</span>}
          <Button variant="outline" size="sm" onClick={onReanalyze} disabled={reanalyzing || !hasStoredFiles} title={!hasStoredFiles ? 'No stored files to analyze' : 'Re-run AI analysis on stored files'}>
            {reanalyzing ? <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 sm:mr-2" />}<span className="hidden sm:inline">Re-analyze</span>
          </Button>
        </div>
        {!isHr && <Button size="sm" onClick={() => navigate('/sessions/new?candidateId=' + candidate.id)}><Plus className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">New Session</span></Button>}
      </div>
    </div>
  );
}

function BasicInfoCard({
  candidate,
  user,
  isAdmin,
  allUsers,
  assigneeIds,
  handleAssign,
  assigning,
  handleDownload,
  handleViewPdf,
  handleViewXlsx,
}: CandidateDetailViewProps & { candidate: CandidateRecord }) {
  const canAssign = isAdmin || candidate.createdById === user?.id;
  return (
    <Card>
      <CardHeader><CardTitle>Candidate Information</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <InfoRow label="Name" value={candidate.name} />
          <InfoRow label="Email" value={candidate.email} />
          <InfoRow label="Phone" value={candidate.phone} />
          <InfoRow label="Birth Year" value={candidate.birthYear?.toString()} />
          <InfoRow label="Position" value={candidate.position} />
          <div className="flex gap-2 items-center"><span className="text-muted-foreground w-32">Level</span><Badge variant="outline">{candidate.level}</Badge></div>
          {canAssign && <AssigneeRow allUsers={allUsers} assigneeIds={assigneeIds} handleAssign={handleAssign} assigning={assigning} />}
          {candidate.resumeUrl && <FileLinks label="Resume" url={candidate.resumeUrl} downloadName="resume.pdf" handleDownload={handleDownload} handleView={handleViewPdf} />}
          {candidate.profileXlsxUrl && <FileLinks label="Profile XLSX" url={candidate.profileXlsxUrl} downloadName="profile.xlsx" handleDownload={handleDownload} handleView={handleViewXlsx} />}
        </div>
      </CardContent>
    </Card>
  );
}

function AssigneeRow({ allUsers, assigneeIds, handleAssign, assigning }: Pick<CandidateDetailViewProps, 'allUsers' | 'assigneeIds' | 'handleAssign' | 'assigning'>) {
  return (
    <div className="flex gap-2 items-center col-span-full">
      <span className="text-muted-foreground w-32">Assigned To</span>
      <MultiSelect options={allUsers.map((u) => ({ value: u.id, label: u.name + ' (' + u.email + ')' }))} selected={assigneeIds} onChange={handleAssign} placeholder="Select assignees..." className="w-80" />
      {assigning && <Loader2 className="h-4 w-4 animate-spin" />}
    </div>
  );
}

function FileLinks({ label, url, downloadName, handleDownload, handleView }: { label: string; url: string; downloadName: string; handleDownload: (url: string, filename: string) => void; handleView: (url: string) => void }) {
  return (
    <div className="flex gap-2 items-center col-span-full">
      <span className="text-muted-foreground w-32">{label}</span>
      <button type="button" onClick={() => handleDownload(url, downloadName)} className="flex items-center gap-1 text-blue-600 underline text-sm"><Download className="h-3.5 w-3.5" />Download {label}</button>
      <button type="button" onClick={() => handleView(url)} className="flex items-center gap-1 text-blue-600 underline text-sm"><Eye className="h-3.5 w-3.5" />View {label}</button>
    </div>
  );
}

function UploadFilesDialog({ uploadOpen, setUploadOpen, uploadFiles, setUploadFiles, uploading, uploadItems, setUploadItems, onUpload }: CandidateDetailViewProps) {
  const onOpenChange = (open: boolean) => {
    if (uploading) return;
    setUploadOpen(open);
    if (!open) { setUploadFiles([]); setUploadItems([]); }
  };
  return (
    <Dialog open={uploadOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Upload Files</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Upload profile files (PDF, XLSX, DOCX) to update this candidate's parsed profile.</p>
          <label htmlFor="dialog-upload" className={['flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-lg cursor-pointer transition-colors', uploading ? 'border-muted bg-muted/20 cursor-not-allowed' : 'border-muted-foreground/30 hover:border-primary hover:bg-primary/5'].join(' ')}>
            <div className="flex flex-col items-center gap-1.5 text-muted-foreground"><Upload className="h-5 w-5" /><span className="text-sm">{uploadFiles.length > 0 ? formatSelectedFileLabel(uploadFiles.length) : 'Click to select files'}</span><span className="text-xs">.pdf - .xlsx - .xls - .docx</span></div>
            <input id="dialog-upload" type="file" multiple accept=".pdf,.xlsx,.xls,.docx" className="hidden" disabled={uploading} onChange={(event) => { setUploadFiles(Array.from(event.target.files ?? [])); setUploadItems([]); }} />
          </label>
          <UploadProgressList uploadItems={uploadItems} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>Cancel</Button>
          <Button onClick={onUpload} disabled={uploading || uploadFiles.length === 0}>{uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</> : <><Upload className="h-4 w-4 mr-2" />Upload</>}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadProgressList({ uploadItems }: { uploadItems: UploadItem[] }) {
  if (!uploadItems.length) return null;
  return (
    <div className="space-y-2">
      {uploadItems.map((item) => (
        <div key={item.fileIndex} className="space-y-1">
          <div className="flex justify-between items-center text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /><span className="truncate max-w-[260px]">{item.fileName}</span></span><span className={getUploadStageTextClass(item.stage)}>{STAGE_LABELS[item.stage]}</span></div>
          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden"><div className={['h-full rounded-full transition-all duration-300', getUploadProgressClass(item.stage)].join(' ')} style={{ width: STAGE_PROGRESS[item.stage] + '%' }} /></div>
          {item.stage === 'error' && item.error && <p className="text-xs text-destructive">{item.error}</p>}
        </div>
      ))}
    </div>
  );
}

function formatSelectedFileLabel(fileCount: number) {
  return `${fileCount} file${fileCount !== 1 ? 's' : ''} selected`;
}

function getUploadStageTextClass(stage: UploadItem['stage']) {
  if (stage === 'error') return 'text-destructive';
  if (stage === 'done') return 'text-green-600';
  return '';
}

function getUploadProgressClass(stage: UploadItem['stage']) {
  if (stage === 'error') return 'bg-destructive';
  if (stage === 'done') return 'bg-green-500';
  return 'bg-primary';
}

function formatSpreadsheetCell(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'symbol') return value.description ?? '';
  if (typeof value !== 'object') return '';
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

function renderPdfViewerContent(pdfLoading: boolean, pdfBlobUrl: string | null) {
  if (pdfLoading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }
  if (pdfBlobUrl) {
    return <iframe src={pdfBlobUrl} className="w-full h-full rounded border" title="Resume PDF" />;
  }
  return null;
}

function PdfViewerDialog({ pdfViewOpen, closePdfView, pdfLoading, pdfBlobUrl }: CandidateDetailViewProps) {
  return (
    <Dialog open={pdfViewOpen} onOpenChange={(open) => { if (!open) closePdfView(); }}>
      <DialogContent className="max-w-5xl w-full h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2"><DialogTitle>Resume - PDF Preview</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-hidden px-6 pb-6">{renderPdfViewerContent(pdfLoading, pdfBlobUrl)}</div>
      </DialogContent>
    </Dialog>
  );
}

function XlsxViewerDialog({ xlsxViewOpen, setXlsxViewOpen, xlsxLoading, xlsxSheets, xlsxActiveSheet, setXlsxActiveSheet }: CandidateDetailViewProps) {
  return (
    <Dialog open={xlsxViewOpen} onOpenChange={setXlsxViewOpen}>
      <DialogContent className="max-w-5xl w-full h-[90vh] flex flex-col">
        <DialogHeader><DialogTitle>Profile - Excel Preview</DialogTitle></DialogHeader>
        {xlsxLoading ? <div className="flex items-center justify-center flex-1"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : <SpreadsheetPreview sheets={xlsxSheets} activeSheet={xlsxActiveSheet} setActiveSheet={setXlsxActiveSheet} />}
      </DialogContent>
    </Dialog>
  );
}

function SpreadsheetPreview({ sheets, activeSheet, setActiveSheet }: { sheets: SheetData[]; activeSheet: number; setActiveSheet: (index: number) => void }) {
  if (!sheets.length) return null;
  const keyedRows = stableKeyedItems(sheets[activeSheet]?.rows ?? [], (row) => JSON.stringify(row), 'sheet-row');
  const firstRowKey = keyedRows[0]?.key;
  return (
    <>
      {sheets.length > 1 && <div className="flex gap-2 flex-wrap">{sheets.map((sheet, index) => <button type="button" key={sheet.name} onClick={() => setActiveSheet(index)} className={['px-3 py-1 rounded text-sm border transition-colors', index === activeSheet ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border hover:bg-muted'].join(' ')}>{sheet.name}</button>)}</div>}
      <div className="flex-1 overflow-auto"><table className="text-xs border-collapse w-full"><tbody>{keyedRows.map(({ item: row, key: rowKey }) => { const keyedCells = stableKeyedItems(row, formatSpreadsheetCell, `${rowKey}-cell`); return <tr key={rowKey} className={rowKey === firstRowKey ? 'bg-muted font-semibold' : 'hover:bg-muted/40'}>{keyedCells.map(({ item: cell, key: cellKey }) => <td key={cellKey} className="border border-border px-2 py-1 break-words whitespace-pre-wrap">{formatSpreadsheetCell(cell)}</td>)}</tr>; })}</tbody></table></div>
    </>
  );
}

function EducationSkillsCard({ profile, getSectionScore }: { profile: any; getSectionScore: (section: ProfileSectionScore['section']) => ProfileSectionScore | undefined }) {
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-3">Education &amp; Skills{getSectionScore('education') && <SectionScoreBadge score={getSectionScore('education')!} />}</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm"><div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3"><InfoRow label="Education" value={profile.education} /><InfoRow label="Total Experience" value={profile.totalYearsExperience != null ? profile.totalYearsExperience + ' years' : undefined} /></div><SkillsContent profile={profile} /></CardContent>
    </Card>
  );
}

function SkillsContent({ profile }: { profile: any }) {
  const hasGroupedSkills = profile.groupedSkills && typeof profile.groupedSkills === 'object' && Object.keys(profile.groupedSkills).length > 0;
  const hasLanguageExperience = profile.experienceByLanguage && typeof profile.experienceByLanguage === 'object' && !Array.isArray(profile.experienceByLanguage) && Object.keys(profile.experienceByLanguage).length > 0;
  return (
    <>
      {renderSkillsSection(profile, hasGroupedSkills)}
      {profile.certifications?.length ? <TagSection label="Certifications" items={profile.certifications} /> : null}
      {hasLanguageExperience && <ExperienceByLanguage data={profile.experienceByLanguage as Record<string, number>} />}
    </>
  );
}

function renderSkillsSection(profile: any, hasGroupedSkills: boolean) {
  if (hasGroupedSkills) return <GroupedSkillsSection data={profile.groupedSkills} />;
  if (profile.skills?.length) return <TagSection label="Skills" items={profile.skills} />;
  return null;
}

function getSectionScoreColorClass(score: number) {
  if (score >= 8) return 'text-green-700 bg-green-50 border-green-200';
  if (score >= 6) return 'text-blue-700 bg-blue-50 border-blue-200';
  if (score >= 4) return 'text-orange-700 bg-orange-50 border-orange-200';
  return 'text-red-700 bg-red-50 border-red-200';
}

function SessionsCard({ candidate }: { candidate: CandidateRecord }) {
  const sessions = candidate.sessions ?? [];
  return (
    <Card>
      <CardHeader><CardTitle>Sessions ({sessions.length})</CardTitle></CardHeader>
      <CardContent>
        {!sessions.length ? <p className="text-sm text-muted-foreground">No sessions yet.</p> : <div className="overflow-x-auto -mx-6 px-6"><Table><TableHeader><TableRow><TableHead>Position</TableHead><TableHead>Target Level</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>{sessions.map((session) => <TableRow key={session.id}><TableCell>{session.templatePosition}</TableCell><TableCell>{session.targetLevel}</TableCell><TableCell><Badge variant="outline">{session.status}</Badge></TableCell><TableCell>{new Date(session.createdAt).toLocaleDateString()}</TableCell><TableCell><Link to={'/sessions/' + session.id} className="text-blue-600 text-sm underline">View</Link></TableCell></TableRow>)}</TableBody></Table></div>}
      </CardContent>
    </Card>
  );
}

function EditCandidateDialog({ editOpen, setEditOpen, editForm, setEditForm, saving, handleSave }: CandidateDetailViewProps) {
  return (
    <Dialog open={editOpen} onOpenChange={setEditOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Candidate</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Name *</Label><Input value={editForm.name} onChange={(event) => setEditForm((form: EditForm) => ({ ...form, name: event.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label>Email</Label><Input value={editForm.email} onChange={(event) => setEditForm((form: EditForm) => ({ ...form, email: event.target.value }))} /></div><div className="space-y-1"><Label>Phone</Label><Input value={editForm.phone} onChange={(event) => setEditForm((form: EditForm) => ({ ...form, phone: event.target.value }))} /></div></div>
          <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label>Birth Year</Label><Input type="number" value={editForm.birthYear} onChange={(event) => setEditForm((form: EditForm) => ({ ...form, birthYear: event.target.value }))} placeholder="1990" /></div><div className="space-y-1"><Label>Position</Label><Input value={editForm.position} onChange={(event) => setEditForm((form: EditForm) => ({ ...form, position: event.target.value }))} /></div></div>
          <div className="space-y-1"><Label>Level</Label><Select value={editForm.level} onValueChange={(value) => setEditForm((form: EditForm) => ({ ...form, level: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.values(CandidateLevel).map((level) => <SelectItem key={level} value={level}>{level}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button><Button onClick={handleSave} disabled={saving || !editForm.name.trim()}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionScoreBadge({ score }: { score: ProfileSectionScore }) {
  const colorClass = getSectionScoreColorClass(score.score);
  return <span className={['text-xs font-normal px-2 py-0.5 rounded border', colorClass].join(' ')}>{score.score}/10 {score.label}</span>;
}

function yearRange(start?: number | null, end?: number | null) {
  if (!start && !end) return null;
  return String(start ?? '?') + ' - ' + (end == null ? 'present' : String(end));
}

function companyTypeBadge(type?: string) {
  if (!type) return null;
  const styles: Record<string, string> = {
    PRODUCT: 'bg-blue-600 text-white',
    STARTUP: 'bg-purple-600 text-white',
    ENTERPRISE: 'bg-slate-600 text-white',
    OUTSOURCE: 'bg-orange-500 text-white',
  };
  return <Badge className={['text-xs', styles[type] ?? 'bg-slate-500 text-white'].join(' ')}>{type}</Badge>;
}

function ProjectRow({ project }: { project: ParsedProject & { description?: string } }) {
  const [open, setOpen] = useState(false);
  const technologies = Array.isArray((project as any).techstack) ? (project as any).techstack : [];
  return (
    <div className="border-l-2 border-muted pl-3 ml-2">
      <button type="button" className="w-full flex items-center gap-2 py-1.5 text-left hover:bg-muted/30 rounded px-1 transition-colors" onClick={() => setOpen((value) => !value)}>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        <span className="text-sm font-medium">{project.name}</span>
        {project.role && <span className="text-xs text-muted-foreground">- {project.role}</span>}
        <span className="ml-auto text-xs text-muted-foreground">{yearRange(project.startYear, project.endYear)}</span>
      </button>
      {open && <div className="pl-6 pb-2 space-y-2 text-xs text-muted-foreground">
        {technologies.length > 0 && <div className="flex flex-wrap gap-1 pt-1">{technologies.map((item: unknown) => <Badge key={String(item)} variant="secondary" className="text-xs">{String(item)}</Badge>)}</div>}
        {project.description && <p className="italic">{project.description}</p>}
      </div>}
    </div>
  );
}

function WorkExperienceCard({ workExperience, sectionScore }: { workExperience: WorkExperience[]; sectionScore?: ProfileSectionScore }) {
  const keyedEntries = stableKeyedItems(workExperience, (entry) => JSON.stringify(entry), 'work-experience');
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-3">Work Experience {sectionScore && <SectionScoreBadge score={sectionScore} />}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {keyedEntries.map(({ item: entry, key }) => <CompanyRow key={key} entry={entry} />)}
      </CardContent>
    </Card>
  );
}

function CompanyRow({ entry }: { entry: WorkExperience }) {
  const [open, setOpen] = useState(true);
  const projects = entry.projects ?? [];
  const keyedProjects = stableKeyedItems(projects, (project) => JSON.stringify(project), 'company-project');
  return (
    <div className="rounded-lg border bg-card">
      <button type="button" className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors rounded-lg" onClick={() => setOpen((value) => !value)}>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
        <span className="font-semibold text-sm flex-1">{entry.company}</span>
        {yearRange(entry.startYear, entry.endYear) && <span className="text-xs text-muted-foreground">{yearRange(entry.startYear, entry.endYear)}</span>}
        {companyTypeBadge(entry.companyType)}
      </button>
      {open && <div className="px-4 pb-3 space-y-3 text-sm">
        {entry.role && <p className="text-xs text-muted-foreground pl-7">{entry.role}</p>}
        {entry.summary && <p className="pl-7 text-muted-foreground">{entry.summary}</p>}
        {entry.technologies?.length ? <div className="flex flex-wrap gap-1 pl-7">{entry.technologies.map((technology) => <Badge key={technology} variant="secondary" className="text-xs">{technology}</Badge>)}</div> : null}
        {projects.length > 0 && <div className="space-y-1 pl-4">{keyedProjects.map(({ item: project, key }) => <ProjectRow key={key} project={project} />)}</div>}
        {!entry.summary && !entry.technologies?.length && !projects.length && <p className="pl-7 text-xs text-muted-foreground italic">No details listed</p>}
      </div>}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | number }) {
  if (value === undefined || value === null || value === '') return null;
  return <div className="flex gap-2 items-start"><span className="text-muted-foreground w-32 shrink-0">{label}</span><span>{value}</span></div>;
}

function TagSection({ label, items }: { label: string; items: string[] }) {
  return <div><p className="font-semibold mb-2">{label}</p><div className="flex flex-wrap gap-1">{items.map((item) => <Badge key={item} variant="secondary" className="text-xs">{item}</Badge>)}</div></div>;
}

function GroupedSkillsSection({ data }: { data: Record<string, string[]> }) {
  const groups = Object.entries(data ?? {});
  return <div><p className="font-semibold mb-2">Skills</p><div className="space-y-2">{groups.map(([category, items]) => <div key={category}><p className="text-xs text-muted-foreground mb-1">{category}</p><div className="flex flex-wrap gap-1">{(Array.isArray(items) ? items : []).map((item) => <Badge key={item} variant="secondary" className="text-xs">{item}</Badge>)}</div></div>)}</div></div>;
}

function ExperienceByLanguage({ data }: { data: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  return <div><button type="button" className="flex items-center gap-1.5 font-semibold mb-1 hover:text-foreground/80 transition-colors" onClick={() => setOpen((value) => !value)}>{open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}Experience by Language</button>{open && <div className="grid grid-cols-3 gap-2 pl-5">{Object.entries(data).map(([language, years]) => <div key={language} className="flex justify-between border rounded px-3 py-1.5 text-xs"><span className="font-medium">{language}</span><span className="text-muted-foreground">{years}y</span></div>)}</div>}</div>;
}

function InterestedInformationCard({ signals }: { signals: VcsSignals }) {
  return (
    <Card className="border-2 border-blue-300 shadow-md">
      <CardHeader className="bg-blue-50/60 rounded-t-lg pb-3">
        <CardTitle className="text-lg">Interested Information</CardTitle>
        <p className="text-xs text-muted-foreground">AI evaluated from CV content</p>
      </CardHeader>
      <CardContent className="pt-5 space-y-4">
        <SignalLine label="Education" ok={signals.university?.ok}>{signals.university?.name}</SignalLine>
        <SignalLine label="Company Type" ok={signals.companyType?.ok}>{signals.companyType?.companies?.join(', ') || signals.companyType?.evidence}</SignalLine>
        <SignalLine label="Advanced Skills" ok={signals.advancedSkills?.ok}>{signals.advancedSkills?.items?.map((item) => item.skill).join(', ') || signals.advancedSkills?.evidence}</SignalLine>
        <SignalLine label="Technical Challenges" ok={signals.technicalChallenges?.ok}>{signals.technicalChallenges?.items?.map((item) => item.challenge).join(', ') || signals.technicalChallenges?.evidence}</SignalLine>
        <SignalLine label="Senior Roles" ok={signals.seniorRoles?.ok}>{signals.seniorRoles?.items?.map((item) => item.role).join(', ') || signals.seniorRoles?.evidence}</SignalLine>
      </CardContent>
    </Card>
  );
}

function SignalLine({ label, ok, children }: { label: string; ok?: boolean; children?: any }) {
  return <div className="flex items-start justify-between gap-4 border-b pb-3 last:border-b-0"><div><p className="font-semibold text-sm">{label}</p><p className="text-xs text-muted-foreground mt-1">{children || 'No evidence available.'}</p></div><Badge variant="outline" className={ok ? 'text-green-700 border-green-300' : 'text-muted-foreground'}>{ok ? 'OK' : 'Not OK'}</Badge></div>;
}

function getCompletenessLabel(completeness: number) {
  if (completeness >= 80) return 'Good';
  if (completeness >= 60) return 'Fair';
  return 'Weak';
}

function AiAnalysisCard({ validation }: { validation: any }) {
  const completeness = validation.completenessScore;
  const overallLabel = getCompletenessLabel(completeness);
  const keyedHighlights = stableKeyedItems(validation.highlights ?? [], (item: string) => item, 'highlight');
  const keyedConcerns = stableKeyedItems(validation.concerns ?? [], (item: string) => item, 'concern');
  return <Card><CardHeader><CardTitle className="flex items-center gap-3">AI Profile Analysis <span className="text-sm font-normal px-2 py-0.5 rounded border text-green-700 bg-green-50 border-green-200">Overall: {completeness}/100 - {overallLabel}</span></CardTitle></CardHeader><CardContent className="space-y-4 text-sm">{validation.summary && <p className="text-muted-foreground leading-relaxed">{validation.summary}</p>}{validation.sectionScores?.length ? <div><p className="font-semibold mb-3">Category Scores</p><div className="space-y-2">{validation.sectionScores.map((score: ProfileSectionScore) => <div key={score.section} className="flex items-center justify-between gap-3"><span className="text-muted-foreground text-xs">{score.section}</span><span className="text-xs font-semibold">{score.score}/10 - {score.label}</span></div>)}</div></div> : null}{keyedHighlights.length ? <div><p className="font-semibold mb-2 text-green-700">Highlights</p><ul className="space-y-1">{keyedHighlights.map(({ item, key }) => <li key={key} className="flex gap-2"><span className="text-green-600">✓</span><span>{item}</span></li>)}</ul></div> : null}{keyedConcerns.length ? <div><p className="font-semibold mb-2 text-destructive">Concerns</p><ul className="space-y-1">{keyedConcerns.map(({ item, key }) => <li key={key} className="flex gap-2"><span className="text-destructive">!</span><span>{item}</span></li>)}</ul></div> : null}</CardContent></Card>;
}

function AnomalyDetectionCard({ anomalyDetection }: { anomalyDetection: ProfileAnomalyDetection }) {
  const keyedAnomalies = stableKeyedItems(anomalyDetection.anomalies ?? [], (anomaly) => JSON.stringify(anomaly), 'anomaly');
  return <Card><CardHeader><CardTitle className="flex items-center gap-3"><ShieldAlert className="h-5 w-5 text-orange-500" />AI Risk &amp; Anomaly Assessment <Badge variant="outline">{anomalyDetection.riskLevel?.toUpperCase() ?? 'NOT ANALYZED'}</Badge></CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><div className="flex items-center gap-3"><TrendingDown className="h-4 w-4 text-orange-500" /><span className="font-semibold">{anomalyDetection.overallRiskScore}/100</span></div><p className="text-muted-foreground">{anomalyDetection.summary}</p>{keyedAnomalies.length ? keyedAnomalies.map(({ item: anomaly, key }) => <div key={key} className="rounded border p-3"><div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" />{anomaly.type}</div><p className="mt-1">{anomaly.description}</p><p className="mt-1 text-xs text-muted-foreground">{anomaly.evidence}</p></div>) : <p className="text-muted-foreground">No anomaly detected.</p>}</CardContent></Card>;
}
