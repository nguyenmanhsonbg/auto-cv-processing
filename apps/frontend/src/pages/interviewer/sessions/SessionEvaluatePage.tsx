import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getSocket, joinSession, disconnectSocket, WebSocketEvents } from '@/lib/socket';
import { useForm, Controller, type Control, type UseFormRegister, type UseFormSetValue, type UseFormWatch } from 'react-hook-form';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { toast } from '@/components/ui/use-toast';
import { Download, Loader2, Sparkles, Pencil, Check, ArrowLeft } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  SOFT_SKILL_SUBCATEGORIES,
  PERSONALITY_CATEGORIES,
  TECHNICAL_RATING_LABELS,
  PERSONALITY_RATING_LABELS,
  OverallResult,
} from '@interview-assistant/shared';
import type { Evaluation, TechnicalRating, SoftSkillRating, PersonalityRating, HrEvaluation, AiEvaluationSuggestion, PaginatedResponse } from '@interview-assistant/shared';

interface Level { id: string; name: string; displayName: string; orderIndex: number }

interface EvalFormData {
  hrEvaluation: HrEvaluation;
  technicalMust: Record<string, { comment: string; rating: string }>;
  technicalShould: Record<string, { comment: string; rating: string }>;
  softSkill: Record<string, { comment: string; rating: string }>;
  zoneExplanation: string;
  finalLevel: string;
  finalZone: string;
  finalSubZone: string;
  personality: Record<string, { rating: string; reasoning: string }>;
  overallResult: string;
  overallNotes: string;
}

const RATING_ACTIVE_CLASSES: Record<number, string> = {
  1: 'bg-red-100 border-red-500 text-red-700',
  2: 'bg-amber-100 border-amber-500 text-amber-700',
  3: 'bg-blue-100 border-blue-500 text-blue-700',
  4: 'bg-green-100 border-green-500 text-green-700',
  5: 'bg-purple-100 border-purple-500 text-purple-700',
};

// Derives per-subcategory ratings from interview-time data:
// Phase 1: difficulty-weighted average per-question ratings grouped by CATEGORY::Subcategory
// Phase 2: override with explicit session.categoryRatings if present
function computeDerivedRatings(session: any): Record<string, number> {
  const buckets: Record<string, { rating: number; difficulty: number }[]> = {};
  for (const sq of session.questions ?? []) {
    const { rating } = sq;
    const category = sq.question?.category;
    const subcategory = sq.question?.subcategory;
    if (!rating || !category || !subcategory) continue;
    const key = `${category}::${subcategory}`;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push({ rating, difficulty: sq.question?.difficulty ?? 1 });
  }
  const derived: Record<string, number> = {};
  for (const [key, entries] of Object.entries(buckets)) {
    const weightedSum = entries.reduce((sum, e) => sum + e.rating * e.difficulty, 0);
    const totalWeight = entries.reduce((sum, e) => sum + e.difficulty, 0);
    const avg = weightedSum / totalWeight;
    derived[key] = Math.min(5, Math.max(1, Math.round(avg)));
  }
  for (const [key, rating] of Object.entries(session.categoryRatings ?? {})) {
    derived[key] = Math.min(5, Math.max(1, rating as number));
  }
  return derived;
}

function RatingButtons({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1">
      {([1, 2, 3, 4, 5] as const).map((v) => {
        const active = value === String(v);
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(String(v))}
            className={`w-8 h-8 rounded border-2 text-sm font-semibold transition-colors cursor-pointer ${
              active ? RATING_ACTIVE_CLASSES[v] : 'border-gray-200 text-gray-400 hover:border-gray-400'
            }`}
          >
            {v}
          </button>
        );
      })}
    </div>
  );
}

function toEvaluationRating(value?: string): 1 | 2 | 3 | 4 | 5 | undefined {
  return value ? (Number(value) as 1 | 2 | 3 | 4 | 5) : undefined;
}

function buildEvaluationPayload(
  data: EvalFormData,
  sessionId: string | undefined,
  mustSubs: readonly string[],
  shouldSubs: readonly string[],
  softSubs: readonly string[],
  persSubs: readonly string[],
) {
  const technicalRatings: TechnicalRating[] = [...mustSubs.map((subcategory) => {
    const entry = data.technicalMust[subcategory];
    return { subcategory, comment: entry?.comment || '', rating: toEvaluationRating(entry?.rating) };
  }), ...shouldSubs.map((subcategory) => {
    const entry = data.technicalShould[subcategory];
    return { subcategory, comment: entry?.comment || '', rating: toEvaluationRating(entry?.rating) };
  })];
  const softSkillRatings: SoftSkillRating[] = softSubs.map((subcategory) => {
    const entry = data.softSkill[subcategory];
    return { subcategory, comment: entry?.comment || '', rating: toEvaluationRating(entry?.rating) };
  });
  const personalityRatings: PersonalityRating[] = persSubs.map((category) => {
    const entry = data.personality[category];
    return { category, rating: toEvaluationRating(entry?.rating), reasoning: entry?.reasoning || '' };
  });
  return {
    sessionId,
    hrEvaluation: data.hrEvaluation,
    technicalRatings,
    softSkillRatings,
    zoneExplanation: data.zoneExplanation,
    finalLevel: data.finalLevel,
    finalZone: data.finalZone,
    finalSubZone: data.finalSubZone,
    personalityRatings,
    overallResult: data.overallResult,
    overallNotes: data.overallNotes,
  };
}

