import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { ArrowLeft, Loader2, ClipboardList, MessageSquare, CheckSquare2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SessionSurveyQuestion, Question, PaginatedResponse } from '@interview-assistant/shared';

type Phase = 'generate' | 'fill' | 'review';

interface QuestionSuggestion {
  questionId: string;
  reasoning: string;
}

export function SessionSurveyPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<any>(null);
  const [phase, setPhase] = useState<Phase>('generate');
  const [surveyQuestions, setSurveyQuestions] = useState<SessionSurveyQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<QuestionSuggestion[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);

  const fetchSession = useCallback(async () => {
    if (!slug) return;
    try {
      const [sess, questions] = await Promise.all([
        apiClient.get<any>(`/sessions/${slug}`),
        apiClient.get<PaginatedResponse<Question>>('/questions', { limit: 1000 }),
      ]);
      setSession(sess);
      setAllQuestions(questions.data);
    } catch {
      toast({ title: 'Failed to load session', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [slug]);

  // Load existing survey questions on mount (in case user is returning to a partially-filled survey)
  const fetchExistingSurvey = useCallback(async () => {
    if (!slug) return;
    try {
      const rows = await apiClient.get<SessionSurveyQuestion[]>(`/sessions/${slug}/survey`);
      if (rows.length > 0) {
        setSurveyQuestions(rows);
        const initialAnswers: Record<string, string> = {};
        rows.forEach((q) => { if (q.answer) initialAnswers[q.id] = q.answer; });
        setAnswers(initialAnswers);
        setPhase('fill');
      }
    } catch {
      // No existing survey — stay on generate phase
    }
  }, [slug]);

  useEffect(() => {
    fetchSession();
    fetchExistingSurvey();
  }, [fetchSession, fetchExistingSurvey]);

  const handleGenerate = async () => {
    if (!slug) return;
    setGenerating(true);
    try {
      const rows = await apiClient.post<SessionSurveyQuestion[]>(`/sessions/${slug}/survey/generate`, {});
      if (!rows.length) {
        toast({ title: 'AI did not generate questions. Try again.', variant: 'destructive' });
        return;
      }
      setSurveyQuestions(rows);
      setAnswers({});
      setPhase('fill');
    } catch {
      toast({ title: 'Failed to generate survey questions', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const allAnswered = surveyQuestions.length > 0 && surveyQuestions.every((q) => answers[q.id]);

  const handleSaveAndSuggest = async () => {
    if (!slug) return;
    setSaving(true);
    try {
      const result = await apiClient.post<{ suggestions: QuestionSuggestion[] }>(
        `/sessions/${slug}/suggest-from-survey`,
        {},
      );
      setSuggestions(result.suggestions);
      setSelectedIds(new Set(result.suggestions.map((s) => s.questionId)));
      setPhase('review');
    } catch {
      toast({ title: 'Failed to get question suggestions', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleSelection = (questionId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(questionId) ? next.delete(questionId) : next.add(questionId);
      return next;
    });
  };

  const handleActivate = async () => {
    if (!slug || !selectedIds.size) return;
    setActivating(true);
    const activatingIds = new Set(selectedIds);
    try {
      await apiClient.post(`/sessions/${slug}/activate-from-survey`, {
        questionIds: Array.from(activatingIds),
      });
      toast({ title: `${activatingIds.size} question(s) activated` });
      setSelectedIds(new Set());
      setSuggestions((prev) => prev.filter((s) => !activatingIds.has(s.questionId)));
    } catch {
      toast({ title: 'Failed to activate questions', variant: 'destructive' });
    } finally {
      setActivating(false);
    }
  };

  const handleSuggestMore = async () => {
    if (!slug) return;
    setSaving(true);
    try {
      const result = await apiClient.post<{ suggestions: QuestionSuggestion[] }>(
        `/sessions/${slug}/suggest-from-survey`,
        {},
      );
      setSuggestions(result.suggestions);
      setSelectedIds(new Set(result.suggestions.map((s) => s.questionId)));
    } catch {
      toast({ title: 'Failed to get more suggestions', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  // Group suggested questions by subcategory for the review phase
  const questionMap = new Map(allQuestions.map((q) => [q.id, q]));
  const suggestedWithDetails = suggestions.map((s) => ({
    ...s,
    question: questionMap.get(s.questionId),
  })).filter((s) => s.question);

  const groupedSuggestions = suggestedWithDetails.reduce<Record<string, typeof suggestedWithDetails>>((acc, item) => {
    const key = item.question!.subcategory || 'Other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to={`/sessions/${slug}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Survey & Question Activation</h1>
          {session && (
            <p className="text-sm text-muted-foreground">
              {session.candidate?.name} — {session.templatePosition} — {session.targetLevel}
            </p>
          )}
        </div>
      </div>

      {/* Phase indicators */}
      <div className="flex items-center gap-2 text-sm">
        {(['generate', 'fill', 'review'] as Phase[]).map((p, i) => (
          <div key={p} className="flex items-center gap-2">
            {i > 0 && <div className="w-8 h-px bg-border" />}
            <div className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium',
              phase === p ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
            )}>
              {p === 'generate' && <ClipboardList className="h-3 w-3" />}
              {p === 'fill' && <MessageSquare className="h-3 w-3" />}
              {p === 'review' && <CheckSquare2 className="h-3 w-3" />}
              {p === 'generate' ? 'Generate' : p === 'fill' ? 'Fill Answers' : 'Review & Activate'}
            </div>
          </div>
        ))}
      </div>

      {/* Phase 1 — Generate */}
      {phase === 'generate' && (
        <Card>
          <CardHeader>
            <CardTitle>Generate Diagnostic Survey</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              AI will analyze the candidate's profile and generate short diagnostic questions
              to determine their experience in subcategories not clearly shown in their CV.
            </p>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {generating ? 'Generating...' : 'Generate Survey Questions'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Phase 2 — Waiting for candidate to complete survey */}
      {phase === 'fill' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                {answers && Object.keys(answers).length}/{surveyQuestions.length} questions answered by candidate
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Share the session link with the candidate — they will see these questions before the interview starts.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchExistingSurvey}>
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPhase('generate')}>
                Regenerate
              </Button>
            </div>
          </div>

          {surveyQuestions.map((sq) => (
            <Card key={sq.id}>
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-sm leading-snug">{sq.question}</p>
                  {sq.subcategory && (
                    <Badge variant="secondary" className="shrink-0 text-xs">{sq.subcategory}</Badge>
                  )}
                </div>
                {sq.purpose && (
                  <p className="text-xs text-muted-foreground italic">{sq.purpose}</p>
                )}
                {answers[sq.id] ? (
                  <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
                    ✓ {answers[sq.id]}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Waiting for candidate...</p>
                )}
              </CardContent>
            </Card>
          ))}

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleSaveAndSuggest}
              disabled={saving || !allAnswered}
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {saving ? 'Getting suggestions...' : 'Suggest Questions'}
            </Button>
            {!allAnswered && (
              <p className="text-xs text-muted-foreground">All questions must be answered to continue</p>
            )}
          </div>
        </div>
      )}

      {/* Phase 3 — Review & Activate */}
      {phase === 'review' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              AI suggested {suggestions.length} question(s). Uncheck any you want to exclude, then activate.
            </p>
            <p className="text-sm font-medium">{selectedIds.size} selected</p>
          </div>

          {Object.entries(groupedSuggestions).map(([subcategory, items]) => (
            <Card key={subcategory}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">{subcategory}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {items.map(({ questionId, reasoning, question }) => (
                  <div
                    key={questionId}
                    className={cn(
                      'flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors',
                      selectedIds.has(questionId) ? 'border-primary bg-primary/5' : 'border-input bg-background opacity-60',
                    )}
                    onClick={() => toggleSelection(questionId)}
                  >
                    <div className={cn(
                      'mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center',
                      selectedIds.has(questionId) ? 'bg-primary border-primary' : 'border-input',
                    )}>
                      {selectedIds.has(questionId) && (
                        <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm leading-snug">{question?.text}</p>
                      <div className="flex items-center gap-2">
                        {question?.difficulty && (
                          <span className="text-xs text-muted-foreground">Difficulty: {question.difficulty}</span>
                        )}
                        {reasoning && (
                          <span className="text-xs text-blue-600 italic">— {reasoning}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}

          {suggestedWithDetails.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                All suggested questions have been activated. Click "Suggest More" to get additional recommendations.
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-3 pt-2 flex-wrap">
            <Button
              onClick={handleActivate}
              disabled={activating || saving || selectedIds.size === 0}
            >
              {activating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {activating ? 'Activating...' : `Activate ${selectedIds.size} Question(s)`}
            </Button>
            <Button variant="outline" onClick={handleSuggestMore} disabled={saving || activating}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {saving ? 'Suggesting...' : 'Suggest More'}
            </Button>
            <Button variant="outline" onClick={() => setPhase('fill')}>
              Back to Survey
            </Button>
            <Button variant="ghost" onClick={() => navigate(`/sessions/${slug}`)}>
              Go to Session
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
