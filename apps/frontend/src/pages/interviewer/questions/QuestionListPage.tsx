import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useAuthContext } from '@/lib/auth-context';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { SortableHeader, SortOrder } from '@/components/ui/sortable-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, Search, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import type { Question, QuestionOption, ArchitectureAnswer, PaginatedResponse } from '@interview-assistant/shared';
import { QuestionType, UserRole } from '@interview-assistant/shared';
import { ArchitectureEditor } from '@/components/interview/ArchitectureEditor';
import Editor from '@monaco-editor/react';

// ── API-driven master data ──────────────────────────────────────────────────

interface Category { id: string; name: string; displayName: string }
interface SubCategory { id: string; categoryId: string; name: string; competencyType?: string }
interface Level { id: string; name: string; displayName: string; orderIndex: number }

// ── Form state ──────────────────────────────────────────────────────────────

interface TestCaseEntry {
  input: string;
  expectedOutput: string;
  description?: string;
}

interface StarterCodeEntry {
  language: string;
  code: string;
}

interface NewQuestionForm {
  text: string;
  category: string;
  subcategory: string;
  competencyType: string;
  type: string;
  difficulty: number;
  targetLevels: string[];
  expectedAnswer: string;
  options: QuestionOption[];
  correctAnswers: string[];
  architectureTemplate: ArchitectureAnswer | null;
  testCases: TestCaseEntry[];
  hiddenTestCases: TestCaseEntry[];
  starterCode: StarterCodeEntry[];
  timeLimit: number | '';
  memoryLimit: number | '';
}

const emptyForm: NewQuestionForm = {
  text: '',
  category: '',
  subcategory: '',
  competencyType: '',
  type: QuestionType.OPEN_ENDED,
  difficulty: 1,
  targetLevels: [],
  expectedAnswer: '',
  options: [],
  correctAnswers: [],
  architectureTemplate: null,
  testCases: [],
  hiddenTestCases: [],
  starterCode: [],
  timeLimit: '',
  memoryLimit: '',
};

const STARTER_CODE_LANGUAGES = ['javascript', 'typescript', 'python', 'java', 'go'];

function hasOptions(type: string): boolean {
  return type === QuestionType.SINGLE_CHOICE || type === QuestionType.MULTIPLE_CHOICE;
}

// ── Page component ──────────────────────────────────────────────────────────

