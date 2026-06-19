import ExcelJS from 'exceljs';

const navy = 'FF1F3864', blue = 'FFBDD7EE', blueLight = 'FFDEEAF1',
      gray = 'FFD6DCE4', sub = 'FFEBF3FB', white = 'FFFFFFFF';

const T = { style: 'thin' };
const BD = { top: T, left: T, bottom: T, right: T };
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('BM04. Danh gia sau Interview');

ws.getColumn('A').width = 5;
ws.getColumn('B').width = 28;
ws.getColumn('C').width = 40;
ws.getColumn('D').width = 40;
ws.getColumn('E').width = 14;
ws.getColumn('F').width = 14;
ws.getColumn('G').width = 14;
ws.getColumn('H').width = 14;

function cell(ref, val, opts) {
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
  cell('A' + r, text, { bold: true, fill: fill || blue, h: 'left' });
  ws.getRow(r).height = 22;
}

function infoRow(r, labelText) {
  ws.mergeCells('A' + r + ':B' + r);
  cell('A' + r, labelText, { bold: true });
  ws.mergeCells('C' + r + ':H' + r);
  ws.getCell('C' + r).border = BD;
  ws.getRow(r).height = 20;
}

// Row 1: title
ws.mergeCells('A1:H1');
cell('A1', 'BM04 - QTTD: FORM DANH GIA UNG VIEN SAU PHONG VAN', { bold: true, size: 13, color: white, fill: navy, h: 'center' });
ws.getRow(1).height = 30;

// Row 2-3: subtitle
ws.mergeCells('A2:B3');
cell('A2', 'DANH GIA SAU 1ST INTERVIEW', { bold: true, fill: blue });
cell('C2', 'Date:', {});
ws.getRow(2).height = 18;
ws.getRow(3).height = 18;

// Section I
hdr(5, 'I. THONG TIN UNG VIEN');
infoRow(6, 'Name');
infoRow(7, 'Nam sinh');
infoRow(8, 'Vi tri apply');
infoRow(9, 'Nguoi danh gia (HM/HDCM)');
infoRow(10, 'Ket qua danh gia');
infoRow(11, 'Don vi / Du an bo tri');

// Section II: HR
hdr(13, 'II. DANH GIA CUA HR');
for (const [col, text] of [['A','STT'],['B','Noi dung yeu cau'],['C','Yeu cau'],['D','Thong tin nhan su'],['E','Danh gia'],['F','Ghi chu'],['G',''],['H','']]) {
  cell(col + '14', text, { bold: true, fill: gray, h: 'center' });
}
ws.getRow(14).height = 18;

ws.mergeCells('A15:A20');
cell('A15', 'I', { bold: true, fill: sub, h: 'center' });
ws.mergeCells('B15:H15');
cell('B15', 'Yeu cau ve chuyen mon', { bold: true, fill: sub });
ws.getRow(15).height = 18;

for (const [r, stt, b, req] of [
  [16, '1', '- Kien thuc:', ''],
  [17, '2', '- Ky nang:', ''],
  [18, '3', '- Ngoai ngu:', '550 TOEIC'],
  [19, '4', '- Bang cap/chung chi:', 'Tot nghiep DH CNTT'],
  [20, '5', '- Kinh nghiem:', '2-4 nam']
]) {
  cell('A' + r, stt, { h: 'center' });
  cell('B' + r, b, {});
  cell('C' + r, req, {});
  ws.mergeCells('D' + r + ':F' + r);
  ws.getCell('D' + r).border = BD;
  ws.getRow(r).height = 24;
}

ws.mergeCells('A21:A23');
cell('A21', 'II', { bold: true, fill: sub, h: 'center' });
ws.mergeCells('B21:H21');
cell('B21', 'Yeu cau ve con nguoi', { bold: true, fill: sub });
cell('A22', '1', { h: 'center' });
cell('B22', 'Pham chat:', {});
ws.mergeCells('D22:F22');
ws.getCell('D22').border = BD;
cell('A23', '2', { h: 'center' });
cell('B23', 'Dinh huong cong viec:', {});
ws.mergeCells('D23:F23');
ws.getCell('D23').border = BD;
ws.getRow(21).height = 18;
ws.getRow(22).height = 24;
ws.getRow(23).height = 24;

// Section III
hdr(25, 'III. DANH GIA CUA HOI DONG CHUYEN MON');

ws.getCell('A27').border = BD;
ws.mergeCells('B27:C27');
cell('B27', 'YEU CAU', { bold: true, fill: gray, h: 'center' });
cell('D27', 'DANH GIA CUA HDCM', { bold: true, fill: gray, h: 'center' });
ws.mergeCells('E27:H27');
cell('E27', 'DANH GIA MUC DO', { bold: true, fill: gray, h: 'center' });
ws.getRow(27).height = 18;

