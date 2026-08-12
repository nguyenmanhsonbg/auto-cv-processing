import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';
import { getSocket, disconnectSocket, WebSocketEvents } from '@/lib/socket';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { Check, Loader2, ChevronLeft, ChevronRight, Play, AlignLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QuestionType } from '@interview-assistant/shared';
import type { ArchitectureAnswer } from '@interview-assistant/shared';
import { ArchitectureEditor } from '@/components/interview/ArchitectureEditor';
import Editor from '@monaco-editor/react';

const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
  { value: 'cpp', label: 'C++' },
];

function KickedView() {
  return <div className="min-h-screen flex items-center justify-center bg-background"><div className="text-center space-y-4 max-w-md mx-auto px-6"><div className="flex justify-center"><div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center"><span className="text-3xl">⚠</span></div></div><h2 className="text-2xl font-semibold">Session opened on another device</h2><p className="text-muted-foreground">This interview session was accessed from another browser or device. You have been disconnected from this tab.</p><p className="text-sm text-muted-foreground">Please close this tab and continue on the other device.</p></div></div>;
}

function SessionDraftView({ position }: { position?: string }) {
  return <div className="min-h-screen flex items-center justify-center bg-background"><div className="text-center space-y-4 max-w-md mx-auto px-6"><div className="flex justify-center"><span className="relative flex h-5 w-5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" /><span className="relative inline-flex rounded-full h-5 w-5 bg-blue-500" /></span></div><h2 className="text-2xl font-semibold">Session not started yet</h2><p className="text-muted-foreground">Your interview session has not started yet. Please wait for the interviewer to begin.</p><p className="text-sm text-muted-foreground">{position}</p></div></div>;
}

function SessionCompletedView({ position }: { position?: string }) {
  return <div className="min-h-screen flex items-center justify-center bg-background"><div className="text-center space-y-4 max-w-md mx-auto px-6"><div className="flex justify-center"><div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center"><Check className="h-8 w-8 text-green-600" /></div></div><h2 className="text-2xl font-semibold">Thank you for completing the interview!</h2><p className="text-muted-foreground">Your responses have been recorded. The results will be communicated to you separately.</p><p className="text-sm text-muted-foreground">{position}</p></div></div>;
}

