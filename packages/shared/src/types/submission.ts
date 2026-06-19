export enum SubmissionStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  PASSED = 'PASSED',
  PARTIAL = 'PARTIAL',
  FAILED = 'FAILED',
  TIMEOUT = 'TIMEOUT',
  ERROR = 'ERROR',
}

export interface TestCaseResult {
  testCaseIndex: number;
  passed: boolean;
  actualOutput?: string;
  expectedOutput?: string;
  runtime?: number;
  memory?: number;
  error?: string;
}

export interface CodeSubmission {
  id: string;
  sessionQuestionId: string;
  language: string;
  code: string;
  status: SubmissionStatus;
  results?: TestCaseResult[];
  aiEvaluation?: {
    correctness?: string;
    complexity?: string;
    codeQuality?: string;
    suggestions?: string[];
  };
  submittedAt: string;
}