function getSuggestionPrefix(subcategory: string, softSubs: readonly string[], mustSubs: readonly string[]) {
  if (softSubs.includes(subcategory)) return 'softSkill';
  if (mustSubs.includes(subcategory)) return 'technicalMust';
  return 'technicalShould';
}

function applyAiEvaluationSuggestion(
  suggestion: AiEvaluationSuggestion,
  setValue: (name: any, value: any) => void,
  softSubs: readonly string[],
  mustSubs: readonly string[],
  persSubs: readonly string[],
) {
  suggestion.technicalRatings.forEach(({ subcategory, suggestedRating, reasoning }) => {
    const prefix = getSuggestionPrefix(subcategory, softSubs, mustSubs);
    setValue(prefix + '.' + subcategory + '.rating', suggestedRating.toString());
    setValue(prefix + '.' + subcategory + '.comment', reasoning);
  });
  suggestion.personalityRatings.forEach(({ category, suggestedRating, reasoning }) => {
    const formCategory = persSubs.find((item) => item === category || category.startsWith(item) || item.startsWith(category));
    if (!formCategory) return;
    setValue('personality.' + formCategory + '.rating', suggestedRating.toString());
    setValue('personality.' + formCategory + '.reasoning', reasoning);
  });
  setValue('overallResult', suggestion.overallResult);
  setValue('overallNotes', suggestion.overallNotes);
  if (suggestion.overallNotes) setValue('zoneExplanation', suggestion.overallNotes);
  if (suggestion.finalLevel) setValue('finalLevel', suggestion.finalLevel);
  if (suggestion.finalZone) setValue('finalZone', suggestion.finalZone);
  if (suggestion.finalSubZone) setValue('finalSubZone', suggestion.finalSubZone);
}

type EvaluationCategory = { id: string; name: string; orderIndex: number };
type EvaluationSubcategory = { categoryId: string; name: string; orderIndex: number };

function buildEvaluationCategoryOrder(cats: EvaluationCategory[], subs: EvaluationSubcategory[]) {
  const map = new Map<string, string[]>();
  const orderedCategories = [...cats].sort((a, b) => a.orderIndex - b.orderIndex);
  orderedCategories.forEach(({ id: catId, name }) => {
    map.set(name, subs.filter((sub) => sub.categoryId === catId).sort((a, b) => a.orderIndex - b.orderIndex).map((sub) => sub.name));
  });
  const techCats = orderedCategories.filter(({ name }) => name !== 'SOFT_SKILL' && name !== 'PERSONALITY');
  const mustCat = techCats[0]?.name ?? '';
  const shouldCat = techCats[1]?.name ?? '';
  return {
    map,
    mustCat,
    shouldCat,
    mustSubs: map.get(mustCat) ?? [],
    shouldSubs: map.get(shouldCat) ?? [],
  };
}

function restoreEvaluationForm(
  ev: Evaluation,
  setValue: (name: any, value: any) => void,
  mustSubs: readonly string[],
) {
  setValue('hrEvaluation', ev.hrEvaluation || {});
  setValue('zoneExplanation', ev.zoneExplanation || '');
  setValue('finalLevel', ev.finalLevel || '');
  setValue('finalZone', ev.finalZone || '');
  setValue('finalSubZone', ev.finalSubZone || '');
  setValue('overallResult', ev.overallResult || OverallResult.PENDING);
  setValue('overallNotes', ev.overallNotes || '');

  const mustMap: Record<string, { comment: string; rating: string }> = {};
  const shouldMap: Record<string, { comment: string; rating: string }> = {};
  ev.technicalRatings?.forEach((tr) => {
    const entry = { comment: tr.comment || '', rating: tr.rating?.toString() || '' };
    if (mustSubs.includes(tr.subcategory)) {
      mustMap[tr.subcategory] = entry;
    } else {
      shouldMap[tr.subcategory] = entry;
    }
  });
  setValue('technicalMust', mustMap);
  setValue('technicalShould', shouldMap);

  const softSkillMap: Record<string, { comment: string; rating: string }> = {};
  ev.softSkillRatings?.forEach((sr) => {
    softSkillMap[sr.subcategory] = { comment: sr.comment || '', rating: sr.rating?.toString() || '' };
  });
  setValue('softSkill', softSkillMap);

  const personalityMap: Record<string, { rating: string; reasoning: string }> = {};
  ev.personalityRatings?.forEach((pr) => {
    personalityMap[pr.category] = { rating: pr.rating?.toString() || '', reasoning: pr.reasoning || (pr as any).note || '' };
  });
  setValue('personality', personalityMap);
}

