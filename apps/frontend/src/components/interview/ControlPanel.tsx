import { useState, useCallback, useMemo } from 'react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import type { Question } from '@interview-assistant/shared';
import { Plus, Trash2, Zap, ChevronRight, ListX } from 'lucide-react';
import { QuestionTree } from './QuestionTree';
import { QuestionBankTree } from './QuestionBankTree';

interface Category {
  id: string;
  name: string;
  positions?: string[] | null;
}

interface ControlPanelProps {
  session: any;
  sessionQuestions: any[];
  onRefresh: () => void;
  onSelectQuestion?: (sqId: string) => void;
  selectedSqId?: string;
  candidateCurrentSqId?: string;
  onForceActivate?: (sqId: string) => Promise<void>;
  categoryOrder?: Map<string, string[]>;
  categories?: Category[];
  onCategoryRatingsChange?: (ratings: Record<string, number>) => void;
  hideUnrated?: boolean;
  isReadOnly?: boolean;
}

export function ControlPanel({ session, sessionQuestions, onRefresh, onSelectQuestion, selectedSqId, candidateCurrentSqId, onForceActivate, categoryOrder, categories, onCategoryRatingsChange, hideUnrated, isReadOnly }: ControlPanelProps) {
  const handleBulkToggle = useCallback(
    async (sqIds: string[], isActive: boolean) => {
      await apiClient.post(`/sessions/${session.id}/bulk-toggle-questions`, { sqIds, isActive });
      // WebSocket INTERVIEWER_QUESTIONS_ACTIVATED/DEACTIVATED updates sessionQuestions instantly
    },
    [session.id],
  );

  const handleRateSubcategory = useCallback(
    async (key: string, rating: number | null) => {
      try {
        const current: Record<string, number> = { ...(session.categoryRatings || {}) };
        if (rating === null) delete current[key];
        else current[key] = rating;
        onCategoryRatingsChange?.(current);
        await apiClient.patch(`/sessions/${session.id}`, { categoryRatings: current });
      } catch {
        toast({ title: 'Failed to save rating', variant: 'destructive' });
      }
    },
    [session.id, session.categoryRatings, onCategoryRatingsChange],
  );
  const sessionId = session.id;
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removeSelectedIds, setRemoveSelectedIds] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState(false);
  const [questionBank, setQuestionBank] = useState<Question[]>([]);
  const [selectedBankIds, setSelectedBankIds] = useState<Set<string>>(new Set());
  const [bankSearchQuery, setBankSearchQuery] = useState('');
  const [removeSearchQuery, setRemoveSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const existingQuestionIds = new Set(
    sessionQuestions.map((sq) => sq.question?.id || sq.questionId),
  );

  // Filter question bank by the session's position (null/empty positions = default for all)
  const visibleBankQuestions = useMemo(() => {
    const position = session?.templatePosition;
    if (!position || !categories?.length) return questionBank;
    const relevantCategoryNames = new Set(
      categories
        .filter((c) => !c.positions?.length || c.positions.includes(position))
        .map((c) => c.name),
    );
    return questionBank.filter((q: any) => relevantCategoryNames.has(q.category));
  }, [questionBank, categories, session?.templatePosition]);

  // Map session questions into a flat question format using sqId as the id for the remove tree
  const removeTreeQuestions = useMemo(
    () => sessionQuestions.map((sq) => ({ ...(sq.question || {}), id: sq.id })),
    [sessionQuestions],
  );

  // Action: Force activate the next question after the current active one.
  // Uses the same category/subcategory ordering as the QuestionTree display.
  const handleForceActivateNext = useCallback(async () => {
    if (!onForceActivate) return;

    // Build a flat list in the same order the tree renders: categories by categoryOrder,
    // subcategories by categoryOrder, questions in their natural array position.
    const catKeys = categoryOrder ? Array.from(categoryOrder.keys()) : [];
    const grouped = new Map<string, Map<string, any[]>>();
    sessionQuestions.forEach((sq) => {
      const cat = sq.question?.category || 'Uncategorized';
      const sub = sq.question?.subcategory || 'General';
      if (!grouped.has(cat)) grouped.set(cat, new Map());
      if (!grouped.get(cat)!.has(sub)) grouped.get(cat)!.set(sub, []);
      grouped.get(cat)!.get(sub)!.push(sq);
    });
    const sortedCats = Array.from(grouped.entries()).sort(([a], [b]) => {
      const ai = catKeys.indexOf(a); const bi = catKeys.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
    });
    const ordered: any[] = [];
    for (const [catKey, subMap] of sortedCats) {
      const subOrder = categoryOrder?.get(catKey) ?? [];
      const sortedSubs = Array.from(subMap.entries()).sort(([a], [b]) => {
        const ai = subOrder.indexOf(a); const bi = subOrder.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
      });
      for (const [, subQs] of sortedSubs) ordered.push(...subQs);
    }

    const activeInOrder = ordered.filter((q) => q.isActive);
    if (activeInOrder.length === 0) return;
    const lastActive = activeInOrder[activeInOrder.length - 1];
    const next = ordered[ordered.indexOf(lastActive) + 1];
    if (!next) {
      toast({ title: 'No next question available', variant: 'destructive' });
      return;
    }
    try {
      setActionLoading(true);
      await onForceActivate(next.id);
      toast({ title: 'Next question force activated' });
    } catch {
      // error toast handled by caller
    } finally {
      setActionLoading(false);
    }
  }, [onForceActivate, sessionQuestions, categoryOrder]);

  // Toggle question active state.
  // No onRefresh() needed — backend emits INTERVIEWER_QUESTIONS_ACTIVATED/DEACTIVATED
  // which LiveSessionPage's WebSocket listener handles immediately.
  const handleToggleActive = useCallback(
    async (sqId: string, active: boolean) => {
      try {
        if (active) {
          await apiClient.post(`/sessions/${sessionId}/reactivate-question`, {
            questionId: sqId,
          });
        } else {
          await apiClient.patch(`/sessions/${sessionId}/questions/${sqId}`, {
            isActive: false,
          });
        }
      } catch (err) {
        toast({
          title: 'Failed to toggle question',
          description: err instanceof Error ? err.message : 'Error',
          variant: 'destructive',
        });
      }
    },
    [sessionId],
  );

  // Bulk remove from dialog
  const handleBulkRemove = useCallback(async () => {
    if (removeSelectedIds.size === 0) return;
    setRemoving(true);
    try {
      for (const sqId of Array.from(removeSelectedIds)) {
        await apiClient.delete(`/sessions/${sessionId}/questions/${sqId}`);
      }
      toast({ title: `${removeSelectedIds.size} question(s) removed` });
      setRemoveDialogOpen(false);
      setRemoveSelectedIds(new Set());
      onRefresh();
    } catch (err) {
      toast({ title: 'Failed to remove questions', variant: 'destructive' });
    } finally {
      setRemoving(false);
    }
  }, [sessionId, removeSelectedIds, onRefresh]);

  // Add from Bank dialog
  const handleOpenAddDialog = async () => {
    try {
      const data = await apiClient.get<any>('/questions', { limit: 1000 });
      setQuestionBank(data?.data ?? []);
      setSelectedBankIds(new Set());
      setBankSearchQuery('');
      setAddDialogOpen(true);
    } catch (err) {
      toast({ title: 'Failed to load question bank', variant: 'destructive' });
    }
  };

  const handleAddSelectedFromBank = async () => {
    if (selectedBankIds.size === 0) return;
    try {
      await apiClient.post(`/sessions/${sessionId}/questions`, {
        questionIds: Array.from(selectedBankIds),
      });
      toast({ title: `${selectedBankIds.size} question(s) added` });
      setAddDialogOpen(false);
      onRefresh();
    } catch (err) {
      toast({ title: 'Failed to add questions', variant: 'destructive' });
    }
  };

  const toggleBankQuestion = (qId: string) => {
    setSelectedBankIds((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId);
      else next.add(qId);
      return next;
    });
  };

  const handleBulkToggleAddCategory = (questionIds: string[]) => {
    setSelectedBankIds((prev) => {
      const anySelected = questionIds.some((id) => prev.has(id));
      const next = new Set(prev);
      if (anySelected) {
        questionIds.forEach((id) => next.delete(id));
      } else {
        questionIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleBulkToggleAddSubcategory = (questionIds: string[]) => {
    setSelectedBankIds((prev) => {
      const anySelected = questionIds.some((id) => prev.has(id));
      const next = new Set(prev);
      if (anySelected) {
        questionIds.forEach((id) => next.delete(id));
      } else {
        questionIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const toggleRemoveQuestion = (sqId: string) => {
    setRemoveSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(sqId) ? next.delete(sqId) : next.add(sqId);
      return next;
    });
  };

  const handleBulkToggleRemoveCategory = (sqIds: string[]) => {
    setRemoveSelectedIds((prev) => {
      const anySelected = sqIds.some((id) => prev.has(id));
      const next = new Set(prev);
      if (anySelected) {
        sqIds.forEach((id) => next.delete(id));
      } else {
        sqIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleBulkToggleRemoveSubcategory = (sqIds: string[]) => {
    setRemoveSelectedIds((prev) => {
      const anySelected = sqIds.some((id) => prev.has(id));
      const next = new Set(prev);
      if (anySelected) {
        sqIds.forEach((id) => next.delete(id));
      } else {
        sqIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Action buttons — hidden when session is completed/evaluated */}
      {!isReadOnly && (
        <div className="flex flex-wrap gap-2">
          {onForceActivate && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleForceActivateNext}
              disabled={actionLoading}
              className="text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              <Zap className="h-3.5 w-3.5 mr-1" />
              Force Next
              <ChevronRight className="h-3 w-3 ml-0.5" />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenAddDialog}
            className="text-xs"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add from Bank
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setRemoveSelectedIds(new Set()); setRemoveSearchQuery(''); setRemoveDialogOpen(true); }}
            className="text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
          >
            <ListX className="h-3.5 w-3.5 mr-1" />
            Remove Questions
          </Button>
        </div>
      )}

      {/* Question Tree */}
      <div className="border rounded-md p-2 max-h-[60vh] overflow-y-auto">
        <QuestionTree
          questions={sessionQuestions}
          selectedId={selectedSqId}
          candidateCurrentSqId={candidateCurrentSqId}
          onSelect={(sqId) => onSelectQuestion?.(sqId)}
          onToggleActive={isReadOnly ? undefined : handleToggleActive}
          onForceActivate={isReadOnly ? undefined : onForceActivate}
          onBulkToggle={isReadOnly ? undefined : handleBulkToggle}
          onRateSubcategory={handleRateSubcategory}
          categoryRatings={session.categoryRatings}
          categoryOrder={categoryOrder}
          hideUnrated={hideUnrated}
        />
      </div>

      {/* Remove Questions Dialog */}
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Remove Questions ({removeSelectedIds.size} selected)</DialogTitle>
            <DialogDescription>Select questions to remove from this session.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Search questions..."
            value={removeSearchQuery}
            onChange={(e) => setRemoveSearchQuery(e.target.value)}
          />
          <div className="max-h-[400px] overflow-auto">
            {sessionQuestions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No questions in this session.</p>
            ) : (
              <QuestionBankTree
                questions={removeTreeQuestions}
                existingQuestionIds={new Set()}
                selectedIds={removeSelectedIds}
                onToggle={toggleRemoveQuestion}
                searchQuery={removeSearchQuery}
                categoryOrder={categoryOrder}
                onBulkToggleCategory={handleBulkToggleRemoveCategory}
                onBulkToggleSubcategory={handleBulkToggleRemoveSubcategory}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleBulkRemove}
              disabled={removeSelectedIds.size === 0 || removing}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              {removing ? 'Removing...' : `Remove ${removeSelectedIds.size > 0 ? removeSelectedIds.size : ''} Question(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add from Bank Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Questions from Bank</DialogTitle>
          </DialogHeader>
          <DialogDescription>Select questions to add to this session</DialogDescription>
          <Input
            placeholder="Search questions..."
            value={bankSearchQuery}
            onChange={(e) => setBankSearchQuery(e.target.value)}
          />
          <div className="max-h-[500px] overflow-auto">
            <QuestionBankTree
              questions={visibleBankQuestions}
              existingQuestionIds={existingQuestionIds}
              selectedIds={selectedBankIds}
              onToggle={toggleBankQuestion}
              searchQuery={bankSearchQuery}
              categoryOrder={categoryOrder}
              onBulkToggleCategory={handleBulkToggleAddCategory}
              onBulkToggleSubcategory={handleBulkToggleAddSubcategory}
            />
          </div>
          <DialogFooter>
            <Button onClick={handleAddSelectedFromBank} disabled={selectedBankIds.size === 0}>
              Add {selectedBankIds.size} Question(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
