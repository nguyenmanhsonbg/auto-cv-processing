import React, { useState } from 'react';
import { CheckCircle2, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { importRecruitmentWorkbook } from '@/lib/dashboard-api';

export interface RecruitmentImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export const RecruitmentImportModal: React.FC<RecruitmentImportModalProps> = ({
  open,
  onOpenChange,
  onImported,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = (nextOpen: boolean) => {
    if (uploading) return;
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setFile(null);
      setResult(null);
      setError(null);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const summary = await importRecruitmentWorkbook(file);
      setResult({ created: summary.created, updated: summary.updated });
      onImported();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Import thất bại');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="bg-[#111827] border border-slate-800 text-slate-100 sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2 text-white">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            Import dữ liệu tuyển dụng
          </DialogTitle>
          <DialogDescription className="text-slate-400 text-xs">
            Workbook phải có 4 sheet: candidates, applications, interview_rounds, offers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-3 text-xs">
          <label className="border border-dashed border-slate-700 rounded-lg p-5 flex flex-col items-center gap-2 cursor-pointer hover:border-emerald-600">
            <Upload className="w-6 h-6 text-slate-400" />
            <span className="text-slate-300">Chọn file .xlsx</span>
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          {file && <p className="text-slate-300">Đã chọn: {file.name}</p>}
          {result && (
            <p className="text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Đã import: {result.created} tạo mới, {result.updated} cập nhật.
            </p>
          )}
          {error && <p className="text-rose-400">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={uploading} className="border-slate-700 text-slate-300 hover:bg-slate-800">
            Đóng
          </Button>
          <Button onClick={handleImport} disabled={!file || uploading} className="bg-emerald-700 hover:bg-emerald-600 text-white">
            {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Đang import...</> : 'Import workbook'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
