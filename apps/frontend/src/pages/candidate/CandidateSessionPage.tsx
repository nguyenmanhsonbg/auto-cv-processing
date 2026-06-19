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

  // Survey state
  const [surveyQuestions, setSurveyQuestions] = useState<any[]>([]);
  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, string>>({});
  const [surveySubmitting, setSurveySubmitting] = useState(false);
  const [surveyDone, setSurveyDone] = useState(false);

  // Debounce refs
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
      (data.questions || []).forEach((q: any) => {
        if (q.candidateAnswer) {
          existingAnswers[q.id] = q.candidateAnswer;
        }
      });
      setAnswers((prev) => {
        const merged = { ...prev };
        for (const [key, val] of Object.entries(existingAnswers)) {
          if (!(key in merged)) {
            merged[key] = val;
          }
        }
        return merged;
      });

      // Initialize code state from starter code for CODING questions
      setCodeState((prev) => {
        const merged = { ...prev };
        (data.questions || []).forEach((sq: any) => {
          if (sq.question?.type === QuestionType.CODING && !(sq.id in merged)) {
            const starterCode = sq.question?.starterCode?.[0];
            merged[sq.id] = {
              code: starterCode?.code || '',
              language: starterCode?.language || 'javascript',
            };
          }
        });
        return merged;
      });

      // Initialize architecture state from existing answers
      setArchitectureState((prev) => {
        const merged = { ...prev };
        (data.questions || []).forEach((sq: any) => {
          if (sq.question?.type === QuestionType.ARCHITECTURE && sq.candidateAnswer && !(sq.id in merged)) {
            try {
              merged[sq.id] = JSON.parse(sq.candidateAnswer);
            } catch { /* ignore parse errors */ }
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

  // Initial fetch and socket setup
  useEffect(() => {
    let mounted = true;

    // Register listeners immediately so events fired during the initial fetch are not missed
    const s = getSocket();
    const handleActivated = () => { if (mounted) { setCurrentIndex(0); fetchSession(); } };
    const handleDeactivated = () => { if (mounted) { fetchSession(); setCurrentIndex(0); } };
    const handleViewToggled = (payload: { enabled: boolean }) => {
      if (mounted) {
        setCandidateViewEnabled(payload.enabled);
        if (!payload.enabled) setCurrentIndex(0);
        fetchSession();
      }
    };
    s.on(WebSocketEvents.INTERVIEWER_QUESTIONS_ACTIVATED, handleActivated);
    s.on(WebSocketEvents.INTERVIEWER_QUESTIONS_DEACTIVATED, handleDeactivated);
    s.on(WebSocketEvents.INTERVIEWER_CANDIDATE_VIEW_TOGGLED, handleViewToggled);

    const init = async () => {
      const sess = await fetchSession();
      if (!mounted || !sess) return;

      // Load survey questions (if any) — show pre-interview survey if unanswered questions exist
      try {
        const rows = await apiClient.get<any[]>(`/sessions/access/${token}/survey`);
        if (mounted && rows.length > 0) {
          setSurveyQuestions(rows);
          const existingAnswers: Record<string, string> = {};
          rows.forEach((q: any) => { if (q.answer) existingAnswers[q.id] = q.answer; });
          setSurveyAnswers(existingAnswers);
          // If all already answered, skip survey phase
          const allAnswered = rows.every((q: any) => q.answer);
          if (allAnswered) setSurveyDone(true);
        }
      } catch { /* no survey — proceed normally */ }

      // Connect socket with role info and accessToken for server-side validation
      if (!s.connected) {
        s.io.opts.query = { sessionId: sess.id, role: 'candidate', accessToken: sess.accessToken };
        s.connect();
      }
      s.emit(WebSocketEvents.SESSION_JOIN, { sessionId: sess.id });

      // Anti-cheat: tab/window switch detection
      const handleVisibilityChange = () => {
        if (document.hidden) {
          s.emit(WebSocketEvents.CANDIDATE_TAB_HIDDEN, { sessionId: sess.id });
          toast({ title: 'Warning', description: 'Leaving the interview tab has been recorded.' });
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);

      // Anti-cheat: copy/cut detection
      const handleCopy = () => {
        s.emit(WebSocketEvents.CANDIDATE_COPY_ATTEMPT, { sessionId: sess.id });
      };
      document.addEventListener('copy', handleCopy);
      document.addEventListener('cut', handleCopy);

      // Anti-cheat: kicked when another device joins
      const handleKicked = () => {
        if (mounted) setKicked(true);
      };
      s.on(WebSocketEvents.CANDIDATE_SESSION_KICKED, handleKicked);

      antiCheatCleanupRef.current = () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        document.removeEventListener('copy', handleCopy);
        document.removeEventListener('cut', handleCopy);
        s.off(WebSocketEvents.CANDIDATE_SESSION_KICKED, handleKicked);
      };
    };

    init();

    // Polling fallback every 3s to catch any missed socket events
    const pollInterval = setInterval(() => {
      if (mounted) fetchSession();
    }, 3000);

    return () => {
      mounted = false;
      clearInterval(pollInterval);
      s.off(WebSocketEvents.INTERVIEWER_QUESTIONS_ACTIVATED, handleActivated);
      s.off(WebSocketEvents.INTERVIEWER_QUESTIONS_DEACTIVATED, handleDeactivated);
      s.off(WebSocketEvents.INTERVIEWER_CANDIDATE_VIEW_TOGGLED, handleViewToggled);
      antiCheatCleanupRef.current?.();
      disconnectSocket();
      // Clear all debounce timers
      Object.values(typingTimerRef.current).forEach(clearTimeout);
      Object.values(codeTimerRef.current).forEach(clearTimeout);
      Object.values(archDebounceRef.current).forEach(clearTimeout);
    };
  }, [token, fetchSession]);

  // Emit candidate question changed when currentIndex changes
  useEffect(() => {
    if (!session?.id) return;
    const questions = allQuestions.filter((sq) => sq.isActive === true);
    const currentQ = questions[currentIndex];
    if (!currentQ) return;

    const socket = getSocket();
    if (socket.connected) {
      socket.emit(WebSocketEvents.CANDIDATE_QUESTION_CHANGED, {
        sessionId: session.id,
        sessionQuestionId: currentQ.id,
      });
    }
  }, [currentIndex, session?.id, allQuestions]);

  // Emit typing event debounced
  const emitTyping = useCallback(
    (sessionQuestionId: string, text: string) => {
      if (!session?.id) return;
      if (typingTimerRef.current[sessionQuestionId]) {
        clearTimeout(typingTimerRef.current[sessionQuestionId]);
      }
      typingTimerRef.current[sessionQuestionId] = setTimeout(() => {
        const socket = getSocket();
        if (socket.connected) {
          socket.emit(WebSocketEvents.CANDIDATE_TYPING, {
            sessionId: session.id,
            sessionQuestionId,
            text,
          });
        }
      }, 150);
    },
    [session?.id],
  );

  // Emit code changed debounced
  const emitCodeChanged = useCallback(
    (sessionQuestionId: string, code: string, language: string) => {
      if (!session?.id) return;
      if (codeTimerRef.current[sessionQuestionId]) {
        clearTimeout(codeTimerRef.current[sessionQuestionId]);
      }
      codeTimerRef.current[sessionQuestionId] = setTimeout(() => {
        const socket = getSocket();
        if (socket.connected) {
          socket.emit(WebSocketEvents.CANDIDATE_CODE_CHANGED, {
            sessionId: session.id,
            sessionQuestionId,
            code,
            language,
          });
        }
      }, 300);
    },
    [session?.id],
  );

  const handleAnswerChange = useCallback(
    (sqId: string, value: string) => {
      setAnswers((prev) => ({ ...prev, [sqId]: value }));
      emitTyping(sqId, value);
    },
    [emitTyping],
  );

  const handleCodeChange = useCallback(
    (sqId: string, code: string) => {
      setCodeState((prev) => {
        const current = prev[sqId] || { code: '', language: 'javascript' };
        return { ...prev, [sqId]: { ...current, code } };
      });
      const lang = codeState[sqId]?.language || 'javascript';
      emitCodeChanged(sqId, code, lang);
    },
    [emitCodeChanged, codeState],
  );

  const handleLanguageChange = useCallback(
    (sqId: string, language: string) => {
      setCodeState((prev) => {
        const current = prev[sqId] || { code: '', language: 'javascript' };
        return { ...prev, [sqId]: { ...current, language } };
      });
      const code = codeState[sqId]?.code || '';
      emitCodeChanged(sqId, code, language);
    },
    [emitCodeChanged, codeState],
  );

  const handleSubmitAnswer = async (sessionQuestionId: string) => {
    const questionType = allQuestions.find((q) => q.id === sessionQuestionId)?.question?.type;
    let answer: string;

    if (questionType === QuestionType.ARCHITECTURE) {
      answer = JSON.stringify(architectureState[sessionQuestionId] || {});
    } else if (questionType === QuestionType.CODING) {
      answer = codeState[sessionQuestionId]?.code || '';
    } else {
      answer = answers[sessionQuestionId] || '';
    }

    if (!answer?.trim()) {
      toast({ title: 'Please enter an answer', variant: 'destructive' });
      return;
    }
    try {
      setSubmittingId(sessionQuestionId);
      await apiClient.post(`/sessions/access/${token}/submit`, {
        sessionQuestionId,
        answer,
      });

      // Emit submitted event
      const socket = getSocket();
      if (socket.connected && session?.id) {
        socket.emit(WebSocketEvents.CANDIDATE_ANSWER_SUBMITTED, {
          sessionId: session.id,
          sessionQuestionId,
        });
      }

      toast({ title: 'Answer submitted' });
      await fetchSession();

      // In sequential mode reset to index 0 — the refetch puts the new unanswered question first.
      // In normal mode, auto-advance to the next question if available.
      if (session?.sequentialMode) {
        setCurrentIndex(0);
      } else {
        const questions = allQuestions.filter((sq) => sq.isActive === true);
        if (currentIndex < questions.length - 1) {
          setCurrentIndex((prev) => prev + 1);
        }
      }
    } catch (err) {
      toast({ title: 'Submit failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setSubmittingId(null);
    }
  };

  const handleRunCode = useCallback(async (sqId: string) => {
    const { code, language } = codeState[sqId] || { code: '', language: 'javascript' };
    if (!code.trim()) { toast({ title: 'Write some code first', variant: 'destructive' }); return; }
    setRunningId(sqId);
    try {
      const submission = await apiClient.post<any>(`/sessions/access/${token}/submissions`, { sessionQuestionId: sqId, code, language });
      // Poll until status is no longer PENDING, max 10s
      let result = submission;
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 500));
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

  const handleFormatCode = useCallback((sqId: string) => {
    const editor = editorRefs.current[sqId];
    if (editor) {
      editor.getAction('editor.action.formatDocument')?.run();
    }
  }, []);

  const toggleMultipleChoice = (sqId: string, optionId: string) => {
    const current = answers[sqId] || '';
    const selected = current ? current.split(',') : [];
    const idx = selected.indexOf(optionId);
    if (idx >= 0) {
      selected.splice(idx, 1);
    } else {
      selected.push(optionId);
    }
    const newVal = selected.join(',');
    setAnswers({ ...answers, [sqId]: newVal });
    emitTyping(sqId, newVal);
  };

  if (kicked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-md mx-auto px-6">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <span className="text-3xl">⚠</span>
            </div>
          </div>
          <h2 className="text-2xl font-semibold">Session opened on another device</h2>
          <p className="text-muted-foreground">
            This interview session was accessed from another browser or device. You have been disconnected from this tab.
          </p>
          <p className="text-sm text-muted-foreground">Please close this tab and continue on the other device.</p>
        </div>
      </div>
    );
  }

  if (loading) return <div className="text-center py-12">Loading...</div>;
  if (!session) return <div className="text-center py-12">Session not found or expired.</div>;

  // Show pre-interview survey if unanswered questions exist
  const pendingSurveyQuestions = surveyQuestions.filter((q) => !surveyAnswers[q.id]);
  if (surveyQuestions.length > 0 && !surveyDone) {
    const allSurveyAnswered = surveyQuestions.every((q) => surveyAnswers[q.id]);
    const handleSurveySelectChoice = (qId: string, choice: string) => {
      setSurveyAnswers((prev) => prev[qId] === choice ? (({ [qId]: _, ...rest }) => rest)(prev) : { ...prev, [qId]: choice });
    };
    const handleSurveySubmit = async () => {
      setSurveySubmitting(true);
      try {
        const payload = surveyQuestions.map((q) => ({ id: q.id, answer: surveyAnswers[q.id] || '' })).filter((a) => a.answer);
        await apiClient.patch(`/sessions/access/${token}/survey/answers`, { answers: payload });
        setSurveyDone(true);
      } catch {
        toast({ title: 'Failed to submit survey. Please try again.', variant: 'destructive' });
      } finally {
        setSurveySubmitting(false);
      }
    };
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-8 px-4">
        <div>
          <h1 className="text-2xl font-bold">Pre-Interview Survey</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Please answer all questions honestly before the interview begins.
            ({surveyQuestions.length - pendingSurveyQuestions.length}/{surveyQuestions.length} answered)
          </p>
        </div>
        <div className="space-y-4">
          {surveyQuestions.map((sq) => (
            <Card key={sq.id}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-sm leading-snug">{sq.question}</p>
                  {sq.subcategory && (
                    <Badge variant="secondary" className="shrink-0 text-xs">{sq.subcategory}</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(sq.choices || []).map((choice: string) => (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => handleSurveySelectChoice(sq.id, choice)}
                      className={cn(
                        'px-3 py-1.5 rounded-md border text-sm transition-colors text-left',
                        surveyAnswers[sq.id] === choice
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-muted border-input',
                      )}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Button onClick={handleSurveySubmit} disabled={surveySubmitting || !allSurveyAnswered} className="w-full">
          {surveySubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {surveySubmitting ? 'Submitting...' : 'Submit Survey & Start Interview'}
        </Button>
        {!allSurveyAnswered && (
          <p className="text-xs text-center text-muted-foreground">Answer all questions to continue</p>
        )}
      </div>
    );
  }

  const questions = allQuestions.filter((sq) => sq.isActive === true);
  const isSequential = !!session.sequentialMode;
  const isCompleted = session.status === 'COMPLETED' || session.status === 'EVALUATED';
  const isDraft = session.status === 'DRAFT';

  // Clamp currentIndex to valid range
  const safeIndex = Math.max(0, Math.min(currentIndex, questions.length - 1));
  const currentQuestion = questions[safeIndex];

  const renderQuestionInput = (sq: any) => {
    const questionType = sq.question?.type as QuestionType | undefined;
    const options: { id: string; text: string }[] = sq.question?.options || [];

    if (questionType === QuestionType.SINGLE_CHOICE && options.length > 0) {
      return (
        <div className="space-y-2">
          <Label>Your Answer</Label>
          <RadioGroup
            value={answers[sq.id] || ''}
            onValueChange={(val) => handleAnswerChange(sq.id, val)}
            disabled={isCompleted}
          >
            {options.map((opt) => (
              <div key={opt.id} className="flex items-center space-x-2">
                <RadioGroupItem value={opt.id} id={`${sq.id}-${opt.id}`} />
                <Label htmlFor={`${sq.id}-${opt.id}`} className="text-sm font-normal cursor-pointer">
                  {opt.text}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      );
    }

    if (questionType === QuestionType.MULTIPLE_CHOICE && options.length > 0) {
      const selectedIds = (answers[sq.id] || '').split(',').filter(Boolean);
      return (
        <div className="space-y-2">
          <Label>Your Answer (select all that apply)</Label>
          <div className="space-y-2">
            {options.map((opt) => (
              <div key={opt.id} className="flex items-center space-x-2">
                <Checkbox
                  checked={selectedIds.includes(opt.id)}
                  onCheckedChange={() => toggleMultipleChoice(sq.id, opt.id)}
                  disabled={isCompleted}
                />
                <Label className="text-sm font-normal cursor-pointer">
                  {opt.text}
                </Label>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // ARCHITECTURE type: diagram editor
    if (questionType === QuestionType.ARCHITECTURE) {
      return (
        <div className="space-y-2">
          <Label>Your Architecture Design</Label>
          <ArchitectureEditor
            value={architectureState[sq.id] || { nodes: [], connections: [], description: '' }}
            onChange={(val) => {
              setArchitectureState(prev => ({ ...prev, [sq.id]: val }));
              // Debounced emit via socket
              if (archDebounceRef.current[sq.id]) clearTimeout(archDebounceRef.current[sq.id]);
              archDebounceRef.current[sq.id] = setTimeout(() => {
                const socket = getSocket();
                socket.emit(WebSocketEvents.CANDIDATE_ARCHITECTURE_CHANGED, {
                  sessionId: session?.id,
                  sessionQuestionId: sq.id,
                  architecture: val,
                });
              }, 500);
            }}
            readOnly={isCompleted}
          />
        </div>
      );
    }

    // CODING type: inline Monaco editor with Run/Format
    if (questionType === QuestionType.CODING) {
      const cData = codeState[sq.id] || { code: '', language: 'javascript' };
      const runResult = runResults[sq.id];
      const isRunnable = ['javascript', 'typescript'].includes(cData.language);
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Label>Your Code</Label>
            <div className="flex items-center gap-2">
              <Select
                value={cData.language}
                onValueChange={(lang) => handleLanguageChange(sq.id, lang)}
                disabled={isCompleted}
              >
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isCompleted && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => handleFormatCode(sq.id)}
                  >
                    <AlignLeft className="h-3.5 w-3.5 mr-1" />
                    Format
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => handleRunCode(sq.id)}
                    disabled={runningId === sq.id || !isRunnable}
                    title={!isRunnable ? 'Execution only available for JavaScript/TypeScript' : undefined}
                  >
                    {runningId === sq.id ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5 mr-1" />
                    )}
                    {runningId === sq.id ? 'Running…' : 'Run'}
                  </Button>
                </>
              )}
            </div>
          </div>
          <div className="border rounded-md overflow-hidden">
            <Editor
              height="350px"
              language={cData.language || 'javascript'}
              value={cData.code}
              onChange={(val) => handleCodeChange(sq.id, val || '')}
              onMount={(editor) => { editorRefs.current[sq.id] = editor; }}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                readOnly: isCompleted,
              }}
            />
          </div>

          {/* Run results */}
          {runResult && (
            <div className="rounded-md border bg-slate-950 p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-300">Run Results</span>
                <Badge
                  className="text-xs"
                  variant={runResult.status === 'PASSED' ? 'default' : runResult.status === 'FAILED' ? 'destructive' : 'secondary'}
                >
                  {runResult.status}
                </Badge>
              </div>
              {(runResult.results || []).map((r: any, i: number) => (
                <div
                  key={i}
                  className={cn(
                    'text-xs rounded px-2 py-1.5',
                    r.passed ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300',
                  )}
                >
                  <span className="font-medium">{r.passed ? '✓' : '✗'} Test {i + 1}</span>
                  {!r.passed && r.expected !== undefined && (
                    <span className="ml-2 text-slate-400">expected: <code className="text-white">{String(r.expected)}</code> got: <code className="text-white">{String(r.actual ?? r.error ?? '—')}</code></span>
                  )}
                  {r.runtime && <span className="ml-2 text-slate-500">{r.runtime}ms</span>}
                </div>
              ))}
              {runResult.results?.length === 0 && (
                <p className="text-xs text-slate-400">No test cases defined.</p>
              )}
            </div>
          )}

          {/* Show test cases if available */}
          {sq.question?.testCases && sq.question.testCases.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Test Cases</Label>
              {sq.question.testCases.map((tc: any, i: number) => (
                <div key={i} className="rounded-md border p-2 text-xs">
                  <p className="text-muted-foreground">{tc.description || `Test ${i + 1}`}</p>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div>
                      <span className="font-medium">Input:</span>
                      <pre className="bg-muted p-1 rounded mt-0.5">{tc.input}</pre>
                    </div>
                    <div>
                      <span className="font-medium">Expected:</span>
                      <pre className="bg-muted p-1 rounded mt-0.5">{tc.expectedOutput}</pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    // Default: OPEN_ENDED, SCENARIO, or fallback
    return (
      <div className="space-y-2">
        <Label>Your Answer</Label>
        <Textarea
          value={answers[sq.id] || ''}
          onChange={(e) => handleAnswerChange(sq.id, e.target.value)}
          placeholder="Type your answer here..."
          rows={4}
          disabled={isCompleted}
        />
      </div>
    );
  };

  // --- State-based full-screen overlays ---

  // Session hasn't started yet
  if (isDraft) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-md mx-auto px-6">
          <div className="flex justify-center">
            <span className="relative flex h-5 w-5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-5 w-5 bg-blue-500" />
            </span>
          </div>
          <h2 className="text-2xl font-semibold">Session not started yet</h2>
          <p className="text-muted-foreground">
            Your interview session has not started yet. Please wait for the interviewer to begin.
          </p>
          <p className="text-sm text-muted-foreground">
            {session.templatePosition}
          </p>
        </div>
      </div>
    );
  }

  // Session ended — thank you screen
  if (isCompleted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-md mx-auto px-6">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
              <Check className="h-8 w-8 text-green-600" />
            </div>
          </div>
          <h2 className="text-2xl font-semibold">Thank you for completing the interview!</h2>
          <p className="text-muted-foreground">
            Your responses have been recorded. The results will be communicated to you separately.
          </p>
          <p className="text-sm text-muted-foreground">
            {session.templatePosition}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Interview Session</h1>
        <p className="text-muted-foreground mt-1">
          {session.templatePosition}
        </p>
      </div>

      <Separator />

      {/* Single question display */}
      {!candidateViewEnabled ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <div className="flex justify-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <AlignLeft className="h-6 w-6 text-muted-foreground" />
              </div>
            </div>
            <p className="font-medium">Questions are temporarily hidden</p>
            <p className="text-sm text-muted-foreground">The interviewer has paused question display. Please wait.</p>
          </CardContent>
        </Card>
      ) : questions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">The interviewer will share questions with you shortly.</p>
          </CardContent>
        </Card>
      ) : currentQuestion ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Question {safeIndex + 1} of {questions.length}
              </CardTitle>
              <div className="flex items-center gap-2">
                {currentQuestion.question?.type && (
                  <Badge variant="outline" className="text-xs">
                    {currentQuestion.question.type}
                  </Badge>
                )}
                {!!currentQuestion.candidateAnswer && (
                  <Badge className="bg-green-100 text-green-800" variant="outline">
                    <Check className="h-3 w-3 mr-1" />
                    Answered
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm whitespace-pre-wrap">{currentQuestion.question?.text || 'Question text'}</p>

            {renderQuestionInput(currentQuestion)}

            {!isCompleted && (
              <Button
                size="sm"
                onClick={() => handleSubmitAnswer(currentQuestion.id)}
                disabled={submittingId === currentQuestion.id}
              >
                {submittingId === currentQuestion.id
                  ? 'Submitting...'
                  : currentQuestion.candidateAnswer
                    ? 'Update Answer'
                    : 'Submit Answer'}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Navigation — hidden in sequential mode */}
      {questions.length > 0 && !isSequential && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            disabled={safeIndex === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
<Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
            disabled={safeIndex === questions.length - 1}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

    </div>
  );
}
