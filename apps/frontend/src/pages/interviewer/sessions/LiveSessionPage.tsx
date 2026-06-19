import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';
import { getSocket, joinSession, disconnectSocket, WebSocketEvents } from '@/lib/socket';
import { useAuthContext } from '@/lib/auth-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { ArrowLeft, Radio, Wifi, WifiOff, Eye, Clock, Users, ListTree, Star, Lightbulb } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { CandidateMirror } from '@/components/interview/CandidateMirror';
import { ControlPanel } from '@/components/interview/ControlPanel';
import { CategoryRatings } from '@/components/interview/CategoryRatings';
import type { ArchitectureAnswer } from '@interview-assistant/shared';
import { UserRole } from '@interview-assistant/shared';

interface InterviewerInfo {
  socketId: string;
  name: string;
  email: string;
  joinedAt: string;
}

function useElapsedTimer(startIso: string | undefined) {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    if (!startIso) return;
    const update = () => {
      const diffMs = Date.now() - new Date(startIso).getTime();
      const h = Math.floor(diffMs / 3_600_000);
      const m = Math.floor((diffMs % 3_600_000) / 60_000);
      const s = Math.floor((diffMs % 60_000) / 1_000);
      setElapsed([h > 0 ? String(h).padStart(2, '0') : null, String(m).padStart(2, '0'), String(s).padStart(2, '0')]
        .filter(Boolean).join(':'));
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [startIso]);
  return elapsed;
}

