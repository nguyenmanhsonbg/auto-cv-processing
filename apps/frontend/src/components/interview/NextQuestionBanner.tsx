import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Zap, Sparkles, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import type { QuestionSuggestion } from '@/lib/suggest-next-question';

interface NextQuestionBannerProps {
  suggestion: QuestionSuggestion;
  sessionId: string;
  onActivate: (sqId: string) => Promise<void>;
  onDismiss: () => void;
}

const difficultyColors: Record<number, string> = {
  1: 'bg-green-100 text-green-800',
  2: 'bg-blue-100 text-blue-800',
  3: 'bg-orange-100 text-orange-800',
  4: 'bg-red-100 text-red-800',
  5: 'bg-purple-100 text-purple-800',
};

export function NextQuestionBanner({ suggestion, sessionId, onActivate, onDismiss }: NextQuestionBannerProps) {
  const [activating, setActivating] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [current, setCurrent] = useState(suggestion);
  const [isAi, setIsAi] = useState(false);

  const handleActivate = async () => {
    setActivating(true);
    try {
      await onActivate(current.sessionQuestionId);
      onDismiss();
    } finally {
      setActivating(false);
    }
  };

  const handleAiSuggest = async () => {
    setAiLoading(true);
    try {
      const result = await apiClient.post<{ sessionQuestionId: string; reasoning: string } | null>(
        `/sessions/${sessionId}/suggest-next-question`,
      );
      if (result?.sessionQuestionId) {
        setCurrent((prev) => ({
          ...prev,
          sessionQuestionId: result.sessionQuestionId,
          reasoning: result.reasoning,
        }));
        setIsAi(true);
      }
    } catch {
      // Silently keep rule-based suggestion
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2 relative">
      <button
        type="button"
        onClick={onDismiss}
        className="absolute top-2 right-2 text-amber-600 hover:text-amber-800 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-2 pr-6">
        <Zap className="h-4 w-4 text-amber-600 shrink-0" />
        <span className="text-xs font-semibold text-amber-800">
          {isAi ? 'AI Suggestion' : 'Suggested Next Question'}
        </span>
        <div className="flex items-center gap-1 ml-auto">
          {current.category && (
            <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 border-amber-300">
              {current.category}
            </Badge>
          )}
          {current.subcategory && (
            <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 border-amber-300">
              {current.subcategory}
            </Badge>
          )}
          {current.difficulty > 0 && (
            <Badge variant="outline" className={`text-[10px] ${difficultyColors[current.difficulty] || ''}`}>
              Lv.{current.difficulty}
            </Badge>
          )}
        </div>
      </div>

      <p className="text-sm text-amber-900 line-clamp-2">{current.questionText}</p>

      <p className="text-xs text-amber-700 italic">{current.reasoning}</p>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="default"
          className="text-xs bg-amber-600 hover:bg-amber-700 text-white"
          onClick={handleActivate}
          disabled={activating}
        >
          {activating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
          Activate This Question
        </Button>
        {!isAi && (
          <Button
            size="sm"
            variant="outline"
            className="text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
            onClick={handleAiSuggest}
            disabled={aiLoading}
          >
            {aiLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
            Get AI Suggestion
          </Button>
        )}
      </div>
    </div>
  );
}
