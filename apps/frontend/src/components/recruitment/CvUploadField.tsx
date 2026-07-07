import { ChangeEvent, useRef } from 'react';
import { FileText, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const CV_ACCEPT = '.pdf,application/pdf';
export const MAX_CV_FILE_SIZE_BYTES = 20 * 1024 * 1024;

const ALLOWED_CV_EXTENSIONS = new Set(['.pdf']);

export function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function validateCvFile(file: File): string | null {
  const fileName = file.name.toLowerCase();
  const extension = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '';

  if (!ALLOWED_CV_EXTENSIONS.has(extension)) {
    return 'Hien tai he thong chi ho tro CV dang PDF de dam bao quet va tao CV sach.';
  }

  if (file.size > MAX_CV_FILE_SIZE_BYTES) {
    return 'File vuot dung luong cho phep. Vui long chon file nho hon.';
  }

  if (file.size <= 0) {
    return 'CV chua hop le. Vui long chon file khac.';
  }

  return null;
}

interface CvUploadFieldProps {
  file: File | null;
  error?: string;
  disabled?: boolean;
  onFileChange: (file: File | null, error?: string) => void;
}

export function CvUploadField({
  file,
  error,
  disabled,
  onFileChange,
}: CvUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    if (!nextFile) {
      onFileChange(null);
      return;
    }

    onFileChange(nextFile, validateCvFile(nextFile) ?? undefined);
  };

  const clearFile = () => {
    if (inputRef.current) inputRef.current.value = '';
    onFileChange(null);
  };

  return (
    <div className="space-y-3">
      <label
        htmlFor="cv-file"
        className={cn(
          'flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
          disabled
            ? 'cursor-not-allowed border-muted bg-muted/20 text-muted-foreground'
            : 'border-muted-foreground/30 hover:border-primary hover:bg-primary/5',
          error && 'border-destructive/60 bg-destructive/5',
        )}
      >
        <Upload className="mb-3 h-6 w-6 text-muted-foreground" />
        <span className="text-sm font-medium">Chon CV de ung tuyen</span>
        <span className="mt-1 text-xs text-muted-foreground">
          Ho tro PDF, toi da 20 MB.
        </span>
        <input
          ref={inputRef}
          id="cv-file"
          type="file"
          accept={CV_ACCEPT}
          className="hidden"
          disabled={disabled}
          onChange={handleChange}
        />
      </label>

      {file && (
        <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{file.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatFileSize(file.size)}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={clearFile}
            disabled={disabled}
            aria-label="Remove CV file"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
