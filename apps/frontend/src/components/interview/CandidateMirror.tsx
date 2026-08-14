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
import { Eye, Loader2, Check, AlertCircle, ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { suggestNextQuestion, type QuestionSuggestion } from '@/lib/suggest-next-question';
import { NextQuestionBanner } from '@/components/interview/NextQuestionBanner';
import { ChoiceAnswerReview } from '@/components/interview/ChoiceAnswerReview';
import { parseArchitectureAnswer } from '@/components/interview/answer-utils';

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

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

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

function SaveStatusIndicator({ status, errorLabel = 'Error' }: Readonly<{ status: SaveStatus; errorLabel?: string }>) {
  if (status === 'saving') {
    return <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Saving...</span>;
  }
  if (status === 'saved') {
    return <span className="flex items-center gap-1 text-xs text-green-600"><Check className="h-3 w-3" />Saved</span>;
  }
  if (status === 'error') {
    return <span className="flex items-center gap-1 text-xs text-red-600"><AlertCircle className="h-3 w-3" />{errorLabel}</span>;
  }
  return null;
}

function RatingButtons({
  category,
  rating,
  onChange,
}: Readonly<{
  category?: string;
  rating: number;
  onChange: (value: number) => void;
}>) {
  const ratingConfig = getRatingConfig(category ?? '');

  return (
    <div className="grid grid-cols-5 gap-1.5">
      {([1, 2, 3, 4, 5] as const).map((value) => {
        const config = ratingConfig[value];
        const isActive = rating === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            className={cn(
              'flex flex-col items-center gap-0.5 px-2 py-2 rounded-md border text-center transition-all cursor-pointer',
              isActive ? config.activeColor : config.color,
            )}
          >
            <span className="text-base font-bold leading-none">{value}</span>
            <span className="text-[10px] leading-tight">{config.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function NoActiveQuestion({ canViewQuestions }: Readonly<{ canViewQuestions: boolean }>) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
      <Eye className="h-12 w-12 mb-4 opacity-30" />
      <p className="text-lg font-medium">No questions activated yet</p>
      {canViewQuestions && <p className="text-sm mt-1">Activate questions from the control panel to begin</p>}
    </div>
  );
}

function RestrictedCandidateMirror({
  activeQuestionCount,
  candidateCurrentSqId,
  rating,
  saveStatus,
  note,
  onRatingChange,
  onNoteChange,
}: Readonly<{
  activeQuestionCount: number;
  candidateCurrentSqId?: string;
  rating: number;
  saveStatus: SaveStatus;
  note: string;
  onRatingChange: (value: number) => void;
  onNoteChange: (value: string) => void;
}>) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium text-muted-foreground">Session Activity Monitor</span>
      </div>
      <Card className="border-2">
        <CardHeader className="pb-2"><CardTitle className="text-base">Interview in Progress</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
            <p className="text-sm text-blue-900">
              {activeQuestionCount > 0 ? `${activeQuestionCount} question(s) active` : 'No questions activated yet'}
            </p>
            {candidateCurrentSqId && <p className="text-xs text-blue-700 mt-1">Candidate is currently answering a question</p>}
          </div>
        </CardContent>
      </Card>
      <div className="relative">
        <div className="absolute inset-0 flex items-center"><Separator className="w-full" /></div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-background px-3 text-muted-foreground font-medium tracking-wider">RATINGS & NOTES</span>
        </div>
      </div>
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">Rating</Label>
            <SaveStatusIndicator status={saveStatus} />
          </div>
          <RatingButtons category="" rating={rating} onChange={onRatingChange} />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium">Interviewer Note</Label>
          <Textarea
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Add your notes about this answer..."
            rows={3}
            className="text-sm"
          />
        </div>
      </div>
    </div>
  );
}

function MirrorHeader({
  isActive,
  forceActivating,
  onForceActivate,
}: Readonly<{
  isActive: boolean;
  forceActivating: boolean;
  onForceActivate?: () => void;
}>) {
  return (
    <div className="flex items-center gap-2">
      <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-sm font-medium text-muted-foreground">Candidate View (Mirror)</span>
      {onForceActivate && (
        <Button
          size="sm"
          variant={isActive ? 'outline' : 'default'}
          className={cn('ml-auto text-xs', !isActive && 'bg-amber-500 hover:bg-amber-600 border-amber-500 text-white')}
          onClick={onForceActivate}
          disabled={forceActivating}
        >
          {forceActivating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
          Force Activate
        </Button>
      )}
    </div>
  );
}

function MirrorNavigation({
  activeIdx,
  activeQuestionCount,
  onPrev,
  onNext,
}: Readonly<{
  activeIdx: number;
  activeQuestionCount: number;
  onPrev: () => void;
  onNext: () => void;
}>) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={onPrev} disabled={activeIdx <= 0} className="text-xs px-2">
        <ChevronLeft className="h-3.5 w-3.5 mr-0.5" />Prev
      </Button>
      <span className="flex-1 text-center text-xs text-muted-foreground">Active {activeIdx + 1} of {activeQuestionCount}</span>
      <Button variant="ghost" size="sm" onClick={onNext} disabled={activeIdx >= activeQuestionCount - 1} className="text-xs px-2">
        Next<ChevronRight className="h-3.5 w-3.5 ml-0.5" />
      </Button>
    </div>
  );
}

function renderAnswer(sq: any, options: { id: string; text: string }[]) {
  const questionType = sq.question?.type as QuestionType | undefined;
  const answer = sq.candidateAnswer;
  if (questionType === QuestionType.ARCHITECTURE) return null;
  if ((questionType === QuestionType.SINGLE_CHOICE || questionType === QuestionType.MULTIPLE_CHOICE) && options.length > 0) {
    const selectedIds = answer ? answer.split(',') : [];
    return (
      <div className="space-y-1">
        {options.map((opt) => (
          <div key={opt.id} className={cn('text-sm px-2 py-1 rounded', selectedIds.includes(opt.id) ? 'bg-green-100 font-medium' : 'text-muted-foreground')}>
            {selectedIds.includes(opt.id) ? '>> ' : '   '}{opt.text}
          </div>
        ))}
      </div>
    );
  }
  return <p className="text-sm whitespace-pre-wrap">{answer}</p>;
}

function renderChoicePreview(draft: string, options: { id: string; text: string }[]) {
  const selectedIds = draft ? draft.split(',').filter(Boolean) : [];
  return (
    <div className="space-y-1">
      {options.map((opt) => (
        <div key={opt.id} className={cn('text-sm px-2 py-1 rounded', selectedIds.includes(opt.id) ? 'bg-yellow-100 font-medium text-yellow-900' : 'text-muted-foreground')}>
          {selectedIds.includes(opt.id) ? '>> ' : '   '}{opt.text}
        </div>
      ))}
    </div>
  );
}

function LiveDraftActivity({ draft, questionType, options }: Readonly<{ draft?: string; questionType?: QuestionType; options: { id: string; text: string }[] }>) {
  if (draft === undefined) return null;
  const isChoice = questionType === QuestionType.SINGLE_CHOICE || questionType === QuestionType.MULTIPLE_CHOICE;
  const isText = !isChoice && questionType !== QuestionType.CODING && questionType !== QuestionType.ARCHITECTURE;
  if (!isChoice && !isText) return null;
  return (
    <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-yellow-700">{isChoice ? 'Selecting...' : 'typing...'}</span>
        <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500" /></span>
      </div>
      {isChoice ? renderChoicePreview(draft, options) : <p className="text-sm whitespace-pre-wrap text-yellow-900">{draft}</p>}
    </div>
  );
}

function ArchitectureActivity({ liveValue, candidateAnswer }: Readonly<{ liveValue?: ArchitectureAnswer; candidateAnswer?: string }>) {
  if (liveValue) {
    return (
      <div>
        <div className="flex items-center gap-1 mb-1"><span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse" /><span className="text-xs text-muted-foreground">designing...</span></div>
        <ArchitectureViewer value={liveValue} />
      </div>
    );
  }
  if (candidateAnswer) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
        <p className="text-xs font-medium text-green-700 mb-1">Final Answer:</p>
        {(() => {
          const parsed = parseArchitectureAnswer(QuestionType.ARCHITECTURE, candidateAnswer);
          return parsed ? <ArchitectureViewer value={parsed} /> : null;
        })()}
      </div>
    );
  }
  return <p className="text-sm text-muted-foreground italic">Waiting for candidate to design...</p>;
}

