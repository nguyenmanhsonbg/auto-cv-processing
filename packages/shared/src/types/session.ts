export enum SessionStatus {
  DRAFT = 'DRAFT',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  EVALUATED = 'EVALUATED',
}

export enum MeetingPlatform {
  MS_TEAMS = 'MS_TEAMS',
  GOOGLE_MEET = 'GOOGLE_MEET',
}

export interface InterviewSession {
  id: string;
  candidateId: string;
  createdById: string;
  status: SessionStatus;
  accessToken: string;
  templatePosition: string;
  targetLevel: string;
  sequentialMode?: boolean;
  candidateViewEnabled?: boolean;
  scheduledAt?: string;
  meetingPlatform?: MeetingPlatform;
  meetingLink?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface SessionSurveyQuestion {
  id: string;
  sessionId: string;
  question: string;
  category: string;
  subcategory: string | null;
  /** One-sentence Vietnamese explanation of what the answer reveals. */
  purpose: string;
  /** AI-generated clickable answer choices (ordered most to least experienced). */
  choices: string[];
  /** The selected choice text (or free-text override) filled in by the interviewer. */
  answer: string | null;
  orderIndex: number;
  createdAt: string;
}

export interface SessionQuestion {
  id: string;
  sessionId: string;
  questionId: string;
  orderIndex: number;
  isActive: boolean;
  activatedAt?: string;
  candidateAnswer?: string;
  interviewerNote?: string;
  rating?: number;
  answeredAt?: string;
}

