import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';
import { useAuthContext } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { MultiSelect } from '@/components/ui/multi-select';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { SortableHeader, SortOrder } from '@/components/ui/sortable-header';
import { Plus, Trash2, Search, SlidersHorizontal } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { UserRole } from '@interview-assistant/shared';
import type { Candidate, PaginatedResponse } from '@interview-assistant/shared';

interface Level { id: string; name: string; displayName: string }

const LIMIT = 20;

export function CandidateListPage() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const isAdmin = user?.role === UserRole.ADMIN;

  const [result, setResult] = useState<PaginatedResponse<Candidate>>({ data: [], total: 0, page: 1, limit: LIMIT, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [levelOptions, setLevelOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    apiClient.get<PaginatedResponse<Level>>('/levels', { limit: 100 })
      .then((r) => setLevelOptions(r.data.map((l) => ({ value: l.name, label: l.displayName }))))
      .catch(() => {});
  }, []);

  const [search, setSearch] = useState('');
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

  useEffect(() => { setPage(1); }, [debouncedSearch, levelFilter, sortBy, sortOrder]);

  const load = useCallback(() => {
    setLoading(true);
    apiClient
      .get<PaginatedResponse<Candidate>>('/candidates', {
        page,
        limit,
        search: debouncedSearch || undefined,
        level: levelFilter.length > 0 ? levelFilter.join(',') : undefined,
        sortBy,
        sortOrder,
      })
      .then((data) => setResult(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, limit, debouncedSearch, levelFilter, sortBy, sortOrder]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Delete this candidate? This cannot be undone.')) return;
    try {
      await apiClient.delete(`/candidates/${id}`);
      toast({ title: 'Candidate deleted' });
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
        <h1 className="text-2xl sm:text-3xl font-bold">Candidates</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="sm:hidden" onClick={() => setFiltersOpen((v) => !v)}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </Button>
          <Link to="/candidates/new">
            <Button>
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">New Candidate</span>
            </Button>
          </Link>
        </div>
      </div>

      <div className={filtersOpen ? 'flex flex-col gap-3' : 'hidden sm:flex sm:items-center sm:gap-3 sm:flex-wrap'}>
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, position…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 w-full sm:w-72"
          />
        </div>
        <MultiSelect options={levelOptions} selected={levelFilter} onChange={setLevelFilter} placeholder="All Levels" className="w-full sm:w-44" />
      </div>

      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead><SortableHeader label="Name" field="name" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead><SortableHeader label="Email" field="email" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead><SortableHeader label="Position" field="position" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead><SortableHeader label="Level" field="level" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            <TableHead>Created By</TableHead>
            <TableHead>Assigned To</TableHead>
            <TableHead><SortableHeader label="Created" field="createdAt" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
            {isAdmin && <TableHead className="w-24">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={isAdmin ? 8 : 7} className="text-center text-muted-foreground py-8">Loading…</TableCell>
            </TableRow>
          ) : result.data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={isAdmin ? 8 : 7} className="text-center text-muted-foreground">No candidates found.</TableCell>
            </TableRow>
          ) : (
            result.data.map((c) => (
              <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/candidates/${c.slug || c.id}`)}>
                <TableCell className="font-medium text-blue-600 underline">{c.name}</TableCell>
                <TableCell>{(c as any).email || '-'}</TableCell>
                <TableCell>{(c as any).position}</TableCell>
                <TableCell>{c.level}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{(c as any).createdBy?.email ?? '—'}</TableCell>
                <TableCell>
                  {c.assignees?.length
                    ? (
                      <div className="flex flex-wrap gap-1">
                        {c.assignees.map(u => (
                          <Badge key={u.id} variant="secondary" className="text-xs font-normal">{u.email}</Badge>
                        ))}
                      </div>
                    )
                    : <span className="text-sm text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>{new Date(c.createdAt).toLocaleDateString()}</TableCell>
                {isAdmin && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => handleDelete(e, c.id)} title="Delete candidate">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                )}
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
