// Category codes are dynamic (stored in the categories DB table).
// String literals are used instead of a hardcoded enum so new tracks
// (e.g. FRONTEND, MOBILE) can be added without a code change.
export type QuestionCategoryCode = string;

export enum CompetencyType {
  KNOWLEDGE = 'KNOWLEDGE',
  SKILL = 'SKILL',
  ADDITIONAL = 'ADDITIONAL',
  PERSONALITY = 'PERSONALITY',
}

export enum QuestionType {
  OPEN_ENDED = 'OPEN_ENDED',
  SINGLE_CHOICE = 'SINGLE_CHOICE',
  MULTIPLE_CHOICE = 'MULTIPLE_CHOICE',
  CODING = 'CODING',
  SCENARIO = 'SCENARIO',
  ARCHITECTURE = 'ARCHITECTURE',
}

export type ArchitectureNodeType = 'service' | 'database' | 'client' | 'queue' | 'cache' | 'custom';

export interface ArchitectureNode {
  id: string;
  label: string;
  x: number;
  y: number;
  type?: ArchitectureNodeType;
  color?: string; // stroke color from the editor palette
}

export type ArchitectureConnectionLineType = 'forward' | 'backward' | 'bidirectional' | 'none';
export type ArchitectureAnchor = 'top' | 'bottom' | 'left' | 'right' | 'center';

export interface ArchitectureConnection {
  from: string;
  to: string;
  label?: string;
  lineType?: ArchitectureConnectionLineType;
  fromAnchor?: ArchitectureAnchor;
  toAnchor?: ArchitectureAnchor;
}

export interface ArchitectureAnswer {
  nodes: ArchitectureNode[];
  connections: ArchitectureConnection[];
  description: string;
}

export interface ArchitectureTemplate {
  nodes: ArchitectureNode[];
  connections: ArchitectureConnection[];
  name: string;
}

export interface QuestionOption {
  id: string;
  text: string;
}

export const SOFT_SKILL_SUBCATEGORIES = [
  'Giao tiếp',
  'Thuyết trình',
  'Báo cáo',
  'Thuyết phục',
] as const;

export const PERSONALITY_SUBCATEGORIES = [
  'Phẩm chất',
  'Động lực',
] as const;

export interface TestCase {
  input: string;
  expectedOutput: string;
  description?: string;
}

export interface StarterCode {
  language: string;
  code: string;
}

export interface Question {
  id: string;
  category: string;
  subcategory: string;
  competencyType?: CompetencyType;
  text: string;
  difficulty: number;
  targetLevels: string[];
  type: QuestionType;

  // Choice question fields
  options?: QuestionOption[];
  correctAnswers?: string[];

  // Coding question fields
  testCases?: TestCase[];
  hiddenTestCases?: TestCase[];
  timeLimit?: number;
  memoryLimit?: number;
  starterCode?: StarterCode[];

  // Architecture question fields
  architectureTemplate?: ArchitectureTemplate;

  // Common evaluation fields
  expectedAnswer?: string;
  scoringGuide?: string;

  isActive: boolean;
  isCustomized?: boolean;
  createdAt: string;
  updatedAt: string;
}
