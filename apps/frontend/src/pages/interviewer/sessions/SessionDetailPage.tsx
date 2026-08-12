import { useEffect, useState, useCallback } from "react"; // session detail
import { useParams, Link, useNavigate } from "react-router-dom";
import { apiClient } from "@/lib/api-client";
import { getSocket, joinSession, disconnectSocket, WebSocketEvents } from "@/lib/socket";
import { useAuthContext } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { Copy, Check, Download, ClipboardList, Plus, Radio, Clock, User, Layers, ChevronDown, ChevronRight, ShieldAlert, ClipboardCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Question } from "@interview-assistant/shared";
import { UserRole, TECHNICAL_RATING_LABELS, PERSONALITY_RATING_LABELS } from "@interview-assistant/shared";
import { QuestionTree } from "@/components/interview/QuestionTree";
import { CategoryRatings } from "@/components/interview/CategoryRatings";

const getRatingLabels = (category: string): Record<number, string> => (category === "PERSONALITY" ? PERSONALITY_RATING_LABELS : TECHNICAL_RATING_LABELS);

const RATING_COLORS: Record<number, string> = {
  1: "bg-red-500 text-white border-red-500",
  2: "bg-yellow-500 text-white border-yellow-500",
  3: "bg-blue-500 text-white border-blue-500",
  4: "bg-green-500 text-white border-green-500",
  5: "bg-purple-500 text-white border-purple-500",
};

const statusStyles: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  EVALUATED: "bg-purple-100 text-purple-800",
};

const NEXT_STATUS: Record<string, { label: string; next: string; variant: "default" | "outline" }> = {
  DRAFT: { label: "Start Session", next: "IN_PROGRESS", variant: "default" },
  IN_PROGRESS: { label: "Complete Session", next: "COMPLETED", variant: "outline" },
  COMPLETED: { label: "Mark as Evaluated", next: "EVALUATED", variant: "outline" },
};

