import type { Key, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  TableBody,
  TableCell,
  TableRow,
} from '@/components/ui/table';
import type { RecruitmentPagination } from '@/lib/recruitment-api';

interface RecruitmentTableBodyProps<Row> {
  items: readonly Row[];
  loading: boolean;
  colSpan: number;
  loadingMessage: string;
  emptyMessage: string;
  getRowKey: (row: Row, index: number) => Key;
  renderRow: (row: Row, index: number) => ReactNode;
}

export function RecruitmentTableBody<Row>({
  items,
  loading,
  colSpan,
  loadingMessage,
  emptyMessage,
  getRowKey,
  renderRow,
}: RecruitmentTableBodyProps<Row>) {
  return (
    <TableBody>
      {loading && (
        <TableRow>
          <TableCell colSpan={colSpan} className="h-24 text-center text-muted-foreground">
            {loadingMessage}
          </TableCell>
        </TableRow>
      )}

      {!loading && items.length === 0 && (
        <TableRow>
          <TableCell colSpan={colSpan} className="h-24 text-center text-muted-foreground">
            {emptyMessage}
          </TableCell>
        </TableRow>
      )}

      {!loading && items.map((row, index) => (
        <FragmentWithKey key={getRowKey(row, index)}>
          {renderRow(row, index)}
        </FragmentWithKey>
      ))}
    </TableBody>
  );
}

function FragmentWithKey({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

interface RecruitmentListFooterProps {
  itemCount: number;
  page: number;
  pagination?: RecruitmentPagination;
  loading: boolean;
  onPageChange: (page: number) => void;
}

function getResultSummary(itemCount: number, pagination?: RecruitmentPagination) {
  if (pagination) {
    return `Page ${pagination.page} of ${pagination.totalPages} - ${pagination.total} total`;
  }

  return `${itemCount} result${itemCount === 1 ? '' : 's'}`;
}

export function RecruitmentListFooter({
  itemCount,
  page,
  pagination,
  loading,
  onPageChange,
}: RecruitmentListFooterProps) {
  const totalPages = pagination?.totalPages ?? 1;
  const canPrevious = page > 1 && !loading;
  const canNext = page < totalPages && !loading;

  return (
    <div className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>{getResultSummary(itemCount, pagination)}</span>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canPrevious}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canNext}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
