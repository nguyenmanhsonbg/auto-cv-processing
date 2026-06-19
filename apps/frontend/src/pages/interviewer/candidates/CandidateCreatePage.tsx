import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { Upload, Loader2, FileText, CheckCircle2, XCircle, X } from 'lucide-react';
import { WebSocketEvents } from '@interview-assistant/shared';

interface UploadItem {
  fileIndex: number;
  fileName: string;
  stage: 'pending' | 'parsing' | 'analyzing' | 'saving' | 'done' | 'error';
  totalFiles: number;
  candidateId?: string;
  error?: string;
}

interface UploadResult {
  candidateId: string;
  slug?: string;
  errors: Array<{ fileName: string; error: string }>;
}

const STAGE_LABELS: Record<UploadItem['stage'], string> = {
  pending: 'Waiting…',
  parsing: 'Parsing file…',
  analyzing: 'Running AI analysis…',
  saving: 'Saving candidate…',
  done: 'Done',
  error: 'Failed',
};

const STAGE_PROGRESS: Record<UploadItem['stage'], number> = {
  pending: 5,
  parsing: 25,
  analyzing: 55,
  saving: 85,
  done: 100,
  error: 100,
};

function FileProgressCard({ item }: { item: UploadItem }) {
  const pct = STAGE_PROGRESS[item.stage];
  const isError = item.stage === 'error';
  const isDone = item.stage === 'done';

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium truncate">{item.fileName}</span>
        </div>
        <div className="shrink-0">
          {isDone && <CheckCircle2 className="h-4 w-4 text-green-500" />}
          {isError && <XCircle className="h-4 w-4 text-destructive" />}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between items-center text-xs text-muted-foreground">
          <span className={isError ? 'text-destructive' : isDone ? 'text-green-600' : ''}>
            {STAGE_LABELS[item.stage]}
          </span>
          <span>{pct}%</span>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ease-out ${
              isError ? 'bg-destructive' : isDone ? 'bg-green-500' : 'bg-primary'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {isError && item.error && (
          <p className="text-xs text-destructive">{item.error}</p>
        )}
      </div>
    </div>
  );
}

export function CandidateCreatePage() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');
  const wasConnectedRef = useRef(false);

  // Cleanup socket listener on unmount
  useEffect(() => {
    return () => {
      const socket = getSocket();
      socket.off(WebSocketEvents.UPLOAD_PROGRESS);
      if (!wasConnectedRef.current) disconnectSocket();
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(e.target.files ?? []));
    setItems([]);
    setResult(null);
    setError('');
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (!files.length) return;

    setError('');
    setResult(null);

    const socket = getSocket();
    wasConnectedRef.current = socket.connected;
    if (!socket.connected) socket.connect();

    // Wait for socket connection to get socket.id
    const socketId = await new Promise<string>((resolve) => {
      if (socket.connected && socket.id) {
        resolve(socket.id);
        return;
      }
      socket.once('connect', () => resolve(socket.id!));
    });

    // Initialise progress items
    setItems(files.map((f, i) => ({
      fileIndex: i,
      fileName: f.name,
      stage: 'pending',
      totalFiles: files.length,
    })));
    setUploading(true);

    console.log('[upload] socketId:', socketId, '| files:', files.map(f => f.name));
    socket.onAny((event, ...args) => console.log('[socket] event:', event, args));

    socket.on(WebSocketEvents.UPLOAD_PROGRESS, (payload: UploadItem) => {
      console.log('[upload] progress event received:', payload);
      setItems((prev) =>
        prev.map((item) =>
          item.fileIndex === payload.fileIndex ? { ...item, ...payload } : item,
        ),
      );
    });

    try {
      const res = await apiClient.uploadMulti<UploadResult>(
        '/candidates/upload',
        files,
        { socketId },
      );
      setResult(res);
      toast({ title: 'Candidate created or updated' });
      navigate(`/candidates/${res.slug || res.candidateId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      socket.off(WebSocketEvents.UPLOAD_PROGRESS);
      socket.offAny();
      if (!wasConnectedRef.current) disconnectSocket();
      setUploading(false);
    }
  };

  const isDone = result !== null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Upload Candidate Profiles</h1>

      <Card>
        <CardHeader>
          <CardTitle>Select Files</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload one or more profile files (PDF, XLSX, DOCX). Each file is parsed and analyzed once.
            Candidates are matched by email — existing candidates will be updated, new ones created.
          </p>

          <div>
            <label
              htmlFor="profile-files"
              className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                uploading
                  ? 'border-muted bg-muted/20 cursor-not-allowed'
                  : 'border-muted-foreground/30 hover:border-primary hover:bg-primary/5'
              }`}
            >
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Upload className="h-6 w-6" />
                <span className="text-sm">Click to select files</span>
                <span className="text-xs">.pdf · .xlsx · .xls · .docx</span>
              </div>
              <input
                id="profile-files"
                type="file"
                multiple
                accept=".pdf,.xlsx,.xls,.docx"
                className="hidden"
                onChange={handleFileChange}
                disabled={uploading}
              />
            </label>
          </div>

          {files.length > 0 && !uploading && !isDone && (
            <div className="space-y-1.5">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{f.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      ({(f.size / 1024).toFixed(0)} KB)
                    </span>
                  </div>
                  <button
                    onClick={() => removeFile(i)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label="Remove file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">{error}</div>
          )}

          {!isDone && (
            <div className="flex gap-3">
              <Button
                onClick={handleUpload}
                disabled={uploading || files.length === 0}
              >
                {uploading
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading…</>
                  : <><Upload className="h-4 w-4 mr-2" />Upload & Create</>
                }
              </Button>
              <Button variant="outline" onClick={() => navigate('/candidates')} disabled={uploading}>
                Cancel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-file progress */}
      {items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.map((item) => (
              <FileProgressCard key={item.fileIndex} item={item} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Results — navigation happens automatically; this card is a fallback if still on page */}
      {isDone && result && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            {result.errors.length > 0 && (
              <div className="space-y-1">
                {result.errors.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-destructive">
                    <XCircle className="h-4 w-4 shrink-0" />
                    <span className="truncate">{e.fileName}: {e.error}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <Button onClick={() => navigate(`/candidates/${result.slug || result.candidateId}`)}>
                View Candidate
              </Button>
              <Button variant="outline" onClick={() => navigate('/candidates')}>
                Back to Candidates
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setFiles([]);
                  setItems([]);
                  setResult(null);
                  setError('');
                }}
              >
                Upload More
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
