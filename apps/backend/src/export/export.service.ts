import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';
import JSZip from 'jszip';
import { EvaluationEntity } from '../evaluations/entities/evaluation.entity';
import { SessionEntity } from '../sessions/entities/session.entity';
import { CandidateEntity } from '../candidates/entities/candidate.entity';
import { CategoriesService } from '../categories/categories.service';
import { CategoryEntity } from '../categories/entities/category.entity';
import { SubCategoryEntity } from '../categories/entities/sub-category.entity';

// Categories that feed into dedicated rating arrays and are NOT part of technicalRatings
const NON_TECHNICAL_CATEGORIES = ['SOFT_SKILL', 'PERSONALITY'];

interface TechnicalCategoryData {
  category: CategoryEntity;
  subs: SubCategoryEntity[];
}

interface RatingItem {
  subcategory: string;
  rating?: number;
  comment?: string;
}

// BM04.1/BM04.2 rating level → column letter
// [1] Cơ bản → E, [2] Ứng dụng → F, [3] Thành thạo → G, [4] Chuyên gia → H, [5] Định hướng → I
const RATING_COL: Record<number, string> = { 1: 'E', 2: 'F', 3: 'G', 4: 'H', 5: 'I' };

// Template section boundaries (first row, last row) — 4 rows each
const SECTION = {
  KNOWLEDGE: { first: 45, last: 48 },
  SKILL: { first: 49, last: 52 },
  ADDITIONAL: { first: 53, last: 56 },
};

