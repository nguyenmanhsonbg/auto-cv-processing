import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { QuestionType, TECHNICAL_RATING_LABELS, PERSONALITY_RATING_LABELS } from '@interview-assistant/shared';
import type { ArchitectureAnswer } from '@interview-assistant/shared';
import { ArchitectureViewer } from '@/components/interview/ArchitectureViewer';
import { Button } from '@/components/ui/button';
import { Eye, Loader2, Check, AlertCircle, CheckCircle, XCircle, ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { suggestNextQuestion, type QuestionSuggestion } from '@/lib/suggest-next-question';
import { NextQuestionBanner } from '@/components/interview/NextQuestionBanner';

interface CandidateMirrorProps {
  session: any;
  liveDrafts: Record<string, string>;
  liveCode: Record<string, { code: string; language: string }>;
  liveArchitecture?: Record<string, ArchitectureAnswer>;
  focusedSqId?: string;
  allQuestions: any[];
  onAutoSave: (sqId: string, data: { interviewerNote?: string; rating?: number }) => Promise<void>;
  onNavigate?: (sqId: string) => void;
  onForceActivate?: () => Promise<void>;
  onForceActivateNext?: () => Promise<void>;
  candidateCurrentSqId?: string;
  sessionId?: string;
  onForceActivateById?: (sqId: string) => Promise<void>;
  suggestionsEnabled?: boolean;
  canViewQuestions?: boolean;
}

const typeBadgeStyles: Record<string, string> = {
  OPEN_ENDED: 'bg-blue-100 text-blue-800',
  SINGLE_CHOICE: 'bg-purple-100 text-purple-800',
  MULTIPLE_CHOICE: 'bg-indigo-100 text-indigo-800',
  CODING: 'bg-orange-100 text-orange-800',
  SCENARIO: 'bg-teal-100 text-teal-800',
  ARCHITECTURE: 'bg-amber-100 text-amber-800',
};

const RATING_COLORS: Record<number, { color: string; activeColor: string }> = {
  1: { color: 'border-rose-200 text-rose-700 hover:bg-rose-50', activeColor: 'bg-rose-500 border-rose-500 text-white' },
  2: { color: 'border-amber-200 text-amber-700 hover:bg-amber-50', activeColor: 'bg-amber-500 border-amber-500 text-white' },
  3: { color: 'border-blue-200 text-blue-700 hover:bg-blue-50', activeColor: 'bg-blue-500 border-blue-500 text-white' },
  4: { color: 'border-green-200 text-green-700 hover:bg-green-50', activeColor: 'bg-green-500 border-green-500 text-white' },
  5: { color: 'border-purple-200 text-purple-700 hover:bg-purple-50', activeColor: 'bg-purple-500 border-purple-500 text-white' },
};

const getRatingConfig = (category: string) => {
  const labels = category === 'PERSONALITY' ? PERSONALITY_RATING_LABELS : TECHNICAL_RATING_LABELS;
  return Object.fromEntries(
    ([1, 2, 3, 4, 5] as const).map((r) => [r, { label: labels[r], ...RATING_COLORS[r] }]),
  ) as Record<number, { label: string; color: string; activeColor: string }>;
};

export function CandidateMirror({
  session,
  liveDrafts,
  liveCode,
  liveArchitecture,
  focusedSqId,
  allQuestions,
  onAutoSave,
  onNavigate,
  onForceActivate,
  onForceActivateNext,
  candidateCurrentSqId,
  sessionId,
  onForceActivateById,
  suggestionsEnabled,
  canViewQuestions = true,
}: CandidateMirrorProps) {
  const [forceActivating, setForceActivating] = useState(false);
  const [forceActivatingNext, setForceActivatingNext] = useState(false);
  const [suggestion, setSuggestion] = useState<QuestionSuggestion | null>(null);
  const questions: any[] = allQuestions.length > 0 ? allQuestions : (Array.isArray(session.questions) ? session.questions : []);
  const activeQuestions = questions.filter((sq) => sq.isActive === true);

  // Find focused question
  const sq = focusedSqId
    ? questions.find((q) => q.id === focusedSqId)
    : activeQuestions[0];

  // Question index in context of all questions
  const questionIdx = sq ? questions.indexOf(sq) : -1;
  const activeIdx = sq ? activeQuestions.indexOf(sq) : -1;

  // Inline review state
  const [note, setNote] = useState('');
  const [rating, setRating] = useState<number>(0);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Sync state when focused question changes (only on question ID change, not on
  // every poll-driven note/rating update — avoids clearing the suggestion banner).
  useEffect(() => {
    setNote(sq?.interviewerNote || '');
    setRating(sq?.rating || 0);
    setSaveStatus('idle');
    setSuggestion(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sq?.id]);

  // Clear suggestion when toggle is turned off
  useEffect(() => {
    if (!suggestionsEnabled) setSuggestion(null);
  }, [suggestionsEnabled]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const doSave = useCallback(
    async (data: { interviewerNote?: string; rating?: number }) => {
      if (!sq?.id) return;
      setSaveStatus('saving');
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      try {
        await onAutoSave(sq.id, data);
        setSaveStatus('saved');
        savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('error');
      }
    },
    [sq?.id, onAutoSave],
  );

  const handleNoteChange = useCallback(
    (value: string) => {
      setNote(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        doSave({ interviewerNote: value, rating: rating || undefined });
      }, 800);
    },
    [doSave, rating],
  );

  const handleRatingChange = useCallback(
    async (value: number) => {
      // Toggle off if clicking same rating
      const newRating = rating === value ? 0 : value;
      setRating(newRating);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      await doSave({ interviewerNote: note, rating: newRating || undefined });

      if (suggestionsEnabled && newRating > 0 && sq?.id) {
        const result = suggestNextQuestion(questions, sq.id, newRating);
        setSuggestion(result);
      } else {
        setSuggestion(null);
      }
    },
    [doSave, note, rating, suggestionsEnabled, sq?.id, questions],
  );

  const handlePrev = () => {
    if (activeIdx > 0 && onNavigate) {
      onNavigate(activeQuestions[activeIdx - 1].id);
    }
  };

  const handleNext = () => {
    if (activeIdx < activeQuestions.length - 1 && onNavigate) {
      onNavigate(activeQuestions[activeIdx + 1].id);
    }
  };

  const handleForceActivate = async () => {
    if (!onForceActivate) return;
    setForceActivating(true);
    try { await onForceActivate(); } finally { setForceActivating(false); }
  };

  const handleForceActivateNext = async () => {
    if (!onForceActivateNext) return;
    setForceActivatingNext(true);
    try { await onForceActivateNext(); } finally { setForceActivatingNext(false); }
  };

  if (!sq) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Eye className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-lg font-medium">No questions activated yet</p>
        {canViewQuestions && <p className="text-sm mt-1">Activate questions from the control panel to begin</p>}
      </div>
    );
  }

  // HR users see limited view without question content
  if (!canViewQuestions) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium text-muted-foreground">Session Activity Monitor</span>
        </div>

        <Card className="border-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Interview in Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
              <p className="text-sm text-blue-900">
                {activeQuestions.length > 0
                  ? `${activeQuestions.length} question(s) active`
                  : 'No questions activated yet'}
              </p>
              {candidateCurrentSqId && (
                <p className="text-xs text-blue-700 mt-1">
                  Candidate is currently answering a question
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <Separator className="w-full" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background px-3 text-muted-foreground font-medium tracking-wider">
              RATINGS & NOTES
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Rating</Label>
              {saveStatus === 'saving' && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving...
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <Check className="h-3 w-3" />
                  Saved
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle className="h-3 w-3" />
                  Error
                </span>
              )}
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {([1, 2, 3, 4, 5] as const).map((r) => {
                const cfg = getRatingConfig(sq?.question?.category ?? '')[r];
                const isActive = rating === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handleRatingChange(r)}
                    className={cn(
                      'flex flex-col items-center gap-0.5 px-2 py-2 rounded-md border text-center transition-all cursor-pointer',
                      isActive ? cfg.activeColor : cfg.color,
                    )}
                  >
                    <span className="text-base font-bold leading-none">{r}</span>
                    <span className="text-[10px] leading-tight">{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium">Interviewer Note</Label>
            <Textarea
              value={note}
              onChange={(e) => handleNoteChange(e.target.value)}
              placeholder="Add your notes about this answer..."
              rows={3}
              className="text-sm"
            />
          </div>
        </div>
      </div>
    );
  }

  const questionType = sq.question?.type as QuestionType | undefined;
  const options: { id: string; text: string }[] = sq.question?.options || [];
  const correctAnswers: string[] = sq.question?.correctAnswers || [];
  const draft = liveDrafts[sq.id];
  const codeData = liveCode[sq.id];
  const isAnswered = !!sq.candidateAnswer || !!sq.rating;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium text-muted-foreground">Candidate View (Mirror)</span>
        {onForceActivate && (
          <Button
            size="sm"
            variant={sq.isActive ? 'outline' : 'default'}
            className={cn('ml-auto text-xs', !sq.isActive && 'bg-amber-500 hover:bg-amber-600 border-amber-500 text-white')}
            onClick={handleForceActivate}
            disabled={forceActivating}
          >
            {forceActivating
              ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
              : <Zap className="h-3 w-3 mr-1" />}
            Force Activate
          </Button>
        )}
      </div>

      {/* Navigation row */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePrev}
          disabled={activeIdx <= 0}
          className="text-xs px-2"
        >
          <ChevronLeft className="h-3.5 w-3.5 mr-0.5" />
          Prev
        </Button>
        <span className="flex-1 text-center text-xs text-muted-foreground">
          Active {activeIdx + 1} of {activeQuestions.length}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleNext}
          disabled={activeIdx >= activeQuestions.length - 1}
          className="text-xs px-2"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
        </Button>
      </div>

      <Card
        className={cn(
          'border-2 border-dashed relative',
          sq.isActive ? 'border-green-300 bg-green-50/20' : 'border-muted-foreground/20 bg-muted/5',
        )}
      >
        {/* Mirror overlay indicator */}
        <div className="absolute top-0 right-0 text-[10px] px-2 py-0.5 rounded-bl font-mono text-muted-foreground bg-muted-foreground/10">
          {sq.isActive ? '● ACTIVE' : '○ INACTIVE'}
        </div>

        {/* Candidate currently viewing indicator */}
        {candidateCurrentSqId === sq.id && (
          <div className="absolute top-0 left-0 flex items-center gap-1.5 text-[10px] text-yellow-700 bg-yellow-100 border-b border-r border-yellow-300 px-2 py-0.5 rounded-br font-medium">
            <Eye className="h-2.5 w-2.5 shrink-0" />
            <span>Candidate is here</span>
            {onForceActivateNext && (
              <button
                type="button"
                onClick={handleForceActivateNext}
                disabled={forceActivatingNext}
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-50"
              >
                {forceActivatingNext
                  ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  : <Zap className="h-2.5 w-2.5" />}
                Force Next
              </button>
            )}
          </div>
        )}

        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Question {questionIdx + 1}
            </CardTitle>
            <div className="flex items-center gap-2">
              {questionType && (
                <Badge
                  variant="outline"
                  className={cn('text-xs', typeBadgeStyles[questionType] || '')}
                >
                  {questionType}
                </Badge>
              )}
              {isAnswered && (
                <Badge className="bg-green-100 text-green-800" variant="outline">
                  Submitted
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <p className="text-sm whitespace-pre-wrap">{sq.question?.text || 'Question text'}</p>

          {/* Show submitted answer (architecture has its own dedicated section below) */}
          {isAnswered && questionType !== QuestionType.ARCHITECTURE && (
            <div className="rounded-md bg-green-50 border border-green-200 p-3">
              <p className="text-xs font-medium text-green-700 mb-1">Final Answer:</p>
              {renderAnswer(sq, options)}
            </div>
          )}

          {/* Show live draft for choice questions */}
          {!isAnswered && draft !== undefined && (
            questionType === QuestionType.SINGLE_CHOICE ||
            questionType === QuestionType.MULTIPLE_CHOICE
          ) && (
            <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-yellow-700">Selecting...</span>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500" />
                </span>
              </div>
              {renderChoicePreview(draft, options)}
            </div>
          )}

          {/* Show live draft for text questions */}
          {!isAnswered && draft !== undefined &&
            questionType !== QuestionType.SINGLE_CHOICE &&
            questionType !== QuestionType.MULTIPLE_CHOICE &&
            questionType !== QuestionType.CODING &&
            questionType !== QuestionType.ARCHITECTURE && (
            <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-yellow-700">typing...</span>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500" />
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap text-yellow-900">{draft}</p>
            </div>
          )}

          {/* Show live architecture for ARCHITECTURE type */}
          {questionType === QuestionType.ARCHITECTURE && (
            <div className="space-y-2">
              {liveArchitecture?.[sq.id] ? (
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                    <span className="text-xs text-muted-foreground">designing...</span>
                  </div>
                  <ArchitectureViewer value={liveArchitecture[sq.id]} />
                </div>
              ) : sq.candidateAnswer ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-green-700 mb-1">Final Answer:</p>
                  {(() => {
                    try {
                      return <ArchitectureViewer value={JSON.parse(sq.candidateAnswer)} />;
                    } catch {
                      return null;
                    }
                  })()}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">Waiting for candidate to design...</p>
              )}
            </div>
          )}

          {/* Show live code for CODING type */}
          {questionType === QuestionType.CODING && (
            <div className="space-y-2">
              {codeData ? (
                <>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{codeData.language}</Badge>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500" />
                    </span>
                    <span className="text-xs text-yellow-700">coding...</span>
                  </div>
                  <div className="border rounded-md overflow-hidden">
                    <Editor
                      height="300px"
                      language={codeData.language || 'javascript'}
                      value={codeData.code}
                      theme="vs-dark"
                      options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        fontSize: 13,
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        domReadOnly: true,
                      }}
                    />
                  </div>
                </>
              ) : !isAnswered ? (
                <div className="rounded-md bg-muted p-4 text-center text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1" />
                  Waiting for candidate to start coding...
                </div>
              ) : null}
            </div>
          )}

          {/* No activity yet */}
          {!isAnswered && draft === undefined && !codeData && questionType !== QuestionType.CODING && questionType !== QuestionType.ARCHITECTURE && (
            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground text-center">
              Waiting for candidate response...
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ Answer Review ═══ */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <Separator className="w-full" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-background px-3 text-muted-foreground font-medium tracking-wider">
            ANSWER REVIEW
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {/* Expected answer */}
        {sq.question?.expectedAnswer && (
          <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
            <Label className="text-xs text-blue-700 font-medium">Expected Answer</Label>
            <p className="text-sm whitespace-pre-wrap mt-1 text-blue-900">
              {sq.question.expectedAnswer}
            </p>
          </div>
        )}

        {/* Scoring guide */}
        {sq.question?.scoringGuide && (
          <div className="rounded-md bg-purple-50 border border-purple-200 p-3">
            <Label className="text-xs text-purple-700 font-medium">Scoring Guide</Label>
            <p className="text-sm whitespace-pre-wrap mt-1 text-purple-900">
              {sq.question.scoringGuide}
            </p>
          </div>
        )}

        {/* For choice questions: correct vs selected */}
        {(questionType === QuestionType.SINGLE_CHOICE || questionType === QuestionType.MULTIPLE_CHOICE) &&
          options.length > 0 && sq.candidateAnswer && (
          <div>
            <Label className="text-xs text-muted-foreground">Correct vs Selected</Label>
            <div className="mt-1 space-y-1">
              {options.map((opt) => {
                const selectedIds = sq.candidateAnswer.split(',');
                const isSelected = selectedIds.includes(opt.id);
                const isCorrect = correctAnswers.includes(opt.id);

                return (
                  <div
                    key={opt.id}
                    className={cn(
                      'text-sm px-2 py-1 rounded flex items-center gap-2',
                      isSelected && isCorrect && 'bg-green-50 border border-green-200',
                      isSelected && !isCorrect && 'bg-red-50 border border-red-200',
                      !isSelected && isCorrect && 'bg-blue-50 border border-blue-200',
                      !isSelected && !isCorrect && 'text-muted-foreground',
                    )}
                  >
                    {isSelected && isCorrect && <CheckCircle className="h-3.5 w-3.5 text-green-600 shrink-0" />}
                    {isSelected && !isCorrect && <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />}
                    {!isSelected && isCorrect && <CheckCircle className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
                    <span>{opt.text}</span>
                    {isSelected && <Badge variant="outline" className="text-[10px] ml-auto">Selected</Badge>}
                    {isCorrect && <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700">Correct</Badge>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Code submission results */}
        {questionType === QuestionType.CODING && sq.submissions && sq.submissions.length > 0 && (() => {
          const sorted = [...sq.submissions].sort((a: any, b: any) =>
            new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
          );
          const latest = sorted[0];
          const statusVariant =
            latest.status === 'PASSED' ? 'default' :
            latest.status === 'PARTIAL' ? 'secondary' :
            'destructive';
          const statusColor =
            latest.status === 'PASSED' ? 'bg-green-950 border-green-800' :
            latest.status === 'PARTIAL' ? 'bg-amber-950 border-amber-800' :
            'bg-red-950 border-red-900';

          return (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Last Run</Label>
                <Badge variant={statusVariant} className="text-[10px]">{latest.status}</Badge>
                <span className="text-[10px] text-muted-foreground ml-auto">{latest.language}</span>
                {sorted.length > 1 && (
                  <span className="text-[10px] text-muted-foreground">({sorted.length} runs)</span>
                )}
              </div>
              <div className={cn('rounded-md border p-2.5 space-y-1', statusColor)}>
                {latest.status === 'PENDING' || latest.status === 'RUNNING' ? (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Executing...
                  </div>
                ) : (latest.results || []).length === 0 ? (
                  <p className="text-xs text-slate-400">No test cases defined.</p>
                ) : (
                  (latest.results || []).map((r: any, i: number) => (
                    <div
                      key={i}
                      className={cn(
                        'flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs rounded px-2 py-1',
                        r.passed ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300',
                      )}
                    >
                      <span className="font-semibold shrink-0">
                        {r.passed ? '✓' : '✗'} Test {i + 1}
                        {r.runtime != null && (
                          <span className="ml-1 font-normal text-slate-500">{r.runtime}ms</span>
                        )}
                      </span>
                      {r.input != null && (
                        <span className="text-slate-500 break-all">
                          in: <code className="text-slate-300">{String(r.input)}</code>
                        </span>
                      )}
                      {!r.passed && (
                        <span className="text-slate-400 break-all">
                          expected{' '}
                          <code className="text-white">{String(r.expected ?? '—')}</code>
                          {' · '}got{' '}
                          <code className="text-white">{String(r.actual ?? r.error ?? '—')}</code>
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })()}

        {/* Rating */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">Rating</Label>
            {saveStatus === 'saving' && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving...
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <Check className="h-3 w-3" />
                Saved
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="h-3 w-3" />
                Error
              </span>
            )}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {([1, 2, 3, 4, 5] as const).map((r) => {
              const cfg = getRatingConfig(sq?.question?.category ?? '')[r];
              const isActive = rating === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleRatingChange(r)}
                  className={cn(
                    'flex flex-col items-center gap-0.5 px-2 py-2 rounded-md border text-center transition-all cursor-pointer',
                    isActive ? cfg.activeColor : cfg.color,
                  )}
                >
                  <span className="text-base font-bold leading-none">{r}</span>
                  <span className="text-[10px] leading-tight">{cfg.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Next question suggestion banner */}
        {suggestion && sessionId && onForceActivateById && (
          <NextQuestionBanner
            suggestion={suggestion}
            sessionId={sessionId}
            onActivate={async (sqId) => {
              await onForceActivateById(sqId);
            }}
            onDismiss={() => setSuggestion(null)}
          />
        )}

        {/* Interviewer note */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Interviewer Note</Label>
          <Textarea
            value={note}
            onChange={(e) => handleNoteChange(e.target.value)}
            placeholder="Add your notes about this answer..."
            rows={3}
            className="text-sm"
          />
        </div>
      </div>
    </div>
  );
}

function renderAnswer(sq: any, options: { id: string; text: string }[]) {
  const questionType = sq.question?.type as QuestionType | undefined;
  const answer = sq.candidateAnswer;

  // Architecture answers are rendered by their own dedicated section; avoid dumping raw JSON here
  if (questionType === QuestionType.ARCHITECTURE) {
    return null;
  }

  if (
    (questionType === QuestionType.SINGLE_CHOICE || questionType === QuestionType.MULTIPLE_CHOICE) &&
    options.length > 0
  ) {
    const selectedIds = answer ? answer.split(',') : [];
    return (
      <div className="space-y-1">
        {options.map((opt) => (
          <div
            key={opt.id}
            className={cn(
              'text-sm px-2 py-1 rounded',
              selectedIds.includes(opt.id)
                ? 'bg-green-100 font-medium'
                : 'text-muted-foreground',
            )}
          >
            {selectedIds.includes(opt.id) ? '>> ' : '   '}
            {opt.text}
          </div>
        ))}
      </div>
    );
  }

  return <p className="text-sm whitespace-pre-wrap">{answer}</p>;
}

function renderChoicePreview(
  draft: string,
  options: { id: string; text: string }[],
) {
  const selectedIds = draft ? draft.split(',').filter(Boolean) : [];
  return (
    <div className="space-y-1">
      {options.map((opt) => (
        <div
          key={opt.id}
          className={cn(
            'text-sm px-2 py-1 rounded',
            selectedIds.includes(opt.id)
              ? 'bg-yellow-100 font-medium text-yellow-900'
              : 'text-muted-foreground',
          )}
        >
          {selectedIds.includes(opt.id) ? '>> ' : '   '}
          {opt.text}
        </div>
      ))}
    </div>
  );
}
