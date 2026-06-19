// One-time script: generates apps/backend/public/templates/BM04_template.xlsx
// Run from project root: node scripts/gen-bm04-template.js
const ExcelJS = require('../node_modules/.pnpm/exceljs@4.4.0/node_modules/exceljs');
const path = require('path');

const navy = 'FF1F3864', blue = 'FFBDD7EE', blueLight = 'FFDEEAF1',
      gray = 'FFD6DCE4', sub = 'FFEBF3FB', white = 'FFFFFFFF';

const T = { style: 'thin' };
const BD = { top: T, left: T, bottom: T, right: T };

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('BM04. Đánh giá sau Interview');

ws.getColumn('A').width = 5;
ws.getColumn('B').width = 28;
ws.getColumn('C').width = 40;
ws.getColumn('D').width = 40;
ws.getColumn('E').width = 14;
ws.getColumn('F').width = 14;
ws.getColumn('G').width = 14;
ws.getColumn('H').width = 14;

function setCell(ref, val, opts) {
  opts = opts || {};
  const c = ws.getCell(ref);
  if (val !== undefined) c.value = val;
  if (opts.bold || opts.size || opts.color) {
    c.font = { bold: opts.bold, size: opts.size, color: opts.color ? { argb: opts.color } : undefined };
  }
  if (opts.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
  c.alignment = { horizontal: opts.h || 'left', vertical: opts.v || 'middle', wrapText: opts.wrap !== false };
  c.border = BD;
  return c;
}

function hdr(r, text, fill) {
  ws.mergeCells('A' + r + ':H' + r);
  setCell('A' + r, text, { bold: true, fill: fill || blue, h: 'left' });
  ws.getRow(r).height = 22;
}

function infoRow(r, lbl) {
  ws.mergeCells('A' + r + ':B' + r);
  setCell('A' + r, lbl, { bold: true });
  ws.mergeCells('C' + r + ':H' + r);
  ws.getCell('C' + r).border = BD;
  ws.getRow(r).height = 20;
}

// ── Row 1: Title ─────────────────────────────────────────────
ws.mergeCells('A1:H1');
setCell('A1', 'BM04 - QTTD: FORM ĐÁNH GIÁ ỨNG VIÊN SAU PHỎNG VẤN', { bold: true, size: 13, color: white, fill: navy, h: 'center' });
ws.getRow(1).height = 30;

// ── Rows 2-3: Sub-title ───────────────────────────────────────
ws.mergeCells('A2:B3');
setCell('A2', 'ĐÁNH GIÁ SAU 1ST INTERVIEW', { bold: true, fill: blue });
setCell('C2', 'Date:', {});
ws.getRow(2).height = 18;
ws.getRow(3).height = 18;

// ── Section I: Candidate info ────────────────────────────────
hdr(5, 'I. THÔNG TIN ỨNG VIÊN');
infoRow(6, 'Họ và tên');            // C6 = candidate name
infoRow(7, 'Năm sinh');        // C7 = birthYear
infoRow(8, 'Vị trí apply');    // C8 = position
infoRow(9, 'Người đánh giá (HM/HĐCM)');
infoRow(10, 'Kết quả đánh giá'); // C10 = overallResult
infoRow(11, 'Đơn vị / Dự án bố trí'); // C11 = plannedAssignment

// ── Section II: HR ───────────────────────────────────────────
hdr(13, 'II. ĐÁNH GIÁ CỦA HR');
for (const [col, text] of [['A','STT'],['B','Nội dung yêu cầu'],['C','Yêu cầu'],['D','Thông tin nhân sự'],['E','Đánh giá'],['F','Ghi chú'],['G',''],['H','']]) {
  setCell(col + '14', text, { bold: true, fill: gray, h: 'center' });
}
ws.getRow(14).height = 18;

ws.mergeCells('A15:A20');
setCell('A15', 'I', { bold: true, fill: sub, h: 'center' });
ws.mergeCells('B15:H15');
setCell('B15', 'Yêu cầu về chuyên môn', { bold: true, fill: sub });
ws.getRow(15).height = 18;

// HR rows: D column = data, E-F merged placeholder
for (const [r, stt, b, req] of [
  [16, '1', '- Kiến thức:', ''],       // D16 = hr.knowledge
  [17, '2', '- Kỹ năng:', ''],          // D17 = hr.skills
  [18, '3', '- Ngoại ngữ:', '550 TOEIC'], // D18 = hr.language
  [19, '4', '- Bằng cấp/chứng chỉ:', 'Tốt nghiệp ĐH CNTT'], // D19 = hr.certificates
  [20, '5', '- Kinh nghiệm:', '2-4 năm'], // D20 = hr.experience
]) {
  setCell('A' + r, stt, { h: 'center' });
  setCell('B' + r, b, {});
  setCell('C' + r, req, {});
  ws.mergeCells('D' + r + ':F' + r);
  ws.getCell('D' + r).border = BD;
  ws.getRow(r).height = 24;
}

ws.mergeCells('A21:A23');
setCell('A21', 'II', { bold: true, fill: sub, h: 'center' });
ws.mergeCells('B21:H21');
setCell('B21', 'Yêu cầu về con người', { bold: true, fill: sub });
ws.getRow(21).height = 18;

setCell('A22', '1', { h: 'center' });
setCell('B22', 'Phẩm chất:', {});         // D22 = hr.character
ws.mergeCells('D22:F22');
ws.getCell('D22').border = BD;
ws.getRow(22).height = 24;

setCell('A23', '2', { h: 'center' });
setCell('B23', 'Định hướng công việc:', {}); // D23 = hr.careerGoal
ws.mergeCells('D23:F23');
ws.getCell('D23').border = BD;
ws.getRow(23).height = 24;

// ── Section III: Technical ────────────────────────────────────
hdr(25, 'III. ĐÁNH GIÁ CỦA HỘI ĐỒNG CHUYÊN MÔN');

ws.getCell('A27').border = BD;
ws.mergeCells('B27:C27');
setCell('B27', 'YÊU CẦU', { bold: true, fill: gray, h: 'center' });
setCell('D27', 'ĐÁNH GIÁ CỦA HĐCM', { bold: true, fill: gray, h: 'center' });
ws.mergeCells('E27:H27');
setCell('E27', 'ĐÁNH GIÁ MỨC ĐỘ', { bold: true, fill: gray, h: 'center' });
ws.getRow(27).height = 18;

ws.getCell('A28').border = BD;
ws.mergeCells('B28:C28');
setCell('B28', 'ĐÁNH GIÁ THEO LEVEL:', { bold: true, fill: blue }); // B28 filled with level text
ws.getCell('D28').border = BD;
for (const [col, lbl] of [
  ['E', 'Mức 1\n(Không đạt)'],
  ['F', 'Mức 2\n(Hiểu cơ bản)'],
  ['G', 'Mức 3\n(Triển khai thực tế)'],
  ['H', 'Mức 4\n(Giải quyết vấn đề)'],
]) {
  setCell(col + '28', lbl, { bold: true, fill: gray, h: 'center', wrap: true });
}
ws.getRow(28).height = 42;

ws.getCell('A29').border = BD;
ws.mergeCells('B29:H29');
setCell('B29', '1. KIẾN THỨC CHUYÊN MÔN', { bold: true, fill: blueLight });
ws.getRow(29).height = 18;

// MUST rows 30-39: C=label, D=comment data, E/F/G/H=x marks
ws.mergeCells('B30:B39');
setCell('B30', 'MUST', { bold: true, fill: sub, h: 'center' });
const mustItems = [
  [30, '- Ngôn ngữ lập trình'],
  [31, '- OOP + Design Pattern'],
  [32, '- Thuật toán + Cấu trúc dữ liệu'],
  [33, '- Cơ sở dữ liệu'],
  [34, '- Đa luồng'],
  [35, '- Tech stack'],
  [36, '- Docker'],
  [37, '- Git/SVN'],
  [38, '- Microservices'],
  [39, '- Lập trình an toàn'],
];
for (const [r, text] of mustItems) {
  ws.getCell('A' + r).border = BD;
  setCell('C' + r, text, {});
  ws.getCell('D' + r).border = BD;
  for (const col of ['E','F','G','H']) setCell(col + r, '', { h: 'center' });
  ws.getRow(r).height = 38;
}

// SHOULD rows 40-43
ws.mergeCells('B40:B43');
setCell('B40', 'SHOULD', { bold: true, fill: sub, h: 'center' });
const shouldItems = [
  [40, '- Agile/Scrum'],
  [41, '- Unit test'],
  [42, '- Mạng máy tính'],
  [43, '- DevOps'],
];
for (const [r, text] of shouldItems) {
  ws.getCell('A' + r).border = BD;
  setCell('C' + r, text, {});
  ws.getCell('D' + r).border = BD;
  for (const col of ['E','F','G','H']) setCell(col + r, '', { h: 'center' });
  ws.getRow(r).height = 38;
}

// Soft skill section: row 44 subheader, rows 45-48 items
ws.getCell('A44').border = BD;
ws.mergeCells('B44:H44');
setCell('B44', '2. KỸ NĂNG NGHIỆP VỤ', { bold: true, fill: blueLight });
ws.getRow(44).height = 18;

const softSkillItems = [
  [45, '- Giao tiếp'],
  [46, '- Thuyết trình'],
  [47, '- Báo cáo'],
  [48, '- Thuyết phục'],
];
for (const [r, text] of softSkillItems) {
  ws.getCell('A' + r).border = BD;
  ws.getCell('B' + r).border = BD;
  setCell('C' + r, text, {});
  ws.getCell('D' + r).border = BD;
  for (const col of ['E','F','G','H']) setCell(col + r, '', { h: 'center' });
  ws.getRow(r).height = 38;
}

// ── Zone assessment row 49 ────────────────────────────────────
// C49 = zoneResult, D49:H49 merged = zoneExplanation
ws.getCell('A49').border = BD;
setCell('B49', 'ĐÁNH GIÁ VÙNG', { bold: true, fill: blue });
ws.getCell('C49').border = BD;
ws.mergeCells('D49:H49');
ws.getCell('D49').border = BD;
ws.getRow(49).height = 28;

// ── Section IV: Personality ───────────────────────────────────
hdr(50, 'IV. NHẬN DIỆN VỀ CON NGƯỜI');
ws.getCell('A51').border = BD;
ws.mergeCells('B51:C51');
setCell('B51', 'NHẬN DIỆN VỀ CON NGƯỜI', { bold: true, fill: gray, h: 'center' });
setCell('D51', 'GHI NHẬN CỦA HĐCM', { bold: true, fill: gray, h: 'center' });
for (const [col, lbl] of [
  ['E', 'Mức 1\n(Yếu/ Không rõ ràng)'],
  ['F', 'Mức 2\n(Thể hiện cơ bản)'],
  ['G', 'Mức 3\n(Thể hiện rõ ràng)'],
  ['H', 'Mức 4\n(Thể hiện mạnh mẽ, mang giá trị riêng)'],
]) {
  setCell(col + '51', lbl, { bold: true, fill: gray, h: 'center' });
}
ws.getRow(51).height = 36;

// Personality rows 52-56: D=note data, E/F/G/H=x marks
const personalityItems = [
  [52, 'Phẩm chất đạo đức'],
  [53, 'Tính kỷ luật'],
  [54, 'Tinh thần trách nhiệm'],
  [55, 'Khả năng chịu áp lực'],
  [56, 'Động lực làm việc'],
];
for (const [r, cat] of personalityItems) {
  ws.getCell('A' + r).border = BD;
  ws.mergeCells('B' + r + ':C' + r);
  setCell('B' + r, cat, {});
  ws.getCell('D' + r).border = BD;
  for (const col of ['E','F','G','H']) setCell(col + r, '', { h: 'center' });
  ws.getRow(r).height = 34;
}

// ── Section V: Other ─────────────────────────────────────────
hdr(58, 'V. THÔNG TIN KHÁC');
// C59 = jobDescription, C60 = plannedAssignment, C61 = expectedSalary, C62 = noticePeriod
for (const [r, lbl] of [
  [59, 'Mô tả theo JD'],
  [60, 'Dự kiến bố trí công việc'],
  [61, 'Mức lương mong muốn'],
  [62, 'Notice period'],
]) {
  ws.mergeCells('A' + r + ':B' + r);
  setCell('A' + r, lbl, { bold: true });
  ws.mergeCells('C' + r + ':H' + r);
  ws.getCell('C' + r).border = BD;
  ws.getRow(r).height = 20;
}

// ── Section VI: Overall notes ────────────────────────────────
hdr(64, 'VI. NHẬN XÉT CHUNG');
ws.mergeCells('A65:H65');
ws.getCell('A65').border = BD;
ws.getRow(65).height = 60;

const outPath = path.resolve(__dirname, '../apps/backend/public/templates/BM04_template.xlsx');
wb.xlsx.writeFile(outPath)
  .then(() => console.log('Template written to', outPath))
  .catch(e => { console.error(e); process.exit(1); });