export function QuestionListPage() {
  const { user } = useAuthContext();
  const isAdmin = user?.role === UserRole.ADMIN;

  // Master data from DB
  const [categories, setCategories] = useState<Category[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [allSubsMap, setAllSubsMap] = useState<Map<string, string>>(new Map());

  // List-view filter state
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [subcategoryFilter, setSubcategoryFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [levelFilter, setLevelFilter] = useState<string[]>([]);
  const [filterSubs, setFilterSubs] = useState<SubCategory[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sortBy, setSortBy] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('ASC');

  // Debounce search
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  // Question list (paginated)
  const [result, setResult] = useState<PaginatedResponse<Question>>({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [form, setForm] = useState<NewQuestionForm>({ ...emptyForm });
  const [formSubs, setFormSubs] = useState<SubCategory[]>([]); // subs for the dialog
  const [hiddenExpanded, setHiddenExpanded] = useState(false);

  // Refs for starter code Monaco editors
  const starterEditorRefs = useRef<Record<number, any>>({});

  // ── Load master data once ─────────────────────────────────────────────────

  useEffect(() => {
    apiClient.get<Category[]>('/categories').then((cats) => {
      setCategories(cats);
      Promise.all(
        cats.map((cat) =>
          apiClient.get<SubCategory[]>(`/sub-categories?categoryId=${cat.id}`).catch(() => [] as SubCategory[]),
        ),
      ).then((results) => {
        const map = new Map<string, string>();
        results.flat().forEach((s) => { if (s.competencyType) map.set(s.name, s.competencyType); });
        setAllSubsMap(map);
      });
    }).catch(() => {});
    apiClient.get<PaginatedResponse<Level>>('/levels', { limit: 100 }).then((r) => setLevels(r.data)).catch(() => {});
  }, []);

  // ── Load questions ────────────────────────────────────────────────────────

  // Reset page when filters/sort change
  useEffect(() => { setPage(1); }, [debouncedSearch, categoryFilter, subcategoryFilter, typeFilter, levelFilter, sortBy, sortOrder]);

  const fetchQuestions = useCallback(() => {
    setLoading(true);
    apiClient
      .get<PaginatedResponse<Question>>('/questions', {
        page,
        limit,
        search: debouncedSearch || undefined,
        category: categoryFilter.length > 0 ? categoryFilter.join(',') : undefined,
        subcategory: subcategoryFilter.length > 0 ? subcategoryFilter.join(',') : undefined,
        type: typeFilter.length > 0 ? typeFilter.join(',') : undefined,
        targetLevel: levelFilter.length > 0 ? levelFilter.join(',') : undefined,
        sortBy: sortBy || undefined,
        sortOrder: sortBy ? sortOrder : undefined,
      })
      .then((data) => setResult(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, limit, debouncedSearch, categoryFilter, subcategoryFilter, typeFilter, levelFilter, sortBy, sortOrder]);

  useEffect(() => { fetchQuestions(); }, [fetchQuestions]);

  // ── Filter subcategories for list view ────────────────────────────────────

  useEffect(() => {
    if (categoryFilter.length === 0) {
      setFilterSubs([]);
      setSubcategoryFilter([]);
      return;
    }
    const selectedCats = categories.filter((c) => categoryFilter.includes(c.name));
    if (selectedCats.length === 0) return;
    setSubcategoryFilter([]);
    Promise.all(
      selectedCats.map((cat) =>
        apiClient.get<SubCategory[]>(`/sub-categories?categoryId=${cat.id}`).catch(() => [] as SubCategory[]),
      ),
    ).then((results) => {
      const seen = new Set<string>();
      const unique = results.flat().filter((s) => { if (seen.has(s.name)) return false; seen.add(s.name); return true; });
      setFilterSubs(unique);
    });
  }, [categoryFilter, categories]);

  // ── Load subcategories for dialog ─────────────────────────────────────────

  const loadFormSubs = useCallback(async (categoryName: string) => {
    const cat = categories.find((c) => c.name === categoryName);
    if (!cat) { setFormSubs([]); return; }
    const subs = await apiClient.get<SubCategory[]>(`/sub-categories?categoryId=${cat.id}`).catch(() => []);
    setFormSubs(Array.isArray(subs) ? subs : []);
  }, [categories]);

  // ── Dialog helpers ────────────────────────────────────────────────────────

  const resetFormAndClose = () => {
    setForm({ ...emptyForm });
    setEditingQuestion(null);
    setFormSubs([]);
    setHiddenExpanded(false);
    starterEditorRefs.current = {};
    setDialogOpen(false);
  };

  const openCreateDialog = () => {
    setEditingQuestion(null);
    const defaultCat = categories[0]?.name ?? '';
    setForm({ ...emptyForm, category: defaultCat });
    if (defaultCat) loadFormSubs(defaultCat);
    setHiddenExpanded(false);
    starterEditorRefs.current = {};
    setDialogOpen(true);
  };

  const openEditDialog = (q: Question) => {
    setEditingQuestion(q);
    setForm({
      text: q.text,
      category: q.category,
      subcategory: q.subcategory || '',
      competencyType: q.competencyType || '',
      type: q.type,
      difficulty: q.difficulty,
      targetLevels: q.targetLevels || [],
      expectedAnswer: q.expectedAnswer || '',
      options: q.options || [],
      correctAnswers: q.correctAnswers || [],
      architectureTemplate: (q as any).architectureTemplate ?? null,
      testCases: (q as any).testCases || [],
      hiddenTestCases: (q as any).hiddenTestCases || [],
      starterCode: (q as any).starterCode || [],
      timeLimit: (q as any).timeLimit ?? '',
      memoryLimit: (q as any).memoryLimit ?? '',
    });
    loadFormSubs(q.category);
    setHiddenExpanded(false);
    starterEditorRefs.current = {};
    setDialogOpen(true);
  };

  // When category changes inside the dialog, reload subs
  const handleDialogCategoryChange = (newCat: string) => {
    setForm((f) => ({ ...f, category: newCat, subcategory: '' }));
    loadFormSubs(newCat);
  };

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const buildPayload = () => ({
    text: form.text,
    category: form.category,
    subcategory: form.subcategory,
    ...(form.competencyType ? { competencyType: form.competencyType } : {}),
    type: form.type,
    difficulty: Number(form.difficulty),
    targetLevels: form.targetLevels,
    expectedAnswer: form.expectedAnswer,
    ...(hasOptions(form.type) ? { options: form.options, correctAnswers: form.correctAnswers } : {}),
    ...(form.type === QuestionType.ARCHITECTURE ? { architectureTemplate: form.architectureTemplate } : {}),
    ...(form.type === QuestionType.CODING ? {
      testCases: form.testCases,
      hiddenTestCases: form.hiddenTestCases,
      starterCode: form.starterCode,
      ...(form.timeLimit !== '' ? { timeLimit: Number(form.timeLimit) } : {}),
      ...(form.memoryLimit !== '' ? { memoryLimit: Number(form.memoryLimit) } : {}),
    } : {}),
  });

  const handleCreate = async () => {
    try {
      await apiClient.post('/questions', buildPayload());
      toast({ title: 'Question created' });
      resetFormAndClose();
      fetchQuestions();
    } catch (err) {
      toast({ title: 'Create failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    }
  };

  const handleUpdate = async () => {
    if (!editingQuestion) return;
    try {
      await apiClient.patch(`/questions/${editingQuestion.id}`, buildPayload());
      toast({ title: 'Question updated' });
      resetFormAndClose();
      fetchQuestions();
    } catch (err) {
      toast({ title: 'Update failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    }
  };

  const handleDelete = async (qId: string) => {
    try {
      await apiClient.delete(`/questions/${qId}`);
      toast({ title: 'Question deleted' });
      fetchQuestions();
    } catch {
      toast({ title: 'Delete failed', variant: 'destructive' });
    }
  };

  const handleReset = async (qId: string) => {
    try {
      await apiClient.post(`/questions/${qId}/reset`);
      toast({ title: 'Question reset to default' });
      fetchQuestions();
    } catch {
      toast({ title: 'Reset failed', variant: 'destructive' });
    }
  };

  // ── Options management ────────────────────────────────────────────────────

  const addOption = () => {
    const nextIdx = form.options.length + 1;
    setForm({ ...form, options: [...form.options, { id: `opt_${nextIdx}`, text: '' }] });
  };

  const removeOption = (optId: string) => {
    setForm({
      ...form,
      options: form.options.filter((o) => o.id !== optId),
      correctAnswers: form.correctAnswers.filter((id) => id !== optId),
    });
  };

  const updateOptionText = (optId: string, text: string) => {
    setForm({ ...form, options: form.options.map((o) => (o.id === optId ? { ...o, text } : o)) });
  };

  const toggleCorrectAnswer = (optId: string) => {
    if (form.type === QuestionType.SINGLE_CHOICE) {
      setForm({ ...form, correctAnswers: form.correctAnswers.includes(optId) ? [] : [optId] });
    } else {
      const current = [...form.correctAnswers];
      const idx = current.indexOf(optId);
      if (idx >= 0) current.splice(idx, 1); else current.push(optId);
      setForm({ ...form, correctAnswers: current });
    }
  };

  const toggleLevel = (levelName: string) => {
    setForm((f) => {
      const has = f.targetLevels.includes(levelName);
      return { ...f, targetLevels: has ? f.targetLevels.filter((l) => l !== levelName) : [...f.targetLevels, levelName] };
    });
  };

  // ── Coding helpers ────────────────────────────────────────────────────────

  const addTestCase = (hidden = false) => {
    const entry: TestCaseEntry = { input: '', expectedOutput: '', description: '' };
    if (hidden) {
      setForm((f) => ({ ...f, hiddenTestCases: [...f.hiddenTestCases, entry] }));
    } else {
      setForm((f) => ({ ...f, testCases: [...f.testCases, entry] }));
    }
  };

  const updateTestCase = (hidden: boolean, idx: number, field: keyof TestCaseEntry, value: string) => {
    if (hidden) {
      setForm((f) => {
        const updated = f.hiddenTestCases.map((tc, i) => i === idx ? { ...tc, [field]: value } : tc);
        return { ...f, hiddenTestCases: updated };
      });
    } else {
      setForm((f) => {
        const updated = f.testCases.map((tc, i) => i === idx ? { ...tc, [field]: value } : tc);
        return { ...f, testCases: updated };
      });
    }
  };

  const removeTestCase = (hidden: boolean, idx: number) => {
    if (hidden) {
      setForm((f) => ({ ...f, hiddenTestCases: f.hiddenTestCases.filter((_, i) => i !== idx) }));
    } else {
      setForm((f) => ({ ...f, testCases: f.testCases.filter((_, i) => i !== idx) }));
    }
  };

  const addStarterCode = () => {
    const used = new Set(form.starterCode.map((s) => s.language));
    const next = STARTER_CODE_LANGUAGES.find((l) => !used.has(l)) ?? 'javascript';
    setForm((f) => ({ ...f, starterCode: [...f.starterCode, { language: next, code: '' }] }));
  };

  const updateStarterLanguage = (idx: number, language: string) => {
    setForm((f) => ({
      ...f,
      starterCode: f.starterCode.map((s, i) => i === idx ? { ...s, language } : s),
    }));
  };

  const updateStarterCode = (idx: number, code: string) => {
    setForm((f) => ({
      ...f,
      starterCode: f.starterCode.map((s, i) => i === idx ? { ...s, code } : s),
    }));
  };

  const removeStarterCode = (idx: number) => {
    delete starterEditorRefs.current[idx];
    setForm((f) => ({ ...f, starterCode: f.starterCode.filter((_, i) => i !== idx) }));
  };

  // ── Filtered list ─────────────────────────────────────────────────────────

  const handleSort = (field: string, order: SortOrder) => { setSortBy(field); setSortOrder(order); };

  // ── Render ────────────────────────────────────────────────────────────────

  // Display name helper
  const catDisplayName = (name: string) => categories.find((c) => c.name === name)?.displayName ?? name;

  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl sm:text-3xl font-bold">Questions</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="sm:hidden" onClick={() => setFiltersOpen((v) => !v)}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </Button>
          {isAdmin && (
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Create Question</span>
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className={filtersOpen ? 'flex flex-col gap-3' : 'hidden sm:flex sm:items-center sm:gap-3 sm:flex-wrap'}>
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search question text…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 w-full sm:w-64"
          />
        </div>
        <MultiSelect
          options={categories.map((c) => ({ value: c.name, label: c.displayName }))}
          selected={categoryFilter}
          onChange={setCategoryFilter}
          placeholder="All Categories"
          className="w-full sm:w-48"
        />
        {categoryFilter.length > 0 && filterSubs.length > 0 && (
          <MultiSelect
            options={filterSubs.map((s) => ({ value: s.name, label: s.name }))}
            selected={subcategoryFilter}
            onChange={setSubcategoryFilter}
            placeholder="All Sub-categories"
            className="w-full sm:w-48"
          />
        )}
        <MultiSelect
          options={[
            { value: 'OPEN_ENDED', label: 'Open Ended' },
            { value: 'SINGLE_CHOICE', label: 'Single Choice' },
            { value: 'MULTIPLE_CHOICE', label: 'Multiple Choice' },
            { value: 'CODING', label: 'Coding' },
            { value: 'ARCHITECTURE', label: 'Architecture' },
            { value: 'SCENARIO', label: 'Scenario' },
          ]}
          selected={typeFilter}
          onChange={setTypeFilter}
          placeholder="All Types"
          className="w-full sm:w-44"
        />
        <MultiSelect
          options={levels.map((l) => ({ value: l.name, label: l.displayName }))}
          selected={levelFilter}
          onChange={setLevelFilter}
          placeholder="All Levels"
          className="w-full sm:w-44"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]"><SortableHeader label="Text" field="text" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead><SortableHeader label="Category" field="category" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead><SortableHeader label="Subcategory" field="subcategory" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead>Competency</TableHead>
            <TableHead><SortableHeader label="Type" field="type" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead><SortableHeader label="Difficulty" field="difficulty" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead>Levels</TableHead>
            <TableHead><SortableHeader label="Created" field="createdAt" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead className="w-[80px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
          ) : result.data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground">No questions found.</TableCell>
            </TableRow>
          ) : (
            result.data.map((q) => (
              <TableRow
                key={q.id}
                className={isAdmin ? 'cursor-pointer hover:bg-muted/50' : ''}
                onClick={() => isAdmin && openEditDialog(q)}
              >
                <TableCell className="max-w-[300px]">
                  <div className="flex items-center gap-2">
                    <TooltipProvider delayDuration={100}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="truncate">{q.text}</span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm whitespace-normal">
                          {q.text}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    {q.isCustomized && <Badge className="bg-amber-100 text-amber-800 text-xs shrink-0">Customized</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{catDisplayName(q.category)}</Badge>
                </TableCell>
                <TableCell className="text-sm">{q.subcategory}</TableCell>
                <TableCell>
                  {(q.competencyType || allSubsMap.get(q.subcategory || '')) && (
                    <Badge variant="outline" className="text-xs">
                      {q.competencyType || allSubsMap.get(q.subcategory || '')}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{q.type}</Badge>
                </TableCell>
                <TableCell>{q.difficulty}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {q.targetLevels?.map((l) => {
                    const lv = levels.find((lv) => lv.name === l);
                    return lv?.displayName ?? l;
                  }).join(', ')}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {(q as any).createdAt ? new Date((q as any).createdAt).toLocaleDateString() : '—'}
                </TableCell>
                <TableCell>
                  {isAdmin && (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {q.isCustomized && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-600" title="Reset to default" onClick={() => handleReset(q.id)}>
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(q)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(q.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      </div>

      <DataTablePagination
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        limit={result.limit}
        onPageChange={setPage}
        onLimitChange={setLimit}
      />

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetFormAndClose(); else setDialogOpen(true); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingQuestion ? 'Edit Question' : 'Create Question'}</DialogTitle>
            <DialogDescription>
              {editingQuestion ? 'Update the question details.' : 'Add a new question to the bank.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">

            {/* Question text */}
            <div className="space-y-2">
              <Label>Text</Label>
              <Textarea value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
            </div>

            {/* Category + Subcategory */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={handleDialogCategoryChange}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.name}>{c.displayName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Subcategory</Label>
                {formSubs.length > 0 ? (
                  <Select value={form.subcategory} onValueChange={(v) => setForm({ ...form, subcategory: v })}>
                    <SelectTrigger><SelectValue placeholder="Select subcategory" /></SelectTrigger>
                    <SelectContent>
                      {formSubs.map((s) => (
                        <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={form.subcategory}
                    onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
                    placeholder="Subcategory"
                  />
                )}
              </div>
            </div>

            {/* Competency Type */}
            <div className="space-y-2">
              <Label>Competency Type</Label>
              <Select value={form.competencyType || ''} onValueChange={(v) => setForm({ ...form, competencyType: v })}>
                <SelectTrigger><SelectValue placeholder="Inherit from subcategory" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="KNOWLEDGE">Knowledge — Kiến thức chuyên môn</SelectItem>
                  <SelectItem value="SKILL">Skill — Kỹ năng chuyên môn</SelectItem>
                  <SelectItem value="ADDITIONAL">Additional — Năng lực bổ sung</SelectItem>
                  <SelectItem value="PERSONALITY">Personality — Tính cách</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Type + Difficulty */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => {
                    const newForm = { ...form, type: v };
                    if (hasOptions(v) && form.options.length === 0) {
                      newForm.options = [{ id: 'opt_1', text: '' }, { id: 'opt_2', text: '' }];
                    }
                    if (!hasOptions(v)) { newForm.options = []; newForm.correctAnswers = []; }
                    setForm(newForm);
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.values(QuestionType).map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Difficulty (1–5)</Label>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={form.difficulty}
                  onChange={(e) => setForm({ ...form, difficulty: Number(e.target.value) })}
                />
              </div>
            </div>

            {/* Options for choice questions */}
            {hasOptions(form.type) && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Options</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addOption}>
                    <Plus className="h-3 w-3 mr-1" /> Add Option
                  </Button>
                </div>
                {form.options.length === 0 && (
                  <p className="text-sm text-muted-foreground">No options added yet.</p>
                )}
                {form.options.map((opt, idx) => (
                  <div key={opt.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={form.correctAnswers.includes(opt.id)}
                      onCheckedChange={() => toggleCorrectAnswer(opt.id)}
                    />
                    <span className="text-xs text-muted-foreground w-12 shrink-0">{opt.id}</span>
                    <Input
                      value={opt.text}
                      onChange={(e) => updateOptionText(opt.id, e.target.value)}
                      placeholder={`Option ${idx + 1} text`}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive"
                      onClick={() => removeOption(opt.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Check the box next to correct answer(s).{' '}
                  {form.type === QuestionType.SINGLE_CHOICE ? 'Select one.' : 'Select one or more.'}
                </p>
              </div>
            )}

            {/* Target Levels — checkbox group from DB */}
            <div className="space-y-2">
              <Label>Target Levels</Label>
              {levels.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {levels.map((l) => (
                    <label key={l.id} className="flex items-center gap-2 cursor-pointer select-none">
                      <Checkbox
                        checked={form.targetLevels.includes(l.name)}
                        onCheckedChange={() => toggleLevel(l.name)}
                      />
                      <span className="text-sm">{l.displayName}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No levels available.</p>
              )}
            </div>

            {/* Architecture template — shown only for ARCHITECTURE type */}
            {form.type === QuestionType.ARCHITECTURE && (
              <div className="space-y-2">
                <Label>Architecture Template</Label>
                <p className="text-xs text-muted-foreground">
                  Design a starting template for the candidate. They can modify or build on top of it.
                </p>
                <ArchitectureEditor
                  value={form.architectureTemplate ?? { nodes: [], connections: [], description: '' }}
                  onChange={(val) => setForm((f) => ({ ...f, architectureTemplate: val }))}
                />
              </div>
            )}

            {/* Expected answer */}
            <div className="space-y-2">
              <Label>Expected Answer / Scoring Guide</Label>
              <Textarea
                value={form.expectedAnswer}
                onChange={(e) => setForm({ ...form, expectedAnswer: e.target.value })}
                placeholder="Describe what a good answer looks like…"
              />
            </div>

            {/* ── CODING-specific fields ── */}
            {form.type === QuestionType.CODING && (
              <div className="space-y-5 pt-1 border-t">

                {/* Time & Memory limits */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Time Limit (seconds)</Label>
                    <Input
                      type="number"
                      min={1}
                      placeholder="e.g. 5"
                      value={form.timeLimit}
                      onChange={(e) => setForm({ ...form, timeLimit: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Memory Limit (MB)</Label>
                    <Input
                      type="number"
                      min={1}
                      placeholder="e.g. 256"
                      value={form.memoryLimit}
                      onChange={(e) => setForm({ ...form, memoryLimit: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </div>
                </div>

                {/* Starter Code */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Starter Code</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={addStarterCode}
                      disabled={form.starterCode.length >= STARTER_CODE_LANGUAGES.length}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add Language
                    </Button>
                  </div>
                  {form.starterCode.length === 0 && (
                    <p className="text-xs text-muted-foreground">No starter code. Candidate will start with an empty editor.</p>
                  )}
                  {form.starterCode.map((sc, idx) => (
                    <div key={idx} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Select
                          value={sc.language}
                          onValueChange={(v) => updateStarterLanguage(idx, v)}
                        >
                          <SelectTrigger className="h-7 w-36 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STARTER_CODE_LANGUAGES.map((lang) => (
                              <SelectItem key={lang} value={lang} className="text-xs">{lang}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive ml-auto"
                          onClick={() => removeStarterCode(idx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="rounded overflow-hidden border">
                        <Editor
                          height="150px"
                          language={sc.language === 'typescript' ? 'typescript' : sc.language === 'javascript' ? 'javascript' : sc.language}
                          value={sc.code}
                          theme="vs-dark"
                          options={{
                            minimap: { enabled: false },
                            fontSize: 12,
                            lineNumbers: 'off',
                            scrollBeyondLastLine: false,
                            wordWrap: 'on',
                          }}
                          onMount={(editor) => { starterEditorRefs.current[idx] = editor; }}
                          onChange={(val) => updateStarterCode(idx, val ?? '')}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Visible Test Cases */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Test Cases</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => addTestCase(false)}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add Test Case
                    </Button>
                  </div>
                  {form.testCases.length === 0 && (
                    <p className="text-xs text-muted-foreground">No test cases. Code will run without validation.</p>
                  )}
                  {form.testCases.map((tc, idx) => (
                    <div key={idx} className="rounded-md border p-3 space-y-2 bg-muted/20">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Test Case {idx + 1}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={() => removeTestCase(false, idx)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Input</Label>
                          <Textarea
                            className="text-xs font-mono min-h-[60px] resize-y"
                            value={tc.input}
                            onChange={(e) => updateTestCase(false, idx, 'input', e.target.value)}
                            placeholder="e.g. [1, 2, 3]"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Expected Output</Label>
                          <Textarea
                            className="text-xs font-mono min-h-[60px] resize-y"
                            value={tc.expectedOutput}
                            onChange={(e) => updateTestCase(false, idx, 'expectedOutput', e.target.value)}
                            placeholder="e.g. 6"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Description (optional)</Label>
                        <Input
                          className="text-xs h-7"
                          value={tc.description ?? ''}
                          onChange={(e) => updateTestCase(false, idx, 'description', e.target.value)}
                          placeholder="e.g. Sum of array"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Hidden Test Cases — collapsible */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div
                      className="flex items-center gap-1 cursor-pointer select-none"
                      onClick={() => setHiddenExpanded((v) => !v)}
                    >
                      {hiddenExpanded
                        ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      <Label className="cursor-pointer">
                        Hidden Test Cases
                        {form.hiddenTestCases.length > 0 && (
                          <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                            ({form.hiddenTestCases.length})
                          </span>
                        )}
                      </Label>
                      <span className="text-xs text-muted-foreground ml-1">— not shown to candidate</span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => { addTestCase(true); setHiddenExpanded(true); }}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  </div>
                  {hiddenExpanded && (
                    <div className="space-y-2 pl-2 border-l-2 border-muted">
                      {form.hiddenTestCases.length === 0 && (
                        <p className="text-xs text-muted-foreground">No hidden test cases.</p>
                      )}
                      {form.hiddenTestCases.map((tc, idx) => (
                        <div key={idx} className="rounded-md border p-3 space-y-2 bg-muted/20">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Hidden {idx + 1}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive"
                              onClick={() => removeTestCase(true, idx)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Input</Label>
                              <Textarea
                                className="text-xs font-mono min-h-[60px] resize-y"
                                value={tc.input}
                                onChange={(e) => updateTestCase(true, idx, 'input', e.target.value)}
                                placeholder="e.g. [1, 2, 3]"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Expected Output</Label>
                              <Textarea
                                className="text-xs font-mono min-h-[60px] resize-y"
                                value={tc.expectedOutput}
                                onChange={(e) => updateTestCase(true, idx, 'expectedOutput', e.target.value)}
                                placeholder="e.g. 6"
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Description (optional)</Label>
                            <Input
                              className="text-xs h-7"
                              value={tc.description ?? ''}
                              onChange={(e) => updateTestCase(true, idx, 'description', e.target.value)}
                              placeholder="e.g. Edge case: empty array"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}

          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetFormAndClose}>Cancel</Button>
            <Button onClick={editingQuestion ? handleUpdate : handleCreate}>
              {editingQuestion ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