type ApplyDerivedEvaluationRatingsOptions = {
  derived: Record<string, number>;
  map: Map<string, string[]>;
  mustCat: string;
  shouldCat: string;
  mustSubs: readonly string[];
  shouldSubs: readonly string[];
  getValues: (name?: any) => any;
  setValue: (name: any, value: any) => void;
};

function applyDerivedEvaluationRatings({
  derived,
  map,
  mustCat,
  shouldCat,
  mustSubs,
  shouldSubs,
  getValues,
  setValue,
}: ApplyDerivedEvaluationRatingsOptions) {
  const fill = (field: string, keyPrefix: string, subcategories: readonly string[]) => {
    subcategories.forEach((subcategory) => {
      if (!getValues(field + '.' + subcategory + '.rating')) {
        const rating = derived[keyPrefix + '::' + subcategory];
        if (rating !== undefined) setValue(field + '.' + subcategory + '.rating' as any, String(rating));
      }
    });
  };
  fill('technicalMust', mustCat, mustSubs);
  fill('technicalShould', shouldCat, shouldSubs);
  fill('softSkill', 'SOFT_SKILL', map.get('SOFT_SKILL') ?? SOFT_SKILL_SUBCATEGORIES);
  fill('personality', 'PERSONALITY', map.get('PERSONALITY') ?? PERSONALITY_CATEGORIES);
}

