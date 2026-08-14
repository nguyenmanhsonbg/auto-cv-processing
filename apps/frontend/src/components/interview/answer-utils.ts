import { QuestionType } from '@interview-assistant/shared';
import type { ArchitectureAnswer } from '@interview-assistant/shared';

export function parseArchitectureAnswer(
  questionType: QuestionType | undefined,
  candidateAnswer?: string,
): ArchitectureAnswer | null {
  if (questionType !== QuestionType.ARCHITECTURE || !candidateAnswer) return null;

  try {
    return JSON.parse(candidateAnswer) as ArchitectureAnswer;
  } catch {
    return null;
  }
}
