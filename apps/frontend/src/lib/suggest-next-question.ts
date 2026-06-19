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

  const ratedCat = justRated.question.category || '';
  const ratedSub = justRated.question.subcategory || '';
  const ratedDiff = justRated.question.difficulty || 1;
  const isWeak = justRatedValue <= 2;

  const sameSubcategory = unrated.filter((q) => q.question?.subcategory === ratedSub);
  const sameCategory = unrated.filter((q) => q.question?.category === ratedCat && q.question?.subcategory !== ratedSub);
  const otherCategory = unrated.filter((q) => q.question?.category !== ratedCat);

  let picked: SqInfo | undefined;
  let reasoning: string;

  if (isWeak) {
    // Prefer easier in same subcategory
    picked = sameSubcategory.find((q) => (q.question?.difficulty || 1) <= ratedDiff);
    if (picked) {
      reasoning = `Ứng viên trả lời yếu (${justRatedValue}/4) — chọn câu dễ hơn trong cùng chủ đề "${ratedSub}" để đánh giá kỹ hơn.`;
    } else {
      picked = sameCategory[0];
      if (picked) {
        reasoning = `Ứng viên trả lời yếu (${justRatedValue}/4) — không còn câu dễ hơn trong "${ratedSub}", chuyển sang chủ đề khác trong "${ratedCat}".`;
      } else {
        picked = unrated[0];
        reasoning = `Ứng viên trả lời yếu (${justRatedValue}/4) — chuyển sang câu tiếp theo theo thứ tự.`;
      }
    }
  } else {
    // Prefer harder in same subcategory, then next category
    picked = sameSubcategory.find((q) => (q.question?.difficulty || 1) > ratedDiff);
    if (picked) {
      reasoning = `Ứng viên trả lời tốt (${justRatedValue}/4) — chọn câu khó hơn trong "${ratedSub}" để đánh giá chiều sâu.`;
    } else {
      picked = otherCategory[0] || sameCategory[0];
      if (picked) {
        reasoning = `Ứng viên trả lời tốt (${justRatedValue}/4) — chuyển sang category mới để đánh giá chiều rộng kiến thức.`;
      } else {
        picked = unrated[0];
        reasoning = `Ứng viên trả lời tốt (${justRatedValue}/4) — chuyển sang câu tiếp theo theo thứ tự.`;
      }
    }
  }

  if (!picked) return null;

  return {
    sessionQuestionId: picked.id,
    reasoning,
    category: picked.question?.category || '',
    subcategory: picked.question?.subcategory || '',
    difficulty: picked.question?.difficulty || 1,
    questionText: picked.question?.text || '',
  };
}