// Fixed row offsets relative to the end of the ADDITIONAL section (row 56)
// These are used to compute dynamic row numbers after section expansion.
const AFTER_SECTIONS = {
  riskRow: 57,       // "Các yếu tố rủi ro" data column D
  levelRow: 58,      // "Đánh giá Level/Vùng" data column D
  personalityStart: 62, // First personality row (III.2)
  overallNotes: 68,
  // Section IV
  aiSummary: 73,
  zoneExp: 75,
  planned: 78,
  levelZone: 84,
  salary: 90,
  notice: 94,
  overallD: 95,
};

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    @InjectRepository(EvaluationEntity)
    private evaluationRepo: Repository<EvaluationEntity>,
    @InjectRepository(SessionEntity)
    private sessionRepo: Repository<SessionEntity>,
    @InjectRepository(CandidateEntity)
    private candidateRepo: Repository<CandidateEntity>,
    private readonly categoriesService: CategoriesService,
  ) {}

  async exportEvaluation(sessionId: string): Promise<Buffer> {
    const evaluation = await this.evaluationRepo.findOne({ where: { sessionId } });
    if (!evaluation) throw new BadRequestException('Evaluation not found for this session');

    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      relations: ['candidate', 'questions', 'questions.question'],
    });
    if (!session) throw new BadRequestException('Session not found');

    const candidate = session.candidate;

    const technicalCats = await this.categoriesService.findCategoriesWithSubcategories(
      NON_TECHNICAL_CATEGORIES,
    );

    const templatePath = path.join(
      process.cwd(),
      'public',
      'templates',
      'output_template_v2.xlsx',
    );

    if (!fs.existsSync(templatePath)) {
      throw new BadRequestException(
        'Export template not found. Please ensure output_template_v2.xlsx is in public/templates/',
      );
    }

    const templateBuffer = fs.readFileSync(templatePath);
    const zip = await JSZip.loadAsync(templateBuffer);

    // Fill BM04.1 (sheet2.xml) — "BM04.1 Đánh giá PV (KNL)"
    const sheet2 = zip.file('xl/worksheets/sheet2.xml');
    if (sheet2) {
      let xml = await sheet2.async('string');
      xml = this.fillSheetXml(xml, candidate, session, evaluation, technicalCats);
      zip.file('xl/worksheets/sheet2.xml', xml);
    }

    await this.stripTemplateNoise(zip);

    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }) as Promise<Buffer>;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Remove template noise that causes Excel repair warnings, and strip all
  // sheets except sheet2 and sheet3 (BM04.1 / BM04.2).
  // ─────────────────────────────────────────────────────────────────────────
  private async stripTemplateNoise(zip: JSZip): Promise<void> {
    Object.keys(zip.files).forEach((name) => {
      if (name.startsWith('xl/externalLinks')) zip.remove(name);
    });
    zip.remove('xl/calcChain.xml');

    // ── Determine which relationship IDs map to sheet2/sheet3 ─────────────
    const keptSheetFiles = new Set(['xl/worksheets/sheet2.xml']);
    const keptRelIds = new Set<string>();

    const relsFile = zip.file('xl/_rels/workbook.xml.rels');
    if (relsFile) {
      let relsXml = await relsFile.async('string');

      // Collect rel IDs for the sheets we want to keep
      const relRe = /<Relationship\s+([^>]*)\/>/g;
      let m: RegExpExecArray | null;
      while ((m = relRe.exec(relsXml)) !== null) {
        const attrs = m[1];
        const idMatch = attrs.match(/Id="([^"]+)"/);
        const targetMatch = attrs.match(/Target="([^"]+)"/);
        if (idMatch && targetMatch) {
          const target = targetMatch[1].startsWith('/')
            ? targetMatch[1].slice(1)
            : `xl/${targetMatch[1]}`;
          if (keptSheetFiles.has(target)) keptRelIds.add(idMatch[1]);
        }
      }

      relsXml = relsXml.replace(/<Relationship[^>]*Type="[^"]*externalLink"[^>]*\/>/g, '');
      relsXml = relsXml.replace(/<Relationship[^>]*Type="[^"]*calcChain"[^>]*\/>/g, '');

      // Remove relationships for sheets we are dropping
      relsXml = relsXml.replace(/<Relationship\s+([^>]*)\/>/g, (match, attrs) => {
        const typeMatch = attrs.match(/Type="([^"]+)"/);
        if (!typeMatch?.[1].includes('worksheet')) return match;
        const idMatch = attrs.match(/Id="([^"]+)"/);
        return idMatch && keptRelIds.has(idMatch[1]) ? match : '';
      });

      zip.file('xl/_rels/workbook.xml.rels', relsXml);
    }

    // ── Remove unwanted worksheet files ───────────────────────────────────
    Object.keys(zip.files).forEach((name) => {
      if (name.startsWith('xl/worksheets/sheet') && !keptSheetFiles.has(name)) {
        zip.remove(name);
      }
      // Also remove companion rels files for dropped sheets
      if (name.startsWith('xl/worksheets/_rels/sheet') &&
          !keptSheetFiles.has(name.replace('/_rels', '').replace('.xml.rels', '.xml'))) {
        zip.remove(name);
      }
    });

    // ── Strip dropped sheets from workbook.xml ────────────────────────────
    const wbFile = zip.file('xl/workbook.xml');
    if (wbFile) {
      let xml = await wbFile.async('string');
      xml = xml.replace(/<externalReferences>[\s\S]*?<\/externalReferences>/g, '');
      xml = xml.replace(/<definedNames>[\s\S]*?<\/definedNames>/g, '');

      // Remove <sheet> entries whose r:id is not in keptRelIds
      xml = xml.replace(/<sheet\s+[^>]*\/>/g, (match) => {
        const ridMatch = match.match(/r:id="([^"]+)"/);
        return ridMatch && keptRelIds.has(ridMatch[1]) ? match : '';
      });

      zip.file('xl/workbook.xml', xml);
    }

    // ── Strip from [Content_Types].xml ────────────────────────────────────
    const ctFile = zip.file('[Content_Types].xml');
    if (ctFile) {
      let xml = await ctFile.async('string');
      xml = xml.replace(/<Override[^>]*PartName="[^"]*externalLink[^"]*"[^>]*\/>/g, '');
      xml = xml.replace(/<Override[^>]*PartName="[^"]*calcChain[^"]*"[^>]*\/>/g, '');

      // Remove content type overrides for dropped worksheet files
      xml = xml.replace(/<Override\s+[^>]*\/>/g, (match) => {
        const partMatch = match.match(/PartName="([^"]+)"/);
        if (!partMatch) return match;
        const part = partMatch[1].startsWith('/') ? partMatch[1].slice(1) : partMatch[1];
        if (!part.startsWith('xl/worksheets/sheet')) return match;
        return keptSheetFiles.has(part) ? match : '';
      });

      zip.file('[Content_Types].xml', xml);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Core sheet filler.
  // Strategy: expand each section to fit all items (by cloning blank rows),
  // then write data. All row references below the sections are offset by the
  // total number of inserted rows so personality / section IV land correctly.
  // ─────────────────────────────────────────────────────────────────────────
  private fillSheetXml(
    xml: string,
    candidate: CandidateEntity,
    session: SessionEntity,
    evaluation: EvaluationEntity,
    technicalCats: TechnicalCategoryData[],
  ): string {
    const hr = evaluation.hrEvaluation ?? {};
    const finalLevelZone = [
      evaluation.finalLevel,
      evaluation.finalZone ? `Zone ${evaluation.finalZone}` : null,
      evaluation.finalSubZone,
    ].filter(Boolean).join(' / ');
    const levelZone = finalLevelZone || [session.targetLevel, evaluation.zoneResult].filter(Boolean).join(' / ');

    // ── Section I & II (above expansion zone — row numbers unchanged) ──────
    xml = this.setCell(xml, 'C6', candidate.name ?? '');
    xml = this.setCell(xml, 'C7', candidate.birthYear?.toString() ?? '');
    xml = this.setCell(xml, 'C8', candidate.position ?? '');
    xml = this.setCell(xml, 'C16', session.targetLevel ?? '');
    xml = this.setCell(xml, 'C17', evaluation.zoneResult ?? '');
    xml = this.setCell(xml, 'C18', evaluation.overallResult ?? '');

    xml = this.setCell(xml, 'C25', hr.certificates ?? '');
    xml = this.setCell(xml, 'C26', hr.language ?? '');
    xml = this.setCell(xml, 'C27', hr.skills ?? '');
    xml = this.setCell(xml, 'C29', hr.experience ?? '');
    xml = this.setCell(xml, 'C34', hr.character ?? '');
    xml = this.setCell(xml, 'C35', hr.careerGoal ?? '');
    xml = this.setCell(xml, 'C38', hr.knowledge ?? '');

    // ── Build competency-type map ─────────────────────────────────────────
    const subTypeMap = new Map<string, string>();
    technicalCats.forEach(({ subs }) =>
      subs.forEach((s) => subTypeMap.set(s.name, s.competencyType ?? 'KNOWLEDGE')),
    );

    // ── Partition technical ratings by type ───────────────────────────────
    const knowledgeItems: RatingItem[] = [];
    const skillItems: RatingItem[] = [];
    const additionalItems: RatingItem[] = [];

    for (const tr of evaluation.technicalRatings ?? []) {
      const type = subTypeMap.get(tr.subcategory) ?? 'KNOWLEDGE';
      const item: RatingItem = { subcategory: tr.subcategory, rating: tr.rating, comment: tr.comment };
      if (type === 'SKILL') skillItems.push(item);
      else if (type === 'ADDITIONAL') additionalItems.push(item);
      else knowledgeItems.push(item);
    }

    // Soft skills fill remaining SKILL rows after technical SKILL items
    const allSkillItems: RatingItem[] = [
      ...skillItems,
      ...(evaluation.softSkillRatings ?? []).map((sr) => ({
        subcategory: sr.subcategory,
        rating: sr.rating,
        comment: sr.comment,
      })),
    ];

    // ── Expand sections to fit all items ──────────────────────────────────
    const templateRows = SECTION.KNOWLEDGE.last - SECTION.KNOWLEDGE.first + 1; // 4

    const kExtra = Math.max(0, knowledgeItems.length - templateRows);
    const sExtra = Math.max(0, allSkillItems.length - templateRows);
    const aExtra = Math.max(0, additionalItems.length - templateRows);

    // Expand KNOWLEDGE section first; SKILL/ADDITIONAL boundaries shift after each expansion
    if (kExtra > 0) {
      xml = this.expandSection(xml, SECTION.KNOWLEDGE.first, SECTION.KNOWLEDGE.last, kExtra);
    }

    const skillFirst = SECTION.SKILL.first + kExtra;
    const skillLast = SECTION.SKILL.last + kExtra;
    if (sExtra > 0) {
      xml = this.expandSection(xml, skillFirst, skillLast, sExtra);
    }

    const addFirst = SECTION.ADDITIONAL.first + kExtra + sExtra;
    const addLast = SECTION.ADDITIONAL.last + kExtra + sExtra;
    if (aExtra > 0) {
      xml = this.expandSection(xml, addFirst, addLast, aExtra);
    }

    const totalOffset = kExtra + sExtra + aExtra;

    // ── Fill KNOWLEDGE rows (C = subcategory, D = comment, E-I = rating x) ─
    const kFirst = SECTION.KNOWLEDGE.first;
    knowledgeItems.forEach((item, i) => {
      const row = kFirst + i;
      xml = this.setCell(xml, `C${row}`, item.subcategory);
      if (item.comment) xml = this.setCell(xml, `D${row}`, item.comment);
      if (item.rating && RATING_COL[item.rating]) {
        xml = this.setCell(xml, `${RATING_COL[item.rating]}${row}`, 'x');
      }
    });

    // ── Fill SKILL rows ───────────────────────────────────────────────────
    allSkillItems.forEach((item, i) => {
      const row = skillFirst + i;
      xml = this.setCell(xml, `C${row}`, item.subcategory);
      if (item.comment) xml = this.setCell(xml, `D${row}`, item.comment);
      if (item.rating && RATING_COL[item.rating]) {
        xml = this.setCell(xml, `${RATING_COL[item.rating]}${row}`, 'x');
      }
    });

    // ── Fill ADDITIONAL rows ──────────────────────────────────────────────
    additionalItems.forEach((item, i) => {
      const row = addFirst + i;
      xml = this.setCell(xml, `C${row}`, item.subcategory);
      if (item.comment) xml = this.setCell(xml, `D${row}`, item.comment);
      if (item.rating && RATING_COL[item.rating]) {
        xml = this.setCell(xml, `${RATING_COL[item.rating]}${row}`, 'x');
      }
    });

    // ── All rows below the three sections are offset by totalOffset ────────
    const o = totalOffset;

    if (evaluation.zoneExplanation)
      xml = this.setCell(xml, `D${AFTER_SECTIONS.riskRow + o}`, evaluation.zoneExplanation);
    if (levelZone)
      xml = this.setCell(xml, `D${AFTER_SECTIONS.levelRow + o}`, levelZone);

    // ── Section III.2: Personality ────────────────────────────────────────
    (evaluation.personalityRatings ?? []).forEach((pr, idx) => {
      const row = AFTER_SECTIONS.personalityStart + o + idx;
      if (pr.reasoning) xml = this.setCell(xml, `D${row}`, pr.reasoning);
      if (pr.rating && RATING_COL[pr.rating]) {
        xml = this.setCell(xml, `${RATING_COL[pr.rating]}${row}`, 'x');
      }
    });

    if (evaluation.overallNotes)
      xml = this.setCell(xml, `C${AFTER_SECTIONS.overallNotes + o}`, evaluation.overallNotes);

    // ── Section IV ────────────────────────────────────────────────────────
    if (evaluation.aiSummary)
      xml = this.setCell(xml, `C${AFTER_SECTIONS.aiSummary + o}`, evaluation.aiSummary);
    if (evaluation.zoneExplanation)
      xml = this.setCell(xml, `C${AFTER_SECTIONS.zoneExp + o}`, evaluation.zoneExplanation);
    if (evaluation.plannedAssignment)
      xml = this.setCell(xml, `C${AFTER_SECTIONS.planned + o}`, evaluation.plannedAssignment);
    if (levelZone)
      xml = this.setCell(xml, `C${AFTER_SECTIONS.levelZone + o}`, levelZone);
    if (evaluation.expectedSalary)
      xml = this.setCell(xml, `C${AFTER_SECTIONS.salary + o}`, evaluation.expectedSalary);
    if (evaluation.noticePeriod)
      xml = this.setCell(xml, `C${AFTER_SECTIONS.notice + o}`, evaluation.noticePeriod);
    if (evaluation.overallNotes)
      xml = this.setCell(xml, `D${AFTER_SECTIONS.overallD + o}`, evaluation.overallNotes);

    return xml;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Expand a template section by inserting `extraCount` cloned rows.
  // The "middle row" (lastRow - 1) is cloned for each extra row; the original
  // "last row" (with its bottom-border style) is then shifted down, so it
  // always remains the actual last row of the section.
  // After insertion every row reference ≥ lastRow is incremented by extraCount,
  // and merge-cell endpoints are updated accordingly.
  // ─────────────────────────────────────────────────────────────────────────
  private expandSection(xml: string, firstRow: number, lastRow: number, extraCount: number): string {
    if (extraCount <= 0) return xml;

    const middleRow = lastRow - 1;

    // Capture the middle row XML BEFORE any shifts (used as clone template)
    const middleRowRe = new RegExp(`<row r="${middleRow}"[^>]*>.*?</row>`, 's');
    const middleMatch = xml.match(middleRowRe);
    if (!middleMatch) {
      this.logger.warn(`expandSection: row ${middleRow} not found`);
      return xml;
    }
    const middleRowXml = middleMatch[0];

    // Step 1: shift every row ≥ lastRow down by extraCount.
    // This creates a gap at positions lastRow … lastRow+extraCount-1.
    xml = this.shiftRowsAndCells(xml, lastRow, extraCount);
    xml = this.shiftMergeCells(xml, lastRow, extraCount);

    // Step 2: fill the gap with clones numbered lastRow … lastRow+extraCount-1.
    const clonedRows = Array.from({ length: extraCount }, (_, i) =>
      this.cloneRow(middleRowXml, middleRow, lastRow + i),
    ).join('');

    // Insert before the now-shifted lastRow (which is at lastRow+extraCount)
    const shiftedLastRow = lastRow + extraCount;
    xml = xml.replace(
      new RegExp(`(</row>)(\\s*)(<row r="${shiftedLastRow}")`),
      `$1$2${clonedRows}$2$3`,
    );

    return xml;
  }

  private cloneRow(rowXml: string, sourceRow: number, targetRow: number): string {
    // Replace <row r="N"> attribute
    let cloned = rowXml.replace(
      new RegExp(`(<row r=")${sourceRow}(")`),
      `$1${targetRow}$2`,
    );
    // Replace every <c r="XN"> reference (column letters followed by the row number)
    cloned = cloned.replace(
      new RegExp(`(<c r="[A-Z]+)${sourceRow}(")`, 'g'),
      `$1${targetRow}$2`,
    );
    return cloned;
  }

  private shiftRowsAndCells(xml: string, fromRow: number, by: number): string {
    // Shift <row r="N"> elements
    xml = xml.replace(/<row r="(\d+)"/g, (match, n) => {
      const num = parseInt(n, 10);
      return num >= fromRow ? `<row r="${num + by}"` : match;
    });
    // Shift <c r="XN"> cell references
    xml = xml.replace(/<c r="([A-Z]+)(\d+)"/g, (match, col, n) => {
      const num = parseInt(n, 10);
      return num >= fromRow ? `<c r="${col}${num + by}"` : match;
    });
    return xml;
  }

  private shiftMergeCells(xml: string, fromRow: number, by: number): string {
    return xml.replace(
      /(<mergeCell ref=")([A-Z]+)(\d+):([A-Z]+)(\d+)(")/g,
      (match, pre, c1, r1, c2, r2, post) => {
        const row1 = parseInt(r1, 10);
        const row2 = parseInt(r2, 10);
        const newR1 = row1 >= fromRow ? row1 + by : row1;
        const newR2 = row2 >= fromRow ? row2 + by : row2;
        return `${pre}${c1}${newR1}:${c2}${newR2}${post}`;
      },
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Inject an inline-string value into a cell, preserving its existing style.
  // Three cell forms in this template:
  //  1. Empty self-closing:  <c r="C6" s="N"/>
  //  2. Formula cell:        <c r="C78" s="N"><f>…</f><v>…</v></c>
  //  3. Existing value cell: <c r="C45" s="N" t="s"><v>175</v></c>
  // ─────────────────────────────────────────────────────────────────────────
  private setCell(xml: string, ref: string, value: string): string {
    if (!value || !value.trim()) return xml;
    const escaped = this.escapeXml(value);
    const inlineVal = `t="inlineStr"><is><t xml:space="preserve">${escaped}</t></is></c>`;

    // 1. Empty self-closing cell
    const emptyRe = new RegExp(`(<c r="${ref}"(?:\\s+[^/>]*)?)\\s*/>`);
    if (emptyRe.test(xml)) {
      return xml.replace(emptyRe, `$1 ${inlineVal}`);
    }

    // 2. Formula cell
    const formulaRe = new RegExp(
      `<c r="${ref}"((?:\\s+[^>]*)?s="\\d+"(?:\\s+[^>]*)?)><f>[^<]*</f><v>[^<]*</v></c>`,
    );
    if (formulaRe.test(xml)) {
      return xml.replace(formulaRe, `<c r="${ref}"$1 ${inlineVal}`);
    }

    // 3. Existing shared-string / numeric value cell (e.g. placeholder text)
    const valueRe = new RegExp(`<c r="${ref}"([^>]*)><v>[^<]*</v></c>`);
    if (valueRe.test(xml)) {
      return xml.replace(valueRe, (_, attrs) => {
        const cleanAttrs = attrs.replace(/\s+t="[^"]*"/g, '');
        return `<c r="${ref}"${cleanAttrs} ${inlineVal}`;
      });
    }

    // 4. Cell not found — insert a new inline-string cell into the existing row
    const row = ref.replace(/\D+/g, '');
    const rowRe = new RegExp(`(<row r="${row}"[^>]*>)(.*?)(</row>)`, 's');
    const rowMatch = xml.match(rowRe);
    if (rowMatch) {
      const newCell = `<c r="${ref}" ${inlineVal}`;
      return xml.replace(rowRe, `$1$2${newCell}$3`);
    }

    this.logger.warn(`setCell: cell ${ref} not found and row ${row} missing — skipping`);
    return xml;
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
