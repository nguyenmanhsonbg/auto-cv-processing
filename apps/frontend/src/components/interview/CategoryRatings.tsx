import { useMemo, useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { TECHNICAL_RATING_LABELS, PERSONALITY_RATING_LABELS } from '@interview-assistant/shared';

const getRatingLabels = (category: string): Record<number, string> =>
  category === 'PERSONALITY' ? PERSONALITY_RATING_LABELS : TECHNICAL_RATING_LABELS;

const CATEGORY_LABELS: Record<string, string> = {
  SOFT_SKILL: 'Kỹ năng mềm',
  PERSONALITY: 'Tính cách',
};

const CATEGORY_COLORS: Record<string, string> = {
  SOFT_SKILL: 'text-purple-700 bg-purple-50 border-purple-200',
  PERSONALITY: 'text-orange-700 bg-orange-50 border-orange-200',
};

const RATING_COLORS: Record<number, string> = {
  1: 'bg-red-500 text-white border-red-500',
  2: 'bg-yellow-500 text-white border-yellow-500',
  3: 'bg-blue-500 text-white border-blue-500',
  4: 'bg-green-500 text-white border-green-500',
  5: 'bg-purple-500 text-white border-purple-500',
};

interface CategoryRatingsProps {
  sessionId: string;
  sessionQuestions: any[];
  onRefresh?: () => void;
  categoryOrder?: Map<string, string[]>;
}

export function CategoryRatings({ sessionId, sessionQuestions, onRefresh, categoryOrder }: CategoryRatingsProps) {
  const [saving, setSaving] = useState<string | null>(null);
  const [localRatings, setLocalRatings] = useState<Record<string, number>>({});

  // Sync local ratings from session questions whenever they change
  useEffect(() => {
    const ratings: Record<string, number[]> = {};
    sessionQuestions.forEach((sq) => {
      if (!sq.rating) return;
      const key = `${sq.question?.category || 'Uncategorized'}::${sq.question?.subcategory || 'General'}`;
      if (!ratings[key]) ratings[key] = [];
      ratings[key].push(sq.rating);
    });
    const computed: Record<string, number> = {};
    Object.entries(ratings).forEach(([key, vals]) => {
      computed[key] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    });
    setLocalRatings((prev) => ({ ...computed, ...prev }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Group by category then subcategory, sorted by DB orderIndex
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, any[]>>();
    sessionQuestions.forEach((sq) => {
      const cat = sq.question?.category || 'Uncategorized';
      const sub = sq.question?.subcategory || 'General';
      if (!map.has(cat)) map.set(cat, new Map());
      const catMap = map.get(cat)!;
      if (!catMap.has(sub)) catMap.set(sub, []);
      catMap.get(sub)!.push(sq);
    });

    if (!categoryOrder || categoryOrder.size === 0) return map;

    const catKeys = Array.from(categoryOrder.keys());
    const sortedEntries = Array.from(map.entries()).sort(([a], [b]) => {
      const ai = catKeys.indexOf(a), bi = catKeys.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
    });
    for (const [catKey, subcatMap] of sortedEntries) {
      const subOrder = categoryOrder.get(catKey) ?? [];
      const sortedSubs = new Map(
        Array.from(subcatMap.entries()).sort(([a], [b]) => {
          const ai = subOrder.indexOf(a), bi = subOrder.indexOf(b);
          if (ai === -1 && bi === -1) return a.localeCompare(b);
          return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
        }),
      );
      sortedEntries.find(([k]) => k === catKey)![1] = sortedSubs;
    }
    return new Map(sortedEntries);
  }, [sessionQuestions, categoryOrder]);

  const handleRate = async (category: string, subcategory: string, sqIds: string[], rating: number) => {
    const key = `${category}::${subcategory}`;
    setLocalRatings((prev) => ({ ...prev, [key]: rating }));
    setSaving(key);
    try {
      await Promise.all(
        sqIds.map((sqId) =>
          apiClient.patch(`/sessions/${sessionId}/questions/${sqId}`, { rating }),
        ),
      );
      onRefresh?.();
    } catch {
      toast({ title: 'Failed to save rating', variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  if (grouped.size === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        No questions to rate.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {Array.from(grouped.entries()).map(([category, subcatMap]) => (
        <div key={category}>
          <div className={cn('text-xs font-semibold px-2 py-1 rounded-md border mb-2 inline-block', CATEGORY_COLORS[category] || 'text-gray-600 bg-gray-50 border-gray-200')}>
            {CATEGORY_LABELS[category] || category}
          </div>
          <div className="space-y-1.5">
            {Array.from(subcatMap.entries()).map(([sub, sqs]) => {
              const key = `${category}::${sub}`;
              const current = localRatings[key];
              const sqIds = sqs.map((sq: any) => sq.id);
              const isSaving = saving === key;
              return (
                <div key={key} className="flex items-center gap-2 pl-1">
                  <span
                    className="text-xs text-foreground min-w-0 flex-1 truncate"
                    title={sub}
                  >
                    {sub}
                    <span className="text-muted-foreground ml-1">({sqs.length})</span>
                  </span>
                  <div className="flex gap-0.5 shrink-0">
                    {[1, 2, 3, 4, 5].map((r) => (
                      <button
                        key={r}
                        title={getRatingLabels(category)[r]}
                        disabled={isSaving}
                        onClick={() => handleRate(category, sub, sqIds, r)}
                        className={cn(
                          'w-6 h-6 text-xs rounded border transition-all font-medium',
                          current === r
                            ? RATING_COLORS[r]
                            : 'bg-background text-muted-foreground border-border hover:border-primary/60 hover:bg-muted',
                          isSaving && 'opacity-50 cursor-not-allowed',
                        )}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="pt-1 border-t space-y-0.5">
        <p className="text-[10px] text-muted-foreground">
          {[1, 2, 3, 4, 5].map((r) => `${r} = ${TECHNICAL_RATING_LABELS[r]}`).join(' · ')}
        </p>
        {Array.from(grouped.keys()).includes('PERSONALITY') && (
          <p className="text-[10px] text-orange-600">
            Tính cách: {[1, 2, 3, 4, 5].map((r) => `${r} = ${PERSONALITY_RATING_LABELS[r]}`).join(' · ')}
          </p>
        )}
      </div>
    </div>
  );
}
