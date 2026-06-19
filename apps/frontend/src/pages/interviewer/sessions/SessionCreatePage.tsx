import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { Copy, Check } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { QuestionBankTree } from '@/components/interview/QuestionBankTree';
import type { Candidate, Question, PaginatedResponse } from '@interview-assistant/shared';
import { MeetingPlatform, UserRole } from '@interview-assistant/shared';
import { useAuthContext } from '@/lib/auth-context';

interface Position { id: string; name: string }
interface Level { id: string; name: string; displayName: string; orderIndex: number }
interface Category { id: string; name: string; displayName: string; positions?: string[] | null }
export function SessionCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthContext();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const [candidateId, setCandidateId] = useState(searchParams.get('candidateId') ?? '');
  const [targetLevel, setTargetLevel] = useState('');
  const [templatePosition, setTemplatePosition] = useState(''); // position name (for local question filtering)
  const [positionId, setPositionId] = useState(''); // position UUID (sent to API)
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [autoSelectHint, setAutoSelectHint] = useState('');

  const [sequentialMode, setSequentialMode] = useState(true);
  const [scheduledAt, setScheduledAt] = useState('');
  const [meetingPlatform, setMeetingPlatform] = useState<MeetingPlatform | ''>('');
  const [meetingLink, setMeetingLink] = useState('');
  const [createdToken, setCreatedToken] = useState('');
  const [createdSlug, setCreatedSlug] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([
      apiClient.get<PaginatedResponse<Candidate>>('/candidates', { limit: 1000 }),
      apiClient.get<PaginatedResponse<Question>>('/questions', { limit: 1000 }),
      apiClient.get<PaginatedResponse<Position>>('/positions', { limit: 1000 }).catch(() => ({ data: [] as Position[] } as PaginatedResponse<Position>)),
      apiClient.get<PaginatedResponse<Level>>('/levels', { limit: 100 }).catch(() => ({ data: [] as Level[] } as PaginatedResponse<Level>)),
      apiClient.get<Category[]>('/categories').catch(() => [] as Category[]),
    ])
      .then(([c, q, p, lvls, cats]) => {
        setCandidates(c.data);
        setQuestions(q.data);
        const pos = p.data;
        setPositions(pos);
        if (pos.length > 0) {
          setTemplatePosition(pos[0].name);
          setPositionId(pos[0].id);
        }
        setLevels(lvls.data);
        setCategories(Array.isArray(cats) ? cats : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Filter questions to only those belonging to the selected position's categories
  // (null/empty positions = default, shown for all positions)
  const visibleQuestions = useMemo(() => {
    if (!categories.length) return questions;
    const relevantCategoryNames = new Set(
      categories
        .filter((c) => !c.positions?.length || c.positions.includes(templatePosition))
        .map((c) => c.name),
    );
    return questions.filter((q) => relevantCategoryNames.has(q.category));
  }, [questions, categories, templatePosition]);

  // Auto-select matching questions when level changes
  const handleTargetLevelChange = (level: string) => {
    setTargetLevel(level);
    if (!level) return;
    const matched = visibleQuestions.filter((q: any) => Array.isArray(q.targetLevels) && q.targetLevels.includes(level));
    if (matched.length > 0) {
      setSelectedQuestions(new Set(matched.map((q: any) => q.id)));
      setAutoSelectHint(`Auto-selected ${matched.length} question(s) for level "${level}"`);
    } else {
      setAutoSelectHint('');
    }
  };

  const toggleQuestion = (id: string) => {
    setAutoSelectHint('');
    setSelectedQuestions((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkToggleCategory = (questionIds: string[]) => {
    setAutoSelectHint('');
    setSelectedQuestions((prev) => {
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

  const handleBulkToggleSubcategory = (questionIds: string[]) => {
    setAutoSelectHint('');
    setSelectedQuestions((prev) => {
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

  const isHR = user?.role === UserRole.HR;

  const handleSubmit = async () => {
    if (!candidateId) {
      toast({ title: 'Please select a candidate', variant: 'destructive' });
      return;
    }
    try {
      setSubmitting(true);
      const session = await apiClient.post<any>('/sessions', {
        candidateId,
        targetLevel,
        // Send positionId (UUID) so the backend resolves the canonical name — avoids passing brittle strings over the wire.
        // Fall back to templatePosition string only when no position list was loaded (e.g. API unavailable).
        ...(positionId ? { positionId } : { templatePosition }),
        ...(isHR ? {} : { questionIds: Array.from(selectedQuestions) }),
        sequentialMode,
        ...(scheduledAt && { scheduledAt }),
        ...(meetingPlatform && { meetingPlatform }),
        ...(meetingLink && { meetingLink }),
      });
      setCreatedToken(session.accessToken);
      setCreatedSlug(session.slug);
      toast({ title: 'Session created successfully' });
    } catch (err) {
      toast({ title: 'Failed to create session', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const accessLink = createdToken ? `${window.location.origin}/session/${createdToken}` : '';
  const handleCopy = () => {
    navigator.clipboard.writeText(accessLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <div>Loading...</div>;

  if (createdToken) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Session Created</h1>
        <Card>
          <CardHeader><CardTitle>Access Link</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Share this link with the candidate:</p>
            <div className="flex items-center gap-2">
              <Input value={accessLink} readOnly />
              <Button variant="outline" size="icon" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex gap-4 flex-wrap">
              <Button onClick={() => navigate(`/sessions/${createdSlug}/live`)}>Go Live</Button>
              <Button variant="outline" onClick={() => navigate(`/sessions/${createdSlug}/survey`)}>Start Survey</Button>
              <Button variant="outline" onClick={() => navigate(`/sessions/${createdSlug}`)}>View Detail</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">New Interview Session</h1>

      <Card>
        <CardHeader><CardTitle>Session Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Candidate *</Label>
            <Select value={candidateId} onValueChange={setCandidateId}>
              <SelectTrigger><SelectValue placeholder="Select a candidate" /></SelectTrigger>
              <SelectContent>
                {candidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name} - {c.position}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Sequential Mode</Label>
              <p className="text-xs text-muted-foreground">Show questions one at a time — candidate must submit before seeing the next</p>
            </div>
            <Switch checked={sequentialMode} onCheckedChange={setSequentialMode} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Target Level *</Label>
              <Select value={targetLevel} onValueChange={handleTargetLevelChange}>
                <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
                <SelectContent>
                  {levels.map((l) => (
                    <SelectItem key={l.id} value={l.name}>{l.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Position</Label>
              {positions.length > 0 ? (
                <Select
                  value={positionId}
                  onValueChange={(id) => {
                    const pos = positions.find((p) => p.id === id);
                    if (pos) { setPositionId(pos.id); setTemplatePosition(pos.name); }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select position" /></SelectTrigger>
                  <SelectContent>
                    {positions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={templatePosition} onChange={(e) => setTemplatePosition(e.target.value)} placeholder="Backend Developer" />
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Interview Date & Time</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              placeholder="Select date and time"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Meeting Platform</Label>
              <Select value={meetingPlatform} onValueChange={(value) => setMeetingPlatform(value as MeetingPlatform)}>
                <SelectTrigger><SelectValue placeholder="Select platform" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={MeetingPlatform.MS_TEAMS}>MS Teams</SelectItem>
                  <SelectItem value={MeetingPlatform.GOOGLE_MEET}>Google Meet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Meeting Link</Label>
              <Input
                type="url"
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {!isHR && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle>Select Questions ({selectedQuestions.size} selected)</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Optional — you can also use the AI Survey flow after session creation</p>
                {autoSelectHint && (
                  <p className="text-xs text-blue-600 mt-1">{autoSelectHint}</p>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <Input
                  placeholder="Search questions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-56"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[500px] overflow-auto">
              <QuestionBankTree
                questions={visibleQuestions}
                existingQuestionIds={new Set()}
                selectedIds={selectedQuestions}
                onToggle={toggleQuestion}
                searchQuery={searchQuery}
                onBulkToggleCategory={handleBulkToggleCategory}
                onBulkToggleSubcategory={handleBulkToggleSubcategory}
              />
            </div>
            <Button onClick={handleSubmit} disabled={submitting} className="w-full mt-4">
              {submitting ? 'Creating...' : 'Create Session'}
            </Button>
          </CardContent>
        </Card>
      )}

      {isHR && (
        <Button onClick={handleSubmit} disabled={submitting} className="w-full">
          {submitting ? 'Creating...' : 'Create Session'}
        </Button>
      )}
    </div>
  );
}
