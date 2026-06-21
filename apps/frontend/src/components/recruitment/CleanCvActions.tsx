import { Download, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { getInternalSafeErrorMessage } from '@/lib/api-errors';
import {
  downloadCleanCv,
  type CvDocumentMetadataRecord,
} from '@/lib/recruitment-api';

interface CleanCvActionsProps {
  applicationId: string;
  cvDocument?: CvDocumentMetadataRecord | null;
  disabledReason?: string;
  size?: 'sm' | 'default';
}

function isCleanCvAvailable(cvDocument?: CvDocumentMetadataRecord | null) {
  return Boolean(
    cvDocument?.cvDocumentId
    && cvDocument?.cleanFileUrl
    && cvDocument?.documentType === 'CLEAN'
    && cvDocument?.sanitizeStatus === 'SANITIZED',
  );
}

function cleanFileName(cvDocument: CvDocumentMetadataRecord) {
  return `clean-cv-v${cvDocument.versionNo}.pdf`;
}

export function CleanCvActions({
  applicationId,
  cvDocument,
  disabledReason = 'Clean CV is not available.',
  size = 'sm',
}: CleanCvActionsProps) {
  const available = isCleanCvAvailable(cvDocument);

  const handlePreview = async () => {
    if (!cvDocument?.cvDocumentId || !available) return;

    try {
      const blob = await downloadCleanCv(applicationId, cvDocument.cvDocumentId, 'inline');
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);

      if (!opened) {
        toast({
          title: 'Preview blocked',
          description: 'Allow popups for this site or use Download.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Preview failed',
        description: getInternalSafeErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  const handleDownload = async () => {
    if (!cvDocument?.cvDocumentId || !available) return;

    try {
      const blob = await downloadCleanCv(applicationId, cvDocument.cvDocumentId, 'attachment');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = cleanFileName(cvDocument);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({
        title: 'Download failed',
        description: getInternalSafeErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size={size}
        disabled={!available}
        title={available ? 'Preview clean CV' : disabledReason}
        onClick={() => void handlePreview()}
      >
        <Eye className="mr-2 h-4 w-4" />
        Preview
      </Button>
      <Button
        type="button"
        variant="outline"
        size={size}
        disabled={!available}
        title={available ? 'Download clean CV' : disabledReason}
        onClick={() => void handleDownload()}
      >
        <Download className="mr-2 h-4 w-4" />
        Download
      </Button>
    </div>
  );
}
