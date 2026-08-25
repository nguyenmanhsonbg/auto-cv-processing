export type ImportRow = Record<string, string | null>;

export interface ParsedImportRow {
  rowNumber: number;
  values: ImportRow;
}

export interface ParsedRecruitmentWorkbook {
  candidates: ParsedImportRow[];
  applications: ParsedImportRow[];
  interviewRounds: ParsedImportRow[];
  offers: ParsedImportRow[];
}

export interface ImportSummary {
  candidates: number;
  applications: number;
  interviewRounds: number;
  offers: number;
  created: number;
  updated: number;
}
