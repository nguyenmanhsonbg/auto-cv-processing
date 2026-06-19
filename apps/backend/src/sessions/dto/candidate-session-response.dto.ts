import { QuestionType, MeetingPlatform } from '@interview-assistant/shared';

export class CandidateQuestionDto {
  id: string;
  category: string | null;
  subcategory: string;
  competencyType: string | null;
  text: string;
  difficulty: number;
  targetLevels: string[];
  type: QuestionType;
  options: { id: string; text: string }[] | null;
  testCases: { input: string; expectedOutput: string; description?: string }[] | null;
  starterCode: { language: string; code: string }[] | null;
  architectureTemplate: Record<string, unknown> | null;
  timeLimit: number | null;
  memoryLimit: number | null;
  // Intentionally omitted: correctAnswers, expectedAnswer, scoringGuide, hiddenTestCases
}

export class CandidateSessionQuestionDto {
  id: string;
  sessionId: string;
  questionId: string;
  question: CandidateQuestionDto | null;
  orderIndex: number;
  isActive: boolean;
  activatedAt: Date | null;
  candidateAnswer: string | null;
  answeredAt: Date | null;
  // Intentionally omitted: interviewerNote, rating, submissions
}

export class CandidateSessionResponseDto {
  id: string;
  status: string;
  accessToken: string;
  templatePosition: string;
  sequentialMode: boolean;
  candidateViewEnabled: boolean;
  scheduledAt?: Date | null;
  meetingPlatform?: MeetingPlatform | null;
  meetingLink?: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  questions: CandidateSessionQuestionDto[];
  // Intentionally omitted: candidate, createdBy, categoryRatings, candidateId, createdById
}

export class CandidateSubmissionResultDto {
  id: string;
  status: string;
  submittedAt: Date;
  results: Record<string, unknown>[];
  // Intentionally omitted: aiEvaluation, code, sessionQuestionId, sessionQuestion
}
