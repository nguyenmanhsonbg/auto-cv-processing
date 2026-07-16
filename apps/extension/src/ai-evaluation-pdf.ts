type PdfValue = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : '';
}

function ascii(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^\x20-\x7E]/g, '?');
}

function escapePdf(value: string) {
  return ascii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function linesForDetail(detail: PdfValue) {
  const candidate = (detail.candidate ?? {}) as PdfValue;
  const job = (detail.jobPosting ?? {}) as PdfValue;
  const mapping = (detail.mapping ?? {}) as PdfValue;
  const ai = (detail.aiScreening ?? {}) as PdfValue;
  const lines = [
    'AI MATCH PREVIEW - VCS RECRUITMENT',
    '',
    `Ung vien: ${text(candidate.fullName) || 'N/A'}`,
    `Email: ${text(candidate.email) || 'N/A'}`,
    `Dien thoai: ${text(candidate.phone) || 'N/A'}`,
    `Vi tri: ${text(job.title) || 'N/A'}`,
    '',
    `Diem mapping: ${text(mapping.score) || 'N/A'}`,
    `Khuyen nghi mapping: ${text(mapping.recommendation) || 'N/A'}`,
    `Diem AI screening: ${text(ai.score) || 'N/A'}`,
    `Khuyen nghi AI: ${text(ai.recommendation) || 'N/A'}`,
    '',
    'Tom tat AI:',
    ...wrap(text(ai.summary) || 'Chua co tom tat AI.', 92),
    '',
    'Diem manh:',
    ...insights(ai.strengths),
    '',
    'Khoang thieu:',
    ...insights(ai.gaps),
    '',
    'Rui ro:',
    ...insights(ai.risks),
    '',
    `Tao luc: ${text(ai.createdAt) || new Date().toISOString()}`,
  ];
  return lines.flatMap((line) => wrap(line, 92));
}

function insights(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return ['- Khong co du lieu.'];
  return value.flatMap((item) => {
    const record = (item ?? {}) as PdfValue;
    const title = text(record.title) || text(record.name) || 'Item';
    const evidence = text(record.evidence) || text(record.description);
    return wrap(`- ${title}${evidence ? `: ${evidence}` : ''}`, 92);
  });
}

function wrap(value: string, width: number) {
  if (!value) return [''];
  const words = ascii(value).split(/\s+/);
  const result: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + (current ? ' ' : '') + word).length > width && current) {
      result.push(current);
      current = word;
    } else {
      current += `${current ? ' ' : ''}${word}`;
    }
  }
  if (current) result.push(current);
  return result;
}

export function createAiEvaluationPdf(detail: PdfValue) {
  const pageLines = linesForDetail(detail);
  const pages: string[][] = [];
  for (let index = 0; index < pageLines.length; index += 48) pages.push(pageLines.slice(index, index + 48));

  const objects: string[] = [];
  const add = (value: string) => { objects.push(value); return objects.length; };
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds: number[] = [];
  const contentIds: number[] = [];
  for (const page of pages) {
    const commands = ['BT', '/F1 10 Tf', '50 790 Td', '14 TL', ...page.map((line) => `(${escapePdf(line)}) Tj T*`), 'ET'].join('\n');
    contentIds.push(add(`<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`));
    pageIds.push(0);
  }
  const pagesId = add('');
  pageIds.forEach((_, index) => {
    pageIds[index] = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentIds[index]} 0 R >>`);
  });
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
