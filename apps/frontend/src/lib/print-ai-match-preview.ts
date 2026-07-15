const EXPORT_CLASS_NAME = 'ai-match-preview-exporting';

type ExportAiMatchPreviewOptions = {
  element: HTMLElement;
  filename: string;
};

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function sanitizeFilename(filename: string): string {
  const safeFilename = filename.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').trim();
  return safeFilename.endsWith('.pdf') ? safeFilename : `${safeFilename}.pdf`;
}

/**
 * Captures the rendered AI Match Preview and downloads it as a multi-page PDF.
 */
export async function exportAiMatchPreviewToPdf({
  element,
  filename,
}: ExportAiMatchPreviewOptions): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  document.body.classList.add(EXPORT_CLASS_NAME);

  try {
    await nextAnimationFrame();
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      height: element.scrollHeight,
      logging: false,
      scale: Math.min(window.devicePixelRatio || 1, 2),
      useCORS: true,
      width: element.scrollWidth,
    });

    const pdf = new jsPDF({ compress: true, format: 'a4', orientation: 'portrait', unit: 'mm' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const contentWidth = pageWidth - margin * 2;
    const contentHeight = pageHeight - margin * 2;
    const pageHeightInPixels = Math.max(
      1,
      Math.floor((contentHeight / contentWidth) * canvas.width),
    );

    let offsetY = 0;
    let pageIndex = 0;
    while (offsetY < canvas.height) {
      const sliceHeight = Math.min(pageHeightInPixels, canvas.height - offsetY);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;
      const context = pageCanvas.getContext('2d');

      if (!context) {
        throw new Error('Could not prepare the AI Match Preview PDF.');
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      context.drawImage(
        canvas,
        0,
        offsetY,
        canvas.width,
        sliceHeight,
        0,
        0,
        pageCanvas.width,
        pageCanvas.height,
      );

      if (pageIndex > 0) {
        pdf.addPage();
      }

      const imageHeight = (sliceHeight / canvas.width) * contentWidth;
      pdf.addImage(
        pageCanvas.toDataURL('image/jpeg', 0.92),
        'JPEG',
        margin,
        margin,
        contentWidth,
        imageHeight,
      );

      offsetY += sliceHeight;
      pageIndex += 1;
    }

    pdf.save(sanitizeFilename(filename));
  } finally {
    document.body.classList.remove(EXPORT_CLASS_NAME);
  }
}
