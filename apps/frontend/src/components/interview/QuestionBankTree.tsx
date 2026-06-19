import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronRight, ChevronsDown, ChevronsUp } from 'lucide-react';

interface QuestionBankTreeProps {
  questions: any[];
  existingQuestionIds: Set<string>;
  selectedIds: Set<string>;
  onToggle: (questionId: string) => void;
  searchQuery: string;
  categoryOrder?: Map<string, string[]>;
  onBulkToggleCategory?: (questionIds: string[]) => void;
  onBulkToggleSubcategory?: (questionIds: string[]) => void;
}

interface TreeCategory {
  name: string;
  subcategories: Map<string, any[]>;
  allQuestions: any[];
}

const typeBadgeStyles: Record<string, string> = {
  OPEN_ENDED: 'bg-blue-50 text-blue-700',
  SINGLE_CHOICE: 'bg-purple-50 text-purple-700',
  MULTIPLE_CHOICE: 'bg-indigo-50 text-indigo-700',
  CODING: 'bg-orange-50 text-orange-700',
  SCENARIO: 'bg-teal-50 text-teal-700',
  ARCHITECTURE: 'bg-pink-50 text-pink-700',
};

const difficultyBadgeStyles: Record<number, string> = {
  1: 'bg-green-50 text-green-700',
  2: 'bg-yellow-50 text-yellow-700',
  3: 'bg-orange-50 text-orange-700',
  4: 'bg-red-50 text-red-700',
  5: 'bg-red-100 text-red-800',
};

function computeGroupChecked(
  ids: string[],
  selectedIds: Set<string>,
  existingIds: Set<string>,
): boolean | 'indeterminate' {
  const selectable = ids.filter((id) => !existingIds.has(id));
  if (selectable.length === 0) return false;
  const count = selectable.filter((id) => selectedIds.has(id)).length;
  if (count === 0) return false;
  if (count === selectable.length) return true;
  return 'indeterminate';
}