ws.getCell('A28').border = BD;
ws.mergeCells('B28:C28');
cell('B28', 'DANH GIA THEO LEVEL:', { bold: true, fill: blue });
ws.getCell('D28').border = BD;
for (const [col, lbl] of [
  ['E', 'Muc 1\n(Khong dat)'],
  ['F', 'Muc 2\n(Hieu co ban)'],
  ['G', 'Muc 3\n(Trien khai thuc te)'],
  ['H', 'Muc 4\n(Giai quyet van de)']
]) {
  cell(col + '28', lbl, { bold: true, fill: gray, h: 'center', wrap: true });
}
ws.getRow(28).height = 42;

ws.getCell('A29').border = BD;
ws.mergeCells('B29:H29');
cell('B29', '1. KIEN THUC CHUYEN MON', { bold: true, fill: blueLight });
ws.getRow(29).height = 18;

ws.mergeCells('B30:B39');
cell('B30', 'MUST', { bold: true, fill: sub, h: 'center' });
const must = [
  [30, '- Ngon ngu lap trinh'],
  [31, '- OOP + Design Pattern'],
  [32, '- Thuat toan + Cau truc du lieu'],
  [33, '- Co so du lieu'],
  [34, '- Da luong'],
  [35, '- Tech stack'],
  [36, '- Docker'],
  [37, '- Git/SVN'],
  [38, '- Microservices'],
  [39, '- Lap trinh an toan'],
];
for (const [r, text] of must) {
  ws.getCell('A' + r).border = BD;
  cell('C' + r, text, {});
  ws.getCell('D' + r).border = BD;
  for (const col of ['E','F','G','H']) cell(col + r, '', { h: 'center' });
  ws.getRow(r).height = 38;
}

ws.mergeCells('B40:B43');
cell('B40', 'SHOULD', { bold: true, fill: sub, h: 'center' });
const should = [
  [40, '- Agile/Scrum'],
  [41, '- Unit test'],
  [42, '- Mang may tinh'],
  [43, '- DevOps'],
];
for (const [r, text] of should) {
  ws.getCell('A' + r).border = BD;
  cell('C' + r, text, {});
  ws.getCell('D' + r).border = BD;
  for (const col of ['E','F','G','H']) cell(col + r, '', { h: 'center' });
  ws.getRow(r).height = 38;
}

// Zone row 49
ws.getCell('A49').border = BD;
cell('B49', 'DANH GIA VUNG', { bold: true, fill: blue });
ws.getCell('C49').border = BD;
ws.mergeCells('D49:H49');
ws.getCell('D49').border = BD;
ws.getRow(49).height = 28;

// Section IV: Personality
hdr(50, 'IV. NHAN DIEN VE CON NGUOI');
ws.getCell('A51').border = BD;
ws.mergeCells('B51:C51');
cell('B51', 'NHAN DIEN VE CON NGUOI', { bold: true, fill: gray, h: 'center' });
cell('D51', 'GHI NHAN CUA HDCM', { bold: true, fill: gray, h: 'center' });
for (const [col, lbl] of [
  ['E', 'Muc 1\n(Yeu)'],
  ['F', 'Muc 2\n(Co ban)'],
  ['G', 'Muc 3\n(Ro rang)'],
  ['H', 'Muc 4\n(Manh me)']
]) {
  cell(col + '51', lbl, { bold: true, fill: gray, h: 'center' });
}
ws.getRow(51).height = 36;

const personality = [
  [52, 'Pham chat dao duc'],
  [53, 'Tinh ky luat'],
  [54, 'Tinh than trach nhiem'],
  [55, 'Kha nang chiu ap luc'],
  [56, 'Dong luc lam viec'],
];
for (const [r, cat] of personality) {
  ws.getCell('A' + r).border = BD;
  ws.mergeCells('B' + r + ':C' + r);
  cell('B' + r, cat, {});
  ws.getCell('D' + r).border = BD;
  for (const col of ['E','F','G','H']) cell(col + r, '', { h: 'center' });
  ws.getRow(r).height = 34;
}

// Section V: Other
hdr(58, 'V. THONG TIN KHAC');
for (const [r, lbl] of [
  [59, 'Mo ta theo JD'],
  [60, 'Du kien bo tri cong viec'],
  [61, 'Muc luong mong muon'],
  [62, 'Notice period']
]) {
  ws.mergeCells('A' + r + ':B' + r);
  cell('A' + r, lbl, { bold: true });
  ws.mergeCells('C' + r + ':H' + r);
  ws.getCell('C' + r).border = BD;
  ws.getRow(r).height = 20;
}

// Section VI: Overall notes
hdr(64, 'VI. NHAN XET CHUNG');
ws.mergeCells('A65:H65');
ws.getCell('A65').border = BD;
ws.getRow(65).height = 60;

await wb.xlsx.writeFile('apps/backend/public/templates/BM04_template.xlsx');
console.log('Template written successfully');
