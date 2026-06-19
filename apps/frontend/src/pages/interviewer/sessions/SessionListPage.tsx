import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';
import { useAuthContext } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { MultiSelect } from '@/components/ui/multi-select';
import { Badge } from '@/components/ui/badge';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { SortableHeader, SortOrder } from '@/components/ui/sortable-header';
import { Plus, ChevronRight, Trash2, Search, SlidersHorizontal } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { UserRole } from '@interview-assistant/shared';
import type { PaginatedResponse } from '@interview-assistant/shared';
import { cn } from '@/lib/utils';

interface Level { id: string; name: string; displayName: string }

const statusStyles: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 border-gray-200',
  IN_PROGRESS: 'bg-blue-100 text-blue-800 border-blue-200',
  COMPLETED: 'bg-green-100 text-green-800 border-green-200',
  EVALUATED: 'bg-purple-100 text-purple-800 border-purple-200',
};

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'EVALUATED', label: 'Evaluated' },
];

const LIMIT = 20;

export function SessionListPage() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const isAdmin = user?.role === UserRole.ADMIN;

  const [result, setResult] = useState<PaginatedResponse<any>>({ data: [], total: 0, page: 1, limit: LIMIT, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [levelOptions, setLevelOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    apiClient.get<PaginatedResponse<Level>>('/levels', { limit: 100 })
      .then((r) => setLevelOptions(r.data.map((l) => ({ value: l.name, label: l.displayName }))))
      .catch(() => {});
  }, []);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [levelFilter, setLevelFilter] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(LIMIT);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('DESC');

  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, levelFilter, sortBy, sortOrder]);

  const load = useCallback(() => {
    setLoading(true);
    apiClient
      .get<PaginatedResponse<any>>('/sessions', {
        page,
        limit,
        search: debouncedSearch || undefined,
        status: statusFilter.length > 0 ? statusFilter.join(',') : undefined,
        targetLevel: levelFilter.length > 0 ? levelFilter.join(',') : undefined,
        sortBy,
        sortOrder,
      })
      .then((data) => setResult(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, limit, debouncedSearch, statusFilter, levelFilter, sortBy, sortOrder]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    try {
      await apiClient.delete(`/sessions/${id}`);
      toast({ title: 'Session deleted' });
      load();
    } catch {
      toast({ title: 'Delete failed', variant: 'destructive' });
    }
  };

  const handleSort = (field: string, order: SortOrder) => { setSortBy(field); setSortOrder(order); };
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl sm:text-3xl font-bold">Sessions</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="sm:hidden" onClick={() => setFiltersOpen((v) => !v)}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </Button>
          <Link to="/sessions/new">
            <Button>
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">New Session</span>
            </Button>
          </Link>
        </div>
      </div>

      <div className={filtersOpen ? 'flex flex-col gap-3' : 'hidden sm:flex sm:items-center sm:gap-3 sm:flex-wrap'}>
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search candidate…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-full sm:w-60" />
        </div>
        <MultiSelect options={STATUS_OPTIONS} selected={statusFilter} onChange={setStatusFilter} placeholder="All Statuses" className="w-full sm:flex-none sm:w-44" />
        <MultiSelect options={levelOptions} selected={levelFilter} onChange={setLevelFilter} placeholder="All Levels" className="w-full sm:flex-none sm:w-44" />
      </div>

      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead><SortableHeader label="Candidate" field="candidateName" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead><SortableHeader label="Status" field="status" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead><SortableHeader label="Target Level" field="targetLevel" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead>Created By</TableHead>
            <TableHead><SortableHeader label="Created" field="createdAt" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
          ) : result.data.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No sessions found.</TableCell></TableRow>
          ) : (
            result.data.map((s) => (
              <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/sessions/${s.slug}`)}>
                <TableCell className="font-medium">{s.candidate?.name || 'Unknown'}</TableCell>
                <TableCell>
                  <Badge className={cn(statusStyles[s.status] || '')} variant="outline">{s.status}</Badge>
                </TableCell>
                <TableCell>{s.targetLevel}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{s.createdBy?.email ?? '—'}</TableCell>
                <TableCell>{new Date(s.createdAt).toLocaleDateString()}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Link to={`/sessions/${s.slug}`}>
                      <Button variant="ghost" size="sm">View<ChevronRight className="h-4 w-4 ml-1" /></Button>
                    </Link>
                    {isAdmin && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(s.id)} title="Delete session">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
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
    </div>
  );
}
