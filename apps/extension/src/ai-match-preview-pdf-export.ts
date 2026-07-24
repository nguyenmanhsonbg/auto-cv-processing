import { createElement, type ReactElement } from 'react';
import { pdf } from '@react-pdf/renderer';
import { AiMatchPreviewPdf } from './ai-match-preview-pdf';
import type { ApplicationAiScreeningSummary, ApplicationMappingSummary } from './ai-match-preview-pdf-types';

export async function createAiMatchPreviewPdfBase64(options: {
  profile?: Record<string, unknown> | null;
  mapping?: ApplicationMappingSummary | null;
  screening?: ApplicationAiScreeningSummary | null;
  candidate?: { fullName?: string | null; email?: string | null; phone?: string | null } | null;
}) {
  const document = createElement(AiMatchPreviewPdf, options) as unknown as ReactElement;
  const blob = await pdf(document).toBlob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
