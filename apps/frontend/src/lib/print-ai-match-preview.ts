import { createElement, type ReactElement } from 'react';
import type { ParsedProfile } from '@interview-assistant/shared';
import type {
  ApplicationAiScreeningSummary,
  ApplicationMappingSummary,
} from '@/lib/recruitment-api';

type ExportAiMatchPreviewOptions = {
  profile?: ParsedProfile | null;
  mapping?: ApplicationMappingSummary | null;
  screening?: ApplicationAiScreeningSummary | null;
  candidate?: { fullName?: string | null; email?: string | null; phone?: string | null } | null;
  filename: string;
};

function sanitizeFilename(filename: string): string {
  const safeFilename = filename.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').trim();
  return safeFilename.endsWith('.pdf') ? safeFilename : `${safeFilename}.pdf`;
}

/** Generates a text/vector PDF from the profile data instead of rasterizing the UI. */
export async function createAiMatchPreviewPdfBlob({
  profile,
  mapping,
  screening,
  candidate,
}: Omit<ExportAiMatchPreviewOptions, 'filename'>): Promise<Blob> {
  const [{ pdf }, { AiMatchPreviewPdf }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('@/components/recruitment/AiMatchPreviewPdf'),
  ]);

  const pdfDocument = createElement(AiMatchPreviewPdf, {
    profile,
    mapping,
    screening,
    candidate,
  }) as unknown as ReactElement;
  return pdf(pdfDocument).toBlob();
}

export async function pdfBlobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function exportAiMatchPreviewToPdf({ filename, ...options }: ExportAiMatchPreviewOptions): Promise<void> {
  const blob = await createAiMatchPreviewPdfBlob(options);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = sanitizeFilename(filename);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