export function SessionEvaluatePage() {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [categoryOrder, setCategoryOrder] = useState<Map<string, string[]>>(new Map());
  const [mustCatName, setMustCatName] = useState('');
  const [shouldCatName, setShouldCatName] = useState('');
  const [existingEval, setExistingEval] = useState<Evaluation | null>(null);
  const [saving, setSaving] = useState(false);
  const [levels, setLevels] = useState<Level[]>([]);
  const [aiSuggestion, setAiSuggestion] = useState<AiEvaluationSuggestion | null>(null);
  const [generatingEval, setGeneratingEval] = useState(false);
  const [showAiSuggestion, setShowAiSuggestion] = useState(false);

  const { register, handleSubmit, control, setValue, getValues, watch } = useForm<EvalFormData>({
    defaultValues: {
      hrEvaluation: {},
      technicalMust: {},
      technicalShould: {},
      softSkill: {},
      zoneExplanation: '',
      finalLevel: '',
      finalZone: '',
      finalSubZone: '',
      personality: {},
      overallResult: OverallResult.PENDING,
      overallNotes: '',
    },
  });

  // Tracks the current evaluation ID synchronously so onSubmit never reads a stale closure.
  // React state updates (setExistingEval) are async â€” this ref is updated immediately.
  const existingEvalIdRef = useRef<string | null>(null);

  const [editingComment, setEditingComment] = useState<string | null>(null);

  const derivedRatings = useMemo<Record<string, number>>(() => {
    if (!session) return {};
    return computeDerivedRatings(session);
  }, [session]);

  // Use DB-ordered subcategory lists for all categories
  const mustSubs = useMemo<readonly string[]>(
    () => categoryOrder.get(mustCatName) ?? [],
    [categoryOrder, mustCatName],
  );
  const shouldSubs = useMemo<readonly string[]>(
    () => categoryOrder.get(shouldCatName) ?? [],
    [categoryOrder, shouldCatName],
  );
  const softSubs = useMemo<readonly string[]>(
    () => categoryOrder.get('SOFT_SKILL') ?? SOFT_SKILL_SUBCATEGORIES,
    [categoryOrder],
  );
  const persSubs = useMemo<readonly string[]>(
    () => categoryOrder.get('PERSONALITY') ?? PERSONALITY_CATEGORIES,
    [categoryOrder],
  );

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [cats, subs, lvls] = await Promise.all([
          apiClient.get<EvaluationCategory[]>('/categories'),
          apiClient.get<EvaluationSubcategory[]>('/sub-categories'),
          apiClient.get<PaginatedResponse<Level>>('/levels', { limit: 100 }),
        ]);
        setLevels(lvls.data);

        const {
          map,
          mustCat,
          shouldCat,
          mustSubs: localMustSubs,
          shouldSubs: localShouldSubs,
        } = buildEvaluationCategoryOrder(cats, subs);
        setCategoryOrder(map);
        setMustCatName(mustCat);
        setShouldCatName(shouldCat);

        const s = await apiClient.get<any>(`/sessions/${slug}`);
        setSession(s);

        try {
          const ev = await apiClient.get<Evaluation>(`/evaluations/by-session/${slug}`);
          setExistingEval(ev);
          existingEvalIdRef.current = ev.id;
          if (ev.aiEvaluationSuggestion) setAiSuggestion(ev.aiEvaluationSuggestion);
          if (ev.aiAnalysisStatus === 'analyzing') setGeneratingEval(true);
          if (ev) restoreEvaluationForm(ev, setValue, localMustSubs);
        } catch {
          // No existing evaluation
        }

        applyDerivedEvaluationRatings({
          derived: computeDerivedRatings(s),
          map,
          mustCat,
          shouldCat,
          mustSubs: localMustSubs,
          shouldSubs: localShouldSubs,
          getValues,
          setValue,
        });
      } catch (err) {
        console.error('Failed to load session:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [slug, setValue, getValues]);

  useEffect(() => {
    if (!slug) return;
    const socket = getSocket();
    joinSession(slug, 'interviewer');

    socket.on(WebSocketEvents.EVAL_SUMMARY_READY, (payload: { summary: string }) => {
      setExistingEval((prev) => prev ? { ...prev, aiSummary: payload.summary } : prev);
    });

    socket.on(WebSocketEvents.EVAL_ANALYZING, () => {
      setGeneratingEval(true);
    });

    socket.on(WebSocketEvents.EVAL_ANALYSIS_READY, (payload: { suggestion: AiEvaluationSuggestion }) => {
      setAiSuggestion(payload.suggestion);
      setGeneratingEval(false);
    });

    return () => {
      socket.off(WebSocketEvents.EVAL_SUMMARY_READY);
      socket.off(WebSocketEvents.EVAL_ANALYZING);
      socket.off(WebSocketEvents.EVAL_ANALYSIS_READY);
      disconnectSocket();
    };
  }, [slug]);

  const onSubmit = async (data: EvalFormData) => {
    try {
      setSaving(true);
      const payload = buildEvaluationPayload(data, slug, mustSubs, shouldSubs, softSubs, persSubs);

      const resolvedId = existingEval?.id ?? existingEvalIdRef.current;
      if (resolvedId) {
        await apiClient.put(`/evaluations/${resolvedId}`, payload);
      } else {
        const ev = await apiClient.post<Evaluation>('/evaluations', payload);
        setExistingEval(ev);
        existingEvalIdRef.current = ev.id;
      }
      toast({ title: 'Evaluation saved successfully' });
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateAiEvaluation = async () => {
    try {
      setGeneratingEval(true);
      let evalId = existingEval?.id;
      if (!evalId) {
        const payload = buildEvaluationPayload(getValues(), slug, mustSubs, shouldSubs, softSubs, persSubs);
        const ev = await apiClient.post<Evaluation>('/evaluations', payload);
        setExistingEval(ev);
        existingEvalIdRef.current = ev.id;
        evalId = ev.id;
      }
      const suggestion = await apiClient.post<AiEvaluationSuggestion>(
        `/evaluations/${evalId}/generate-ai-evaluation`,
      );
      setAiSuggestion(suggestion);
      applyAiEvaluationSuggestion(suggestion, setValue, softSubs, mustSubs, persSubs);
      toast({ title: 'AI analysis complete â€” suggestions applied' });
    } catch (err) {
      toast({ title: 'AI Error', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setGeneratingEval(false);
    }
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleExport = async () => {
    try {
      const blob = await apiClient.downloadBlob(`/export/${slug}`);
      triggerBlobDownload(blob, `evaluation-${slug}.xlsx`);
    } catch {
      toast({ title: 'Export failed', variant: 'destructive' });
    }
  };

  // Find AI suggestion for a given technical subcategory
  const getTechSuggestion = (subcategory: string) =>
    aiSuggestion?.technicalRatings.find((r) => r.subcategory === subcategory);

  // Find AI suggestion for a given personality category
  const getPersSuggestion = (category: string) =>
    aiSuggestion?.personalityRatings.find((r) => r.category === category);

  const getDerivedRating = (category: string, subcategory: string): number | undefined =>
    derivedRatings[`${category}::${subcategory}`];

  if (loading) return <div>Loading...</div>;
  if (!session) return <div>Session not found.</div>;

  return (
    <SessionEvaluationView
      session={session}
      slug={slug}
      levels={levels}
      mustSubs={mustSubs}
      shouldSubs={shouldSubs}
      softSubs={softSubs}
      persSubs={persSubs}
      mustCatName={mustCatName}
      shouldCatName={shouldCatName}
      existingEval={existingEval}
      saving={saving}
      aiSuggestion={aiSuggestion}
      generatingEval={generatingEval}
      showAiSuggestion={showAiSuggestion}
      setShowAiSuggestion={setShowAiSuggestion}
      derivedRatings={derivedRatings}
      editingComment={editingComment}
      setEditingComment={setEditingComment}
      register={register}
      handleSubmit={handleSubmit}
      control={control}
      setValue={setValue}
      watch={watch}
      onSubmit={onSubmit}
      onGenerateAiEvaluation={handleGenerateAiEvaluation}
      onExport={handleExport}
      getTechSuggestion={getTechSuggestion}
      getPersSuggestion={getPersSuggestion}
      getDerivedRating={getDerivedRating}
    />
  );
}

function SessionEvaluationView(props: any) {
  const hasAiSuggestion = props.aiSuggestion !== null;
  const showAiCol = hasAiSuggestion && props.showAiSuggestion;
  const techColCount = 4 + (Object.keys(props.derivedRatings).length > 0 ? 1 : 0) + (showAiCol ? 1 : 0);
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <EvaluationHeader {...props} />
      <form onSubmit={props.handleSubmit(props.onSubmit)} className="space-y-6">
        <TechnicalAssessment {...props} hasAiSuggestion={hasAiSuggestion} hasDerivedData={Object.keys(props.derivedRatings).length > 0} showAiCol={showAiCol} techColCount={techColCount} />
        <PersonalityAssessment {...props} hasAiSuggestion={hasAiSuggestion} hasDerivedData={Object.keys(props.derivedRatings).length > 0} showAiCol={showAiCol} />
        <FinalEvaluationCard {...props} />
        <OverallResultCard {...props} />
      </form>
    </div>
  );
}

function EvaluationHeader({ session, slug, saving, generatingEval, handleSubmit, onSubmit, onGenerateAiEvaluation, onExport }: any) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <Link to={'/sessions/' + slug} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"><ArrowLeft className="h-4 w-4" />Back to session</Link>
        <h1 className="text-3xl font-bold">BM04 Evaluation Form</h1>
        <p className="text-muted-foreground">{session.candidate?.name} - {session.templatePosition}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={onGenerateAiEvaluation} disabled={generatingEval}>{generatingEval ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing...</> : <><Sparkles className="h-4 w-4 mr-2" />Analyze with AI</>}</Button>
        <Button onClick={handleSubmit(onSubmit)} disabled={saving}>{saving ? 'Saving...' : 'Save Evaluation'}</Button>
        <Button variant="outline" onClick={onExport}><Download className="h-4 w-4 mr-2" />Export</Button>
      </div>
    </div>
  );
}

type AssessmentRatingRowProps = {
  rowNumber: number;
  subcategory: string;
  fieldPrefix: string;
  commentField: string;
  editKey: string;
  suggestion?: AiEvaluationSuggestion['technicalRatings'][number];
  derivedRating?: number;
  hasDerivedData: boolean;
  showAiCol: boolean;
  labels: Record<number, string>;
  editingComment: string | null;
  setEditingComment: (value: string | null) => void;
  register: UseFormRegister<EvalFormData>;
  control: Control<EvalFormData>;
  setValue: UseFormSetValue<EvalFormData>;
  watch: UseFormWatch<EvalFormData>;
};

function AssessmentRatingRow({
  rowNumber,
  subcategory,
  fieldPrefix,
  commentField,
  editKey,
  suggestion,
  derivedRating,
  hasDerivedData,
  showAiCol,
  labels,
  editingComment,
  setEditingComment,
  register,
  control,
  setValue,
  watch,
}: AssessmentRatingRowProps) {
  const ratingField = `${fieldPrefix}.${subcategory}.rating`;
  const commentValue = watch(commentField as any) || '';

  return (
    <TableRow key={subcategory}>
      <TableCell className="text-xs text-muted-foreground text-center">{rowNumber}</TableCell>
      <TableCell className="font-medium text-sm">{subcategory}</TableCell>
      <TableCell>
        {editingComment === editKey ? (
          <Textarea
            className="min-h-[56px] text-sm w-full"
            {...register(commentField as any)}
            placeholder="Add comment..."
            autoFocus
            onBlur={() => setEditingComment(null)}
          />
        ) : (
          <button
            type="button"
            className="flex w-full items-start gap-1 border-0 bg-transparent p-0 text-left cursor-pointer group min-h-[36px]"
            aria-label={`Edit comment for ${subcategory}`}
            onClick={() => setEditingComment(editKey)}
          >
            <span className="text-sm flex-1 whitespace-pre-wrap">{commentValue || <span className="text-muted-foreground">Add comment...</span>}</span>
            <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 mt-0.5" />
          </button>
        )}
      </TableCell>
      <TableCell>
        <Controller
          name={ratingField as any}
          control={control}
          render={({ field }) => <RatingButtons value={field.value} onChange={field.onChange} />}
        />
      </TableCell>
      {hasDerivedData && (
        <TableCell>
          {derivedRating !== undefined ? (
            <div className="flex items-center gap-2">
              <span className={`inline-flex w-6 h-6 items-center justify-center rounded border-2 text-xs font-bold ${RATING_ACTIVE_CLASSES[derivedRating]}`}>
                {derivedRating}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={() => setValue(ratingField as any, String(derivedRating))}
              >
                {labels[derivedRating]}
              </Button>
            </div>
          ) : <span className="text-xs text-muted-foreground">â€”</span>}
        </TableCell>
      )}
      {showAiCol && (
        <TableCell>
          {suggestion ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`inline-flex w-6 h-6 items-center justify-center rounded border-2 text-xs font-bold ${RATING_ACTIVE_CLASSES[suggestion.suggestedRating]}`}>
                  {suggestion.suggestedRating}
                </span>
                <p className="text-xs text-muted-foreground leading-snug line-clamp-2 flex-1" title={suggestion.reasoning}>
                  {suggestion.reasoning}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 shrink-0"
                  title="Apply suggestion"
                  onClick={() => {
                    setValue(ratingField as any, suggestion.suggestedRating.toString());
                    setValue(commentField as any, suggestion.reasoning);
                  }}
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : <span className="text-xs text-muted-foreground">â€”</span>}
        </TableCell>
      )}
    </TableRow>
  );
}

function TechnicalAssessment(props: any) {
  const {
    mustSubs,
    shouldSubs,
    softSubs,
    mustCatName,
    shouldCatName,
    hasAiSuggestion,
    showAiSuggestion,
    setShowAiSuggestion,
    techColCount,
    hasDerivedData,
    showAiCol,
    getTechSuggestion,
    getDerivedRating,
    editingComment,
    setEditingComment,
    register,
    control,
    setValue,
    watch,
  } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
            Technical &amp; Soft Skills Assessment
          </span>
          {hasAiSuggestion && (
            <label className="flex items-center gap-2 text-sm font-normal cursor-pointer">
              <Checkbox
                checked={showAiSuggestion}
                onCheckedChange={(checked) => setShowAiSuggestion(!!checked)}
              />
              Show AI Suggestion
            </label>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead className="w-44">Criteria</TableHead>
              <TableHead className="min-w-[220px]">Comments</TableHead>
              <TableHead className="w-36">Rating (1-5)</TableHead>
              {hasDerivedData && <TableHead className="w-32">From Interview</TableHead>}
              {showAiCol && <TableHead className="w-64">AI Suggestion</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableCell colSpan={techColCount} className="py-1.5 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                MUST â€” Required
              </TableCell>
            </TableRow>
            {mustSubs.map((sub: string, idx: number) => (
              <AssessmentRatingRow
                key={sub}
                rowNumber={idx + 1}
                subcategory={sub}
                fieldPrefix="technicalMust"
                commentField={"technicalMust." + sub + ".comment"}
                editKey={"must:" + sub}
                suggestion={getTechSuggestion(sub)}
                derivedRating={getDerivedRating(mustCatName, sub)}
                hasDerivedData={hasDerivedData}
                showAiCol={showAiCol}
                labels={TECHNICAL_RATING_LABELS}
                editingComment={editingComment}
                setEditingComment={setEditingComment}
                register={register}
                control={control}
                setValue={setValue}
                watch={watch}
              />
            ))}

            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableCell colSpan={techColCount} className="py-1.5 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                SHOULD â€” Nice to have
              </TableCell>
            </TableRow>
            {shouldSubs.map((sub: string, idx: number) => (
              <AssessmentRatingRow
                key={sub}
                rowNumber={mustSubs.length + idx + 1}
                subcategory={sub}
                fieldPrefix="technicalShould"
                commentField={"technicalShould." + sub + ".comment"}
                editKey={"should:" + sub}
                suggestion={getTechSuggestion(sub)}
                derivedRating={getDerivedRating(shouldCatName, sub)}
                hasDerivedData={hasDerivedData}
                showAiCol={showAiCol}
                labels={TECHNICAL_RATING_LABELS}
                editingComment={editingComment}
                setEditingComment={setEditingComment}
                register={register}
                control={control}
                setValue={setValue}
                watch={watch}
              />
            ))}

            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableCell colSpan={techColCount} className="py-1.5 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                SOFT SKILLS
              </TableCell>
            </TableRow>
            {softSubs.map((sub: string, idx: number) => (
              <AssessmentRatingRow
                key={sub}
                rowNumber={mustSubs.length + shouldSubs.length + idx + 1}
                subcategory={sub}
                fieldPrefix="softSkill"
                commentField={"softSkill." + sub + ".comment"}
                editKey={"soft:" + sub}
                suggestion={getTechSuggestion(sub)}
                derivedRating={getDerivedRating("SOFT_SKILL", sub)}
                hasDerivedData={hasDerivedData}
                showAiCol={showAiCol}
                labels={TECHNICAL_RATING_LABELS}
                editingComment={editingComment}
                setEditingComment={setEditingComment}
                register={register}
                control={control}
                setValue={setValue}
                watch={watch}
              />
            ))}
          </TableBody>
        </Table>
        <div className="px-4 py-2 border-t text-xs text-muted-foreground">
          <span className="font-medium">Rating scale:</span>{' '}
          {[1, 2, 3, 4, 5].map((r) => `${r} = ${TECHNICAL_RATING_LABELS[r]}`).join(' · ')}
        </div>
      </CardContent>
    </Card>
  );
}

function PersonalityAssessment(props: any) {
  const {
    persSubs, hasAiSuggestion, showAiSuggestion, setShowAiSuggestion, hasDerivedData, showAiCol, getPersSuggestion, getDerivedRating,
    editingComment, setEditingComment, register, control, setValue, watch,
  } = props;
  return (
    <>
        {/* Personality â€” also merged with AI suggestions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Personality Assessment</span>
              {hasAiSuggestion && (
                <label className="flex items-center gap-2 text-sm font-normal cursor-pointer">
                  <Checkbox
                    checked={showAiSuggestion}
                    onCheckedChange={(checked) => setShowAiSuggestion(!!checked)}
                  />
                  Show AI Suggestion
                </label>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-48">Category</TableHead>
                  <TableHead className="min-w-[220px]">Comments</TableHead>
                  <TableHead className="w-36">Rating (1-5)</TableHead>
                  {hasDerivedData && <TableHead className="w-32">From Interview</TableHead>}
                  {showAiCol && <TableHead className="w-64">AI Suggestion</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {persSubs.map((cat: string) => {
                  const suggestion = getPersSuggestion(cat);
                  const noteVal = watch(`personality.${cat}.reasoning` as any) || '';
                  const derivedR = getDerivedRating('PERSONALITY', cat);
                  return (
                    <TableRow key={cat}>
                      <TableCell className="font-medium text-sm">{cat}</TableCell>
                      <TableCell>
                        {editingComment === `pers:${cat}` ? (
                          <Textarea
                            className="min-h-[56px] text-sm w-full"
                            {...register(`personality.${cat}.reasoning`)}
                            placeholder="Add comment..."
                            autoFocus
                            onBlur={() => setEditingComment(null)}
                          />
                        ) : (
                          <button
                            type="button"
                            className="flex w-full items-start gap-1 border-0 bg-transparent p-0 text-left cursor-pointer group min-h-[36px]"
                            aria-label={`Edit comment for ${cat}`}
                            onClick={() => setEditingComment(`pers:${cat}`)}
                          >
                            <span className="text-sm flex-1 whitespace-pre-wrap">{noteVal || <span className="text-muted-foreground">Add comment...</span>}</span>
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 mt-0.5" />
                          </button>
                        )}
                      </TableCell>
                      <TableCell>
                        <Controller
                          name={`personality.${cat}.rating`}
                          control={control}
                          render={({ field }) => (
                            <RatingButtons value={field.value} onChange={field.onChange} />
                          )}
                        />
                      </TableCell>
                      {hasDerivedData && (
                        <TableCell>
                          {derivedR !== undefined ? (
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex w-6 h-6 items-center justify-center rounded border-2 text-xs font-bold ${RATING_ACTIVE_CLASSES[derivedR]}`}>
                                {derivedR}
                              </span>
                              <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs"
                                onClick={() => setValue(`personality.${cat}.rating` as any, String(derivedR))}>
                                {PERSONALITY_RATING_LABELS[derivedR]}
                              </Button>
                            </div>
                          ) : <span className="text-xs text-muted-foreground">â€”</span>}
                        </TableCell>
                      )}
                      {showAiCol && (
                        <TableCell>
                          {suggestion ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-flex w-6 h-6 items-center justify-center rounded border-2 text-xs font-bold ${RATING_ACTIVE_CLASSES[suggestion.suggestedRating]}`}
                                >
                                  {suggestion.suggestedRating}
                                </span>
                                <p className="text-xs text-muted-foreground leading-snug line-clamp-2 flex-1" title={suggestion.reasoning}>
                                  {suggestion.reasoning}
                                </p>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 shrink-0"
                                  title="Apply suggestion"
                                  onClick={() => {
                                    setValue(`personality.${cat}.rating` as any, suggestion.suggestedRating.toString());
                                    setValue(`personality.${cat}.reasoning` as any, suggestion.reasoning);
                                  }}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">â€”</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {/* Personality rating scale legend â€” different from technical scale */}
            <div className="px-4 py-2 border-t text-xs text-muted-foreground">
              <span className="font-medium">Personality rating scale:</span>{' '}
              {[1, 2, 3, 4, 5].map((r) => `${r} = ${PERSONALITY_RATING_LABELS[r]}`).join(' Â· ')}
            </div>
          </CardContent>
        </Card>


    </>
  );
}

function FinalEvaluationCard(props: any) {
  const {
    levels, aiSuggestion, control, setValue, editingComment, setEditingComment, register, watch,
  } = props;
  return (
    <>
        {/* Final Evaluation Result */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-muted-foreground" />
                Final Evaluation Result
              </span>
              {aiSuggestion && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (aiSuggestion.finalLevel) setValue('finalLevel', aiSuggestion.finalLevel);
                    if (aiSuggestion.finalZone) setValue('finalZone', aiSuggestion.finalZone);
                    if (aiSuggestion.finalSubZone) setValue('finalSubZone', aiSuggestion.finalSubZone);
                    if (aiSuggestion.overallNotes) setValue('zoneExplanation', aiSuggestion.overallNotes);
                  }}
                >
                  Apply AI
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Level */}
            <div className="space-y-2">
              <Label>Level</Label>
              <div className="flex items-center gap-3">
                <Controller
                  name="finalLevel"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select level..." />
                      </SelectTrigger>
                      <SelectContent>
                        {levels.map((l: Level) => (
                          <SelectItem key={l.id} value={l.name}>{l.displayName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {aiSuggestion?.finalLevel && (
                  <span className="text-xs text-muted-foreground shrink-0">AI: <span className="font-medium text-foreground">{aiSuggestion.finalLevel}</span></span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Zone */}
              <div className="space-y-2">
                <Label>Zone</Label>
                <div className="flex items-center gap-3">
                  <Controller
                    name="finalZone"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select zone..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 â€” Below expectations</SelectItem>
                          <SelectItem value="2">2 â€” Meets expectations</SelectItem>
                          <SelectItem value="3">3 â€” Exceeds expectations</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {aiSuggestion?.finalZone && (
                    <span className="text-xs text-muted-foreground shrink-0">AI: <span className="font-medium text-foreground">{aiSuggestion.finalZone}</span></span>
                  )}
                </div>
              </div>

              {/* Sub-zone */}
              <div className="space-y-2">
                <Label>Sub-zone</Label>
                <div className="flex items-center gap-3">
                  <Controller
                    name="finalSubZone"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select sub-zone..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Average">Average</SelectItem>
                          <SelectItem value="Good">Good</SelectItem>
                          <SelectItem value="Excellent">Excellent</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {aiSuggestion?.finalSubZone && (
                    <span className="text-xs text-muted-foreground shrink-0">AI: <span className="font-medium text-foreground">{aiSuggestion.finalSubZone}</span></span>
                  )}
                </div>
              </div>
            </div>

            {/* Explanation */}
            <div className="space-y-2">
              <Label>Explanation</Label>
              {editingComment === 'explanation' ? (
                <Textarea
                  {...register('zoneExplanation')}
                  placeholder="Explain evaluation result..."
                  rows={3}
                  className="w-full"
                  autoFocus
                  onBlur={() => setEditingComment(null)}
                />
              ) : (
                <button
                  type="button"
                  className="flex w-full items-start gap-1 text-left cursor-pointer group min-h-[36px] rounded-md border px-3 py-2"
                  aria-label="Edit explanation"
                  onClick={() => setEditingComment('explanation')}
                >
                  <span className="text-sm flex-1 whitespace-pre-wrap">
                    {watch('zoneExplanation') || <span className="text-muted-foreground">Explain evaluation result...</span>}
                  </span>
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 mt-0.5" />
                </button>
              )}
            </div>
          </CardContent>
        </Card>


    </>
  );
}

function OverallResultCard(props: any) {
  const {
    control, editingComment, setEditingComment, register, watch,
  } = props;
  return (
    <>
        {/* Overall Result */}
        <Card>
          <CardHeader>
            <CardTitle>Overall Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Result</Label>
              <Controller
                name="overallResult"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(OverallResult).map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>Overall Notes</Label>
              {editingComment === 'overallNotes' ? (
                <Textarea
                  {...register('overallNotes')}
                  placeholder="Final notes and summary..."
                  rows={4}
                  autoFocus
                  onBlur={() => setEditingComment(null)}
                />
              ) : (
                <button
                  type="button"
                  className="flex w-full items-start gap-1 text-left cursor-pointer group min-h-[36px] rounded-md border px-3 py-2"
                  aria-label="Edit overall notes"
                  onClick={() => setEditingComment('overallNotes')}
                >
                  <span className="text-sm flex-1 whitespace-pre-wrap">
                    {watch('overallNotes') || <span className="text-muted-foreground">Final notes and summary...</span>}
                  </span>
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 mt-0.5" />
                </button>
              )}
            </div>
          </CardContent>
        </Card>


    </>
  );
}

