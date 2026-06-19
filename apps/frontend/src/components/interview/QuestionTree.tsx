import { useState, useMemo, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  MessageSquare,
  CircleDot,
  CheckSquare,
  Code2,
  Network,
  FileText,
  Eye,
  Zap,
  Search,
} from 'lucide-react';

import { TECHNICAL_RATING_LABELS, PERSONALITY_RATING_LABELS } from '@interview-assistant/shared';

const getRatingLabels = (category: string): Record<number, string> =>
  category === 'PERSONALITY' ? PERSONALITY_RATING_LABELS : TECHNICAL_RATING_LABELS;

interface QuestionTreeProps {
  questions: any[];
  selectedId?: string;
  candidateCurrentSqId?: string;
  onSelect: (sqId: string) => void;
  onToggleActive?: (sqId: string, active: boolean) => void;
  onForceActivate?: (sqId: string) => void;
  onBulkToggle?: (sqIds: string[], active: boolean) => Promise<void>;
  onRateSubcategory?: (key: string, rating: number | null) => void;
  categoryRatings?: Record<string, number>;
  categoryOrder?: Map<string, string[]>;
  hideUnrated?: boolean;
}

interface TreeCategory {
  name: string;
  subcategories: Map<string, any[]>;
  allQuestions: any[];
}

const typeIcons: Record<string, React.ElementType> = {
  OPEN_ENDED: MessageSquare,
  SINGLE_CHOICE: CircleDot,
  MULTIPLE_CHOICE: CheckSquare,
  CODING: Code2,
  ARCHITECTURE: Network,
  SCENARIO: FileText,
};

const ratingColors: Record<number, string> = {
  1: 'bg-red-500 text-white',
  2: 'bg-yellow-500 text-white',
  3: 'bg-blue-500 text-white',
  4: 'bg-green-500 text-white',
  5: 'bg-purple-500 text-white',
};

const typeColors: Record<string, string> = {
  OPEN_ENDED: 'text-blue-500',
  SINGLE_CHOICE: 'text-purple-500',
  MULTIPLE_CHOICE: 'text-indigo-500',
  CODING: 'text-orange-500',
  ARCHITECTURE: 'text-amber-500',
  SCENARIO: 'text-teal-500',
};