function SurveyView({
  questions,
  answers,
  submitting,
  onSelect,
  onSubmit,
}: {
  questions: any[];
  answers: Record<string, string>;
  submitting: boolean;
  onSelect: (questionId: string, choice: string) => void;
  onSubmit: () => Promise<void>;
}) {
  const pendingCount = questions.filter((question) => !answers[question.id]).length;
  const allAnswered = pendingCount === 0;

  return <div className="max-w-2xl mx-auto space-y-6 py-8 px-4"><div><h1 className="text-2xl font-bold">Pre-Interview Survey</h1><p className="text-sm text-muted-foreground mt-1">Please answer all questions honestly before the interview begins. ({questions.length - pendingCount}/{questions.length} answered)</p></div><div className="space-y-4">{questions.map((question) => <Card key={question.id}><CardContent className="pt-4 space-y-3"><div className="flex items-start justify-between gap-2"><p className="font-medium text-sm leading-snug">{question.question}</p>{question.subcategory && <Badge variant="secondary" className="shrink-0 text-xs">{question.subcategory}</Badge>}</div><div className="flex flex-wrap gap-2">{(question.choices || []).map((choice: string) => <button key={choice} type="button" onClick={() => onSelect(question.id, choice)} className={cn('px-3 py-1.5 rounded-md border text-sm transition-colors text-left', answers[question.id] === choice ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted border-input')}>{choice}</button>)}</div></CardContent></Card>)}</div><Button onClick={onSubmit} disabled={submitting || !allAnswered} className="w-full">{submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{submitting ? 'Submitting...' : 'Submit Survey & Start Interview'}</Button>{!allAnswered && <p className="text-xs text-center text-muted-foreground">Answer all questions to continue</p>}</div>;
}

function CodingQuestionInput({
  sq,
  codeData,
  isCompleted,
  runResult,
  running,
  editorRefs,
  onLanguageChange,
  onCodeChange,
  onFormat,
  onRun,
}: {
  sq: any;
  codeData: { code: string; language: string };
  isCompleted: boolean;
  runResult?: any;
  running: boolean;
  editorRefs: React.MutableRefObject<Record<string, any>>;
  onLanguageChange: (sqId: string, language: string) => void;
  onCodeChange: (sqId: string, code: string) => void;
  onFormat: (sqId: string) => void;
  onRun: (sqId: string) => void;
}) {
  const isRunnable = ['javascript', 'typescript'].includes(codeData.language);
  return <div className="space-y-2"><div className="flex items-center justify-between gap-2 flex-wrap"><Label>Your Code</Label><div className="flex items-center gap-2"><Select value={codeData.language} onValueChange={(language) => onLanguageChange(sq.id, language)} disabled={isCompleted}><SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{LANGUAGES.map((language) => <SelectItem key={language.value} value={language.value}>{language.label}</SelectItem>)}</SelectContent></Select>{!isCompleted && <><Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onFormat(sq.id)}><AlignLeft className="h-3.5 w-3.5 mr-1" />Format</Button><Button size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white" onClick={() => onRun(sq.id)} disabled={running || !isRunnable} title={!isRunnable ? 'Execution only available for JavaScript/TypeScript' : undefined}>{running ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1" />}{running ? 'Running…' : 'Run'}</Button></>}</div></div><div className="border rounded-md overflow-hidden"><Editor height="350px" language={codeData.language || 'javascript'} value={codeData.code} onChange={(value) => onCodeChange(sq.id, value || '')} onMount={(editor) => { editorRefs.current[sq.id] = editor; }} theme="vs-dark" options={{ minimap: { enabled: false }, fontSize: 14, lineNumbers: 'on', scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2, readOnly: isCompleted }} /></div>{runResult && <RunResults result={runResult} />}{sq.question?.testCases && sq.question.testCases.length > 0 && <TestCases testCases={sq.question.testCases} />}</div>;
}

function getRunStatusVariant(status: string) {
  if (status === 'PASSED') return 'default' as const;
  if (status === 'FAILED') return 'destructive' as const;
  return 'secondary' as const;
}

function RunResults({ result }: { result: any }) {
  return <div className="rounded-md border bg-slate-950 p-3 space-y-1.5"><div className="flex items-center gap-2"><span className="text-xs font-semibold text-slate-300">Run Results</span><Badge className="text-xs" variant={getRunStatusVariant(result.status)}>{result.status}</Badge></div>{(result.results || []).map((item: any, index: number) => <div key={`test-${item.testCaseIndex}`} className={cn('text-xs rounded px-2 py-1.5', item.passed ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300')}><span className="font-medium">{item.passed ? '✓' : '✗'} Test {index + 1}</span>{!item.passed && item.expected !== undefined && <span className="ml-2 text-slate-400">expected: <code className="text-white">{String(item.expected)}</code> got: <code className="text-white">{String(item.actual ?? item.error ?? '—')}</code></span>}{item.runtime && <span className="ml-2 text-slate-500">{item.runtime}ms</span>}</div>)}{result.results?.length === 0 && <p className="text-xs text-slate-400">No test cases defined.</p>}</div>;
}

function TestCases({ testCases }: { testCases: any[] }) {
  return <div className="space-y-2"><Label className="text-xs text-muted-foreground">Test Cases</Label>{testCases.map((testCase, index) => <div key={index} className="rounded-md border p-2 text-xs"><p className="text-muted-foreground">{testCase.description || `Test ${index + 1}`}</p><div className="grid grid-cols-2 gap-2 mt-1"><div><span className="font-medium">Input:</span><pre className="bg-muted p-1 rounded mt-0.5">{testCase.input}</pre></div><div><span className="font-medium">Expected:</span><pre className="bg-muted p-1 rounded mt-0.5">{testCase.expectedOutput}</pre></div></div></div>)}</div>;
}

function QuestionInput({
  sq,
  answers,
  codeState,
  architectureState,
  isCompleted,
  runResults,
  runningId,
  editorRefs,
  onAnswerChange,
  onToggleMultiple,
  onArchitectureChange,
  onCodeChange,
  onLanguageChange,
  onFormat,
  onRun,
}: {
  sq: any;
  answers: Record<string, string>;
  codeState: Record<string, { code: string; language: string }>;
  architectureState: Record<string, ArchitectureAnswer>;
  isCompleted: boolean;
  runResults: Record<string, any>;
  runningId: string | null;
  editorRefs: React.MutableRefObject<Record<string, any>>;
  onAnswerChange: (sqId: string, value: string) => void;
  onToggleMultiple: (sqId: string, optionId: string) => void;
  onArchitectureChange: (sqId: string, value: ArchitectureAnswer) => void;
  onCodeChange: (sqId: string, code: string) => void;
  onLanguageChange: (sqId: string, language: string) => void;
  onFormat: (sqId: string) => void;
  onRun: (sqId: string) => void;
}) {
  const questionType = sq.question?.type as QuestionType | undefined;
  const options: { id: string; text: string }[] = sq.question?.options || [];

  if (questionType === QuestionType.SINGLE_CHOICE && options.length > 0) {
    return <div className="space-y-2"><Label>Your Answer</Label><RadioGroup value={answers[sq.id] || ''} onValueChange={(value) => onAnswerChange(sq.id, value)} disabled={isCompleted}>{options.map((option) => <div key={option.id} className="flex items-center space-x-2"><RadioGroupItem value={option.id} id={`${sq.id}-${option.id}`} /><Label htmlFor={`${sq.id}-${option.id}`} className="text-sm font-normal cursor-pointer">{option.text}</Label></div>)}</RadioGroup></div>;
  }
  if (questionType === QuestionType.MULTIPLE_CHOICE && options.length > 0) {
    const selectedIds = (answers[sq.id] || '').split(',').filter(Boolean);
    return <div className="space-y-2"><Label>Your Answer (select all that apply)</Label><div className="space-y-2">{options.map((option) => <div key={option.id} className="flex items-center space-x-2"><Checkbox checked={selectedIds.includes(option.id)} onCheckedChange={() => onToggleMultiple(sq.id, option.id)} disabled={isCompleted} /><Label className="text-sm font-normal cursor-pointer">{option.text}</Label></div>)}</div></div>;
  }
  if (questionType === QuestionType.ARCHITECTURE) {
    return <div className="space-y-2"><Label>Your Architecture Design</Label><ArchitectureEditor value={architectureState[sq.id] || { nodes: [], connections: [], description: '' }} onChange={(value) => onArchitectureChange(sq.id, value)} readOnly={isCompleted} /></div>;
  }
  if (questionType === QuestionType.CODING) {
    return <CodingQuestionInput sq={sq} codeData={codeState[sq.id] || { code: '', language: 'javascript' }} isCompleted={isCompleted} runResult={runResults[sq.id]} running={runningId === sq.id} editorRefs={editorRefs} onLanguageChange={onLanguageChange} onCodeChange={onCodeChange} onFormat={onFormat} onRun={onRun} />;
  }
  return <div className="space-y-2"><Label>Your Answer</Label><Textarea value={answers[sq.id] || ''} onChange={(event) => onAnswerChange(sq.id, event.target.value)} placeholder="Type your answer here..." rows={4} disabled={isCompleted} /></div>;
}

function ActiveQuestionCard({
  question,
  index,
  total,
  answers,
  codeState,
  architectureState,
  isCompleted,
  runResults,
  runningId,
  submittingId,
  editorRefs,
  onAnswerChange,
  onToggleMultiple,
  onArchitectureChange,
  onCodeChange,
  onLanguageChange,
  onFormat,
  onRun,
  onSubmit,
}: {
  question: any;
  index: number;
  total: number;
  answers: Record<string, string>;
  codeState: Record<string, { code: string; language: string }>;
  architectureState: Record<string, ArchitectureAnswer>;
  isCompleted: boolean;
  runResults: Record<string, any>;
  runningId: string | null;
  submittingId: string | null;
  editorRefs: React.MutableRefObject<Record<string, any>>;
  onAnswerChange: (sqId: string, value: string) => void;
  onToggleMultiple: (sqId: string, optionId: string) => void;
  onArchitectureChange: (sqId: string, value: ArchitectureAnswer) => void;
  onCodeChange: (sqId: string, code: string) => void;
  onLanguageChange: (sqId: string, language: string) => void;
  onFormat: (sqId: string) => void;
  onRun: (sqId: string) => void;
  onSubmit: (sqId: string) => void;
}) {
  return <Card><CardHeader><div className="flex items-center justify-between"><CardTitle className="text-base">Question {index + 1} of {total}</CardTitle><div className="flex items-center gap-2">{question.question?.type && <Badge variant="outline" className="text-xs">{question.question.type}</Badge>}{!!question.candidateAnswer && <Badge className="bg-green-100 text-green-800" variant="outline"><Check className="h-3 w-3 mr-1" />Answered</Badge>}</div></div></CardHeader><CardContent className="space-y-4"><p className="text-sm whitespace-pre-wrap">{question.question?.text || 'Question text'}</p><QuestionInput sq={question} answers={answers} codeState={codeState} architectureState={architectureState} isCompleted={isCompleted} runResults={runResults} runningId={runningId} editorRefs={editorRefs} onAnswerChange={onAnswerChange} onToggleMultiple={onToggleMultiple} onArchitectureChange={onArchitectureChange} onCodeChange={onCodeChange} onLanguageChange={onLanguageChange} onFormat={onFormat} onRun={onRun} />{!isCompleted && <Button size="sm" onClick={() => onSubmit(question.id)} disabled={submittingId === question.id}>{submittingId === question.id ? 'Submitting...' : question.candidateAnswer ? 'Update Answer' : 'Submit Answer'}</Button>}</CardContent></Card>;
}

function CandidateSessionContent({
  session,
  questions,
  currentQuestion,
  safeIndex,
  candidateViewEnabled,
  isCompleted,
  isSequential,
  onPrevious,
  onNext,
  onSubmit,
  ...inputProps
}: {
  session: any;
  questions: any[];
  currentQuestion?: any;
  safeIndex: number;
  candidateViewEnabled: boolean;
  isCompleted: boolean;
  isSequential: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onSubmit: (sqId: string) => void;
  answers: Record<string, string>;
  codeState: Record<string, { code: string; language: string }>;
  architectureState: Record<string, ArchitectureAnswer>;
  runResults: Record<string, any>;
  runningId: string | null;
  submittingId: string | null;
  editorRefs: React.MutableRefObject<Record<string, any>>;
  onAnswerChange: (sqId: string, value: string) => void;
  onToggleMultiple: (sqId: string, optionId: string) => void;
  onArchitectureChange: (sqId: string, value: ArchitectureAnswer) => void;
  onCodeChange: (sqId: string, code: string) => void;
  onLanguageChange: (sqId: string, language: string) => void;
  onFormat: (sqId: string) => void;
  onRun: (sqId: string) => void;
}) {
  const navigationVisible = questions.length > 0 && !isSequential;
  return <div className="max-w-3xl mx-auto space-y-6"><div><h1 className="text-3xl font-bold">Interview Session</h1><p className="text-muted-foreground mt-1">{session.templatePosition}</p></div><Separator />{!candidateViewEnabled ? <Card><CardContent className="py-10 text-center space-y-3"><div className="flex justify-center"><div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center"><AlignLeft className="h-6 w-6 text-muted-foreground" /></div></div><p className="font-medium">Questions are temporarily hidden</p><p className="text-sm text-muted-foreground">The interviewer has paused question display. Please wait.</p></CardContent></Card> : questions.length === 0 ? <Card><CardContent className="py-10 text-center space-y-3"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /><p className="text-muted-foreground">The interviewer will share questions with you shortly.</p></CardContent></Card> : currentQuestion ? <ActiveQuestionCard question={currentQuestion} index={safeIndex} total={questions.length} isCompleted={isCompleted} onSubmit={onSubmit} {...inputProps} /> : null}{navigationVisible && <div className="flex items-center justify-between"><Button variant="outline" size="sm" onClick={onPrevious} disabled={safeIndex === 0}><ChevronLeft className="h-4 w-4 mr-1" />Previous</Button><Button variant="outline" size="sm" onClick={onNext} disabled={safeIndex === questions.length - 1}>Next<ChevronRight className="h-4 w-4 ml-1" /></Button></div>}</div>;
}

export function CandidateSessionPage() {
  const { token } = useParams<{ token: string }>();
  const [session, setSession] = useState<any>(null);
  const [allQuestions, setAllQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [codeState, setCodeState] = useState<Record<string, { code: string; language: string }>>({});
  const [architectureState, setArchitectureState] = useState<Record<string, ArchitectureAnswer>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runResults, setRunResults] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [kicked, setKicked] = useState(false);
  const [candidateViewEnabled, setCandidateViewEnabled] = useState(true);
  const editorRefs = useRef<Record<string, any>>({});
  const [surveyQuestions, setSurveyQuestions] = useState<any[]>([]);
  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, string>>({});
  const [surveySubmitting, setSurveySubmitting] = useState(false);
  const [surveyDone, setSurveyDone] = useState(false);
  const typingTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const codeTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const archDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const antiCheatCleanupRef = useRef<(() => void) | null>(null);

  const fetchSession = useCallback(async () => {
    try {
      const data = await apiClient.get<any>(`/sessions/access/${token}`);
      const sess = data.session || data;
      setSession(sess);
      setCandidateViewEnabled(sess.candidateViewEnabled !== false);
      setAllQuestions(data.questions || []);
      const existingAnswers: Record<string, string> = {};
      (data.questions || []).forEach((question: any) => { if (question.candidateAnswer) existingAnswers[question.id] = question.candidateAnswer; });
      setAnswers((prev) => {
        const merged = { ...prev };
        for (const [key, value] of Object.entries(existingAnswers)) if (!(key in merged)) merged[key] = value;
        return merged;
      });
      setCodeState((prev) => {
        const merged = { ...prev };
        (data.questions || []).forEach((question: any) => {
          if (question.question?.type === QuestionType.CODING && !(question.id in merged)) {
            const starterCode = question.question?.starterCode?.[0];
            merged[question.id] = { code: starterCode?.code || '', language: starterCode?.language || 'javascript' };
          }
        });
        return merged;
      });
      setArchitectureState((prev) => {
        const merged = { ...prev };
        (data.questions || []).forEach((question: any) => {
          if (question.question?.type === QuestionType.ARCHITECTURE && question.candidateAnswer && !(question.id in merged)) {
            try { merged[question.id] = JSON.parse(question.candidateAnswer); } catch { /* ignore parse errors */ }
          }
        });
        return merged;
      });
      return sess;
    } catch (err) {
      console.error('Failed to load session:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let mounted = true;
    const socket = getSocket();
    const handleActivated = () => { if (mounted) { setCurrentIndex(0); fetchSession(); } };
    const handleDeactivated = () => { if (mounted) { fetchSession(); setCurrentIndex(0); } };
    const handleViewToggled = (payload: { enabled: boolean }) => { if (mounted) { setCandidateViewEnabled(payload.enabled); if (!payload.enabled) setCurrentIndex(0); fetchSession(); } };
    socket.on(WebSocketEvents.INTERVIEWER_QUESTIONS_ACTIVATED, handleActivated);
    socket.on(WebSocketEvents.INTERVIEWER_QUESTIONS_DEACTIVATED, handleDeactivated);
    socket.on(WebSocketEvents.INTERVIEWER_CANDIDATE_VIEW_TOGGLED, handleViewToggled);
    const init = async () => {
      const sess = await fetchSession();
      if (!mounted || !sess) return;
      try {
        const rows = await apiClient.get<any[]>(`/sessions/access/${token}/survey`);
        if (mounted && rows.length > 0) {
          setSurveyQuestions(rows);
          const existingAnswers: Record<string, string> = {};
          rows.forEach((question: any) => { if (question.answer) existingAnswers[question.id] = question.answer; });
          setSurveyAnswers(existingAnswers);
          if (rows.every((question) => question.answer)) setSurveyDone(true);
        }
      } catch { /* no survey - proceed normally */ }
      if (!socket.connected) {
        socket.io.opts.query = { sessionId: sess.id, role: 'candidate', accessToken: sess.accessToken };
        socket.connect();
      }
      socket.emit(WebSocketEvents.SESSION_JOIN, { sessionId: sess.id });
      const handleVisibilityChange = () => { if (document.hidden) { socket.emit(WebSocketEvents.CANDIDATE_TAB_HIDDEN, { sessionId: sess.id }); toast({ title: 'Warning', description: 'Leaving the interview tab has been recorded.' }); } };
      const handleCopy = () => { socket.emit(WebSocketEvents.CANDIDATE_COPY_ATTEMPT, { sessionId: sess.id }); };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      document.addEventListener('copy', handleCopy);
      document.addEventListener('cut', handleCopy);
      const handleKicked = () => { if (mounted) setKicked(true); };
      socket.on(WebSocketEvents.CANDIDATE_SESSION_KICKED, handleKicked);
      antiCheatCleanupRef.current = () => { document.removeEventListener('visibilitychange', handleVisibilityChange); document.removeEventListener('copy', handleCopy); document.removeEventListener('cut', handleCopy); socket.off(WebSocketEvents.CANDIDATE_SESSION_KICKED, handleKicked); };
    };
    init();
    const pollInterval = setInterval(() => { if (mounted) fetchSession(); }, 3000);
    return () => { mounted = false; clearInterval(pollInterval); socket.off(WebSocketEvents.INTERVIEWER_QUESTIONS_ACTIVATED, handleActivated); socket.off(WebSocketEvents.INTERVIEWER_QUESTIONS_DEACTIVATED, handleDeactivated); socket.off(WebSocketEvents.INTERVIEWER_CANDIDATE_VIEW_TOGGLED, handleViewToggled); antiCheatCleanupRef.current?.(); disconnectSocket(); Object.values(typingTimerRef.current).forEach(clearTimeout); Object.values(codeTimerRef.current).forEach(clearTimeout); Object.values(archDebounceRef.current).forEach(clearTimeout); };
  }, [token, fetchSession]);

  useEffect(() => {
    if (!session?.id) return;
    const questions = allQuestions.filter((question) => question.isActive === true);
    const currentQuestion = questions[currentIndex];
    if (!currentQuestion) return;
    const socket = getSocket();
    if (socket.connected) socket.emit(WebSocketEvents.CANDIDATE_QUESTION_CHANGED, { sessionId: session.id, sessionQuestionId: currentQuestion.id });
  }, [currentIndex, session?.id, allQuestions]);

  const emitTyping = useCallback((sessionQuestionId: string, text: string) => {
    if (!session?.id) return;
    if (typingTimerRef.current[sessionQuestionId]) clearTimeout(typingTimerRef.current[sessionQuestionId]);
    typingTimerRef.current[sessionQuestionId] = setTimeout(() => { const socket = getSocket(); if (socket.connected) socket.emit(WebSocketEvents.CANDIDATE_TYPING, { sessionId: session.id, sessionQuestionId, text }); }, 150);
  }, [session?.id]);

  const emitCodeChanged = useCallback((sessionQuestionId: string, code: string, language: string) => {
    if (!session?.id) return;
    if (codeTimerRef.current[sessionQuestionId]) clearTimeout(codeTimerRef.current[sessionQuestionId]);
    codeTimerRef.current[sessionQuestionId] = setTimeout(() => { const socket = getSocket(); if (socket.connected) socket.emit(WebSocketEvents.CANDIDATE_CODE_CHANGED, { sessionId: session.id, sessionQuestionId, code, language }); }, 300);
  }, [session?.id]);

  const handleAnswerChange = useCallback((sqId: string, value: string) => { setAnswers((prev) => ({ ...prev, [sqId]: value })); emitTyping(sqId, value); }, [emitTyping]);

  const handleCodeChange = useCallback((sqId: string, code: string) => {
    setCodeState((prev) => ({ ...prev, [sqId]: { ...(prev[sqId] || { code: '', language: 'javascript' }), code } }));
    emitCodeChanged(sqId, code, codeState[sqId]?.language || 'javascript');
  }, [emitCodeChanged, codeState]);

  const handleLanguageChange = useCallback((sqId: string, language: string) => {
    setCodeState((prev) => ({ ...prev, [sqId]: { ...(prev[sqId] || { code: '', language: 'javascript' }), language } }));
    emitCodeChanged(sqId, codeState[sqId]?.code || '', language);
  }, [emitCodeChanged, codeState]);

  const handleArchitectureChange = useCallback((sqId: string, value: ArchitectureAnswer) => {
    setArchitectureState((prev) => ({ ...prev, [sqId]: value }));
    if (archDebounceRef.current[sqId]) clearTimeout(archDebounceRef.current[sqId]);
    archDebounceRef.current[sqId] = setTimeout(() => { const socket = getSocket(); socket.emit(WebSocketEvents.CANDIDATE_ARCHITECTURE_CHANGED, { sessionId: session?.id, sessionQuestionId: sqId, architecture: value }); }, 500);
  }, [session?.id]);

  const handleSubmitAnswer = useCallback(async (sessionQuestionId: string) => {
    const questionType = allQuestions.find((question) => question.id === sessionQuestionId)?.question?.type;
    const answer = questionType === QuestionType.ARCHITECTURE
      ? JSON.stringify(architectureState[sessionQuestionId] || {})
      : questionType === QuestionType.CODING
        ? codeState[sessionQuestionId]?.code || ''
        : answers[sessionQuestionId] || '';
    if (!answer?.trim()) { toast({ title: 'Please enter an answer', variant: 'destructive' }); return; }
    try {
      setSubmittingId(sessionQuestionId);
      await apiClient.post(`/sessions/access/${token}/submit`, { sessionQuestionId, answer });
      const socket = getSocket();
      if (socket.connected && session?.id) socket.emit(WebSocketEvents.CANDIDATE_ANSWER_SUBMITTED, { sessionId: session.id, sessionQuestionId });
      toast({ title: 'Answer submitted' });
      await fetchSession();
      if (session?.sequentialMode) {
        setCurrentIndex(0);
      } else {
        const questions = allQuestions.filter((question) => question.isActive === true);
        if (currentIndex < questions.length - 1) setCurrentIndex((prev) => prev + 1);
      }
    } catch (err) {
      toast({ title: 'Submit failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setSubmittingId(null);
    }
  }, [allQuestions, architectureState, answers, codeState, currentIndex, fetchSession, session?.id, session?.sequentialMode, token]);

  const handleRunCode = useCallback(async (sqId: string) => {
    const { code, language } = codeState[sqId] || { code: '', language: 'javascript' };
    if (!code.trim()) { toast({ title: 'Write some code first', variant: 'destructive' }); return; }
    setRunningId(sqId);
    try {
      const submission = await apiClient.post<any>(`/sessions/access/${token}/submissions`, { sessionQuestionId: sqId, code, language });
      let result = submission;
      for (let i = 0; i < 20; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        result = await apiClient.get<any>(`/sessions/access/${token}/submissions/${submission.id}`);
        if (result.status !== 'PENDING') break;
      }
      setRunResults((prev) => ({ ...prev, [sqId]: result }));
    } catch (err) {
      toast({ title: 'Run failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setRunningId(null);
    }
  }, [codeState, token]);

  const handleFormatCode = useCallback((sqId: string) => { const editor = editorRefs.current[sqId]; if (editor) editor.getAction('editor.action.formatDocument')?.run(); }, []);

  const toggleMultipleChoice = useCallback((sqId: string, optionId: string) => {
    const current = answers[sqId] || '';
    const selected = current ? current.split(',') : [];
    const index = selected.indexOf(optionId);
    if (index >= 0) selected.splice(index, 1); else selected.push(optionId);
    const newValue = selected.join(',');
    setAnswers({ ...answers, [sqId]: newValue });
    emitTyping(sqId, newValue);
  }, [answers, emitTyping]);

  if (kicked) return <KickedView />;
  if (loading) return <div className="text-center py-12">Loading...</div>;
  if (!session) return <div className="text-center py-12">Session not found or expired.</div>;

  if (surveyQuestions.length > 0 && !surveyDone) {
    const handleSurveySelectChoice = (questionId: string, choice: string) => {
      setSurveyAnswers((prev) => prev[questionId] === choice ? (({ [questionId]: _, ...rest }) => rest)(prev) : { ...prev, [questionId]: choice });
    };
    const handleSurveySubmit = async () => {
      setSurveySubmitting(true);
      try {
        const payload = surveyQuestions.map((question) => ({ id: question.id, answer: surveyAnswers[question.id] || '' })).filter((answer) => answer.answer);
        await apiClient.patch(`/sessions/access/${token}/survey/answers`, { answers: payload });
        setSurveyDone(true);
      } catch {
        toast({ title: 'Failed to submit survey. Please try again.', variant: 'destructive' });
      } finally {
        setSurveySubmitting(false);
      }
    };
    return <SurveyView questions={surveyQuestions} answers={surveyAnswers} submitting={surveySubmitting} onSelect={handleSurveySelectChoice} onSubmit={handleSurveySubmit} />;
  }

  const isCompleted = session.status === 'COMPLETED' || session.status === 'EVALUATED';
  if (session.status === 'DRAFT') return <SessionDraftView position={session.templatePosition} />;
  if (isCompleted) return <SessionCompletedView position={session.templatePosition} />;

  const questions = allQuestions.filter((question) => question.isActive === true);
  const isSequential = !!session.sequentialMode;
  const safeIndex = Math.max(0, Math.min(currentIndex, questions.length - 1));
  const currentQuestion = questions[safeIndex];
  const onPrevious = () => setCurrentIndex((prev) => Math.max(0, prev - 1));
  const onNext = () => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1));

  return <CandidateSessionContent session={session} questions={questions} currentQuestion={currentQuestion} safeIndex={safeIndex} candidateViewEnabled={candidateViewEnabled} isCompleted={isCompleted} isSequential={isSequential} onPrevious={onPrevious} onNext={onNext} onSubmit={handleSubmitAnswer} answers={answers} codeState={codeState} architectureState={architectureState} runResults={runResults} runningId={runningId} submittingId={submittingId} editorRefs={editorRefs} onAnswerChange={handleAnswerChange} onToggleMultiple={toggleMultipleChoice} onArchitectureChange={handleArchitectureChange} onCodeChange={handleCodeChange} onLanguageChange={handleLanguageChange} onFormat={handleFormatCode} onRun={handleRunCode} />;
}
