import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api-client';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { SortableHeader, SortOrder } from '@/components/ui/sortable-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import { toast } from '@/components/ui/use-toast';
import type { PaginatedResponse } from '@interview-assistant/shared';
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/lib/auth-context';

interface Position { id: string; name: string; description: string | null; isActive: boolean; isCustomized?: boolean; createdAt?: string }
interface Category { id: string; name: string; displayName: string; description: string | null; orderIndex: number; isCustomized?: boolean; positions?: string[] | null }
interface SubCategory { id: string; categoryId: string; name: string; orderIndex: number; competencyType?: string; isCustomized?: boolean }

// ── Positions tab ──────────────────────────────────────────────────────────

function PositionsTab() {
  const [result, setResult] = useState<PaginatedResponse<Position>>({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('ASC');

  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, sortBy, sortOrder]);

  const load = useCallback(() => {
    setLoading(true);
    apiClient.get<PaginatedResponse<Position>>('/positions', {
      page, limit,
      search: debouncedSearch || undefined,
      status: statusFilter.length > 0 ? statusFilter.join(',') : undefined,
      sortBy, sortOrder,
    }).then(setResult).catch(console.error).finally(() => setLoading(false));
  }, [page, limit, debouncedSearch, statusFilter, sortBy, sortOrder]);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setName(''); setDescription(''); setOpen(true); };
  const openEdit = (p: Position) => { setEditing(p); setName(p.name); setDescription(p.description ?? ''); setOpen(true); };

  const handleSave = async () => {
    try {
      if (editing) {
        await apiClient.put(`/positions/${editing.id}`, { name, description: description || undefined });
        toast({ title: 'Position updated' });
      } else {
        await apiClient.post('/positions', { name, description: description || undefined });
        toast({ title: 'Position created' });
      }
      setOpen(false);
      load();
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/positions/${id}`);
      toast({ title: 'Position deleted' });
      load();
    } catch {
      toast({ title: 'Delete failed', variant: 'destructive' });
    }
  };

  const handleReset = async (id: string) => {
    try {
      await apiClient.post(`/positions/${id}/reset`);
      toast({ title: 'Position reset to default' });
      load();
    } catch {
      toast({ title: 'Reset failed', variant: 'destructive' });
    }
  };

  const handleSort = (field: string, order: SortOrder) => { setSortBy(field); setSortOrder(order); };

  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 justify-between flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="sm:hidden" onClick={() => setFiltersOpen((v) => !v)}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Add Position
        </Button>
      </div>
      <div className={filtersOpen ? 'flex flex-col gap-3' : 'hidden sm:flex sm:items-center sm:gap-3 sm:flex-wrap'}>
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search positions…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-full sm:w-56" />
        </div>
        <MultiSelect
          options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }]}
          selected={statusFilter}
          onChange={setStatusFilter}
          placeholder="All Statuses"
          className="w-full sm:w-36"
        />
      </div>
      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead><SortableHeader label="Name" field="name" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead><SortableHeader label="Description" field="description" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead>Status</TableHead>
            <TableHead><SortableHeader label="Created" field="createdAt" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead className="w-20">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
          ) : result.data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">No positions found.</TableCell>
            </TableRow>
          ) : result.data.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  {p.name}
                  {p.isCustomized && <Badge className="bg-amber-100 text-amber-800 text-xs">Customized</Badge>}
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{p.description}</TableCell>
              <TableCell>
                {p.isActive
                  ? <Badge className="bg-green-100 text-green-800">Active</Badge>
                  : <Badge variant="secondary">Inactive</Badge>}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {p.isCustomized && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600" title="Reset to default" onClick={() => handleReset(p.id)}>
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(p.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
      <DataTablePagination page={result.page} totalPages={result.totalPages} total={result.total} limit={result.limit} onPageChange={setPage} onLimitChange={setLimit} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Position' : 'New Position'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Backend Developer" />
            </div>
            <div className="space-y-1">
              <Label>Description (optional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!name.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Categories tree tab ────────────────────────────────────────────────────

type SubcategoryMap = Record<string, SubCategory[]>;

interface CategoryDialogState {
  open: boolean;
  editing: Category | null;
  name: string;
  displayName: string;
  description: string;
  orderIndex: number;
  positions: string[];
}

interface SubcategoryDialogState {
  open: boolean;
  editing: SubCategory | null;
  categoryId: string;
  name: string;
  orderIndex: number;
  competencyType: string;
}

function CategoriesTreeTab() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategoryMap, setSubcategoryMap] = useState<SubcategoryMap>({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [availablePositions, setAvailablePositions] = useState<string[]>([]);
  const [catDialog, setCatDialog] = useState<CategoryDialogState>({
    open: false, editing: null, name: '', displayName: '', description: '', orderIndex: 0, positions: [],
  });
  const [subDialog, setSubDialog] = useState<SubcategoryDialogState>({
    open: false, editing: null, categoryId: '', name: '', orderIndex: 0, competencyType: 'KNOWLEDGE',
  });

  const loadCategories = useCallback(async () => {
    const cats = await apiClient.get<Category[]>('/categories').catch(() => [] as Category[]);
    setCategories(cats);
  }, []);

  const loadSubcategories = useCallback(async (categoryId: string) => {
    const subs = await apiClient.get<SubCategory[]>(`/sub-categories?categoryId=${categoryId}`).catch(() => [] as SubCategory[]);
    setSubcategoryMap((prev) => ({ ...prev, [categoryId]: subs }));
  }, []);

  useEffect(() => {
    loadCategories();
    apiClient.get<{ data: Array<{ name: string }> }>('/positions', { limit: 1000 })
      .then((r) => setAvailablePositions(r.data.map((p) => p.name)))
      .catch(() => {});
  }, [loadCategories]);

  const toggleExpand = (categoryId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
        // load subcategories lazily on first expand
        if (!subcategoryMap[categoryId]) {
          loadSubcategories(categoryId);
        }
      }
      return next;
    });
  };

  // ── Category CRUD ──
  const openCreateCategory = () => {
    setCatDialog({ open: true, editing: null, name: '', displayName: '', description: '', orderIndex: categories.length, positions: [] });
  };
  const openEditCategory = (c: Category) => {
    setCatDialog({ open: true, editing: c, name: c.name, displayName: c.displayName, description: c.description ?? '', orderIndex: c.orderIndex, positions: c.positions ?? [] });
  };
  const saveCategoryDialog = async () => {
    const { editing, name, displayName, description, orderIndex, positions } = catDialog;
    // null = default for all positions; non-empty array = position-specific
    const positionsValue = positions.length > 0 ? positions : null;
    try {
      if (editing) {
        await apiClient.put(`/categories/${editing.id}`, { name, displayName, description: description || undefined, orderIndex, positions: positionsValue });
        toast({ title: 'Category updated' });
      } else {
        await apiClient.post('/categories', { name, displayName, description: description || undefined, orderIndex, positions: positionsValue });
        toast({ title: 'Category created' });
      }
      setCatDialog((d) => ({ ...d, open: false }));
      loadCategories();
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    }
  };
  const deleteCategory = async (id: string) => {
    try {
      await apiClient.delete(`/categories/${id}`);
      toast({ title: 'Category deleted' });
      loadCategories();
    } catch {
      toast({ title: 'Delete failed', variant: 'destructive' });
    }
  };

  // ── Subcategory CRUD ──
  const openCreateSubcategory = (categoryId: string) => {
    const existing = subcategoryMap[categoryId] ?? [];
    setSubDialog({ open: true, editing: null, categoryId, name: '', orderIndex: existing.length, competencyType: 'KNOWLEDGE' });
    // ensure expanded so user sees the result
    setExpandedIds((prev) => new Set([...prev, categoryId]));
    if (!subcategoryMap[categoryId]) loadSubcategories(categoryId);
  };
  const openEditSubcategory = (s: SubCategory) => {
    setSubDialog({ open: true, editing: s, categoryId: s.categoryId, name: s.name, orderIndex: s.orderIndex, competencyType: s.competencyType ?? 'KNOWLEDGE' });
  };
  const saveSubDialog = async () => {
    const { editing, categoryId, name, orderIndex, competencyType } = subDialog;
    try {
      if (editing) {
        await apiClient.put(`/sub-categories/${editing.id}`, { name, orderIndex, competencyType });
        toast({ title: 'Sub-category updated' });
      } else {
        await apiClient.post('/sub-categories', { categoryId, name, orderIndex, competencyType });
        toast({ title: 'Sub-category created' });
      }
      setSubDialog((d) => ({ ...d, open: false }));
      loadSubcategories(categoryId);
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    }
  };
  const deleteSubcategory = async (s: SubCategory) => {
    try {
      await apiClient.delete(`/sub-categories/${s.id}`);
      toast({ title: 'Sub-category deleted' });
      loadSubcategories(s.categoryId);
    } catch {
      toast({ title: 'Delete failed', variant: 'destructive' });
    }
  };

  const handleResetCategory = async (id: string) => {
    try {
      await apiClient.post(`/categories/${id}/reset`);
      toast({ title: 'Category reset to default' });
      loadCategories();
    } catch {
      toast({ title: 'Reset failed', variant: 'destructive' });
    }
  };

  const handleResetSubcategory = async (s: SubCategory) => {
    try {
      await apiClient.post(`/sub-categories/${s.id}/reset`);
      toast({ title: 'Sub-category reset to default' });
      loadSubcategories(s.categoryId);
    } catch {
      toast({ title: 'Reset failed', variant: 'destructive' });
    }
  };

  const filteredCategories = search
    ? categories.filter((c) =>
        c.displayName.toLowerCase().includes(search.toLowerCase()) ||
        c.name.toLowerCase().includes(search.toLowerCase()))
    : categories;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 justify-between flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search categories…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-56" />
        </div>
        <Button size="sm" onClick={openCreateCategory}>
          <Plus className="h-4 w-4 mr-1" /> Add Category
        </Button>
      </div>

      {/* Tree */}
      <div className="border rounded-md divide-y">
        {filteredCategories.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            {search ? 'No categories match your search.' : 'No categories yet. Seed defaults or add one.'}
          </div>
        )}
        {filteredCategories.map((cat) => {
          const isExpanded = expandedIds.has(cat.id);
          const subs = subcategoryMap[cat.id];
          return (
            <div key={cat.id}>
              {/* Category row */}
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors">
                <button
                  onClick={() => toggleExpand(cat.id)}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  {isExpanded
                    ? <ChevronDown className="h-4 w-4" />
                    : <ChevronRight className="h-4 w-4" />}
                </button>
                <span className="font-medium flex-1">{cat.displayName}</span>
                <Badge variant="outline" className="text-xs">{cat.name}</Badge>
                {cat.positions && cat.positions.length > 0
                  ? cat.positions.map((p) => (
                      <Badge key={p} className="bg-blue-600 text-white text-xs">{p}</Badge>
                    ))
                  : <Badge className="bg-gray-400 text-white text-xs">All positions</Badge>
                }
                {cat.isCustomized && <Badge className="bg-amber-100 text-amber-800 text-xs">Customized</Badge>}
                <span className="text-xs text-muted-foreground w-8 text-right">#{cat.orderIndex}</span>
                <div className="flex gap-1 ml-2">
                  <Button
                    variant="ghost" size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => openCreateSubcategory(cat.id)}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Sub
                  </Button>
                  {cat.isCustomized && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600" title="Reset to default" onClick={() => handleResetCategory(cat.id)}>
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditCategory(cat)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteCategory(cat.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Sub-category rows */}
              {isExpanded && (
                <div className={cn('divide-y border-t')}>
                  {!subs && (
                    <div className="pl-10 py-2 text-sm text-muted-foreground">Loading…</div>
                  )}
                  {subs && subs.length === 0 && (
                    <div className="pl-10 py-2 text-sm text-muted-foreground">No sub-categories yet.</div>
                  )}
                  {subs && subs.map((sub) => (
                    <div key={sub.id} className="flex items-center gap-2 pl-10 pr-3 py-1.5 hover:bg-muted/20 transition-colors">
                      <span className="flex-1 text-sm">{sub.name}</span>
                      {sub.competencyType && (
                        <Badge variant="outline" className="text-xs">{sub.competencyType}</Badge>
                      )}
                      {sub.isCustomized && <Badge className="bg-amber-100 text-amber-800 text-xs">Customized</Badge>}
                      <span className="text-xs text-muted-foreground w-8 text-right">#{sub.orderIndex}</span>
                      <div className="flex gap-1">
                        {sub.isCustomized && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-amber-600" title="Reset to default" onClick={() => handleResetSubcategory(sub)}>
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditSubcategory(sub)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteSubcategory(sub)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Category dialog */}
      <Dialog open={catDialog.open} onOpenChange={(v) => setCatDialog((d) => ({ ...d, open: v }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{catDialog.editing ? 'Edit Category' : 'New Category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name (key, e.g. CATEGORY_NAME)</Label>
              <Input value={catDialog.name} onChange={(e) => setCatDialog((d) => ({ ...d, name: e.target.value }))} placeholder="CATEGORY_NAME" />
            </div>
            <div className="space-y-1">
              <Label>Display Name</Label>
              <Input value={catDialog.displayName} onChange={(e) => setCatDialog((d) => ({ ...d, displayName: e.target.value }))} placeholder="Technical (Must)" />
            </div>
            <div className="space-y-1">
              <Label>Description (optional)</Label>
              <Textarea value={catDialog.description} onChange={(e) => setCatDialog((d) => ({ ...d, description: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-1">
              <Label>Order Index</Label>
              <Input type="number" value={catDialog.orderIndex} onChange={(e) => setCatDialog((d) => ({ ...d, orderIndex: Number(e.target.value) }))} min={0} />
            </div>
            <div className="space-y-1">
              <Label>Applicable Positions</Label>
              <MultiSelect
                options={availablePositions.map((p) => ({ value: p, label: p }))}
                selected={catDialog.positions}
                onChange={(v) => setCatDialog((d) => ({ ...d, positions: v }))}
                placeholder="All positions (default)"
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">Leave empty to show for all positions.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialog((d) => ({ ...d, open: false }))}>Cancel</Button>
            <Button onClick={saveCategoryDialog} disabled={!catDialog.name.trim() || !catDialog.displayName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sub-category dialog */}
      <Dialog open={subDialog.open} onOpenChange={(v) => setSubDialog((d) => ({ ...d, open: v }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{subDialog.editing ? 'Edit Sub-Category' : 'New Sub-Category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={subDialog.name} onChange={(e) => setSubDialog((d) => ({ ...d, name: e.target.value }))} placeholder="e.g. Cơ sở dữ liệu" />
            </div>
            <div className="space-y-1">
              <Label>Competency Type</Label>
              <Select value={subDialog.competencyType} onValueChange={(v) => setSubDialog((d) => ({ ...d, competencyType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="KNOWLEDGE">Knowledge — Kiến thức chuyên môn</SelectItem>
                  <SelectItem value="SKILL">Skill — Kỹ năng chuyên môn</SelectItem>
                  <SelectItem value="ADDITIONAL">Additional — Năng lực bổ sung</SelectItem>
                  <SelectItem value="PERSONALITY">Personality — Tính cách</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Order Index</Label>
              <Input type="number" value={subDialog.orderIndex} onChange={(e) => setSubDialog((d) => ({ ...d, orderIndex: Number(e.target.value) }))} min={0} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubDialog((d) => ({ ...d, open: false }))}>Cancel</Button>
            <Button onClick={saveSubDialog} disabled={!subDialog.name.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Users tab ──────────────────────────────────────────────────────────────

interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

interface UserDialogState {
  open: boolean;
  editing: UserRecord | null;
  email: string;
  name: string;
  role: string;
}

const ROLE_VALUES = ['ADMIN', 'INTERVIEWER', 'HR'];

function roleBadge(role: string) {
  if (role === 'ADMIN') return <Badge className="bg-red-100 text-red-800">ADMIN</Badge>;
  if (role === 'HR') return <Badge className="bg-green-100 text-green-800">HR</Badge>;
  return <Badge className="bg-blue-100 text-blue-800">INTERVIEWER</Badge>;
}

function UsersTab() {
  const { user: currentUser } = useAuthContext();
  const [result, setResult] = useState<PaginatedResponse<UserRecord>>({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<UserDialogState>({
    open: false, editing: null, email: '', name: '', role: 'INTERVIEWER',
  });
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('DESC');

  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, roleFilter, sortBy, sortOrder]);

  const load = useCallback(() => {
    setLoading(true);
    apiClient.get<PaginatedResponse<UserRecord>>('/auth/users', {
      page, limit,
      search: debouncedSearch || undefined,
      role: roleFilter.length > 0 ? roleFilter.join(',') : undefined,
      sortBy, sortOrder,
    }).then(setResult).catch(console.error).finally(() => setLoading(false));
  }, [page, limit, debouncedSearch, roleFilter, sortBy, sortOrder]);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => setDialog({ open: true, editing: null, email: '', name: '', role: 'INTERVIEWER' });
  const openEdit = (u: UserRecord) => setDialog({ open: true, editing: u, email: u.email, name: u.name, role: u.role });

  const handleSave = async () => {
    const { editing, email, name, role } = dialog;
    try {
      if (editing) {
        await apiClient.put(`/auth/users/${editing.id}`, { name: name || undefined, role });
        toast({ title: 'User updated' });
      } else {
        await apiClient.post('/auth/users', { email, name, role });
        toast({ title: 'User created' });
      }
      setDialog((d) => ({ ...d, open: false }));
      load();
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    }
  };

  const handleDelete = async (u: UserRecord) => {
    if (u.id === currentUser?.id) return; // prevent self-delete
    try {
      await apiClient.delete(`/auth/users/${u.id}`);
      toast({ title: 'User deleted' });
      load();
    } catch {
      toast({ title: 'Delete failed', variant: 'destructive' });
    }
  };

  const isSelf = (u: UserRecord) => u.id === currentUser?.id;

  const handleSort = (field: string, order: SortOrder) => { setSortBy(field); setSortOrder(order); };

  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 justify-between flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="sm:hidden" onClick={() => setFiltersOpen((v) => !v)}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Add User
        </Button>
      </div>
      <div className={filtersOpen ? 'flex flex-col gap-3' : 'hidden sm:flex sm:items-center sm:gap-3 sm:flex-wrap'}>
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-full sm:w-56" />
        </div>
        <MultiSelect
          options={[{ value: 'ADMIN', label: 'Admin' }, { value: 'INTERVIEWER', label: 'Interviewer' }, { value: 'HR', label: 'HR' }]}
          selected={roleFilter}
          onChange={setRoleFilter}
          placeholder="All Roles"
          className="w-full sm:w-36"
        />
      </div>
      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead><SortableHeader label="Name" field="name" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead><SortableHeader label="Email" field="email" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead><SortableHeader label="Role" field="role" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead><SortableHeader label="Created" field="createdAt" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead className="w-20">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
          ) : result.data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">No users found.</TableCell>
            </TableRow>
          ) : result.data.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.name}{isSelf(u) && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}</TableCell>
              <TableCell className="text-sm">{u.email}</TableCell>
              <TableCell>{roleBadge(u.role)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(u)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                    onClick={() => handleDelete(u)}
                    disabled={isSelf(u)}
                    title={isSelf(u) ? 'Cannot delete yourself' : 'Delete user'}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
      <DataTablePagination page={result.page} totalPages={result.totalPages} total={result.total} limit={result.limit} onPageChange={setPage} onLimitChange={setLimit} />

      <Dialog open={dialog.open} onOpenChange={(v) => setDialog((d) => ({ ...d, open: v }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.editing ? 'Edit User' : 'Add User'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!dialog.editing && (
              <>
                <div className="space-y-1">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={dialog.email}
                    onChange={(e) => setDialog((d) => ({ ...d, email: e.target.value }))}
                    placeholder="user@company.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Name *</Label>
                  <Input
                    value={dialog.name}
                    onChange={(e) => setDialog((d) => ({ ...d, name: e.target.value }))}
                    placeholder="Full name"
                  />
                </div>
              </>
            )}
            {dialog.editing && (
              <div className="space-y-1">
                <Label>Name</Label>
                <Input
                  value={dialog.name}
                  onChange={(e) => setDialog((d) => ({ ...d, name: e.target.value }))}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label>Role *</Label>
              <Select value={dialog.role} onValueChange={(v) => setDialog((d) => ({ ...d, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_VALUES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog((d) => ({ ...d, open: false }))}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={dialog.editing ? false : (!dialog.email.trim() || !dialog.name.trim())}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Levels tab ────────────────────────────────────────────────────────────

interface Level { id: string; name: string; displayName: string; orderIndex: number; isActive: boolean; isCustomized?: boolean; updatedAt?: string }

interface LevelDialogState {
  open: boolean;
  editing: Level | null;
  name: string;
  displayName: string;
  orderIndex: number;
}

function LevelsTab() {
  const [result, setResult] = useState<PaginatedResponse<Level>>({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<LevelDialogState>({
    open: false, editing: null, name: '', displayName: '', orderIndex: 0,
  });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sortBy, setSortBy] = useState('orderIndex');
  const [sortOrder, setSortOrder] = useState<SortOrder>('ASC');

  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, sortBy, sortOrder]);

  const load = useCallback(() => {
    setLoading(true);
    apiClient.get<PaginatedResponse<Level>>('/levels', {
      page, limit,
      search: debouncedSearch || undefined,
      status: statusFilter.length > 0 ? statusFilter.join(',') : undefined,
      sortBy, sortOrder,
    }).then(setResult).catch(console.error).finally(() => setLoading(false));
  }, [page, limit, debouncedSearch, statusFilter, sortBy, sortOrder]);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => setDialog({ open: true, editing: null, name: '', displayName: '', orderIndex: result.data.length });
  const openEdit = (l: Level) => setDialog({ open: true, editing: l, name: l.name, displayName: l.displayName, orderIndex: l.orderIndex });

  const handleSave = async () => {
    const { editing, name, displayName, orderIndex } = dialog;
    try {
      if (editing) {
        await apiClient.put(`/levels/${editing.id}`, { name, displayName, orderIndex });
        toast({ title: 'Level updated' });
      } else {
        await apiClient.post('/levels', { name, displayName, orderIndex });
        toast({ title: 'Level created' });
      }
      setDialog((d) => ({ ...d, open: false }));
      load();
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/levels/${id}`);
      toast({ title: 'Level deleted' });
      load();
    } catch {
      toast({ title: 'Delete failed', variant: 'destructive' });
    }
  };

  const toggleActive = async (l: Level) => {
    try {
      await apiClient.put(`/levels/${l.id}`, { isActive: !l.isActive });
      load();
    } catch {
      toast({ title: 'Update failed', variant: 'destructive' });
    }
  };

  const handleReset = async (id: string) => {
    try {
      await apiClient.post(`/levels/${id}/reset`);
      toast({ title: 'Level reset to default' });
      load();
    } catch {
      toast({ title: 'Reset failed', variant: 'destructive' });
    }
  };

  const handleSort = (field: string, order: SortOrder) => { setSortBy(field); setSortOrder(order); };

  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 justify-between flex-wrap">
        <Button variant="outline" size="sm" className="sm:hidden" onClick={() => setFiltersOpen((v) => !v)}>
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Add Level
        </Button>
      </div>
      <div className={filtersOpen ? 'flex flex-col gap-3' : 'hidden sm:flex sm:items-center sm:gap-3 sm:flex-wrap'}>
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search levels…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-full sm:w-56" />
        </div>
        <MultiSelect
          options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }]}
          selected={statusFilter}
          onChange={setStatusFilter}
          placeholder="All Statuses"
          className="w-full sm:w-36"
        />
      </div>
      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead><SortableHeader label="Name" field="name" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead><SortableHeader label="Display Name" field="displayName" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead><SortableHeader label="Order" field="orderIndex" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="w-20">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
          ) : result.data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">No levels found.</TableCell>
            </TableRow>
          ) : result.data.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="font-medium font-mono text-sm">
                <div className="flex items-center gap-2">
                  {l.name}
                  {l.isCustomized && <Badge className="bg-amber-100 text-amber-800 text-xs">Customized</Badge>}
                </div>
              </TableCell>
              <TableCell>{l.displayName}</TableCell>
              <TableCell className="text-sm text-muted-foreground">#{l.orderIndex}</TableCell>
              <TableCell>
                <button onClick={() => toggleActive(l)}>
                  {l.isActive
                    ? <Badge className="bg-green-100 text-green-800 cursor-pointer">Active</Badge>
                    : <Badge variant="secondary" className="cursor-pointer">Inactive</Badge>}
                </button>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {l.updatedAt ? new Date(l.updatedAt).toLocaleDateString() : '—'}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {l.isCustomized && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600" title="Reset to default" onClick={() => handleReset(l.id)}>
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(l)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(l.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
      <DataTablePagination page={result.page} totalPages={result.totalPages} total={result.total} limit={result.limit} onPageChange={setPage} onLimitChange={setLimit} />

      <Dialog open={dialog.open} onOpenChange={(v) => setDialog((d) => ({ ...d, open: v }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.editing ? 'Edit Level' : 'New Level'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name (key, e.g. SENIOR)</Label>
              <Input value={dialog.name} onChange={(e) => setDialog((d) => ({ ...d, name: e.target.value }))} placeholder="SENIOR" />
            </div>
            <div className="space-y-1">
              <Label>Display Name</Label>
              <Input value={dialog.displayName} onChange={(e) => setDialog((d) => ({ ...d, displayName: e.target.value }))} placeholder="Senior" />
            </div>
            <div className="space-y-1">
              <Label>Order Index</Label>
              <Input type="number" value={dialog.orderIndex} onChange={(e) => setDialog((d) => ({ ...d, orderIndex: Number(e.target.value) }))} min={0} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog((d) => ({ ...d, open: false }))}>Cancel</Button>
            <Button onClick={handleSave} disabled={!dialog.name.trim() || !dialog.displayName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Per-section page wrappers (for sidebar sub-routes) ─────────────────────

function SettingsShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{title}</h1>
      {children}
    </div>
  );
}

export function SettingsPositionsPage() {
  return <SettingsShell title="Positions"><PositionsTab /></SettingsShell>;
}

export function SettingsCategoriesPage() {
  return <SettingsShell title="Categories"><CategoriesTreeTab /></SettingsShell>;
}

export function SettingsLevelsPage() {
  return <SettingsShell title="Levels"><LevelsTab /></SettingsShell>;
}

export function SettingsUsersPage() {
  return <SettingsShell title="Users"><UsersTab /></SettingsShell>;
}

// ── AI Prompts tab ─────────────────────────────────────────────────────────

interface AiPrompt {
  id: string;
  key: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  model: string;
  isActive: boolean;
  updatedAt: string;
}

interface AvailableModel {
  key: string;
  identifier: string;
  family: string;
}

function PromptsTab() {
  const [result, setResult] = useState<PaginatedResponse<AiPrompt>>({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('ASC');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editPrompt, setEditPrompt] = useState<AiPrompt | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSystemPrompt, setEditSystemPrompt] = useState('');
  const [editModel, setEditModel] = useState<string>('claude-sonnet-4.6');
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);

  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, sortBy, sortOrder]);

  // Load available models on mount
  useEffect(() => {
    apiClient.get<AvailableModel[]>('/ai-prompts/models')
      .then(setAvailableModels)
      .catch(console.error);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    apiClient.get<PaginatedResponse<AiPrompt>>('/ai-prompts', {
      page, limit,
      search: debouncedSearch || undefined,
      sortBy, sortOrder,
    }).then(setResult).catch(console.error).finally(() => setLoading(false));
  }, [page, limit, debouncedSearch, sortBy, sortOrder]);
  useEffect(() => { load(); }, [load]);

  const handleSort = (field: string, order: SortOrder) => { setSortBy(field); setSortOrder(order); };

  const openEdit = (p: AiPrompt) => {
    setEditPrompt(p);
    setEditName(p.name);
    setEditDescription(p.description ?? '');
    setEditSystemPrompt(p.systemPrompt);
    setEditModel(p.model ?? 'claude-sonnet-4.6');
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!editPrompt) return;
    setSaving(true);
    try {
      await apiClient.put(`/ai-prompts/${editPrompt.id}`, {
        name: editName,
        description: editDescription || undefined,
        systemPrompt: editSystemPrompt,
        model: editModel,
      });
      toast({ title: 'Prompt updated' });
      setEditOpen(false);
      load();
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await apiClient.post('/ai-prompts/seed');
      toast({ title: 'Prompts reset to defaults' });
      load();
    } catch (err) {
      toast({ title: 'Reset failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 justify-between flex-wrap">
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search prompts…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-full sm:w-56" />
        </div>
        <Button variant="outline" size="sm" onClick={handleReset} disabled={resetting}>
          <RotateCcw className="h-4 w-4 mr-1" />
          {resetting ? 'Resetting…' : 'Reset to Defaults'}
        </Button>
      </div>

      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead><SortableHeader label="Name" field="name" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead><SortableHeader label="Key" field="key" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Description</TableHead>
            <TableHead><SortableHeader label="Last Updated" field="updatedAt" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead className="w-16">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
          ) : result.data.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell>
                <Badge variant="outline" className="font-mono text-xs">{p.key}</Badge>
              </TableCell>
              <TableCell>
                <Badge className={
                  p.model?.includes('sonnet') ? 'bg-blue-100 text-blue-800' :
                  p.model?.includes('opus') ? 'bg-purple-100 text-purple-800' :
                  p.model?.includes('haiku') ? 'bg-green-100 text-green-800' :
                  'bg-gray-100 text-gray-800'
                }>{p.model || 'claude-sonnet-4.6'}</Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{p.description}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {new Date(p.updatedAt).toLocaleDateString()}
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
      <DataTablePagination page={result.page} totalPages={result.totalPages} total={result.total} limit={result.limit} onPageChange={setPage} onLimitChange={setLimit} />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Prompt — {editPrompt?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 flex-1 overflow-y-auto">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Description (optional)</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-1">
              <Label>AI Model</Label>
              <Select value={editModel} onValueChange={setEditModel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableModels.length === 0 ? (
                    <SelectItem value="claude-sonnet-4.6">Claude Sonnet 4.6 (default)</SelectItem>
                  ) : (
                    <>
                      {/* Opus family - most capable, highest cost */}
                      {availableModels.filter(m => m.family === 'opus').length > 0 && (
                        <>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Opus — Most Capable</div>
                          {availableModels.filter(m => m.family === 'opus').map(m => (
                            <SelectItem key={m.key} value={m.key}>
                              {m.key.replace('claude-', 'Claude ').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </SelectItem>
                          ))}
                        </>
                      )}
                      {/* Sonnet family - balanced */}
                      {availableModels.filter(m => m.family === 'sonnet').length > 0 && (
                        <>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Sonnet — Balanced Performance</div>
                          {availableModels.filter(m => m.family === 'sonnet').map(m => (
                            <SelectItem key={m.key} value={m.key}>
                              {m.key.replace('claude-', 'Claude ').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </SelectItem>
                          ))}
                        </>
                      )}
                      {/* Haiku family - fastest, lowest cost */}
                      {availableModels.filter(m => m.family === 'haiku').length > 0 && (
                        <>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Haiku — Fast & Efficient</div>
                          {availableModels.filter(m => m.family === 'haiku').map(m => (
                            <SelectItem key={m.key} value={m.key}>
                              {m.key.replace('claude-', 'Claude ').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </SelectItem>
                          ))}
                        </>
                      )}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>System Prompt</Label>
              <div className="border rounded-md overflow-hidden">
                <Editor
                  height="380px"
                  defaultLanguage="markdown"
                  value={editSystemPrompt}
                  onChange={(v) => setEditSystemPrompt(v ?? '')}
                  options={{ wordWrap: 'on', minimap: { enabled: false }, fontSize: 13 }}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saving || !editName.trim() || !editSystemPrompt.trim()}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function SettingsPromptsPage() {
  return <SettingsShell title="AI Prompts"><PromptsTab /></SettingsShell>;
}

// ── AI Models tab ──────────────────────────────────────────────────────────

interface ModelOverrideRow {
  promptKey: string;
  name: string;
  description: string | null;
  model: string | null;
  defaultModel: string | null;
  updatedAt: string | null;
}

function ModelsTab() {
  const [rows, setRows] = useState<ModelOverrideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    apiClient.get<ModelOverrideRow[]>('/ai-model-overrides')
      .then(setRows)
      .catch((err) => {
        toast({ title: 'Failed to load', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    apiClient.get<AvailableModel[]>('/ai-model-overrides/models')
      .then(setAvailableModels)
      .catch(console.error);
  }, []);

  useEffect(() => { load(); }, [load]);

  const applyModel = async (promptKey: string, nextModel: string) => {
    setSavingKey(promptKey);
    try {
      if (nextModel === '__default__') {
        await apiClient.delete(`/ai-model-overrides/${promptKey}`);
        toast({ title: 'Override cleared' });
      } else {
        await apiClient.put(`/ai-model-overrides/${promptKey}`, { model: nextModel });
        toast({ title: 'Model updated' });
      }
      load();
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setSavingKey(null);
    }
  };

  const handleResetAll = async () => {
    setResetting(true);
    try {
      await apiClient.post('/ai-model-overrides/reset');
      toast({ title: 'All overrides cleared' });
      load();
    } catch (err) {
      toast({ title: 'Reset failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setResetting(false);
    }
  };

  const renderModelOptions = () => {
    if (availableModels.length === 0) {
      return <SelectItem value="claude-sonnet-4.6">Claude Sonnet 4.6</SelectItem>;
    }
    const families: Array<{ label: string; family: string }> = [
      { label: 'Opus — Most Capable', family: 'opus' },
      { label: 'Sonnet — Balanced Performance', family: 'sonnet' },
      { label: 'Haiku — Fast & Efficient', family: 'haiku' },
    ];
    return (
      <>
        {families.map(({ label, family }) => {
          const items = availableModels.filter((m) => m.family === family);
          if (items.length === 0) return null;
          return (
            <div key={family}>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{label}</div>
              {items.map((m) => (
                <SelectItem key={m.key} value={m.key}>
                  {m.key.replace('claude-', 'Claude ').replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                </SelectItem>
              ))}
            </div>
          );
        })}
      </>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          Override the AI model used for each prompt. Leaving a prompt at <em>Default</em> uses the model defined in the prompt itself.
        </p>
        <Button variant="outline" size="sm" onClick={handleResetAll} disabled={resetting}>
          <RotateCcw className="h-4 w-4 mr-1" />
          {resetting ? 'Resetting…' : 'Clear All Overrides'}
        </Button>
      </div>

      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prompt</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-72">Model</TableHead>
              <TableHead className="w-36">Last Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading…</TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No prompts found.</TableCell>
              </TableRow>
            ) : rows.map((r) => {
              const selectedValue = r.model ?? '__default__';
              const isSaving = savingKey === r.promptKey;
              return (
                <TableRow key={r.promptKey}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">{r.promptKey}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-md">{r.description}</TableCell>
                  <TableCell>
                    <Select
                      value={selectedValue}
                      onValueChange={(v) => applyModel(r.promptKey, v)}
                      disabled={isSaving}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default__">
                          Default{r.defaultModel ? ` (${r.defaultModel})` : ''}
                        </SelectItem>
                        {renderModelOptions()}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.updatedAt ? new Date(r.updatedAt).toLocaleString() : '—'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function SettingsModelsPage() {
  return <SettingsShell title="AI Models"><ModelsTab /></SettingsShell>;
}

// ── Main page (legacy tabbed view, kept for direct navigation) ─────────────

export function ManagementPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Settings & Management</h1>
      <Tabs defaultValue="positions">
        <TabsList>
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="levels">Levels</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>
        <TabsContent value="positions" className="mt-4"><PositionsTab /></TabsContent>
        <TabsContent value="categories" className="mt-4"><CategoriesTreeTab /></TabsContent>
        <TabsContent value="levels" className="mt-4"><LevelsTab /></TabsContent>
        <TabsContent value="users" className="mt-4"><UsersTab /></TabsContent>
      </Tabs>
    </div>
  );
}