export function QuestionTree({
  questions,
  selectedId,
  candidateCurrentSqId,
  onSelect,
  onToggleActive,
  onForceActivate,
  onBulkToggle,
  onRateSubcategory,
  categoryRatings: externalCategoryRatings,
  categoryOrder,
  hideUnrated = false,
}: QuestionTreeProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['__all__']));
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set(['__all__']));

  // Subcategory ratings: external prop takes priority, fallback to local state
  const [localSubRatings, setLocalSubRatings] = useState<Record<string, number>>({});
  const subRatings = externalCategoryRatings ?? localSubRatings;
  const [searchQuery, setSearchQuery] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  const tree = useMemo(() => {
    const categoryMap = new Map<string, TreeCategory>();
    const filteredQuestions = hideUnrated ? questions.filter((sq) => sq.rating) : questions;

    filteredQuestions.forEach((sq) => {
      const cat = sq.question?.category || 'Uncategorized';
      const sub = sq.question?.subcategory || 'General';

      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, {
          name: cat,
          subcategories: new Map(),
          allQuestions: [],
        });
      }

      const catNode = categoryMap.get(cat)!;
      catNode.allQuestions.push(sq);

      if (!catNode.subcategories.has(sub)) {
        catNode.subcategories.set(sub, []);
      }
      catNode.subcategories.get(sub)!.push(sq);
    });

    if (!categoryOrder || categoryOrder.size === 0) return categoryMap;

    // Sort categories by DB orderIndex
    const catKeys = Array.from(categoryOrder.keys());
    const sortedCatEntries = Array.from(categoryMap.entries()).sort(([a], [b]) => {
      const ai = catKeys.indexOf(a);
      const bi = catKeys.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
    });

    // Sort subcategories within each category by DB orderIndex
    for (const [catKey, catNode] of sortedCatEntries) {
      const subOrder = categoryOrder.get(catKey) ?? [];
      catNode.subcategories = new Map(
        Array.from(catNode.subcategories.entries()).sort(([a], [b]) => {
          const ai = subOrder.indexOf(a);
          const bi = subOrder.indexOf(b);
          if (ai === -1 && bi === -1) return a.localeCompare(b);
          return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
        }),
      );
    }

    return new Map(sortedCatEntries);
  }, [questions, categoryOrder, hideUnrated]);

  // Expand all by default on first render only
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current || tree.size === 0) return;
    initialized.current = true;
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

  // Filter questions by search query
  const q = searchQuery.toLowerCase().trim();
  const matchesSearch = (sq: any) => {
    if (!q) return true;
    const text = (sq.question?.text || '').toLowerCase();
    const cat = (sq.question?.category || '').toLowerCase();
    const sub = (sq.question?.subcategory || '').toLowerCase();
    return text.includes(q) || cat.includes(q) || sub.includes(q);
  };

  const handleBulkToggle = async (sqIds: string[], active: boolean) => {
    if (!onBulkToggle || bulkLoading) return;
    setBulkLoading(true);
    try { await onBulkToggle(sqIds, active); } finally { setBulkLoading(false); }
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
        No questions to display.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Search input + expand/collapse controls */}
      <div className="flex items-center gap-1">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-7 h-7 text-xs"
            placeholder="Search questions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {!isFullyExpanded && (
          <button
            type="button"
            onClick={expandAll}
            title="Expand all"
            className="shrink-0 px-1.5 py-1 rounded border border-muted-foreground/20 hover:bg-muted text-muted-foreground"
          >
            <ChevronsDown className="h-3.5 w-3.5" />
          </button>
        )}
        {!isFullyCollapsed && (
          <button
            type="button"
            onClick={collapseAll}
            title="Collapse all"
            className="shrink-0 px-1.5 py-1 rounded border border-muted-foreground/20 hover:bg-muted text-muted-foreground"
          >
            <ChevronsUp className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="space-y-1 text-sm">
        {Array.from(tree.entries()).map(([catKey, catNode]) => {
          const isCatExpanded = expandedCategories.has(catKey) || !!q;
          const activeCount = catNode.allQuestions.filter((sq) => sq.isActive).length;
          const doneCount = catNode.allQuestions.filter((sq) => sq.candidateAnswer || sq.rating).length;

          // Filter subcategories/questions by search
          const visibleSubs = Array.from(catNode.subcategories.entries()).filter(([, subQs]) =>
            subQs.some(matchesSearch),
          );
          if (q && visibleSubs.length === 0) return null;

          const allCatSqIds = catNode.allQuestions.map((sq) => sq.id);
          const allCatActive = catNode.allQuestions.every((sq) => sq.isActive);

          const catSubKeys = Array.from(catNode.subcategories.keys());
          const allSubsExpanded = catSubKeys.every((subKey) => expandedSubs.has(`${catKey}::${subKey}`));
          const noSubsExpanded = catSubKeys.every((subKey) => !expandedSubs.has(`${catKey}::${subKey}`));

          return (
            <div key={catKey}>
              {/* Category row */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 text-left font-medium min-w-0"
                  onClick={() => toggleCategory(catKey)}
                >
                  <ChevronRight
                    className={cn(
                      'h-4 w-4 shrink-0 transition-transform',
                      isCatExpanded && 'rotate-90',
                    )}
                  />
                  <span className="flex-1 truncate">{catKey}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {catNode.allQuestions.length} Q
                  </span>
                  {doneCount > 0 && (
                    <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0 shrink-0">
                      {doneCount} done
                    </Badge>
                  )}
                  {activeCount > 0 && (
                    <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0 shrink-0">
                      {activeCount} active
                    </Badge>
                  )}
                </button>
                {onBulkToggle && (
                  <button
                    type="button"
                    title={allCatActive ? 'Deactivate all in category' : 'Activate all in category'}
                    disabled={bulkLoading}
                    className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-transparent hover:border-muted-foreground/30 hover:bg-muted text-muted-foreground disabled:opacity-50"
                    onClick={(e) => { e.stopPropagation(); handleBulkToggle(allCatSqIds, !allCatActive); }}
                  >
                    {allCatActive ? 'Deact all' : 'Act all'}
                  </button>
                )}
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
                  {visibleSubs.map(([subKey, subQuestions]) => {
                    const subFullKey = `${catKey}::${subKey}`;
                    const isSubExpanded = expandedSubs.has(subFullKey) || !!q;
                    const subActiveCount = subQuestions.filter((sq) => sq.isActive).length;
                    const allSubActive = subQuestions.every((sq) => sq.isActive);
                    const subSqIds = subQuestions.map((sq) => sq.id);
                    const visibleLeaves = subQuestions.filter(matchesSearch);

                    const subRatingKey = `${catKey}::${subKey}`;
                    const currentSubRating = subRatings[subRatingKey];

                    return (
                      <div key={subFullKey}>
                        {/* Subcategory row */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="flex-1 flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 text-left text-muted-foreground min-w-0"
                            onClick={() => toggleSub(subFullKey)}
                          >
                            <ChevronRight
                              className={cn(
                                'h-3.5 w-3.5 shrink-0 transition-transform',
                                isSubExpanded && 'rotate-90',
                              )}
                            />
                            <span className="flex-1 truncate text-xs font-medium">{subKey}</span>
                            <span className="text-[10px] shrink-0">
                              {subQuestions.length}
                            </span>
                            {subActiveCount > 0 && (
                              <span className="text-[10px] text-green-600 shrink-0">{subActiveCount}A</span>
                            )}
                          </button>
                          {/* Subcategory rating dropdown */}
                          {onRateSubcategory && (
                            <Select
                              value={currentSubRating ? String(currentSubRating) : '__clear__'}
                              onValueChange={(val) => {
                                const rating = (val === '__clear__' || !val) ? null : Number(val);
                                setLocalSubRatings((prev) => {
                                  const next = { ...prev };
                                  if (rating === null) delete next[subRatingKey];
                                  else next[subRatingKey] = rating;
                                  return next;
                                });
                                onRateSubcategory(subRatingKey, rating);
                              }}
                            >
                              <SelectTrigger
                                className={cn(
                                  'h-6 w-28 text-[10px] px-1.5 shrink-0 border',
                                  currentSubRating === 1 && 'border-red-400 text-red-700 bg-red-50',
                                  currentSubRating === 2 && 'border-yellow-400 text-yellow-700 bg-yellow-50',
                                  currentSubRating === 3 && 'border-blue-400 text-blue-700 bg-blue-50',
                                  currentSubRating === 4 && 'border-green-400 text-green-700 bg-green-50',
                                  currentSubRating === 5 && 'border-purple-400 text-purple-700 bg-purple-50',
                                )}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <SelectValue placeholder="— Rate —" />
                              </SelectTrigger>
                              <SelectContent onClick={(e) => e.stopPropagation()}>
                                <SelectItem value="__clear__" className="text-xs text-muted-foreground">— Clear —</SelectItem>
                                {[1, 2, 3, 4, 5].map((r) => (
                                  <SelectItem key={r} value={String(r)} className="text-xs">
                                    {r} – {getRatingLabels(catKey)[r]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          {onBulkToggle && (
                            <button
                              type="button"
                              title={allSubActive ? 'Deactivate all in subcategory' : 'Activate all in subcategory'}
                              disabled={bulkLoading}
                              className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-transparent hover:border-muted-foreground/30 hover:bg-muted text-muted-foreground disabled:opacity-50"
                              onClick={(e) => { e.stopPropagation(); handleBulkToggle(subSqIds, !allSubActive); }}
                            >
                              {allSubActive ? 'Deact all' : 'Act all'}
                            </button>
                          )}
                        </div>

                        {/* Question leaves */}
                        {isSubExpanded && (
                          <div className="ml-4 space-y-0.5">
                            {visibleLeaves.map((sq) => {
                              const isSelected = selectedId === sq.id;
                              const isCandidateCurrent = candidateCurrentSqId === sq.id;
                              const isDone = !!(sq.candidateAnswer || sq.rating);
                              const questionText = sq.question?.text || 'Question';
                              const truncated =
                                questionText.length > 60
                                  ? questionText.slice(0, 60) + '...'
                                  : questionText;
                              const qType = sq.question?.type as string | undefined;
                              const TypeIcon = qType ? typeIcons[qType] : null;
                              const iconColor = qType ? typeColors[qType] : 'text-muted-foreground';

                              return (
                                <div
                                  key={sq.id}
                                  className={cn(
                                    'group flex items-center gap-2 px-2 py-1 rounded cursor-pointer border-l-2',
                                    isSelected
                                      ? 'bg-primary/10 border-l-primary'
                                      : isCandidateCurrent
                                      ? 'bg-amber-50 border-l-amber-500 ring-1 ring-inset ring-amber-200'
                                      : 'border-l-transparent hover:bg-muted/50',
                                  )}
                                  onClick={() => onSelect(sq.id)}
                                >
                                  <Checkbox
                                    checked={sq.isActive}
                                    onCheckedChange={onToggleActive ? (checked) => onToggleActive(sq.id, !!checked) : undefined}
                                    onClick={(e) => e.stopPropagation()}
                                    disabled={!onToggleActive}
                                    className="shrink-0"
                                  />
                                  {TypeIcon && (
                                    <TypeIcon className={cn('h-3.5 w-3.5 shrink-0', iconColor)} />
                                  )}
                                  <span
                                    className={cn(
                                      'flex-1 truncate text-xs',
                                      isDone && 'text-green-700 font-medium',
                                      !isDone && sq.isActive && 'text-foreground',
                                      !isDone && !sq.isActive && 'text-muted-foreground',
                                    )}
                                  >
                                    {truncated}
                                  </span>
                                  {sq.rating && (
                                    <span
                                      title={getRatingLabels(catKey)[sq.rating]}
                                      className={cn(
                                        'shrink-0 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center',
                                        ratingColors[sq.rating] || 'bg-gray-400 text-white',
                                      )}
                                    >
                                      {sq.rating}
                                    </span>
                                  )}
                                  {isCandidateCurrent && (
                                    <span className="flex items-center gap-0.5 shrink-0">
                                      <Eye className="h-3 w-3 text-amber-500 animate-pulse" />
                                      <span className="text-[9px] font-bold text-amber-600 bg-amber-100 px-1 rounded">NOW</span>
                                    </span>
                                  )}
                                  {!isCandidateCurrent && (
                                    <span className={cn('w-1.5 h-1.5 rounded-full bg-green-500 shrink-0', !sq.isActive && 'invisible')} />
                                  )}
                                  {onForceActivate && !isCandidateCurrent && (
                                    <button
                                      type="button"
                                      title="Force activate this question"
                                      className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-amber-100 text-amber-500 hover:text-amber-600 transition-opacity"
                                      onClick={(e) => { e.stopPropagation(); onForceActivate(sq.id); }}
                                    >
                                      <Zap className="h-3 w-3" />
                                    </button>
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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