function SuggestedQuestionRow({
  questionId,
  reasoning,
  question,
  selected,
  onToggle,
}: {
  questionId: string;
  reasoning?: string;
  question: any;
  selected: boolean;
  onToggle: (questionId: string) => void;
}) {
  return (
    <button
      type="button"
      className={cn("w-full text-left flex items-start gap-3 p-2.5 rounded-md border cursor-pointer transition-colors", selected ? "border-primary bg-primary/5" : "border-input bg-background opacity-60")}
      aria-pressed={selected}
      aria-label={"Select suggested question " + (question?.text ?? "")}
      onClick={() => onToggle(questionId)}
    >
      <div className={cn("mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center", selected ? "bg-primary border-primary" : "border-input")}>
        {selected && (
          <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm leading-snug">{question?.text}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {question?.difficulty && <span className="text-xs text-muted-foreground">Difficulty: {question.difficulty}</span>}
          {reasoning && <span className="text-xs text-blue-600 italic">â€” {reasoning}</span>}
        </div>
      </div>
    </button>
  );
}

function SuggestedQuestionsList({
  suggestions,
  questionsMap,
  selectedIds,
  onToggle,
}: {
  suggestions: any[];
  questionsMap: Map<string, any>;
  selectedIds: Set<string>;
  onToggle: (questionId: string) => void;
}) {
  const suggestedWithDetails = suggestions
    .map((suggestion: any) => ({ ...suggestion, question: questionsMap.get(suggestion.questionId) }))
    .filter((suggestion: any) => suggestion.question);
  const grouped: Record<string, any[]> = {};

  for (const item of suggestedWithDetails) {
    const key = item.question?.subcategory || "Other";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-3 pr-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{suggestions.length} question(s) suggested</span>
        <span className="font-medium">{selectedIds.size} selected</span>
      </div>

      {Object.entries(grouped).map(([subcategory, items]) => (
        <div key={subcategory} className="rounded-lg border bg-card">
          <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between">
            <span className="text-xs font-semibold">{subcategory}</span>
            <span className="text-xs text-muted-foreground">{items.length} question(s)</span>
          </div>
          <div className="p-2 space-y-1.5">
            {items.map(({ questionId, reasoning, question }: any) => (
              <SuggestedQuestionRow
                key={questionId}
                questionId={questionId}
                reasoning={reasoning}
                question={question}
                selected={selectedIds.has(questionId)}
                onToggle={onToggle}
              />
            ))}
          </div>
        </div>
      ))}

      {suggestedWithDetails.length === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No suggestions found. Click "Re-suggest" to run AI again.
        </div>
      )}
    </div>
  );
}

export function SessionDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const isHr = user?.role === UserRole.HR;
  const [session, setSession] = useState<any>(null);
  const [sessionQuestions, setSessionQuestions] = useState<any[]>([]);
  const [categoryOrder, setCategoryOrder] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [questionsExpanded, setQuestionsExpanded] = useState(true);

  // Question detail dialog
  const [detailSq, setDetailSq] = useState<any | null>(null);
  const [detailNote, setDetailNote] = useState("");
  const [detailRating, setDetailRating] = useState<number | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);

  const [anticheatEvents, setAnticheatEvents] = useState<Array<{ type: string; createdAt: string }>>([]);
  const [editingTargetLevel, setEditingTargetLevel] = useState(false);
  const [editTargetLevelValue, setEditTargetLevelValue] = useState("");
  const [editingTemplatePosition, setEditingTemplatePosition] = useState(false);
  const [editTemplatePositionValue, setEditTemplatePositionValue] = useState("");
  const [editingMeetingLink, setEditingMeetingLink] = useState(false);
  const [editMeetingLinkValue, setEditMeetingLinkValue] = useState("");
  const [editingScheduledAt, setEditingScheduledAt] = useState(false);
  const [editScheduledAtValue, setEditScheduledAtValue] = useState("");

  // Add questions dialog
  const [addQuestionsOpen, setAddQuestionsOpen] = useState(false);
  const [questionBank, setQuestionBank] = useState<Question[]>([]);
  const [selectedBankQuestionIds, setSelectedBankQuestionIds] = useState<Set<string>>(new Set());

  // Survey panel
  const [surveyQuestions, setSurveyQuestions] = useState<any[]>([]);
  const [surveyGenerating, setSurveyGenerating] = useState(false);
  const [surveyExpanded, setSurveyExpanded] = useState(false);
  const [surveyActivated, setSurveyActivated] = useState(false);
  const [expandedSurveyId, setExpandedSurveyId] = useState<string | null>(null);
  const [surveyAnswerSaving, setSurveyAnswerSaving] = useState<string | null>(null);

  // Activate dialog (shows persisted AI suggestions from session.surveySuggestions)
  const [activateDialogOpen, setActivateDialogOpen] = useState(false);
  const [activateSelectedIds, setActivateSelectedIds] = useState<Set<string>>(new Set());
  const [activateSubmitting, setActivateSubmitting] = useState(false);
  const [activateQuestionsLoading, setActivateQuestionsLoading] = useState(false);
  const [dialogQuestionsMap, setDialogQuestionsMap] = useState<Map<string, any>>(new Map());

  const toggleActivateQuestion = useCallback((questionId: string) => {
    setActivateSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(questionId) ? next.delete(questionId) : next.add(questionId);
      return next;
    });
  }, []);

  const fetchSession = useCallback(async () => {
    try {
      const s = await apiClient.get<any>(`/sessions/${slug}`);
      setSession(s);
      setSurveyActivated(!!s.surveyActivatedAt);
      if (s.isSurveyGenerating) {
        setSurveyGenerating(true);
        setSurveyExpanded(true);
      }
      // isSurveySuggestGenerating loading state is read directly from session object
      const questionsArr = Array.isArray(s.questions) ? s.questions : [];
      setSessionQuestions(questionsArr);
      return s;
    } catch (err) {
      console.error("Failed to load session:", err);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  const fetchSurvey = useCallback(async (knownStatus?: string) => {
    if (!slug) return;
    try {
      const rows = await apiClient.get<any[]>(`/sessions/${slug}/survey`);
      setSurveyQuestions(rows);
      const effectiveStatus = knownStatus ?? session?.status;
      if (rows.length > 0 && effectiveStatus !== 'COMPLETED' && effectiveStatus !== 'EVALUATED') setSurveyExpanded(true);
    } catch {
      // no survey yet
    }
  }, [slug, session?.status]);

  const handleGenerateSurvey = async () => {
    setSurveyGenerating(true);
    try {
      const rows = await apiClient.post<any[]>(`/sessions/${slug}/survey/generate`, {});
      setSurveyQuestions(rows);
      setSurveyExpanded(true);
      toast({ title: `${rows.length} survey question(s) generated` });
    } catch {
      toast({ title: "Failed to generate survey", variant: "destructive" });
    } finally {
      setSurveyGenerating(false);
    }
  };

  const handleSaveSurveyAnswer = async (sqId: string, choice: string) => {
    setSurveyAnswerSaving(sqId);
    try {
      await apiClient.patch(`/sessions/${slug}/survey`, { answers: [{ id: sqId, answer: choice }] });
      setSurveyQuestions((prev) => prev.map((q) => (q.id === sqId ? { ...q, answer: choice } : q)));
      setExpandedSurveyId(null);
    } catch {
      toast({ title: "Failed to save answer", variant: "destructive" });
    } finally {
      setSurveyAnswerSaving(null);
    }
  };

  const handleSuggest = async () => {
    try {
      await apiClient.post(`/sessions/${slug}/suggest-from-survey`, {});
      // Socket events (SURVEY_SUGGEST_GENERATING â†’ SURVEY_SUGGEST_READY) drive the UI updates
    } catch {
      toast({ title: "Failed to start suggestion", variant: "destructive" });
    }
  };

  const handleOpenActivateDialog = async () => {
    setActivateDialogOpen(true);
    if (session?.surveySuggestions?.length) {
      setActivateSelectedIds(new Set(session.surveySuggestions.map((s: any) => s.questionId)));
    }
    if (dialogQuestionsMap.size === 0) {
      setActivateQuestionsLoading(true);
      try {
        const questionsData = await apiClient.get<any>("/questions", { limit: 1000 });
        const qMap = new Map<string, any>((questionsData.data ?? []).map((q: any) => [q.id, q]));
        setDialogQuestionsMap(qMap);
      } catch {
        toast({ title: "Failed to load questions", variant: "destructive" });
      } finally {
        setActivateQuestionsLoading(false);
      }
    }
  };

  const handleActivateSubmit = async () => {
    if (!activateSelectedIds.size) return;
    setActivateSubmitting(true);
    try {
      await apiClient.post(`/sessions/${slug}/activate-from-survey`, {
        questionIds: Array.from(activateSelectedIds),
      });
      toast({ title: `${activateSelectedIds.size} question(s) activated` });
      setSurveyActivated(true);
      setSurveyExpanded(false);
      setActivateDialogOpen(false);
      fetchSession();
    } catch {
      toast({ title: "Failed to activate questions", variant: "destructive" });
    } finally {
      setActivateSubmitting(false);
    }
  };

  const handleResuggest = async () => {
    setActivateDialogOpen(false);
    await handleSuggest();
  };

  useEffect(() => {
    fetchSession().then((s) => fetchSurvey(s?.status));
    apiClient
      .get<Array<{ type: string; createdAt: string }>>(`/sessions/${slug}/anticheat`)
      .then(setAnticheatEvents)
      .catch(() => {});
    Promise.all([apiClient.get<Array<{ id: string; name: string; orderIndex: number }>>("/categories"), apiClient.get<Array<{ categoryId: string; name: string; orderIndex: number }>>("/sub-categories")])
      .then(([cats, subs]) => {
        const map = new Map<string, string[]>();
        cats.forEach(({ id: catId, name }) => {
          map.set(
            name,
            subs.filter((s) => s.categoryId === catId).map((s) => s.name),
          );
        });
        setCategoryOrder(map);
      })
      .catch(() => {});
  }, [fetchSession, fetchSurvey]);

  useEffect(() => {
    if (!slug) return;
    const socket = getSocket();
    joinSession(slug, 'interviewer', user?.email || 'Interviewer', user?.email);

    socket.on(WebSocketEvents.SURVEY_GENERATING, () => {
      setSurveyGenerating(true);
      setSurveyExpanded(true);
    });

    socket.on(WebSocketEvents.SURVEY_GENERATED, (payload: { questions: any[] }) => {
      setSurveyQuestions(payload.questions);
      setSurveyGenerating(false);
      setSurveyExpanded(true);
    });

    socket.on(WebSocketEvents.SURVEY_ACTIVATED, () => {
      setSurveyActivated(true);
      setSurveyExpanded(false);
    });

    socket.on(WebSocketEvents.SURVEY_SUGGEST_GENERATING, () => {
      setSession((prev: any) => prev ? { ...prev, isSurveySuggestGenerating: true, surveySuggestions: null } : prev);
    });

    socket.on(WebSocketEvents.SURVEY_SUGGEST_READY, (payload: { suggestions: Array<{ questionId: string; reasoning: string }> }) => {
      setSession((prev: any) => prev ? { ...prev, isSurveySuggestGenerating: false, surveySuggestions: payload.suggestions } : prev);
    });

    socket.on(WebSocketEvents.SURVEY_GENERATE_FAILED, () => {
      setSurveyGenerating(false);
      toast({ title: "Failed to generate survey questions", variant: "destructive" });
    });

    socket.on(WebSocketEvents.SURVEY_SUGGEST_FAILED, () => {
      setSession((prev: any) => prev ? { ...prev, isSurveySuggestGenerating: false } : prev);
      toast({ title: "Failed to get suggestions", variant: "destructive" });
    });

    return () => {
      socket.off(WebSocketEvents.SURVEY_GENERATING);
      socket.off(WebSocketEvents.SURVEY_GENERATED);
      socket.off(WebSocketEvents.SURVEY_GENERATE_FAILED);
      socket.off(WebSocketEvents.SURVEY_ACTIVATED);
      socket.off(WebSocketEvents.SURVEY_SUGGEST_GENERATING);
      socket.off(WebSocketEvents.SURVEY_SUGGEST_READY);
      socket.off(WebSocketEvents.SURVEY_SUGGEST_FAILED);
      disconnectSocket();
    };
  }, [slug, user?.email]);

  const handleUpdateStatus = async (status: string) => {
    try {
      await apiClient.patch(`/sessions/${slug}`, { status });
      toast({ title: `Status â†’ ${status}` });
      fetchSession();
    } catch {
      toast({ title: "Failed to update status", variant: "destructive" });
    }
  };

  const handleSaveTargetLevel = async () => {
    try {
      await apiClient.patch(`/sessions/${slug}`, { targetLevel: editTargetLevelValue });
      setEditingTargetLevel(false);
      fetchSession();
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    }
  };

  const handleSaveTemplatePosition = async () => {
    try {
      await apiClient.patch(`/sessions/${slug}`, { templatePosition: editTemplatePositionValue });
      setEditingTemplatePosition(false);
      fetchSession();
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    }
  };

  const handleSaveMeetingLink = async () => {
    // Validate URL format
    if (editMeetingLinkValue && editMeetingLinkValue.trim() !== "") {
      try {
        new URL(editMeetingLinkValue);
      } catch {
        toast({ title: "Invalid URL format", variant: "destructive" });
        return;
      }
    }
    try {
      await apiClient.patch(`/sessions/${slug}`, { meetingLink: editMeetingLinkValue || null });
      setEditingMeetingLink(false);
      toast({ title: "Meeting link updated" });
      fetchSession();
    } catch {
      toast({ title: "Failed to update meeting link", variant: "destructive" });
    }
  };

  const handleSaveScheduledAt = async () => {
    try {
      await apiClient.patch(`/sessions/${slug}`, { scheduledAt: editScheduledAtValue || null });
      setEditingScheduledAt(false);
      toast({ title: "Scheduled date updated" });
      fetchSession();
    } catch {
      toast({ title: "Failed to update scheduled date", variant: "destructive" });
    }
  };

  const handleToggleCandidateView = async (enabled: boolean) => {
    try {
      await apiClient.patch(`/sessions/${slug}/candidate-view`, { enabled });
      setSession((prev: any) => (prev ? { ...prev, candidateViewEnabled: enabled } : prev));
      toast({ title: enabled ? "Candidate can now view questions" : "Candidate view disabled" });
    } catch {
      toast({ title: "Failed to update candidate view permission", variant: "destructive" });
    }
  };

  const handleExport = async () => {
    try {
      const blob = await apiClient.downloadBlob(`/export/${slug}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `session-${slug}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  const accessLink = session?.accessToken ? `${window.location.origin}/session/${session.accessToken}` : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(accessLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Question tree handlers
  const handleToggleActive = useCallback(
    async (sqId: string, active: boolean) => {
      try {
        if (active) {
          await apiClient.post(`/sessions/${slug}/reactivate-question`, { questionId: sqId });
        } else {
          await apiClient.patch(`/sessions/${slug}/questions/${sqId}`, { isActive: false });
        }
        fetchSession();
      } catch {
        toast({ title: "Failed to toggle question", variant: "destructive" });
      }
    },
    [slug, fetchSession],
  );

  const handleBulkToggle = useCallback(
    async (sqIds: string[], isActive: boolean) => {
      await apiClient.post(`/sessions/${slug}/bulk-toggle-questions`, { sqIds, isActive });
      fetchSession();
    },
    [slug, fetchSession],
  );

  const handleRateSubcategory = useCallback(
    async (key: string, rating: number | null) => {
      const current: Record<string, number> = { ...(session?.categoryRatings || {}) };
      if (rating === null) delete current[key];
      else current[key] = rating;
      // Optimistic update â€” no full refetch needed
      setSession((prev: any) => (prev ? { ...prev, categoryRatings: current } : prev));
      try {
        await apiClient.patch(`/sessions/${slug}`, { categoryRatings: current });
      } catch {
        // Revert optimistic update on failure
        setSession((prev: any) => (prev ? { ...prev, categoryRatings: session?.categoryRatings || {} } : prev));
        toast({ title: "Failed to save rating", variant: "destructive" });
      }
    },
    [slug, session?.categoryRatings],
  );

  const handleSelectQuestion = useCallback(
    (sqId: string) => {
      const sq = sessionQuestions.find((q) => q.id === sqId);
      if (!sq) return;
      setDetailSq(sq);
      setDetailNote(sq.interviewerNote || "");
      setDetailRating(sq.rating || null);
    },
    [sessionQuestions],
  );

  const handleSaveDetail = useCallback(async () => {
    if (!detailSq) return;
    setDetailSaving(true);
    try {
      await apiClient.patch(`/sessions/${slug}/questions/${detailSq.id}`, {
        interviewerNote: detailNote,
        ...(detailRating !== null ? { rating: detailRating } : {}),
      });
      toast({ title: "Saved" });
      setDetailSq(null);
      fetchSession();
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setDetailSaving(false);
    }
  }, [detailSq, detailNote, detailRating, slug, fetchSession]);

  const handleOpenAddQuestions = async () => {
    try {
      const data = await apiClient.get<any>("/questions", { limit: 1000 });
      setQuestionBank(data?.data ?? []);
      setSelectedBankQuestionIds(new Set());
      setAddQuestionsOpen(true);
    } catch {
      toast({ title: "Failed to load question bank", variant: "destructive" });
    }
  };

  const handleAddSelectedQuestions = async () => {
    if (selectedBankQuestionIds.size === 0) return;
    try {
      await apiClient.post(`/sessions/${slug}/questions`, {
        questionIds: Array.from(selectedBankQuestionIds),
      });
      toast({ title: `${selectedBankQuestionIds.size} question(s) added` });
      setAddQuestionsOpen(false);
      fetchSession();
    } catch {
      toast({ title: "Failed to add questions", variant: "destructive" });
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  if (!session) return <div className="flex items-center justify-center h-64 text-muted-foreground">Session not found.</div>;

  return (
    <SessionDetailView
      session={session}
      slug={slug}
      isHr={isHr}
      navigate={navigate}
      sessionQuestions={sessionQuestions}
      categoryOrder={categoryOrder}
      copied={copied}
      setCopied={setCopied}
      questionsExpanded={questionsExpanded}
      setQuestionsExpanded={setQuestionsExpanded}
      detailSq={detailSq}
      setDetailSq={setDetailSq}
      detailNote={detailNote}
      setDetailNote={setDetailNote}
      detailRating={detailRating}
      setDetailRating={setDetailRating}
      detailSaving={detailSaving}
      anticheatEvents={anticheatEvents}
      editingTargetLevel={editingTargetLevel}
      setEditingTargetLevel={setEditingTargetLevel}
      editTargetLevelValue={editTargetLevelValue}
      setEditTargetLevelValue={setEditTargetLevelValue}
      editingTemplatePosition={editingTemplatePosition}
      setEditingTemplatePosition={setEditingTemplatePosition}
      editTemplatePositionValue={editTemplatePositionValue}
      setEditTemplatePositionValue={setEditTemplatePositionValue}
      editingMeetingLink={editingMeetingLink}
      setEditingMeetingLink={setEditingMeetingLink}
      editMeetingLinkValue={editMeetingLinkValue}
      setEditMeetingLinkValue={setEditMeetingLinkValue}
      editingScheduledAt={editingScheduledAt}
      setEditingScheduledAt={setEditingScheduledAt}
      editScheduledAtValue={editScheduledAtValue}
      setEditScheduledAtValue={setEditScheduledAtValue}
      addQuestionsOpen={addQuestionsOpen}
      setAddQuestionsOpen={setAddQuestionsOpen}
      questionBank={questionBank}
      selectedBankQuestionIds={selectedBankQuestionIds}
      setSelectedBankQuestionIds={setSelectedBankQuestionIds}
      surveyQuestions={surveyQuestions}
      surveyGenerating={surveyGenerating}
      surveyExpanded={surveyExpanded}
      setSurveyExpanded={setSurveyExpanded}
      surveyActivated={surveyActivated}
      expandedSurveyId={expandedSurveyId}
      setExpandedSurveyId={setExpandedSurveyId}
      surveyAnswerSaving={surveyAnswerSaving}
      activateDialogOpen={activateDialogOpen}
      setActivateDialogOpen={setActivateDialogOpen}
      activateSelectedIds={activateSelectedIds}
      activateSubmitting={activateSubmitting}
      activateQuestionsLoading={activateQuestionsLoading}
      dialogQuestionsMap={dialogQuestionsMap}
      accessLink={accessLink}
      handleCopy={handleCopy}
      handleGenerateSurvey={handleGenerateSurvey}
      handleSaveSurveyAnswer={handleSaveSurveyAnswer}
      handleSuggest={handleSuggest}
      handleOpenActivateDialog={handleOpenActivateDialog}
      handleResuggest={handleResuggest}
      handleActivateSubmit={handleActivateSubmit}
      toggleActivateQuestion={toggleActivateQuestion}
      fetchSurvey={fetchSurvey}
      handleUpdateStatus={handleUpdateStatus}
      handleExport={handleExport}
      handleSelectQuestion={handleSelectQuestion}
      handleToggleActive={handleToggleActive}
      handleBulkToggle={handleBulkToggle}
      handleRateSubcategory={handleRateSubcategory}
      handleOpenAddQuestions={handleOpenAddQuestions}
      handleAddSelectedQuestions={handleAddSelectedQuestions}
      handleSaveDetail={handleSaveDetail}
      handleSaveTargetLevel={handleSaveTargetLevel}
      handleSaveTemplatePosition={handleSaveTemplatePosition}
      handleSaveMeetingLink={handleSaveMeetingLink}
      handleSaveScheduledAt={handleSaveScheduledAt}
      handleToggleCandidateView={handleToggleCandidateView}
    />
  );
}

function SessionDetailView(props: any) {
  const existingQuestionIds = new Set(props.sessionQuestions.map((sq: any) => sq.question?.id || sq.questionId));
  const total = props.sessionQuestions.length;
  const active = props.sessionQuestions.filter((q: any) => q.isActive).length;
  const answered = props.sessionQuestions.filter((q: any) => q.candidateAnswer).length;
  const rated = props.sessionQuestions.filter((q: any) => q.rating).length;
  const answerRate = total > 0 ? Math.round((answered / total) * 100) : 0;
  const ratingRate = total > 0 ? Math.round((rated / total) * 100) : 0;

  return (
    <div className="flex flex-col md:h-full">
      <SessionDetailHeader {...props} />
      <SessionMainContent {...props} total={total} active={active} answered={answered} rated={rated} answerRate={answerRate} ratingRate={ratingRate} />
      <SessionDetailDialogs {...props} existingQuestionIds={existingQuestionIds} />
    </div>
  );
}

function SessionDetailHeader(props: any) {
  const { session, slug, isHr, navigate, handleUpdateStatus, handleExport } = props;
  return (
    <>
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 border-b bg-background shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <h1 className="text-lg font-semibold whitespace-nowrap">Session Detail</h1>
          <Badge className={cn("text-xs shrink-0", statusStyles[session.status] || "")} variant="outline">
            {session.status}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {!isHr && NEXT_STATUS[session.status] && (
            <Button size="sm" variant={NEXT_STATUS[session.status].variant} onClick={() => handleUpdateStatus(NEXT_STATUS[session.status].next)}>
              {NEXT_STATUS[session.status].label}
            </Button>
          )}
          <Button size="sm" onClick={() => navigate(`/sessions/${slug}/live`)}>
            <Radio className="h-3.5 w-3.5 mr-1" />
            Go Live
          </Button>
          {!isHr && (
            <Link to={`/sessions/${slug}/evaluate`}>
              <Button variant="outline" size="sm">
                <ClipboardList className="h-3.5 w-3.5 mr-1" />
                Evaluate
              </Button>
            </Link>
          )}
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-3.5 w-3.5 mr-1" />
            Export
          </Button>
        </div>
      </div>
    </>
  );
}

function SessionSurveyPanel(props: any) {
  const {
    session,
    surveyQuestions,
    surveyExpanded,
    setSurveyExpanded,
    surveyGenerating,
    surveyActivated,
    expandedSurveyId,
    setExpandedSurveyId,
    surveyAnswerSaving,
    handleGenerateSurvey,
    handleSuggest,
    handleOpenActivateDialog,
    fetchSurvey,
    handleSaveSurveyAnswer,
  } = props;
  const surveyAnsweredCount = surveyQuestions.filter((q: any) => q.answer).length;
  const allSurveyAnswered = surveyQuestions.length > 0 && surveyAnsweredCount === surveyQuestions.length;
  const surveyStep = surveyQuestions.length === 0 ? 1 : allSurveyAnswered ? 3 : 2;
  const stepClass = (step: number) => cn("px-2 py-0.5 rounded-full text-xs font-medium", surveyStep === step ? "bg-primary text-primary-foreground" : surveyStep > step ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground");

  return (
    <div className="rounded-lg border bg-card">
      <button type="button" aria-label="Toggle pre-interview survey" aria-expanded={surveyExpanded} className="w-full text-left flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors rounded-lg" onClick={() => setSurveyExpanded((v: boolean) => !v)}>
        <div className="flex items-center gap-2 text-sm font-semibold"><ClipboardCheck className="h-4 w-4 text-muted-foreground" />Pre-Interview Survey{surveyQuestions.length > 0 && <span className="text-xs font-normal text-muted-foreground">({surveyAnsweredCount}/{surveyQuestions.length} answered)</span>}</div>
        <div className="flex items-center gap-2"><div className="hidden sm:flex items-center gap-1"><span className={stepClass(1)}>1 Generate</span><span className="text-muted-foreground text-xs">â€º</span><span className={stepClass(2)}>2 Answers</span><span className="text-muted-foreground text-xs">â€º</span><span className={stepClass(3)}>3 Activate</span></div>{surveyExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}</div>
      </button>
      {surveyExpanded && (
        <div className="border-t px-4 py-3 space-y-3">
          {session.status !== 'COMPLETED' && session.status !== 'EVALUATED' && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant={surveyQuestions.length > 0 ? "outline" : "default"} onClick={(e) => { e.stopPropagation(); handleGenerateSurvey(); }} disabled={surveyGenerating}>{surveyGenerating && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}{surveyQuestions.length > 0 ? "Regenerate" : "Generate Survey"}</Button>
              {allSurveyAnswered && !surveyActivated && !session?.surveySuggestions?.length && <Button size="sm" disabled={session?.isSurveySuggestGenerating} onClick={(e) => { e.stopPropagation(); handleSuggest(); }}>{session?.isSurveySuggestGenerating && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Suggest</Button>}
              {allSurveyAnswered && !surveyActivated && !!session?.surveySuggestions?.length && <Button size="sm" onClick={(e) => { e.stopPropagation(); handleOpenActivateDialog(); }}>Activate â†’</Button>}
              {surveyQuestions.length > 0 && <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); fetchSurvey(); }}>Refresh</Button>}
            </div>
          )}
          {surveyQuestions.length > 0 && <div className="space-y-2">{surveyQuestions.map((sq: any) => (
            <div key={sq.id} className="rounded-md border px-3 py-2 space-y-1.5">
              <button type="button" aria-label={sq.question} aria-expanded={expandedSurveyId === sq.id} className="w-full text-left flex items-start gap-2 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setExpandedSurveyId(expandedSurveyId === sq.id ? null : sq.id)}>
                <p className="leading-snug text-sm flex-1 min-w-0">{sq.question}</p>
                <div className="flex items-center gap-1.5 shrink-0">{sq.subcategory && <Badge variant="secondary" className="text-xs">{sq.subcategory}</Badge>}{sq.answer ? <Badge className="text-xs bg-green-100 text-green-700 border border-green-200 hover:bg-green-100">âœ“</Badge> : <Badge variant="outline" className="text-xs text-muted-foreground">Waitingâ€¦</Badge>}{expandedSurveyId === sq.id ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}</div>
              </button>
              {sq.purpose && <p className="text-xs text-muted-foreground italic">{sq.purpose}</p>}
              {sq.answer && <p className="text-xs text-green-800 bg-green-50 border border-green-100 rounded px-2 py-1">{sq.answer}</p>}
              {expandedSurveyId === sq.id && sq.choices?.length > 0 && <div className="pt-1 space-y-1">{sq.choices.map((choice: string) => <button type="button" key={choice} className={cn("w-full text-left text-xs px-2 py-1.5 rounded border transition-colors", sq.answer === choice ? "bg-green-50 border-green-300 text-green-800 font-medium" : "hover:bg-muted/60 border-transparent hover:border-border", surveyAnswerSaving === sq.id && "opacity-50 pointer-events-none")} onClick={(event) => { event.stopPropagation(); handleSaveSurveyAnswer(sq.id, choice); }}>{surveyAnswerSaving === sq.id && sq.answer !== choice && <Loader2 className="inline h-3 w-3 mr-1 animate-spin" />}{choice}</button>)}</div>}
            </div>
          ))}</div>}
          {surveyQuestions.length === 0 && <p className="text-xs text-muted-foreground">Generate diagnostic survey questions. The candidate will answer them before the interview starts.</p>}
        </div>
      )}
    </div>
  );
}

function SessionQuestionsPanel(props: any) {
  const { session, total, questionsExpanded, setQuestionsExpanded, handleOpenAddQuestions, handleSelectQuestion, handleToggleActive, handleBulkToggle, handleRateSubcategory, sessionQuestions, categoryOrder } = props;
  const sessionClosed = session.status === 'COMPLETED' || session.status === 'EVALUATED';
  return (
    <div className="rounded-lg border bg-card">
      <div className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/40 transition-colors rounded-lg">
        <button type="button" aria-label="Toggle questions" aria-expanded={questionsExpanded} className="flex items-center gap-2 text-left" onClick={() => setQuestionsExpanded((v: boolean) => !v)}><Layers className="h-4 w-4 text-muted-foreground" />Questions ({total})</button>
        <div className="flex items-center gap-2">{!sessionClosed && <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={(e) => { e.stopPropagation(); handleOpenAddQuestions(); }}><Plus className="h-3.5 w-3.5 mr-0.5" />Add</Button>}{questionsExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}</div>
      </div>
      {questionsExpanded && <div className="border-t px-3 py-3 max-h-[60vh] overflow-y-auto"><QuestionTree questions={sessionQuestions} onSelect={handleSelectQuestion} onToggleActive={!sessionClosed ? handleToggleActive : undefined} onBulkToggle={!sessionClosed ? handleBulkToggle : undefined} onRateSubcategory={handleRateSubcategory} categoryRatings={session?.categoryRatings} categoryOrder={categoryOrder} hideUnrated={sessionClosed} /></div>}
    </div>
  );
}

function getAntiCheatEventLabel(type: string) {
  if (type === "TAB_HIDDEN") return "Tab switch";
  if (type === "COPY_ATTEMPT") return "Copy attempt";
  return "Multi-device";
}

function SessionAntiCheatPanel({ anticheatEvents }: { anticheatEvents: any[] }) {
  const tabSwitches = anticheatEvents.filter((e: any) => e.type === "TAB_HIDDEN").length;
  const copyAttempts = anticheatEvents.filter((e: any) => e.type === "COPY_ATTEMPT").length;
  const multiDevice = anticheatEvents.some((e: any) => e.type === "MULTI_DEVICE_DETECTED");
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1"><ShieldAlert className="h-3.5 w-3.5" /> Anti-Cheat</p>
      {anticheatEvents.length === 0 ? <p className="text-xs text-muted-foreground">No violations detected</p> : <><div className="flex flex-wrap gap-1.5">{multiDevice && <Badge variant="destructive" className="text-xs">Multi-device</Badge>}{tabSwitches > 0 && <Badge variant="destructive" className="text-xs">Tab switches: {tabSwitches}</Badge>}{copyAttempts > 0 && <Badge variant="destructive" className="text-xs">Copy attempts: {copyAttempts}</Badge>}</div><div className="space-y-1">{anticheatEvents.map((e: any) => <div key={e.id ?? `${e.type}-${e.createdAt}`} className="text-xs text-muted-foreground flex items-center justify-between"><span className={cn("font-medium", e.type === "MULTI_DEVICE_DETECTED" ? "text-destructive" : "text-orange-600")}>{getAntiCheatEventLabel(e.type)}</span><span>{new Date(e.createdAt).toLocaleTimeString()}</span></div>)}</div></>}
    </div>
  );
}

function SessionEditableField(props: any) {
  const { label, isHr, editing, value, displayValue, setValue, setEditing, onSave, onCancel } = props;
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      {!isHr && editing ? (
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={onSave}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSave();
            if (event.key === "Escape") onCancel();
          }}
          autoFocus
          className="h-7 text-sm"
        />
      ) : (
        <button
          type="button"
          disabled={isHr}
          className={cn(
            "w-full border-0 bg-transparent text-left text-sm font-medium rounded px-1 -mx-1 disabled:cursor-default disabled:opacity-100",
            !isHr && "cursor-pointer hover:bg-muted",
          )}
          onClick={() => {
            if (!isHr) {
          {displayValue || <span className="text-muted-foreground">—</span>}
              setValue(displayValue || "");
              setEditing(true);
            }
          }}
        >
          {displayValue || <span className="text-muted-foreground">Ã¢â‚¬â€</span>}
        </button>
      )}
    </div>
  );
}

function SessionOverviewPanels(props: any) {
  const {
    isHr,
    total,
    active,
    answered,
    rated,
    answerRate,
    ratingRate,
    session,
    surveyQuestions,
    surveyExpanded,
    setSurveyExpanded,
    surveyGenerating,
    surveyActivated,
    expandedSurveyId,
    setExpandedSurveyId,
    surveyAnswerSaving,
    handleGenerateSurvey,
    handleSuggest,
    handleOpenActivateDialog,
    fetchSurvey,
    handleSaveSurveyAnswer,
    questionsExpanded,
    setQuestionsExpanded,
    handleOpenAddQuestions,
    handleSelectQuestion,
    handleToggleActive,
    handleBulkToggle,
    handleRateSubcategory,
    sessionQuestions,
    categoryOrder,
  } = props;
  if (isHr) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border bg-card p-4 text-center">
          <p className="text-2xl font-bold">{total}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Total Questions</p>
        </div>
        <div className="rounded-lg border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{active}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Active</p>
        </div>
        <div className="rounded-lg border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{answered}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Answered ({answerRate}%)</p>
        </div>
        <div className="rounded-lg border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-purple-600">{rated}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Rated ({ratingRate}%)</p>
        </div>
      </div>
      <SessionSurveyPanel
        session={session}
        surveyQuestions={surveyQuestions}
        surveyExpanded={surveyExpanded}
        setSurveyExpanded={setSurveyExpanded}
        surveyGenerating={surveyGenerating}
        surveyActivated={surveyActivated}
        expandedSurveyId={expandedSurveyId}
        setExpandedSurveyId={setExpandedSurveyId}
        surveyAnswerSaving={surveyAnswerSaving}
        handleGenerateSurvey={handleGenerateSurvey}
        handleSuggest={handleSuggest}
        handleOpenActivateDialog={handleOpenActivateDialog}
        fetchSurvey={fetchSurvey}
        handleSaveSurveyAnswer={handleSaveSurveyAnswer}
      />
      <SessionQuestionsPanel
        session={session}
        total={total}
        questionsExpanded={questionsExpanded}
        setQuestionsExpanded={setQuestionsExpanded}
        handleOpenAddQuestions={handleOpenAddQuestions}
        handleSelectQuestion={handleSelectQuestion}
        handleToggleActive={handleToggleActive}
        handleBulkToggle={handleBulkToggle}
        handleRateSubcategory={handleRateSubcategory}
        sessionQuestions={sessionQuestions}
        categoryOrder={categoryOrder}
      />
    </>
  );
}

function SessionMainContent(props: any) {
  const {
    session,
    isHr,
    sessionQuestions,
    categoryOrder,
    copied,
    editingTemplatePosition,
    setEditingTemplatePosition,
    editTemplatePositionValue,
    setEditTemplatePositionValue,
    handleSaveTemplatePosition,
    handleSaveTargetLevel,
    editingTargetLevel,
    setEditingTargetLevel,
    editTargetLevelValue,
    setEditTargetLevelValue,
    editingScheduledAt,
    setEditingScheduledAt,
    editScheduledAtValue,
    setEditScheduledAtValue,
    handleSaveScheduledAt,
    editingMeetingLink,
    setEditingMeetingLink,
    editMeetingLinkValue,
    setEditMeetingLinkValue,
    handleSaveMeetingLink,
    accessLink,
    handleCopy,
    handleToggleCandidateView,
    anticheatEvents,
  } = props;
  return (
    <>
      {/* Body: stacks on mobile, 2-col on md+ */}
      <div className="flex flex-col md:flex-row md:flex-1 md:overflow-hidden">
        {/* Left â€” Overview + Questions tree */}
        <div className="flex-1 md:overflow-y-auto px-4 py-4 space-y-4">
          <SessionOverviewPanels {...props} />
        </div>
        <div className="w-full md:w-80 md:shrink-0 border-t md:border-t-0 md:border-l md:overflow-y-auto px-4 py-4 space-y-5 bg-muted/20">
          {/* Candidate */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <User className="h-3.5 w-3.5" /> Candidate
            </p>
            {session.candidate?.slug ? (
              <Link to={`/candidates/${session.candidate.slug}`} className="font-medium text-sm text-blue-600 hover:underline">
                {session.candidate.name || "Unknown"}
              </Link>
            ) : (
              <p className="font-medium text-sm">{session.candidate?.name || "Unknown"}</p>
            )}
            {session.candidate?.email && <p className="text-xs text-muted-foreground">{session.candidate.email}</p>}
          </div>

          {/* Position */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Position</p>
            {!isHr && editingTemplatePosition ? (
              <Input
                value={editTemplatePositionValue}
                onChange={(e) => setEditTemplatePositionValue(e.target.value)}
                onBlur={handleSaveTemplatePosition}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTemplatePosition();
                  if (e.key === "Escape") setEditingTemplatePosition(false);
                }}
                autoFocus
                className="h-7 text-sm"
              />
            ) : (
              <button
                type="button"
                disabled={isHr}
                className={cn("w-full border-0 bg-transparent text-left text-sm font-medium rounded px-1 -mx-1 disabled:cursor-default disabled:opacity-100", !isHr && "cursor-pointer hover:bg-muted")}
                onClick={() => {
                  if (!isHr) {
                    setEditTemplatePositionValue(session.templatePosition || "");
                    setEditingTemplatePosition(true);
                  }
                }}
              >
                {session.templatePosition || <span className="text-muted-foreground">â€”</span>}
              </button>
            )}
          </div>

          <SessionEditableField
            label="Target Level"
            isHr={isHr}
            editing={editingTargetLevel}
            value={editTargetLevelValue}
            displayValue={session.targetLevel}
            setValue={setEditTargetLevelValue}
            setEditing={setEditingTargetLevel}
            onSave={handleSaveTargetLevel}
            onCancel={() => setEditingTargetLevel(false)}
          />
          {/*
          <>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Target Level</p>
            {!isHr && editingTargetLevel ? (
              <Input
                value={editTargetLevelValue}
                onChange={(e) => setEditTargetLevelValue(e.target.value)}
                onBlur={handleSaveTargetLevel}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTargetLevel();
                  if (e.key === "Escape") setEditingTargetLevel(false);
                }}
                autoFocus
                className="h-7 text-sm"
              />
            ) : (
              <button
                type="button"
                disabled={isHr}
                className={cn("w-full border-0 bg-transparent text-left text-sm font-medium rounded px-1 -mx-1 disabled:cursor-default disabled:opacity-100", !isHr && "cursor-pointer hover:bg-muted")}
                onClick={() => {
                  if (!isHr) {
                    setEditTargetLevelValue(session.targetLevel || "");
                    setEditingTargetLevel(true);
                  }
                }}
              >
                {session.targetLevel || <span className="text-muted-foreground">â€”</span>}
              </button>
            )}
          </div>

          </>
          */}

          {/* Schedule */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> Schedule
            </p>
            <div className="space-y-2">
              {/* Scheduled datetime */}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Interview Date & Time</p>
                {editingScheduledAt ? (
                  <Input
                    type="datetime-local"
                    value={editScheduledAtValue}
                    onChange={(e) => setEditScheduledAtValue(e.target.value)}
                    onBlur={handleSaveScheduledAt}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveScheduledAt();
                      if (e.key === "Escape") setEditingScheduledAt(false);
                    }}
                    autoFocus
                    className="h-7 text-xs"
                  />
                ) : (
                  <button
                    type="button"
                    className="text-xs font-medium rounded px-1 -mx-1 cursor-pointer hover:bg-muted"
                    onClick={() => {
                      const dateValue = session.scheduledAt
                        ? new Date(session.scheduledAt).toISOString().slice(0, 16)
                        : "";
                      setEditScheduledAtValue(dateValue);
                      setEditingScheduledAt(true);
                    }}
                  >
                    {session.scheduledAt ? (
                      <span className="text-foreground">{new Date(session.scheduledAt).toLocaleString()}</span>
                    ) : (
                      <span className="text-muted-foreground">Click to set date/time</span>
                    )}
                  </button>
                )}
              </div>

              {/* Meeting link */}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Meeting Link</p>
                {editingMeetingLink ? (
                  <Input
                    type="url"
                    value={editMeetingLinkValue}
                    onChange={(e) => setEditMeetingLinkValue(e.target.value)}
                    onBlur={handleSaveMeetingLink}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveMeetingLink();
                      if (e.key === "Escape") setEditingMeetingLink(false);
                    }}
                    placeholder="https://meet.google.com/..."
                    autoFocus
                    className="h-7 text-xs"
                  />
                ) : (
                  <div className="text-xs font-medium rounded px-1 -mx-1 break-all">
                    {session.meetingLink ? (
                      <div className="flex items-center gap-2">
                        <a href={session.meetingLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          {session.meetingLink}
                        </a>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground underline"
                          aria-label="Edit meeting link"
                          onClick={() => {
                            setEditMeetingLinkValue(session.meetingLink || "");
                            setEditingMeetingLink(true);
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="p-0 text-xs text-muted-foreground hover:text-foreground"
                        aria-label="Set meeting link"
                        onClick={() => {
                          setEditMeetingLinkValue("");
                          setEditingMeetingLink(true);
                        }}
                      >
                        Click to set meeting link
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Meeting platform (read-only for now) */}
              {session.meetingPlatform && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Platform</p>
                  <p className="text-xs font-medium text-foreground">
                    {session.meetingPlatform === 'MS_TEAMS' ? 'MS Teams' : 'Google Meet'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Timeline */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> Timeline
            </p>
            <div className="space-y-0.5 text-xs text-muted-foreground">
              <p>
                Created: <span className="text-foreground">{new Date(session.createdAt).toLocaleString()}</span>
              </p>
              {session.startedAt && (
                <p>
                  Started: <span className="text-foreground">{new Date(session.startedAt).toLocaleString()}</span>
                </p>
              )}
              {session.completedAt && (
                <p>
                  Completed: <span className="text-foreground">{new Date(session.completedAt).toLocaleString()}</span>
                </p>
              )}
            </div>
          </div>

          {/* Access link */}
          {accessLink && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Candidate Link</p>
              <div className="flex items-center gap-1.5">
                <Input value={accessLink} readOnly className="text-xs h-7 flex-1 font-mono" />
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleCopy}>
                  {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          )}

          {/* Candidate view permission toggle */}
          {
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Candidate Permissions</p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">View activated questions</span>
                <Button size="sm" variant={session.candidateViewEnabled === false ? "destructive" : "outline"} className="h-7 text-xs" onClick={() => handleToggleCandidateView(session.candidateViewEnabled === false)}>
                  {session.candidateViewEnabled === false ? "Disabled" : "Enabled"}
                </Button>
              </div>
            </div>
          }

          <SessionAntiCheatPanel anticheatEvents={anticheatEvents} />
          {/* Category Ratings */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Ratings by Category</p>
            <CategoryRatings sessionId={session?.id!} sessionQuestions={sessionQuestions} categoryOrder={categoryOrder} />
          </div>
        </div>
      </div>
    </>
  );
}

function SessionDetailDialogs(props: any) {
  const {
    session,
    detailSq,
    setDetailSq,
    detailNote,
    setDetailNote,
    detailRating,
    setDetailRating,
    detailSaving,
    handleSaveDetail,
    activateDialogOpen,
    setActivateDialogOpen,
    activateQuestionsLoading,
    dialogQuestionsMap,
    activateSelectedIds,
    toggleActivateQuestion,
    activateSubmitting,
    handleActivateSubmit,
    handleResuggest,
    addQuestionsOpen,
    setAddQuestionsOpen,
    questionBank,
    existingQuestionIds,
    selectedBankQuestionIds,
    setSelectedBankQuestionIds,
    handleAddSelectedQuestions,
  } = props;
  return (
    <>
      {/* Question Detail Dialog */}
      <Dialog
        open={!!detailSq}
        onOpenChange={(open) => {
          if (!open) setDetailSq(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <span className="flex-1">{detailSq?.question?.text || "Question"}</span>
              {detailSq?.question?.type && (
                <Badge variant="outline" className="text-xs shrink-0">
                  {detailSq.question.type}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2 text-xs">
              {detailSq?.question?.category && <span>{detailSq.question.category}</span>}
              {detailSq?.question?.subcategory && <span>Â· {detailSq.question.subcategory}</span>}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Expected answer */}
            {detailSq?.question?.expectedAnswer && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Expected Answer</p>
                <div className="rounded-md bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap">{detailSq.question.expectedAnswer}</div>
              </div>
            )}

            {/* Candidate answer */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Candidate Answer</p>
              {detailSq?.candidateAnswer ? <div className="rounded-md bg-blue-50 border border-blue-100 px-3 py-2 text-sm whitespace-pre-wrap">{detailSq.candidateAnswer}</div> : <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground italic">Not answered yet</div>}
            </div>

            {/* Code submissions */}
            {detailSq?.question?.type === "CODING" && detailSq?.submissions?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Latest Submission</p>
                {detailSq.submissions.slice(-1).map((sub: any) => (
                  <div key={sub.id} className="rounded-md bg-slate-900 px-3 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-400">{sub.language}</span>
                      <Badge className="text-xs h-4" variant={sub.status === "PASSED" ? "default" : sub.status === "FAILED" ? "destructive" : "secondary"}>
                        {sub.status}
                      </Badge>
                    </div>
                    <pre className="text-xs text-slate-200 overflow-auto max-h-40">{sub.code}</pre>
                    {sub.results?.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {sub.results.map((r: any, i: number) => (
                          <span key={i} className={cn("text-xs px-1.5 py-0.5 rounded", r.passed ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300")}>
                            T{i + 1} {r.passed ? "âœ“" : "âœ—"}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Interviewer note */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Interviewer Note</p>
                  <Textarea value={detailNote} onChange={(e: any) => setDetailNote(e.target.value)} placeholder="Add noteâ€¦" className="text-sm min-h-[80px] resize-none" />
            </div>

            {/* Rating */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Rating</p>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((r) => (
                  <button type="button" key={r} onClick={() => setDetailRating((prev: number | null) => (prev === r ? null : r))} className={cn("text-sm px-3 py-1.5 rounded-full border transition-all font-medium", detailRating === r ? RATING_COLORS[r] : "bg-background text-muted-foreground border-border hover:border-primary/50")}>
                    {r} â€” {getRatingLabels(detailSq?.question?.category ?? "")[r]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailSq(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveDetail} disabled={detailSaving}>
              {detailSaving ? "Savingâ€¦" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activate Dialog â€” shows persisted AI suggestions, allows re-suggest */}
      <Dialog open={activateDialogOpen} onOpenChange={(open) => { if (!open) setActivateDialogOpen(false); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Activate Suggested Questions</DialogTitle>
            <DialogDescription>AI-suggested questions based on the candidate's survey answers. Uncheck any to exclude, then activate.</DialogDescription>
          </DialogHeader>

          {activateQuestionsLoading ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Loading questionsâ€¦</span>
            </div>
          ) : (
            <SuggestedQuestionsList
              suggestions={session?.surveySuggestions ?? []}
              questionsMap={dialogQuestionsMap}
              selectedIds={activateSelectedIds}
              onToggle={toggleActivateQuestion}
            />
          )}

          <DialogFooter className="flex-wrap gap-2 pt-2 border-t">
            <Button onClick={handleActivateSubmit} disabled={activateSubmitting || activateQuestionsLoading || activateSelectedIds.size === 0}>
              {activateSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {activateSubmitting ? "Activatingâ€¦" : `Activate ${activateSelectedIds.size} Question(s)`}
            </Button>
            <Button variant="outline" onClick={handleResuggest} disabled={activateSubmitting}>
              Re-suggest
            </Button>
            <Button variant="ghost" onClick={() => setActivateDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Questions Dialog */}
      <Dialog open={addQuestionsOpen} onOpenChange={setAddQuestionsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Questions from Bank</DialogTitle>
            <DialogDescription>Select questions to add to this session.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {questionBank.filter((q: any) => !existingQuestionIds.has(q.id)).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">All questions are already added.</p>
            ) : (
              questionBank
                .filter((q: any) => !existingQuestionIds.has(q.id))
                .map((q: any) => (
                  <div key={q.id} className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/50">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selectedBankQuestionIds.has(q.id)}
                      onChange={() => setSelectedBankQuestionIds((prev: Set<string>) => {
                        const next = new Set(prev);
                        next.has(q.id) ? next.delete(q.id) : next.add(q.id);
                        return next;
                      })}
                    />
                    <button
                      type="button"
                      className="flex-1 min-w-0 text-left"
                      aria-pressed={selectedBankQuestionIds.has(q.id)}
                      aria-label={"Select question " + q.text}
                      onClick={() => setSelectedBankQuestionIds((prev: Set<string>) => {
                        const next = new Set(prev);
                        next.has(q.id) ? next.delete(q.id) : next.add(q.id);
                        return next;
                      })}
                    >
                      <p className="text-sm font-medium truncate">{q.text}</p>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {q.category}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {q.type}
                        </Badge>
                      </div>
                    </button>
                  </div>
                ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddQuestionsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddSelectedQuestions} disabled={selectedBankQuestionIds.size === 0}>
              Add {selectedBankQuestionIds.size} Question(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}