export function LiveSessionPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuthContext();
  const [session, setSession] = useState<any>(null);
  const [sessionQuestions, setSessionQuestions] = useState<any[]>([]);
  const [categoryOrder, setCategoryOrder] = useState<Map<string, string[]>>(new Map());
  const [categories, setCategories] = useState<Array<{ id: string; name: string; positions?: string[] | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [liveDrafts, setLiveDrafts] = useState<Record<string, string>>({});
  const [liveCode, setLiveCode] = useState<Record<string, { code: string; language: string }>>({});
  const [liveArchitecture, setLiveArchitecture] = useState<Record<string, ArchitectureAnswer>>({});
  const [interviewers, setInterviewers] = useState<InterviewerInfo[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Candidate tracking
  const [candidateCurrentSqId, setCandidateCurrentSqId] = useState<string | null>(null);
  const [viewingSqId, setViewingSqId] = useState<string | null>(null);
  const [candidateIp, setCandidateIp] = useState<{ ip: string; userAgent: string; connectedAt: string } | null>(null);

  // Anti-cheat tracking
  const [anticheat, setAnticheat] = useState({ tabSwitches: 0, copyAttempts: 0, multiDeviceDetected: false });

  // Computed focused question
  const focusedSqId = viewingSqId || candidateCurrentSqId || sessionQuestions.find((q) => q.isActive)?.id || null;

  const fetchSession = useCallback(async () => {
    try {
      const data = await apiClient.get<any>(`/sessions/${slug}`);
      setSession(data);
      setSequentialMode(!!data.sequentialMode);
      setCandidateViewEnabled(data.candidateViewEnabled !== false);
      setSessionQuestions(Array.isArray(data.questions) ? data.questions : []);
    } catch (err) {
      console.error('Failed to fetch session:', err);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  // Auto-save handler for interviewer notes/rating.
  // Optimistically updates sessionQuestions so changes appear in the tree immediately
  // without waiting for the next 5s poll.
  const handleAutoSave = useCallback(async (sqId: string, data: { interviewerNote?: string; rating?: number }) => {
    await apiClient.patch(`/sessions/${slug}/questions/${sqId}`, data);
    setSessionQuestions((prev) =>
      prev.map((sq) => {
        if (sq.id !== sqId) return sq;
        const patch: Record<string, unknown> = {};
        if (data.interviewerNote !== undefined) patch.interviewerNote = data.interviewerNote;
        if (data.rating !== undefined) patch.rating = data.rating;
        return { ...sq, ...patch };
      }),
    );
  }, [slug]);

  useEffect(() => {
    fetchSession();

    // Fetch candidate IP info
    apiClient.get<any>(`/sessions/${slug}/client-info`).then(setCandidateIp).catch(() => {});

    // Fetch existing anti-cheat events from DB (persisted across reloads)
    apiClient.get<Array<{ type: string }>>(`/sessions/${slug}/anticheat`).then((events) => {
      setAnticheat({
        tabSwitches: events.filter((e) => e.type === 'TAB_HIDDEN').length,
        copyAttempts: events.filter((e) => e.type === 'COPY_ATTEMPT').length,
        multiDeviceDetected: events.some((e) => e.type === 'MULTI_DEVICE_DETECTED'),
      });
    }).catch(() => {});

    // Fetch category/subcategory order from DB for QuestionTree sorting
    Promise.all([
      apiClient.get<Array<{ id: string; name: string; orderIndex: number; positions?: string[] | null }>>('/categories'),
      apiClient.get<Array<{ categoryId: string; name: string; orderIndex: number }>>('/sub-categories'),
    ]).then(([cats, subs]) => {
      const map = new Map<string, string[]>();
      cats.forEach(({ id: catId, name }) => {
        const catSubs = subs.filter((s) => s.categoryId === catId);
        map.set(name, catSubs.map((s) => s.name));
      });
      setCategoryOrder(map);
      setCategories(cats);
    }).catch(() => {});

    // Polling fallback every 5s
    pollRef.current = setInterval(fetchSession, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchSession, slug]);

  // Socket connection
  useEffect(() => {
    if (!session?.slug) return;

    const socket = getSocket();
    joinSession(session.slug, 'interviewer', user?.email || 'Interviewer', user?.email);

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    if (socket.connected) setConnected(true);

    socket.on(WebSocketEvents.CANDIDATE_TYPING, (payload: { sessionQuestionId: string; text: string }) => {
      setLiveDrafts((prev) => ({ ...prev, [payload.sessionQuestionId]: payload.text }));
    });

    socket.on(WebSocketEvents.CANDIDATE_CODE_CHANGED, (payload: { sessionQuestionId: string; code: string; language: string }) => {
      setLiveCode((prev) => ({
        ...prev,
        [payload.sessionQuestionId]: { code: payload.code, language: payload.language },
      }));
    });

    socket.on(WebSocketEvents.CANDIDATE_ARCHITECTURE_CHANGED, (payload: { sessionQuestionId: string; architecture: ArchitectureAnswer }) => {
      setLiveArchitecture((prev) => ({ ...prev, [payload.sessionQuestionId]: payload.architecture }));
    });

    socket.on(WebSocketEvents.CANDIDATE_ANSWER_SUBMITTED, () => {
      fetchSession();
    });

    socket.on(WebSocketEvents.CODE_EXECUTION_COMPLETED, () => {
      fetchSession();
    });

    socket.on(WebSocketEvents.CANDIDATE_QUESTION_CHANGED, (payload: { sessionQuestionId: string }) => {
      setCandidateCurrentSqId(payload.sessionQuestionId);
    });

    socket.on(WebSocketEvents.CANDIDATE_CONNECTED, (payload: { ip: string; userAgent: string; connectedAt: string }) => {
      setCandidateIp(payload);
    });

    socket.on(WebSocketEvents.INTERVIEWERS_UPDATED, (payload: { interviewers: InterviewerInfo[] }) => {
      setInterviewers(payload.interviewers || []);
    });

    socket.on(WebSocketEvents.CANDIDATE_TAB_HIDDEN, (payload: { count: number }) => {
      setAnticheat((prev) => ({ ...prev, tabSwitches: payload.count }));
    });

    socket.on(WebSocketEvents.CANDIDATE_COPY_ATTEMPT, (payload: { count: number }) => {
      setAnticheat((prev) => ({ ...prev, copyAttempts: payload.count }));
    });

    socket.on(WebSocketEvents.CANDIDATE_MULTI_DEVICE_DETECTED, () => {
      setAnticheat((prev) => ({ ...prev, multiDeviceDetected: true }));
    });

    // Fast-path updates for question activation — avoids race condition with 5s poll
    socket.on(WebSocketEvents.INTERVIEWER_QUESTIONS_ACTIVATED, (payload: { questionIds: string[] }) => {
      setSessionQuestions((prev) =>
        prev.map((sq) => payload.questionIds.includes(sq.slug) ? { ...sq, isActive: true } : sq),
      );
    });

    socket.on(WebSocketEvents.INTERVIEWER_QUESTIONS_DEACTIVATED, (payload: { questionIds: string[] }) => {
      setSessionQuestions((prev) =>
        prev.map((sq) => payload.questionIds.includes(sq.slug) ? { ...sq, isActive: false } : sq),
      );
    });

    return () => {
      socket.off(WebSocketEvents.CANDIDATE_TYPING);
      socket.off(WebSocketEvents.CANDIDATE_CODE_CHANGED);
      socket.off(WebSocketEvents.CANDIDATE_ARCHITECTURE_CHANGED);
      socket.off(WebSocketEvents.CANDIDATE_ANSWER_SUBMITTED);
      socket.off(WebSocketEvents.CODE_EXECUTION_COMPLETED);
      socket.off(WebSocketEvents.CANDIDATE_QUESTION_CHANGED);
      socket.off(WebSocketEvents.CANDIDATE_CONNECTED);
      socket.off(WebSocketEvents.INTERVIEWERS_UPDATED);
      socket.off(WebSocketEvents.CANDIDATE_TAB_HIDDEN);
      socket.off(WebSocketEvents.CANDIDATE_COPY_ATTEMPT);
      socket.off(WebSocketEvents.CANDIDATE_MULTI_DEVICE_DETECTED);
      socket.off(WebSocketEvents.INTERVIEWER_QUESTIONS_ACTIVATED);
      socket.off(WebSocketEvents.INTERVIEWER_QUESTIONS_DEACTIVATED);
      socket.off('connect');
      socket.off('disconnect');
      disconnectSocket();
    };
  }, [slug, fetchSession]);

  // Generic force-activate — accepts an explicit sqId or falls back to focusedSqId
  const callForceActivate = useCallback(async (sqId: string) => {
    try {
      const result = await apiClient.post<any>(`/sessions/${slug}/force-activate-question`, { sqId });
      await fetchSession();
      if (result?.slug) setViewingSqId(result.slug);
    } catch (err) {
      toast({
        title: 'Force activate failed',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
      throw err;
    }
  }, [slug, fetchSession]);

  // Used by CandidateMirror's Force Activate button (acts on focused question)
  const handleForceActivate = useCallback(async () => {
    if (!focusedSqId) return;
    await callForceActivate(focusedSqId);
  }, [focusedSqId, callForceActivate]);

  // Used by CandidateMirror's Force Next button on the "Candidate is here" card
  const handleForceActivateNextFromCandidate = useCallback(async () => {
    if (!candidateCurrentSqId) return;
    const sorted = [...sessionQuestions].sort((a, b) => a.orderIndex - b.orderIndex);
    const currentIdx = sorted.findIndex((q) => q.id === candidateCurrentSqId);
    const next = sorted[currentIdx + 1];
    if (!next) {
      toast({ title: 'No next question available', variant: 'destructive' });
      return;
    }
    await callForceActivate(next.slug);
  }, [candidateCurrentSqId, sessionQuestions, callForceActivate]);

  const handleCompleteSession = useCallback(async () => {
    try {
      await apiClient.patch(`/sessions/${slug}`, { status: 'COMPLETED' });
      toast({ title: 'Session completed' });
      fetchSession();
    } catch {
      toast({ title: 'Failed to complete session', variant: 'destructive' });
    }
  }, [slug, fetchSession]);

  const handleCategoryRatingsUpdate = useCallback((ratings: Record<string, number>) => {
    setSession((prev: any) => prev ? { ...prev, categoryRatings: ratings } : prev);
  }, []);

  const [suggestionsEnabled, setSuggestionsEnabled] = useState(false);
  const [sequentialMode, setSequentialMode] = useState(false);
  const [candidateViewEnabled, setCandidateViewEnabled] = useState(true);
  const [rightTab, setRightTab] = useState<'questions' | 'ratings'>('questions');
  const [mobilePanel, setMobilePanel] = useState<'candidate' | 'panel'>('candidate');
  const elapsed = useElapsedTimer(session?.startedAt);

  // Auto-switch HR users to ratings tab
  useEffect(() => {
    if (user?.role === UserRole.HR && rightTab === 'questions') {
      setRightTab('ratings');
    }
  }, [user?.role, rightTab]);

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!session) return <div className="flex items-center justify-center h-screen">Session not found.</div>;

  const statusStyles: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-800',
    IN_PROGRESS: 'bg-blue-100 text-blue-800',
    COMPLETED: 'bg-green-100 text-green-800',
    EVALUATED: 'bg-purple-100 text-purple-800',
  };

  const isReadOnly = session.status === 'COMPLETED' || session.status === 'EVALUATED';
  const showBackToCandidate = viewingSqId && viewingSqId !== candidateCurrentSqId;
  const canViewQuestions = user?.role === UserRole.ADMIN || user?.role === UserRole.INTERVIEWER;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b bg-background px-3 py-2 flex items-center justify-between shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Link to={`/sessions/${slug}`}>
            <Button variant="ghost" size="sm" className="px-2">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Back</span>
            </Button>
          </Link>
          <div className="h-6 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-1.5 shrink-0">
            <Radio className="h-4 w-4 text-red-500 animate-pulse" />
            <span className="font-semibold text-sm hidden sm:inline">Live</span>
          </div>
          {session.candidate?.slug ? (
            <Link to={`/candidates/${session.candidate.slug}`} className="text-sm text-blue-600 hover:underline truncate min-w-0">
              {session.candidate.name || 'Unknown'}
            </Link>
          ) : (
            <span className="text-sm text-muted-foreground truncate min-w-0">
              {session.candidate?.name || 'Unknown'}
            </span>
          )}
          <Badge className={cn(statusStyles[session.status] || '', 'shrink-0')} variant="outline">
            {session.status}
          </Badge>
          {/* Elapsed timer */}
          {elapsed && (
            <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground font-mono shrink-0">
              <Clock className="h-3.5 w-3.5" />
              {elapsed}
            </span>
          )}
          {/* IP + interviewers — sm+ only */}
          <span className="hidden lg:flex items-center gap-1 text-xs shrink-0">
            {candidateIp ? (
              <Badge variant="outline" className="text-xs font-mono">IP: {candidateIp.ip}</Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-muted-foreground">Offline</Badge>
            )}
          </span>
          {/* Anti-cheat badges */}
          {anticheat.multiDeviceDetected && (
            <Badge variant="destructive" className="text-xs shrink-0 hidden lg:flex">Multi-device!</Badge>
          )}
          {anticheat.tabSwitches > 0 && (
            <Badge variant="destructive" className="text-xs shrink-0 hidden lg:flex">Tabs: {anticheat.tabSwitches}</Badge>
          )}
          {anticheat.copyAttempts > 0 && (
            <Badge variant="destructive" className="text-xs shrink-0 hidden lg:flex">Copy: {anticheat.copyAttempts}</Badge>
          )}
          {interviewers.length > 0 && (
            <span className="hidden lg:flex items-center gap-1 text-xs text-muted-foreground shrink-0">
              <Users className="h-3.5 w-3.5" />
              {[...new Map(interviewers.map((iv) => [iv.email || iv.name, iv])).values()].map((iv) => (
                <span key={iv.email || iv.socketId} className="px-1.5 py-0.5 rounded bg-muted text-foreground text-xs font-medium">
                  {iv.email || iv.name}
                </span>
              ))}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm shrink-0">
          <div className="hidden sm:flex items-center gap-1.5">
            <Label htmlFor="sequential-toggle" className="text-xs cursor-pointer select-none">Sequential</Label>
            <Switch
              id="sequential-toggle"
              checked={sequentialMode}
              onCheckedChange={async (checked) => {
                setSequentialMode(checked);
                try {
                  await apiClient.patch(`/sessions/${slug}`, { sequentialMode: checked });
                  toast({ title: checked ? 'Sequential mode enabled' : 'Sequential mode disabled' });
                } catch {
                  setSequentialMode(!checked);
                  toast({ title: 'Failed to update sequential mode', variant: 'destructive' });
                }
              }}
              className="scale-75"
            />
          </div>
          <div className="hidden sm:flex items-center gap-1.5">
            <Label htmlFor="candidate-view-toggle" className="text-xs cursor-pointer select-none">Candidate View</Label>
            <Switch
              id="candidate-view-toggle"
              checked={candidateViewEnabled}
              onCheckedChange={async (checked) => {
                setCandidateViewEnabled(checked);
                try {
                  await apiClient.patch(`/sessions/${slug}/candidate-view`, { enabled: checked });
                  toast({ title: checked ? 'Candidate can now view questions' : 'Candidate view disabled' });
                } catch {
                  setCandidateViewEnabled(!checked);
                  toast({ title: 'Failed to update candidate view permission', variant: 'destructive' });
                }
              }}
              className="scale-75"
            />
          </div>
          <div className="hidden sm:flex items-center gap-1.5">
            <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
            <Label htmlFor="suggestions-toggle" className="text-xs cursor-pointer select-none">AI</Label>
            <Switch
              id="suggestions-toggle"
              checked={suggestionsEnabled}
              onCheckedChange={setSuggestionsEnabled}
              className="scale-75"
            />
          </div>
          {session.status === 'IN_PROGRESS' && (
            <Button variant="outline" size="sm" onClick={handleCompleteSession} className="text-xs px-2">
              Complete Session
            </Button>
          )}
          {(session.status === 'COMPLETED' || session.status === 'EVALUATED') && (
            <Link to={`/sessions/${slug}/evaluate`}>
              <Button variant="outline" size="sm" className="text-xs px-2">Evaluate</Button>
            </Link>
          )}
          {showBackToCandidate && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setViewingSqId(null)}
              className="text-xs px-2"
            >
              <Eye className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Back to Candidate</span>
            </Button>
          )}
          {connected ? (
            <span className="flex items-center gap-1 text-green-600 text-xs">
              <Wifi className="h-4 w-4" />
              <span className="hidden sm:inline">Connected</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-muted-foreground text-xs">
              <WifiOff className="h-4 w-4" />
              <span className="hidden sm:inline">Disconnected</span>
            </span>
          )}
        </div>
      </div>

      {/* Mobile panel switcher */}
      <div className="flex md:hidden border-b shrink-0">
        <button
          type="button"
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors',
            mobilePanel === 'candidate'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground',
          )}
          onClick={() => setMobilePanel('candidate')}
        >
          <Eye className="h-3.5 w-3.5" />
          Candidate
        </button>
        <button
          type="button"
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors',
            mobilePanel === 'panel'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground',
          )}
          onClick={() => setMobilePanel('panel')}
        >
          <ListTree className="h-3.5 w-3.5" />
          Panel
        </button>
      </div>

      {/* Split-screen */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: 60% on desktop, full width on mobile (hidden when panel tab active) */}
        <div className={cn(
          'border-r overflow-y-auto p-4',
          'md:w-[60%]',
          mobilePanel === 'candidate' ? 'flex-1 md:flex-none' : 'hidden md:block',
        )}>
          <CandidateMirror
            session={session}
            liveDrafts={liveDrafts}
            liveCode={liveCode}
            liveArchitecture={liveArchitecture}
            focusedSqId={focusedSqId || undefined}
            allQuestions={sessionQuestions}
            onAutoSave={handleAutoSave}
            onNavigate={(sqId) => setViewingSqId(sqId)}
            onForceActivate={isReadOnly ? undefined : handleForceActivate}
            onForceActivateNext={isReadOnly || !candidateCurrentSqId ? undefined : handleForceActivateNextFromCandidate}
            candidateCurrentSqId={candidateCurrentSqId || undefined}
            sessionId={session?.id!}
            onForceActivateById={isReadOnly ? undefined : callForceActivate}
            suggestionsEnabled={suggestionsEnabled}
            canViewQuestions={canViewQuestions}
          />
        </div>

        {/* Right panel: 40% on desktop, full width on mobile (hidden when candidate tab active) */}
        <div className={cn(
          'flex flex-col overflow-hidden',
          'md:w-[40%]',
          mobilePanel === 'panel' ? 'flex-1 md:flex-none' : 'hidden md:flex',
        )}>
          {/* Tab bar */}
          <div className="flex border-b shrink-0">
            {canViewQuestions && (
              <button
                type="button"
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors',
                  rightTab === 'questions'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setRightTab('questions')}
              >
                <ListTree className="h-3.5 w-3.5" />
                Questions
              </button>
            )}
            <button
              type="button"
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors',
                rightTab === 'ratings'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setRightTab('ratings')}
            >
              <Star className="h-3.5 w-3.5" />
              Ratings
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {rightTab === 'questions' && canViewQuestions && (
              <ControlPanel
                session={session}
                sessionQuestions={sessionQuestions}
                onRefresh={fetchSession}
                onSelectQuestion={(sqId) => setViewingSqId(sqId)}
                selectedSqId={focusedSqId || undefined}
                candidateCurrentSqId={candidateCurrentSqId || undefined}
                onForceActivate={isReadOnly ? undefined : callForceActivate}
                categoryOrder={categoryOrder}
                categories={categories}
                onCategoryRatingsChange={handleCategoryRatingsUpdate}
                hideUnrated={isReadOnly}
                isReadOnly={isReadOnly}
              />
            )}
            {rightTab === 'ratings' && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Ratings by Category
                </p>
                <CategoryRatings
                  sessionId={session?.id!}
                  sessionQuestions={sessionQuestions}
                  onRefresh={fetchSession}
                  categoryOrder={categoryOrder}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
