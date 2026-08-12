import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as path from 'node:path';
import * as fs from 'node:fs';
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

interface SelfClosingXmlElement {
  match: string;
  attributes: string;
}

function isXmlWhitespace(character: string | undefined) {
  return character === ' ' || character === '\t' || character === '\r' || character === '\n';
}

function transformSelfClosingXmlElements(
  xml: string,
  tagName: string,
  transform: (element: SelfClosingXmlElement) => string,
) {
  const tagPrefix = `<${tagName}`;
  let cursor = 0;
  let outputStart = 0;
  let output = '';

  while (cursor < xml.length) {
    const elementStart = xml.indexOf(tagPrefix, cursor);
    if (elementStart < 0) break;

    const afterTagName = xml[elementStart + tagPrefix.length];
    if (!isXmlWhitespace(afterTagName)) {
      cursor = elementStart + tagPrefix.length;
      continue;
    }

    const elementEnd = xml.indexOf('/>', elementStart + tagPrefix.length);
    if (elementEnd < 0) break;

    output += xml.slice(outputStart, elementStart);
    output += transform({
      match: xml.slice(elementStart, elementEnd + 2),
      attributes: xml.slice(elementStart + tagPrefix.length, elementEnd),
    });
    outputStart = elementEnd + 2;
    cursor = outputStart;
  }

  return outputStart === 0 ? xml : output + xml.slice(outputStart);
}

function getXmlAttribute(attributes: string, name: string) {
  const marker = `${name}="`;
  const valueStart = attributes.indexOf(marker);
  if (valueStart < 0) return null;

  const contentStart = valueStart + marker.length;
  const contentEnd = attributes.indexOf('"', contentStart);
  return contentEnd < 0 ? null : attributes.slice(contentStart, contentEnd);
}

