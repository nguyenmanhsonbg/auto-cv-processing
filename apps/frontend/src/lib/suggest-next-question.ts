export interface QuestionSuggestion {
  sessionQuestionId: string;
  reasoning: string;
  category: string;
  subcategory: string;
  difficulty: number;
  questionText: string;
}

interface SqInfo {
  id: string;
  orderIndex: number;
  rating?: number | null;
  question?: {
    category?: string;
    subcategory?: string;
    difficulty?: number;
    text?: string;
  } | null;
}

interface SuggestionPick {
  picked: SqInfo;
  reasoning: string;
}

function chooseWeakQuestion(
  unrated: SqInfo[],
  sameSubcategory: SqInfo[],
  sameCategory: SqInfo[],
  ratedDiff: number,
  ratedSubcategory: string,
  ratedCategory: string,
  rating: number,
): SuggestionPick {
  const easierQuestion = sameSubcategory.find((q) => (q.question?.difficulty || 1) <= ratedDiff);
  if (easierQuestion) {
    return {
      picked: easierQuestion,
      reasoning: `Ứng viên trả lời yếu (${rating}/4) — chọn câu dễ hơn trong cùng chủ đề "${ratedSubcategory}" để đánh giá kỹ hơn.`,
    };
  }

  const sameCategoryQuestion = sameCategory[0];
  if (sameCategoryQuestion) {
    return {
      picked: sameCategoryQuestion,
      reasoning: `Ứng viên trả lời yếu (${rating}/4) — không còn câu dễ hơn trong "${ratedSubcategory}", chuyển sang chủ đề khác trong "${ratedCategory}".`,
    };
  }

  return {
    picked: unrated[0],
    reasoning: `Ứng viên trả lời yếu (${rating}/4) — chuyển sang câu tiếp theo theo thứ tự.`,
  };
}

function chooseStrongQuestion(
  unrated: SqInfo[],
  sameSubcategory: SqInfo[],
  sameCategory: SqInfo[],
  otherCategory: SqInfo[],
  ratedDiff: number,
  ratedSubcategory: string,
  rating: number,
): SuggestionPick {
  const harderQuestion = sameSubcategory.find((q) => (q.question?.difficulty || 1) > ratedDiff);
  if (harderQuestion) {
    return {
      picked: harderQuestion,
      reasoning: `Ứng viên trả lời tốt (${rating}/4) — chọn câu khó hơn trong "${ratedSubcategory}" để đánh giá chiều sâu.`,
    };
  }

  const nextCategoryQuestion = otherCategory[0] || sameCategory[0];
  if (nextCategoryQuestion) {
    return {
      picked: nextCategoryQuestion,
      reasoning: `Ứng viên trả lời tốt (${rating}/4) — chuyển sang category mới để đánh giá chiều rộng kiến thức.`,
    };
  }

  return {
    picked: unrated[0],
    reasoning: `Ứng viên trả lời tốt (${rating}/4) — chuyển sang câu tiếp theo theo thứ tự.`,
  };
}

function toSuggestion({ picked, reasoning }: SuggestionPick): QuestionSuggestion {
  return {
    sessionQuestionId: picked.id,
    reasoning,
    category: picked.question?.category || '',
    subcategory: picked.question?.subcategory || '',
    difficulty: picked.question?.difficulty || 1,
    questionText: picked.question?.text || '',
  };
}

/**
 * Rule-based next question suggestion.
 * - Rating 1-2 (weak): prefer easier question in same subcategory, then same category
 * - Rating 3-4 (strong): prefer harder question in same subcategory, then next category
 * - Fallback: next unrated by orderIndex
 */
export function suggestNextQuestion(
  allQuestions: SqInfo[],
  justRatedSqId: string,
  justRatedValue: number,
): QuestionSuggestion | null {
  const justRated = allQuestions.find((q) => q.id === justRatedSqId);
  if (!justRated?.question) return null;

  const unrated = allQuestions
    .filter((q) => q.id !== justRatedSqId && (!q.rating || q.rating === 0))
    .sort((a, b) => a.orderIndex - b.orderIndex);
  if (unrated.length === 0) return null;

  const ratedCategory = justRated.question.category || '';
  const ratedSubcategory = justRated.question.subcategory || '';
  const ratedDiff = justRated.question.difficulty || 1;
  const sameSubcategory = unrated.filter((q) => q.question?.subcategory === ratedSubcategory);
  const sameCategory = unrated.filter((q) => q.question?.category === ratedCategory && q.question?.subcategory !== ratedSubcategory);
  const otherCategory = unrated.filter((q) => q.question?.category !== ratedCategory);
  const pick = justRatedValue <= 2
    ? chooseWeakQuestion(unrated, sameSubcategory, sameCategory, ratedDiff, ratedSubcategory, ratedCategory, justRatedValue)
    : chooseStrongQuestion(unrated, sameSubcategory, sameCategory, otherCategory, ratedDiff, ratedSubcategory, justRatedValue);

  return toSuggestion(pick);
}
