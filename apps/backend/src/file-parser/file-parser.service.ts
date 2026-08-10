import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';
import * as ExcelJS from 'exceljs';

function isParserWhitespace(character: string | undefined) {
  return character === ' ' || character === '\t' || character === '\r' || character === '\n';
}

function isAsciiDigit(character: string | undefined) {
  if (!character) return false;
  const code = character.codePointAt(0) ?? -1;
  return code >= 48 && code <= 57;
}

function parseExperienceCell(raw: string) {
  let value = raw.trim();
  const lowerValue = value.toLowerCase();
  for (const suffix of ['years', 'year', 'y']) {
    if (!lowerValue.endsWith(suffix)) continue;
    value = value.slice(0, -suffix.length).trimEnd();
    break;
  }

  const numberEnd = value.length;
  let numberStart = numberEnd;
  while (numberStart > 0 && isAsciiDigit(value[numberStart - 1])) numberStart -= 1;

  const decimalPointIndex = numberStart - 1;
  if (numberStart < numberEnd && value[decimalPointIndex] === '.') {
    let integerStart = decimalPointIndex;
    while (integerStart > 0 && isAsciiDigit(value[integerStart - 1])) integerStart -= 1;
    if (integerStart === decimalPointIndex) return null;
    numberStart = integerStart;
  }

  if (numberStart === numberEnd) return null;
  const separator = value[numberStart - 1];
  if (!separator || (separator !== ':' && !isParserWhitespace(separator))) return null;

  let language = value.slice(0, numberStart).trim();
  while (language.endsWith(':')) language = language.slice(0, -1).trimEnd();
  if (!language) return null;

  const years = Number.parseFloat(value.slice(numberStart, numberEnd));
  return Number.isNaN(years) ? null : { language, years };
}

function isEmailTokenCharacter(character: string | undefined) {
  if (!character) return false;
  const code = character.codePointAt(0) ?? -1;
  return (code >= 48 && code <= 57)
    || (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122)
    || '._+-@'.includes(character);
}

function extractEmailFromText(text: string) {
  for (const token of text.split(/\s+/u)) {
    const tokenAtIndex = token.indexOf('@');
    if (tokenAtIndex <= 0) continue;

    let start = tokenAtIndex;
    while (start > 0 && isEmailTokenCharacter(token[start - 1])) start -= 1;
    let end = tokenAtIndex + 1;
    while (end < token.length && isEmailTokenCharacter(token[end])) end += 1;

    let candidate = token.slice(start, end);
    while (candidate.endsWith('.')) candidate = candidate.slice(0, -1);
    const atIndex = candidate.indexOf('@');
    const domainDotIndex = candidate.lastIndexOf('.');
    if (
      atIndex > 0
      && atIndex === candidate.lastIndexOf('@')
      && domainDotIndex > atIndex + 1
      && domainDotIndex < candidate.length - 1
    ) {
      return candidate;
    }
  }
  return null;
}

@Injectable()
export class FileParserService {
  private readonly logger = new Logger(FileParserService.name);

