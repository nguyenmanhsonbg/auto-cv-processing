export interface ApplicationMappingSummary {
  mappingResultId?: string | null;
  score?: number | null;
  status?: string | null;
  recommendation?: string | null;
  createdAt?: string | null;
}

export interface ApplicationAiScreeningInsight {
  title?: string | null;
  evidence?: string | null;
  confidence?: string | null;
  severity?: string | null;
}

export interface ApplicationAiScreeningSummary {
  aiScreeningResultId?: string | null;
  score?: number | null;
  status?: string | null;
  recommendation?: string | null;
  summary?: string | null;
  strengths?: ApplicationAiScreeningInsight[];
  gaps?: ApplicationAiScreeningInsight[];
  risks?: ApplicationAiScreeningInsight[];
  createdAt?: string | null;
}