function CodeActivity({ codeData, isAnswered }: Readonly<{ codeData?: { code: string; language: string }; isAnswered: boolean }>) {
  if (codeData) {
    return (
      <>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{codeData.language}</Badge>
          <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500" /></span>
          <span className="text-xs text-yellow-700">coding...</span>
        </div>
        <div className="border rounded-md overflow-hidden">
          <Editor height="300px" language={codeData.language || 'javascript'} value={codeData.code} theme="vs-dark" options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, lineNumbers: 'on', scrollBeyondLastLine: false, automaticLayout: true, domReadOnly: true }} />
        </div>
      </>
    );
  }
  if (!isAnswered) {
    return <div className="rounded-md bg-muted p-4 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mx-auto mb-1" />Waiting for candidate to start coding...</div>;
  }
  return null;
}

function CandidateActivityCard({
  sq,
  questionIdx,
  questionType,
  options,
  draft,
  codeData,
  liveArchitecture,
  isAnswered,
  candidateCurrentSqId,
  forceActivatingNext,
  onForceActivateNext,
}: Readonly<{
  sq: any;
  questionIdx: number;
  questionType?: QuestionType;
  options: { id: string; text: string }[];
  draft?: string;
  codeData?: { code: string; language: string };
  liveArchitecture?: ArchitectureAnswer;
  isAnswered: boolean;
  candidateCurrentSqId?: string;
  forceActivatingNext: boolean;
  onForceActivateNext?: () => void;
}>) {
  return (
    <Card className={cn('border-2 border-dashed relative', sq.isActive ? 'border-green-300 bg-green-50/20' : 'border-muted-foreground/20 bg-muted/5')}>
      <div className="absolute top-0 right-0 text-[10px] px-2 py-0.5 rounded-bl font-mono text-muted-foreground bg-muted-foreground/10">{sq.isActive ? '● ACTIVE' : '○ INACTIVE'}</div>
      {candidateCurrentSqId === sq.id && (
        <div className="absolute top-0 left-0 flex items-center gap-1.5 text-[10px] text-yellow-700 bg-yellow-100 border-b border-r border-yellow-300 px-2 py-0.5 rounded-br font-medium">
          <Eye className="h-2.5 w-2.5 shrink-0" /><span>Candidate is here</span>
          {onForceActivateNext && <button type="button" onClick={onForceActivateNext} disabled={forceActivatingNext} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-50">{forceActivatingNext ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Zap className="h-2.5 w-2.5" />}Force Next</button>}
        </div>
      )}
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Question {questionIdx + 1}</CardTitle>
          <div className="flex items-center gap-2">
            {questionType && <Badge variant="outline" className={cn('text-xs', typeBadgeStyles[questionType] || '')}>{questionType}</Badge>}
            {isAnswered && <Badge className="bg-green-100 text-green-800" variant="outline">Submitted</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm whitespace-pre-wrap">{sq.question?.text || 'Question text'}</p>
        {isAnswered && questionType !== QuestionType.ARCHITECTURE && <div className="rounded-md bg-green-50 border border-green-200 p-3"><p className="text-xs font-medium text-green-700 mb-1">Final Answer:</p>{renderAnswer(sq, options)}</div>}
        {!isAnswered && <LiveDraftActivity draft={draft} questionType={questionType} options={options} />}
        {questionType === QuestionType.ARCHITECTURE && <div className="space-y-2"><ArchitectureActivity liveValue={liveArchitecture} candidateAnswer={sq.candidateAnswer} /></div>}
        {questionType === QuestionType.CODING && <div className="space-y-2"><CodeActivity codeData={codeData} isAnswered={isAnswered} /></div>}
        {!isAnswered && draft === undefined && !codeData && questionType !== QuestionType.CODING && questionType !== QuestionType.ARCHITECTURE && <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground text-center">Waiting for candidate response...</div>}
      </CardContent>
    </Card>
  );
}

function ChoiceReview({ questionType, options, correctAnswers, candidateAnswer }: Readonly<{ questionType?: QuestionType; options: { id: string; text: string }[]; correctAnswers: string[]; candidateAnswer?: string }>) {
  const isChoice = questionType === QuestionType.SINGLE_CHOICE || questionType === QuestionType.MULTIPLE_CHOICE;
  if (!isChoice || options.length === 0 || !candidateAnswer) return null;
  return (
    <div>
      <Label className="text-xs text-muted-foreground">Correct vs Selected</Label>
      <ChoiceAnswerReview
        candidateAnswer={candidateAnswer}
        options={options}
        correctAnswers={correctAnswers}
      />
    </div>
  );
}

function getSubmissionStatusVariant(status: string) {
  if (status === 'PASSED') return 'default' as const;
  if (status === 'PARTIAL') return 'secondary' as const;
  return 'destructive' as const;
}

function getSubmissionStatusColor(status: string) {
  if (status === 'PASSED') return 'bg-green-950 border-green-800';
  if (status === 'PARTIAL') return 'bg-amber-950 border-amber-800';
  return 'bg-red-950 border-red-900';
}

function LatestCodeSubmission({ submissions }: Readonly<{ submissions?: any[] }>) {
  if (!submissions || submissions.length === 0) return null;
  const sorted = [...submissions].sort((a: any, b: any) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  const latest = sorted[0];
  const statusVariant = getSubmissionStatusVariant(latest.status);
  const statusColor = getSubmissionStatusColor(latest.status);
  const results = latest.results || [];
  const renderLatestResults = () => {
    if (latest.status === 'PENDING' || latest.status === 'RUNNING') {
      return <div className="flex items-center gap-1.5 text-xs text-slate-400"><Loader2 className="h-3 w-3 animate-spin" />Executing...</div>;
    }
    if (results.length === 0) {
      return <p className="text-xs text-slate-400">No test cases defined.</p>;
    }
    return results.map((result: any, i: number) => (
      <div key={`${latest.id}-test-${result.testCaseIndex}`} className={cn('flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs rounded px-2 py-1', result.passed ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300')}>
        <span className="font-semibold shrink-0">{result.passed ? '✓' : '✗'} Test {i + 1}{result.runtime != null && <span className="ml-1 font-normal text-slate-500">{result.runtime}ms</span>}</span>
        {result.input != null && <span className="text-slate-500 break-all">in: <code className="text-slate-300">{String(result.input)}</code></span>}
        {!result.passed && <span className="text-slate-400 break-all">expected <code className="text-white">{String(result.expected ?? '—')}</code>{' · '}got <code className="text-white">{String(result.actual ?? result.error ?? '—')}</code></span>}
      </div>
    ));
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2"><Label className="text-xs text-muted-foreground">Last Run</Label><Badge variant={statusVariant} className="text-[10px]">{latest.status}</Badge><span className="text-[10px] text-muted-foreground ml-auto">{latest.language}</span>{sorted.length > 1 && <span className="text-[10px] text-muted-foreground">({sorted.length} runs)</span>}</div>
      <div className={cn('rounded-md border p-2.5 space-y-1', statusColor)}>
        {renderLatestResults()}
      </div>
    </div>
  );
}

function AnswerReviewPanel({
  sq,
  questionType,
  options,
  correctAnswers,
  rating,
  saveStatus,
  note,
  suggestion,
  sessionId,
  onRatingChange,
  onNoteChange,
  onSuggestionActivate,
  onSuggestionDismiss,
}: Readonly<{
  sq: any;
  questionType?: QuestionType;
  options: { id: string; text: string }[];
  correctAnswers: string[];
  rating: number;
  saveStatus: SaveStatus;
  note: string;
  suggestion: QuestionSuggestion | null;
  sessionId?: string;
  onRatingChange: (value: number) => void;
  onNoteChange: (value: string) => void;
  onSuggestionActivate?: (sqId: string) => Promise<void>;
  onSuggestionDismiss: () => void;
}>) {
  const labels = questionType ? (sq.question?.category ?? '') : '';
  return (
    <>
      <div className="relative"><div className="absolute inset-0 flex items-center"><Separator className="w-full" /></div><div className="relative flex justify-center text-xs"><span className="bg-background px-3 text-muted-foreground font-medium tracking-wider">ANSWER REVIEW</span></div></div>
      <div className="space-y-4">
        {sq.question?.expectedAnswer && <div className="rounded-md bg-blue-50 border border-blue-200 p-3"><Label className="text-xs text-blue-700 font-medium">Expected Answer</Label><p className="text-sm whitespace-pre-wrap mt-1 text-blue-900">{sq.question.expectedAnswer}</p></div>}
        {sq.question?.scoringGuide && <div className="rounded-md bg-purple-50 border border-purple-200 p-3"><Label className="text-xs text-purple-700 font-medium">Scoring Guide</Label><p className="text-sm whitespace-pre-wrap mt-1 text-purple-900">{sq.question.scoringGuide}</p></div>}
        <ChoiceReview questionType={questionType} options={options} correctAnswers={correctAnswers} candidateAnswer={sq.candidateAnswer} />
        {questionType === QuestionType.CODING && <LatestCodeSubmission submissions={sq.submissions} />}
        <div className="space-y-2">
          <div className="flex items-center justify-between"><Label className="text-xs font-medium">Rating</Label><SaveStatusIndicator status={saveStatus} /></div>
          <RatingButtons category={labels} rating={rating} onChange={onRatingChange} />
        </div>
        {suggestion && sessionId && onSuggestionActivate && <NextQuestionBanner suggestion={suggestion} sessionId={sessionId} onActivate={onSuggestionActivate} onDismiss={onSuggestionDismiss} />}
        <div className="space-y-2"><Label className="text-xs font-medium">Interviewer Note</Label><Textarea value={note} onChange={(event) => onNoteChange(event.target.value)} placeholder="Add your notes about this answer..." rows={3} className="text-sm" /></div>
      </div>
    </>
  );
}

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
  let questions: any[] = [];
  if (allQuestions.length > 0) {
    questions = allQuestions;
  } else if (Array.isArray(session.questions)) {
    questions = session.questions;
  }
  const activeQuestions = questions.filter((sq) => sq.isActive === true);
  const sq = focusedSqId ? questions.find((q) => q.id === focusedSqId) : activeQuestions[0];
  const questionIdx = sq ? questions.indexOf(sq) : -1;
  const activeIdx = sq ? activeQuestions.indexOf(sq) : -1;
  const [note, setNote] = useState('');
  const [rating, setRating] = useState<number>(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setNote(sq?.interviewerNote || '');
    setRating(sq?.rating || 0);
    setSaveStatus('idle');
    setSuggestion(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sq?.id]);

  useEffect(() => {
    if (!suggestionsEnabled) setSuggestion(null);
  }, [suggestionsEnabled]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const doSave = useCallback(async (data: { interviewerNote?: string; rating?: number }) => {
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
  }, [sq?.id, onAutoSave]);

  const handleNoteChange = useCallback((value: string) => {
    setNote(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSave({ interviewerNote: value, rating: rating || undefined }), 800);
  }, [doSave, rating]);

  const handleRatingChange = useCallback(async (value: number) => {
    const newRating = rating === value ? 0 : value;
    setRating(newRating);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    await doSave({ interviewerNote: note, rating: newRating || undefined });
    if (suggestionsEnabled && newRating > 0 && sq?.id) {
      setSuggestion(suggestNextQuestion(questions, sq.id, newRating));
      return;
    }
    setSuggestion(null);
  }, [doSave, note, rating, suggestionsEnabled, sq?.id, questions]);

  const handlePrev = useCallback(() => {
    if (activeIdx > 0 && onNavigate) onNavigate(activeQuestions[activeIdx - 1].id);
  }, [activeIdx, activeQuestions, onNavigate]);

  const handleNext = useCallback(() => {
    if (activeIdx < activeQuestions.length - 1 && onNavigate) onNavigate(activeQuestions[activeIdx + 1].id);
  }, [activeIdx, activeQuestions, onNavigate]);

  const handleForceActivate = useCallback(async () => {
    if (!onForceActivate) return;
    setForceActivating(true);
    try { await onForceActivate(); } finally { setForceActivating(false); }
  }, [onForceActivate]);

  const handleForceActivateNext = useCallback(async () => {
    if (!onForceActivateNext) return;
    setForceActivatingNext(true);
    try { await onForceActivateNext(); } finally { setForceActivatingNext(false); }
  }, [onForceActivateNext]);

  if (!sq) return <NoActiveQuestion canViewQuestions={canViewQuestions} />;
  if (!canViewQuestions) {
    return <RestrictedCandidateMirror activeQuestionCount={activeQuestions.length} candidateCurrentSqId={candidateCurrentSqId} rating={rating} saveStatus={saveStatus} note={note} onRatingChange={handleRatingChange} onNoteChange={handleNoteChange} />;
  }

  const questionType = sq.question?.type as QuestionType | undefined;
  const options: { id: string; text: string }[] = sq.question?.options || [];
  const correctAnswers: string[] = sq.question?.correctAnswers || [];
  const draft = liveDrafts[sq.id];
  const codeData = liveCode[sq.id];
  const isAnswered = !!sq.candidateAnswer || !!sq.rating;

  return (
    <div className="space-y-4">
      <MirrorHeader isActive={sq.isActive} forceActivating={forceActivating} onForceActivate={onForceActivate ? handleForceActivate : undefined} />
      <MirrorNavigation activeIdx={activeIdx} activeQuestionCount={activeQuestions.length} onPrev={handlePrev} onNext={handleNext} />
      <CandidateActivityCard sq={sq} questionIdx={questionIdx} questionType={questionType} options={options} draft={draft} codeData={codeData} liveArchitecture={liveArchitecture?.[sq.id]} isAnswered={isAnswered} candidateCurrentSqId={candidateCurrentSqId} forceActivatingNext={forceActivatingNext} onForceActivateNext={onForceActivateNext ? handleForceActivateNext : undefined} />
      <AnswerReviewPanel sq={sq} questionType={questionType} options={options} correctAnswers={correctAnswers} rating={rating} saveStatus={saveStatus} note={note} suggestion={suggestion} sessionId={sessionId} onRatingChange={handleRatingChange} onNoteChange={handleNoteChange} onSuggestionActivate={onForceActivateById} onSuggestionDismiss={() => setSuggestion(null)} />
    </div>
  );
}