  async parseFile(filePath: string): Promise<Record<string, unknown>> {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.pdf':
        return this.parsePdf(filePath);
      case '.xlsx':
        return this.parseXlsx(filePath);
      case '.docx':
        return this.parseDocx(filePath);
      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }
  }

  private async parsePdf(filePath: string): Promise<Record<string, unknown>> {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > 20 * 1024 * 1024) {
        return { rawText: '', error: 'File too large (max 20MB)' };
      }
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      const text = data.text;

      if (!text || text.trim().length === 0) {
        throw new Error('PDF text extraction returned empty — file may be image-only or use unsupported encoding');
      }

      return {
        rawText: text,
        ...this.extractBasicInfo(text),
      };
    } catch (error) {
      this.logger.error(`Failed to parse PDF: ${error}`);
      return { rawText: '', error: String(error) };
    }
  }

  private async parseXlsx(filePath: string): Promise<Record<string, unknown>> {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);

      const templateSheet = workbook.getWorksheet('Template');
      if (!templateSheet) {
        const firstSheet = workbook.worksheets[0];
        if (!firstSheet) return { error: 'No worksheets found' };
        return this.extractXlsxData(firstSheet);
      }

      return this.extractXlsxData(templateSheet);
    } catch (error) {
      this.logger.error(`Failed to parse XLSX: ${error}`);
      return { error: String(error) };
    }
  }

  private extractXlsxData(sheet: any): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    const rows: string[][] = [];

    sheet.eachRow((row: any, rowNumber: number) => {
      const values: string[] = [];
      row.eachCell((cell: any) => {
        values.push(String(cell.value ?? ''));
      });
      rows.push(values);
    });

    // Extract structured fields from the Template sheet format
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const label = row[0]?.toLowerCase() ?? '';

      if (label.includes('họ tên') || label.includes('ho ten')) {
        data['name'] = row[1] || row[2];
      } else if (label.includes('sdt') || label.includes('số điện thoại')) {
        data['phone'] = row[1] || row[2];
      } else if (label.includes('email')) {
        data['email'] = row[1] || row[2];
      } else if (label.includes('tổng số năm') || label.includes('kinh nghiệm')) {
        const expMap: Record<string, number> = {};
        for (const cell of row.slice(1)) {
          const raw = String(cell ?? '').trim();
          if (!raw) continue;
          // Handles: "JavaScript: 3", "Python 2 years", "Go 1y"
          const experience = parseExperienceCell(raw);
          if (experience) {
            expMap[experience.language] = experience.years;
          }
        }
        if (Object.keys(expMap).length > 0) data['experienceByLanguage'] = expMap;
      } else if (label.includes('techstack')) {
        data['techstack'] = row.slice(1).filter(Boolean).join(', ');
      } else if (label.includes('kiến trúc')) {
        data['architecture'] = row[1] || row[2];
      } else if (label.includes('quy mô')) {
        data['scale'] = row[1] || row[2];
      } else if (label.includes('cấp độ') || label.includes('cap do') || label.includes('level')) {
        data['xlsxLevel'] = row[1] || row[2];
      } else if (label.includes('năm sinh') || label.includes('nam sinh') || label.includes('birth')) {
        const yr = Number.parseInt(String(row[1] || row[2] || ''), 10);
        if (!Number.isNaN(yr) && yr > 1950 && yr < 2010) data['birthYear'] = yr;
      } else if (label.includes('học vấn') || label.includes('hoc van') || label.includes('education') || label.includes('trình độ')) {
        data['xlsxEducation'] = row[1] || row[2];
      } else if (label.includes('công ty') || label.includes('cong ty') || label.includes('company') || label.includes('nơi làm')) {
        const companyEntry = [row[1], row[2], row[3]].filter(Boolean).join(' - ');
        if (companyEntry) {
          const companies = (data['xlsxCompanies'] as string[]) ?? [];
          companies.push(companyEntry);
          data['xlsxCompanies'] = companies;
        }
      }
    }

    // Build rawText so XLSX data flows into the AI as a first-class text corpus
    const textLines: string[] = ['[XLSX Profile Data]'];
    if (data['name'])               textLines.push(`Họ tên: ${data['name']}`);
    if (data['birthYear'])          textLines.push(`Năm sinh: ${data['birthYear']}`);
    if (data['phone'])              textLines.push(`SĐT: ${data['phone']}`);
    if (data['email'])              textLines.push(`Email: ${data['email']}`);
    if (data['xlsxLevel'])          textLines.push(`Cấp độ: ${data['xlsxLevel']}`);
    if (data['xlsxEducation'])      textLines.push(`Học vấn: ${data['xlsxEducation']}`);
    if (data['architecture'])       textLines.push(`Kiến trúc: ${data['architecture']}`);
    if (data['scale'])              textLines.push(`Quy mô: ${data['scale']}`);
    if (data['techstack'])          textLines.push(`Techstack: ${data['techstack']}`);
    if (data['experienceByLanguage']) {
      const expStr = Object.entries(data['experienceByLanguage'] as Record<string, number>)
        .map(([lang, yrs]) => `${lang}: ${yrs} năm`).join(', ');
      textLines.push(`Kinh nghiệm: ${expStr}`);
    }
    if (Array.isArray(data['xlsxCompanies']) && (data['xlsxCompanies'] as string[]).length > 0) {
      textLines.push('Công ty đã làm việc:');
      for (const c of data['xlsxCompanies'] as string[]) textLines.push(`  - ${c}`);
    }
    if (textLines.length > 1) data['rawText'] = textLines.join('\n');

    return data;
  }

  private async parseDocx(filePath: string): Promise<Record<string, unknown>> {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      const text = result.value;

      return {
        rawText: text,
        ...this.extractBasicInfo(text),
      };
    } catch (error) {
      this.logger.error(`Failed to parse DOCX: ${error}`);
      return { rawText: '', error: String(error) };
    }
  }

  private extractBasicInfo(text: string): Record<string, unknown> {
    const info: Record<string, unknown> = {};

    // Extract email
    const email = extractEmailFromText(text);
    if (email) info['email'] = email;

    // Extract phone (Vietnamese format)
    const phoneMatch = text.match(/(?:\+84|0)\s*\d[\d\s.-]{7,}/);
    if (phoneMatch) info['phone'] = phoneMatch[0].replace(/\s/g, '');

    // Extract common tech keywords
    const techKeywords = [
      'JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Golang', 'C#', 'C++',
      'Node.js', 'React', 'Angular', 'Vue', 'Next.js', 'NestJS', 'Spring Boot',
      'Docker', 'Kubernetes', 'AWS', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis',
      'Kafka', 'GraphQL', 'REST', 'Microservices', 'Git',
    ];
    const foundSkills = techKeywords.filter((kw) =>
      this.hasStandaloneSkillMention(kw, text),
    );
    if (foundSkills.length > 0) info['skills'] = foundSkills;

    return info;
  }

  private hasStandaloneSkillMention(keyword: string, text: string) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exactPattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'iu');
    if (exactPattern.test(text)) return true;

    // Some PDF extractors insert spaces between every character, e.g. "J a v a".
    // Permit layout whitespace only between characters of a known keyword.
    const spacedKeyword = [...keyword].map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${spacedKeyword}([^\\p{L}\\p{N}]|$)`, 'iu').test(text);
  }
}