function removeXmlAttribute(attributes: string, name: string) {
  const marker = `${name}="`;
  const valueStart = attributes.indexOf(marker);
  if (valueStart < 0) return attributes;

  const contentStart = valueStart + marker.length;
  const contentEnd = attributes.indexOf('"', contentStart);
  if (contentEnd < 0) return attributes;

  let attributeStart = valueStart;
  while (attributeStart > 0 && isXmlWhitespace(attributes[attributeStart - 1])) {
    attributeStart -= 1;
  }
  return attributes.slice(0, attributeStart) + attributes.slice(contentEnd + 1);
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
    private readonly evaluationRepo: Repository<EvaluationEntity>,
    @InjectRepository(SessionEntity)
    private readonly sessionRepo: Repository<SessionEntity>,
    @InjectRepository(CandidateEntity)
    private readonly candidateRepo: Repository<CandidateEntity>,
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

      relsXml = transformSelfClosingXmlElements(relsXml, 'Relationship', ({ match, attributes }) => {
        const type = getXmlAttribute(attributes, 'Type') ?? '';
        if (type.includes('externalLink') || type.includes('calcChain')) return '';
        if (!type.includes('worksheet')) return match;

        const id = getXmlAttribute(attributes, 'Id');
        const targetValue = getXmlAttribute(attributes, 'Target');
        let target: string | null = null;
        if (targetValue) {
          target = targetValue.startsWith('/') ? targetValue.slice(1) : `xl/${targetValue}`;
        }
        if (id && target && keptSheetFiles.has(target)) {
          keptRelIds.add(id);
          return match;
        }
        return '';
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
      xml = transformSelfClosingXmlElements(xml, 'sheet', ({ match, attributes }) => {
        const relationshipId = getXmlAttribute(attributes, 'r:id');
        return relationshipId && keptRelIds.has(relationshipId) ? match : '';
      });

      zip.file('xl/workbook.xml', xml);
    }

    // ── Strip from [Content_Types].xml ────────────────────────────────────
    const ctFile = zip.file('[Content_Types].xml');
    if (ctFile) {
      let xml = await ctFile.async('string');
      // Remove content type overrides for dropped worksheet files
      xml = transformSelfClosingXmlElements(xml, 'Override', ({ match, attributes }) => {
        const partValue = getXmlAttribute(attributes, 'PartName');
        if (!partValue) return match;
        if (partValue.includes('externalLink') || partValue.includes('calcChain')) return '';
        const part = partValue.startsWith('/') ? partValue.slice(1) : partValue;
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

    const { knowledgeItems, allSkillItems, additionalItems } = this.partitionRatingItems(evaluation, technicalCats);

    // ── Expand sections to fit all items ──────────────────────────────────
    const templateRows = SECTION.KNOWLEDGE.last - SECTION.KNOWLEDGE.first + 1; // 4

    const expandedSections = this.expandRatingSections(
      xml,
      knowledgeItems,
      allSkillItems,
      additionalItems,
      templateRows,
    );
    xml = expandedSections.xml;
    const { skillFirst, addFirst, totalOffset } = expandedSections;

    xml = this.fillRatingRows(xml, knowledgeItems, SECTION.KNOWLEDGE.first);
    xml = this.fillRatingRows(xml, allSkillItems, skillFirst);
    xml = this.fillRatingRows(xml, additionalItems, addFirst);

    return this.fillRowsBelowSections(xml, evaluation, levelZone, totalOffset);
  }

  private partitionRatingItems(
    evaluation: EvaluationEntity,
    technicalCats: TechnicalCategoryData[],
  ) {
    const subTypeMap = new Map<string, string>();
    technicalCats.forEach(({ subs }) =>
      subs.forEach((sub) => subTypeMap.set(sub.name, sub.competencyType ?? 'KNOWLEDGE')),
    );

    const knowledgeItems: RatingItem[] = [];
    const skillItems: RatingItem[] = [];
    const additionalItems: RatingItem[] = [];
    for (const rating of evaluation.technicalRatings ?? []) {
      const item: RatingItem = {
        subcategory: rating.subcategory,
        rating: rating.rating,
        comment: rating.comment,
      };
      const type = subTypeMap.get(rating.subcategory) ?? 'KNOWLEDGE';
      if (type === 'SKILL') skillItems.push(item);
      else if (type === 'ADDITIONAL') additionalItems.push(item);
      else knowledgeItems.push(item);
    }

    return {
      knowledgeItems,
      additionalItems,
      allSkillItems: [
        ...skillItems,
        ...(evaluation.softSkillRatings ?? []).map((rating) => ({
          subcategory: rating.subcategory,
          rating: rating.rating,
          comment: rating.comment,
        })),
      ],
    };
  }

  private expandRatingSections(
    xml: string,
    knowledgeItems: RatingItem[],
    skillItems: RatingItem[],
    additionalItems: RatingItem[],
    templateRows: number,
  ) {
    const kExtra = Math.max(0, knowledgeItems.length - templateRows);
    const sExtra = Math.max(0, skillItems.length - templateRows);
    const aExtra = Math.max(0, additionalItems.length - templateRows);

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

    return { xml, skillFirst, addFirst, totalOffset: kExtra + sExtra + aExtra };
  }

  private fillRatingRows(xml: string, items: RatingItem[], firstRow: number): string {
    for (const [index, item] of items.entries()) {
      const row = firstRow + index;
      xml = this.setCell(xml, `C${row}`, item.subcategory);
      if (item.comment) xml = this.setCell(xml, `D${row}`, item.comment);
      if (item.rating && RATING_COL[item.rating]) {
        xml = this.setCell(xml, `${RATING_COL[item.rating]}${row}`, 'x');
      }
    }
    return xml;
  }

  private fillRowsBelowSections(
    xml: string,
    evaluation: EvaluationEntity,
    levelZone: string,
    offset: number,
  ): string {
    if (evaluation.zoneExplanation) {
      xml = this.setCell(xml, `D${AFTER_SECTIONS.riskRow + offset}`, evaluation.zoneExplanation);
    }
    if (levelZone) {
      xml = this.setCell(xml, `D${AFTER_SECTIONS.levelRow + offset}`, levelZone);
    }

    xml = this.fillPersonalityRows(xml, evaluation, offset);
    if (evaluation.overallNotes) {
      xml = this.setCell(xml, `C${AFTER_SECTIONS.overallNotes + offset}`, evaluation.overallNotes);
    }
    return this.fillSectionFourRows(xml, evaluation, levelZone, offset);
  }

  private fillPersonalityRows(xml: string, evaluation: EvaluationEntity, offset: number): string {
    for (const [index, rating] of (evaluation.personalityRatings ?? []).entries()) {
      const row = AFTER_SECTIONS.personalityStart + offset + index;
      if (rating.reasoning) xml = this.setCell(xml, `D${row}`, rating.reasoning);
      if (rating.rating && RATING_COL[rating.rating]) {
        xml = this.setCell(xml, `${RATING_COL[rating.rating]}${row}`, 'x');
      }
    }
    return xml;
  }

  private fillSectionFourRows(
    xml: string,
    evaluation: EvaluationEntity,
    levelZone: string,
    offset: number,
  ): string {
    const rows: Array<[number, string | null | undefined, string]> = [
      [AFTER_SECTIONS.aiSummary, evaluation.aiSummary, 'C'],
      [AFTER_SECTIONS.zoneExp, evaluation.zoneExplanation, 'C'],
      [AFTER_SECTIONS.planned, evaluation.plannedAssignment, 'C'],
      [AFTER_SECTIONS.levelZone, levelZone, 'C'],
      [AFTER_SECTIONS.salary, evaluation.expectedSalary, 'C'],
      [AFTER_SECTIONS.notice, evaluation.noticePeriod, 'C'],
      [AFTER_SECTIONS.overallD, evaluation.overallNotes, 'D'],
    ];
    for (const [baseRow, value, column] of rows) {
      if (value) xml = this.setCell(xml, `${column}${baseRow + offset}`, value);
    }
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
      const num = Number.parseInt(n, 10);
      return num >= fromRow ? `<row r="${num + by}"` : match;
    });
    // Shift <c r="XN"> cell references
    xml = xml.replace(/<c r="([A-Z]+)(\d+)"/g, (match, col, n) => {
      const num = Number.parseInt(n, 10);
      return num >= fromRow ? `<c r="${col}${num + by}"` : match;
    });
    return xml;
  }

  private shiftMergeCells(xml: string, fromRow: number, by: number): string {
    return xml.replace(
      /(<mergeCell ref=")([A-Z]+)(\d+):([A-Z]+)(\d+)(")/g,
      (match, pre, c1, r1, c2, r2, post) => {
        const row1 = Number.parseInt(r1, 10);
        const row2 = Number.parseInt(r2, 10);
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
        const cleanAttrs = removeXmlAttribute(attrs, 't');
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
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }
}