export function QuestionBankTree({
  questions,
  existingQuestionIds,
  selectedIds,
  onToggle,
  searchQuery,
  categoryOrder,
  onBulkToggleCategory,
  onBulkToggleSubcategory,
}: QuestionBankTreeProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['__all__']));
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set(['__all__']));

  const tree = useMemo(() => {
    const categoryMap = new Map<string, TreeCategory>();
    const query = searchQuery.toLowerCase().trim();

    const filtered = query
      ? questions.filter((q) => q.text?.toLowerCase().includes(query))
      : questions;

    filtered.forEach((q) => {
      const cat = q.category || 'Uncategorized';
      const sub = q.subcategory || 'General';

      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, {
          name: cat,
          subcategories: new Map(),
          allQuestions: [],
        });
      }

      const catNode = categoryMap.get(cat)!;
      catNode.allQuestions.push(q);

      if (!catNode.subcategories.has(sub)) {
        catNode.subcategories.set(sub, []);
      }
      catNode.subcategories.get(sub)!.push(q);
    });

    if (!categoryOrder || categoryOrder.size === 0) return categoryMap;

    const catKeys = Array.from(categoryOrder.keys());
    const sortedCatEntries = Array.from(categoryMap.entries()).sort(([a], [b]) => {
      const ai = catKeys.indexOf(a), bi = catKeys.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
    });
    for (const [catKey, catNode] of sortedCatEntries) {
      const subOrder = categoryOrder.get(catKey) ?? [];
      catNode.subcategories = new Map(
        Array.from(catNode.subcategories.entries()).sort(([a], [b]) => {
          const ai = subOrder.indexOf(a), bi = subOrder.indexOf(b);
          if (ai === -1 && bi === -1) return a.localeCompare(b);
          return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
        }),
      );
    }
    return new Map(sortedCatEntries);
  }, [questions, searchQuery, categoryOrder]);

  // Expand all categories by default
  useMemo(() => {
    const allCats = new Set(['__all__']);
    const allSubs = new Set(['__all__']);
    tree.forEach((catNode, catKey) => {
      allCats.add(catKey);
      catNode.subcategories.forEach((_, subKey) => {
        allSubs.add(`${catKey}::${subKey}`);
      });
    });
    setExpandedCategories(allCats);
    setExpandedSubs(allSubs);
  }, [tree]);

  const toggleCategory = (catKey: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catKey)) next.delete(catKey);
      else next.add(catKey);
      return next;
    });
  };

  const toggleSub = (subKey: string) => {
    setExpandedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(subKey)) next.delete(subKey);
      else next.add(subKey);
      return next;
    });
  };

  const expandAll = () => {
    const allCats = new Set(['__all__']);
    const allSubs = new Set(['__all__']);
    tree.forEach((catNode, catKey) => {
      allCats.add(catKey);
      catNode.subcategories.forEach((_, subKey) => {
        allSubs.add(`${catKey}::${subKey}`);
      });
    });
    setExpandedCategories(allCats);
    setExpandedSubs(allSubs);
  };

  const collapseAll = () => {
    setExpandedCategories(new Set());
    setExpandedSubs(new Set());
  };

  const isFullyExpanded = Array.from(tree.entries()).every(([catKey, catNode]) =>
    expandedCategories.has(catKey) &&
    Array.from(catNode.subcategories.keys()).every((subKey) => expandedSubs.has(`${catKey}::${subKey}`)),
  );
  const isFullyCollapsed = Array.from(tree.entries()).every(([catKey, catNode]) =>
    !expandedCategories.has(catKey) &&
    Array.from(catNode.subcategories.keys()).every((subKey) => !expandedSubs.has(`${catKey}::${subKey}`)),
  );

  if (tree.size === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-4">
        No questions found.
      </div>
    );
  }

  return (
    <div className="space-y-1 text-sm">
      {(!isFullyExpanded || !isFullyCollapsed) && (
        <div className="flex justify-end gap-1 pb-1">
          {!isFullyExpanded && (
            <button
              type="button"
              onClick={expandAll}
              title="Expand all"
              className="text-[10px] px-1.5 py-0.5 rounded border border-muted-foreground/20 hover:bg-muted text-muted-foreground flex items-center gap-0.5"
            >
              <ChevronsDown className="h-3 w-3" /> Expand all
            </button>
          )}
          {!isFullyCollapsed && (
            <button
              type="button"
              onClick={collapseAll}
              title="Collapse all"
              className="text-[10px] px-1.5 py-0.5 rounded border border-muted-foreground/20 hover:bg-muted text-muted-foreground flex items-center gap-0.5"
            >
              <ChevronsUp className="h-3 w-3" /> Collapse all
            </button>
          )}
        </div>
      )}
      {Array.from(tree.entries()).map(([catKey, catNode]) => {
        const isCatExpanded = expandedCategories.has(catKey);
        const catSelectableIds = catNode.allQuestions
          .filter((q) => !existingQuestionIds.has(q.id))
          .map((q) => q.id);

        const catSubKeys = Array.from(catNode.subcategories.keys());
        const allSubsExpanded = catSubKeys.every((subKey) => expandedSubs.has(`${catKey}::${subKey}`));
        const noSubsExpanded = catSubKeys.every((subKey) => !expandedSubs.has(`${catKey}::${subKey}`));

        return (
          <div key={catKey}>
            {/* Category row */}
            <div className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50">
              {onBulkToggleCategory && (
                <Checkbox
                  checked={computeGroupChecked(catSelectableIds, selectedIds, existingQuestionIds)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onBulkToggleCategory(catSelectableIds);
                  }}
                  className="shrink-0"
                />
              )}
              <button
                type="button"
                className="flex-1 flex items-center gap-2 text-left font-medium min-w-0"
                onClick={() => toggleCategory(catKey)}
              >
                <ChevronRight
                  className={cn(
                    'h-4 w-4 shrink-0 transition-transform',
                    isCatExpanded && 'rotate-90',
                  )}
                />
                <span className="flex-1 truncate">{catKey}</span>
                <span className="text-xs text-muted-foreground">
                  {catNode.allQuestions.length} Q
                </span>
              </button>
              {!allSubsExpanded && (
                <button
                  type="button"
                  title="Expand all subcategories"
                  className="shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedCategories((prev) => new Set([...prev, catKey]));
                    setExpandedSubs((prev) => {
                      const next = new Set(prev);
                      catNode.subcategories.forEach((_, subKey) => next.add(`${catKey}::${subKey}`));
                      return next;
                    });
                  }}
                >
                  <ChevronsDown className="h-3 w-3" />
                </button>
              )}
              {!noSubsExpanded && (
                <button
                  type="button"
                  title="Collapse all subcategories"
                  className="shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedSubs((prev) => {
                      const next = new Set(prev);
                      catNode.subcategories.forEach((_, subKey) => next.delete(`${catKey}::${subKey}`));
                      return next;
                    });
                  }}
                >
                  <ChevronsUp className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Subcategories */}
            {isCatExpanded && (
              <div className="ml-4">
                {Array.from(catNode.subcategories.entries()).map(([subKey, subQuestions]) => {
                  const subFullKey = `${catKey}::${subKey}`;
                  const isSubExpanded = expandedSubs.has(subFullKey);
                  const subSelectableIds = subQuestions
                    .filter((q) => !existingQuestionIds.has(q.id))
                    .map((q) => q.id);

                  return (
                    <div key={subFullKey}>
                      {/* Subcategory row */}
                      <div className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50">
                        {onBulkToggleSubcategory && (
                          <Checkbox
                            checked={computeGroupChecked(subSelectableIds, selectedIds, existingQuestionIds)}
                            onClick={(e) => {
                              e.stopPropagation();
                              onBulkToggleSubcategory(subSelectableIds);
                            }}
                            className="shrink-0"
                          />
                        )}
                        <button
                          type="button"
                          className="flex-1 flex items-center gap-2 text-left text-muted-foreground min-w-0"
                          onClick={() => toggleSub(subFullKey)}
                        >
                          <ChevronRight
                            className={cn(
                              'h-3.5 w-3.5 shrink-0 transition-transform',
                              isSubExpanded && 'rotate-90',
                            )}
                          />
                          <span className="flex-1 truncate text-xs font-medium">{subKey}</span>
                          <span className="text-[10px]">
                            {subQuestions.length}
                          </span>
                        </button>
                      </div>

                      {/* Question leaves */}
                      {isSubExpanded && (
                        <div className="ml-4 space-y-0.5">
                          {subQuestions.map((q) => {
                            const isExisting = existingQuestionIds.has(q.id);
                            const isSelected = selectedIds.has(q.id);
                            const questionText = q.text || 'Question';
                            const truncated =
                              questionText.length > 80
                                ? questionText.slice(0, 80) + '...'
                                : questionText;

                            return (
                              <div
                                key={q.id}
                                className={cn(
                                  'flex items-start gap-2 px-2 py-1 rounded',
                                  isExisting
                                    ? 'opacity-50'
                                    : 'cursor-pointer hover:bg-muted/50',
                                  isSelected && !isExisting && 'bg-primary/10 border border-primary/30',
                                )}
                                onClick={() => {
                                  if (!isExisting) onToggle(q.id);
                                }}
                              >
                                <Checkbox
                                  checked={isSelected || isExisting}
                                  disabled={isExisting}
                                  onCheckedChange={() => {
                                    if (!isExisting) onToggle(q.id);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className={cn('mt-0.5 shrink-0', isExisting && 'opacity-50')}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1">
                                    <span className={cn('flex-1 truncate text-xs', isExisting && 'text-muted-foreground')}>
                                      {truncated}
                                    </span>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {q.type && (
                                        <Badge
                                          variant="outline"
                                          className={cn(
                                            'text-[10px] px-1 py-0',
                                            typeBadgeStyles[q.type] || '',
                                          )}
                                        >
                                          {q.type.replace('_', ' ')}
                                        </Badge>
                                      )}
                                      {q.difficulty && (
                                        <Badge
                                          variant="outline"
                                          className={cn(
                                            'text-[10px] px-1 py-0',
                                            difficultyBadgeStyles[q.difficulty] || '',
                                          )}
                                        >
                                          D{q.difficulty}
                                        </Badge>
                                      )}
                                      {isExisting && (
                                        <span className="text-[10px] text-muted-foreground">Added</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
