/**
 * Rating scale matching BM04 template columns E-I (5-level competency framework):
 * 1 = Cơ bản      (Có kiến thức, chưa có KN thực tế)
 * 2 = Ứng dụng    (Đã ứng dụng thực tế, song cần kèm cặp)
 * 3 = Thành thạo  (Vận dụng linh hoạt, chủ động)
 * 4 = Chuyên gia  (Thiết kế, phân tích, xử lý TH phức tạp)
 * 5 = Định hướng  (R&D, hoạch định chiến lược)
 */
export type Rating = 1 | 2 | 3 | 4 | 5;

export interface TechnicalRating {
  subcategory: string;
  comment?: string;
  rating?: Rating;
}

export interface SoftSkillRating {
  subcategory: string;
  comment?: string;
  rating?: Rating;
}

// Technical competency rating labels — BM04 Section III.1 column headers (KNL scale)
export const TECHNICAL_RATING_LABELS: Record<number, string> = {
  1: 'Cơ bản',
  2: 'Ứng dụng',
  3: 'Thành thạo',
  4: 'Chuyên gia',
  5: 'Định hướng',
};

// Personality / behavioral rating labels — BM04 Section III.2 column headers
export const PERSONALITY_RATING_LABELS: Record<number, string> = {
  1: 'Yếu / Không rõ ràng',
  2: 'Thể hiện cơ bản',
  3: 'Thể hiện rõ ràng',
  4: 'Thể hiện mạnh mẽ',
  5: 'Truyền cảm hứng',
};

export interface HrEvaluation {
  knowledge?: string;
  skills?: string;
  language?: string;
  certificates?: string;
  experience?: string;
  character?: string;
  careerGoal?: string;
}

export interface PersonalityRating {
  category: string;
  rating?: Rating;
  reasoning?: string;
}

export enum OverallResult {
  PASS = 'PASS',
  FAIL = 'FAIL',
  PENDING = 'PENDING',
}

export interface Evaluation {
  id: string;
  sessionId: string;
  evaluatorId: string;

  hrEvaluation?: HrEvaluation;
  technicalRatings: TechnicalRating[];
  softSkillRatings: SoftSkillRating[];
  zoneResult?: string;
  zoneExplanation?: string;
  finalLevel?: string;
  finalZone?: string;
  finalSubZone?: string;
  personalityRatings: PersonalityRating[];

  expectedSalary?: string;
  noticePeriod?: string;
  plannedAssignment?: string;
  jobDescription?: string;

  overallResult: OverallResult;
  overallNotes?: string;
  aiSummary?: string;
  aiEvaluationSuggestion?: AiEvaluationSuggestion | null;
  aiAnalysisStatus?: 'analyzing' | 'completed' | 'failed';

  createdAt: string;
  updatedAt: string;
}

export const PERSONALITY_CATEGORIES = [
  'Phẩm chất đạo đức',
  'Tính kỷ luật',
  'Tinh thần trách nhiệm',
  'Khả năng chịu áp lực',
  'Động lực làm việc',
] as const;

export interface AiRatingSuggestion {
  subcategory: string;
  suggestedRating: Rating;
  reasoning: string;
}

export interface AiPersonalitySuggestion {
  category: string;
  suggestedRating: Rating;
  reasoning: string;
}

export interface SubcategoryInsight {
  subcategory: string;
  /** true if profile/survey answers indicate the candidate has hands-on experience in this subcategory */
  hadExperience: boolean;
  /** Vietnamese: depth check if experienced, awareness check if not experienced */
  comment: string;
}

export interface AiEvaluationSuggestion {
  technicalRatings: AiRatingSuggestion[];
  personalityRatings: AiPersonalitySuggestion[];
  overallResult: OverallResult;
  overallNotes: string;
  aiSummary: string;
  finalLevel?: string;
  finalZone?: string;
  finalSubZone?: string;
  /** Per-subcategory AI insight on whether the candidate understands their experienced vs. non-experienced areas */
  subcategoryInsights?: SubcategoryInsight[];
}
