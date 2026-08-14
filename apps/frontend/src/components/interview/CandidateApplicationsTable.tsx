import { Badge } from '@/components/ui/badge';
import { RecruitmentTableBody } from '@/components/recruitment/RecruitmentListPrimitives';
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  getApplicationStatusClassName,
  getApplicationStatusLabel,
} from '@/components/recruitment/ApplicationOverview';
import { formatCandidateValue } from '@/components/interview/candidate-display';
import type { RecruitmentPagination } from '@/lib/recruitment-api';

export interface CandidateApplicationTableRecord {
  referralId: string;
  candidateName?: string | null;
  jobPostingTitle?: string | null;
  processStatus?: string | null;
  hrReceptionStatus?: string | null;
  evaluation?: string | null;
}

interface CandidateApplicationsTableProps<T extends CandidateApplicationTableRecord> {
  applications: readonly T[];
  pagination: RecruitmentPagination;
  loading: boolean;
  headers?: Partial<Record<'number' | 'candidate' | 'jobPosting' | 'process' | 'hrReception' | 'evaluation', string>>;
}

const defaultHeaders = {
  number: 'No.',
  candidate: 'Candidate',
  jobPosting: 'JD',
  process: 'Process status',
  hrReception: 'HR reception',
  evaluation: 'Evaluation',
};

function ApplicationStatusCell({ value }: { value?: string | null }) {
  return value ? (
    <TableCell>
      <Badge className={getApplicationStatusClassName(value)}>
        {getApplicationStatusLabel(value)}
      </Badge>
    </TableCell>
  ) : <TableCell>-</TableCell>;
}

export function CandidateApplicationsTable<T extends CandidateApplicationTableRecord>({
  applications,
  pagination,
  loading,
  headers,
}: CandidateApplicationsTableProps<T>) {
  const tableHeaders = { ...defaultHeaders, ...headers };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">{tableHeaders.number}</TableHead>
          <TableHead>{tableHeaders.candidate}</TableHead>
          <TableHead>{tableHeaders.jobPosting}</TableHead>
          <TableHead>{tableHeaders.process}</TableHead>
          <TableHead>{tableHeaders.hrReception}</TableHead>
          <TableHead>{tableHeaders.evaluation}</TableHead>
        </TableRow>
      </TableHeader>
      <RecruitmentTableBody
        items={applications}
        loading={loading}
        colSpan={6}
        loadingMessage="Loading applications..."
        emptyMessage="No applications found."
        getRowKey={(application) => application.referralId}
        renderRow={(application, index) => (
          <TableRow>
            <TableCell>
              {(pagination.page - 1) * pagination.limit + index + 1}
            </TableCell>
            <TableCell className="font-medium">
              {formatCandidateValue(application.candidateName)}
            </TableCell>
            <TableCell>{formatCandidateValue(application.jobPostingTitle)}</TableCell>
            <ApplicationStatusCell value={application.processStatus} />
            <ApplicationStatusCell value={application.hrReceptionStatus} />
            <TableCell className="max-w-md whitespace-pre-wrap break-words">
              {formatCandidateValue(application.evaluation)}
            </TableCell>
          </TableRow>
        )}
      />
    </Table>
  );
}
