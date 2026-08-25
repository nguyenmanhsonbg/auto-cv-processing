import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileText, FileSpreadsheet, Download, CheckCircle2 } from 'lucide-react';

export interface ExportReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asOfDate?: string;
  scope?: string;
}

export const ExportReportModal: React.FC<ExportReportModalProps> = ({
  open,
  onOpenChange,
  asOfDate = '01/01/2026 – 11/08/2026',
  scope = 'Toàn Công ty',
}) => {
  const [format, setFormat] = useState<'excel' | 'pdf'>('excel');
  const [isExporting, setIsExporting] = useState(false);
  const [exported, setExported] = useState(false);

  const handleExport = () => {
    setIsExporting(true);
    setTimeout(() => {
      setIsExporting(false);
      setExported(true);
      setTimeout(() => {
        setExported(false);
        onOpenChange(false);
      }, 1200);
    }, 800);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#111827] border border-slate-800 text-slate-100 sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2 text-white">
            <span className="w-2 h-4 bg-rose-500 rounded-sm"></span>
            Xuất Báo Cáo Tuyển Dụng & Nhân Sự 2026
          </DialogTitle>
          <DialogDescription className="text-slate-400 text-xs">
            Trích xuất dữ liệu tổng hợp theo chu kỳ YTD và phân tích hiệu suất tuyển dụng.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3 text-xs">
          <div className="bg-[#0b0f19] p-3 rounded-lg border border-slate-800 space-y-1.5">
            <div className="flex justify-between text-slate-400">
              <span>Phạm vi:</span>
              <span className="text-white font-medium">{scope}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Kỳ báo cáo:</span>
              <span className="text-rose-400 font-medium">YTD {asOfDate}</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-slate-300 font-semibold block">Định dạng xuất:</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormat('excel')}
                className={`p-3 rounded-lg border flex flex-col items-center gap-2 cursor-pointer transition ${
                  format === 'excel'
                    ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300'
                    : 'border-slate-800 bg-[#0f172a] text-slate-400 hover:border-slate-700'
                }`}
              >
                <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
                <span className="font-semibold">Excel (.xlsx / BM04)</span>
                <span className="text-[10px] text-slate-400">Bảng tính chi tiết</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat('pdf')}
                className={`p-3 rounded-lg border flex flex-col items-center gap-2 cursor-pointer transition ${
                  format === 'pdf'
                    ? 'border-rose-500 bg-rose-950/40 text-rose-300'
                    : 'border-slate-800 bg-[#0f172a] text-slate-400 hover:border-slate-700'
                }`}
              >
                <FileText className="w-6 h-6 text-rose-400" />
                <span className="font-semibold">PDF Report (.pdf)</span>
                <span className="text-[10px] text-slate-400">Bản in trực quan</span>
              </button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Hủy
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting || exported}
            className="bg-rose-700 hover:bg-rose-600 text-white font-semibold flex items-center gap-2"
          >
            {exported ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Đã tải xuống
              </>
            ) : isExporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Đang trích xuất...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Tải Báo Cáo
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
