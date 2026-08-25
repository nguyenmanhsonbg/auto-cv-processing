import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ParsedImportRow, ParsedRecruitmentWorkbook } from './recruitment-import.types';

const SHEET_CONFIG = {
  candidates: {
    required: ['candidate_key', 'name'],
  },
  applications: {
    required: ['application_key', 'candidate_key', 'job_posting_id'],
  },
  interview_rounds: {
    required: ['application_key', 'round_type'],
  },
  offers: {
    required: ['application_key', 'status', 'job_title'],
  },
} as const;

@Injectable()
export class RecruitmentImportParser {
  async parse(buffer: Buffer): Promise<ParsedRecruitmentWorkbook> {
    if (!buffer?.length) {
      throw new BadRequestException('Import file is empty');
    }

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer);
    } catch {
      throw new BadRequestException('Import file is not a valid XLSX workbook');
    }

    const sheets = new Map(
      workbook.worksheets.map((worksheet) => [worksheet.name.trim().toLowerCase(), worksheet]),
    );

    return {
      candidates: this.parseSheet(sheets, 'candidates'),
      applications: this.parseSheet(sheets, 'applications'),
      interviewRounds: this.parseSheet(sheets, 'interview_rounds'),
      offers: this.parseSheet(sheets, 'offers'),
    };
  }

  private parseSheet(
    sheets: Map<string, ExcelJS.Worksheet>,
    sheetName: keyof typeof SHEET_CONFIG,
  ): ParsedImportRow[] {
    const worksheet = sheets.get(sheetName);
    if (!worksheet) {
      throw new BadRequestException(`Missing required sheet: ${sheetName}`);
    }

    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      headers[columnNumber - 1] = this.normalizeHeader(this.cellValue(cell.value));
    });

    const missingHeaders = SHEET_CONFIG[sheetName].required.filter(
      (header) => !headers.includes(header),
    );
    if (missingHeaders.length) {
      throw new BadRequestException(
        `Sheet ${sheetName} is missing required columns: ${missingHeaders.join(', ')}`,
      );
    }

    const duplicateHeaders = headers.filter(
      (header, index) => header && headers.indexOf(header) !== index,
    );
    if (duplicateHeaders.length) {
      throw new BadRequestException(
        `Sheet ${sheetName} has duplicate columns: ${[...new Set(duplicateHeaders)].join(', ')}`,
      );
    }

    const rows: ParsedImportRow[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const values: Record<string, string | null> = {};
      let hasValue = false;

      headers.forEach((header, index) => {
        if (!header) return;
        const value = this.cellValue(row.getCell(index + 1).value);
        values[header] = value || null;
        hasValue ||= Boolean(value);
      });

      if (hasValue) rows.push({ rowNumber, values });
    });

    return rows;
  }

  private normalizeHeader(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
  }

  private cellValue(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      if ('result' in value) return this.cellValue(value.result as ExcelJS.CellValue);
      if ('text' in value) return String(value.text ?? '');
      return JSON.stringify(value);
    }
    return String(value).trim();
  }
}
