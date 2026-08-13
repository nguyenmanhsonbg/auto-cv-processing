import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Loader2, Search } from 'lucide-react';
import {
  getApplicationStatusClassName,
  getApplicationStatusLabel,
} from '@/components/recruitment/ApplicationOverview';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { getInternalSafeErrorMessage } from '@/lib/api-errors';
import {
  downloadMyFreelancerCv,
  getMyFreelancer,
  listMyFreelancerApplications,
  updateMyFreelancerApplicationEvaluation,
  type FreelancerApplicationRecord,
  type FreelancerRecord,
} from '@/lib/freelancer-api';
import type { RecruitmentPagination } from '@/lib/recruitment-api';

const DEFAULT_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;
const OBJECT_URL_REVOKE_DELAY_MS = 60_000;

function valueOrDash(value?: string | null) {
  if (!value?.trim()) return '-';
  return value;
}

function normalizeEvaluation(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function mergeDrafts(
  currentDrafts: Record<string, string>,
  nextApplications: FreelancerApplicationRecord[],
) {
  const nextDrafts = { ...currentDrafts };

  for (const application of nextApplications) {
    if (!(application.referralId in nextDrafts)) {
      nextDrafts[application.referralId] = application.evaluation ?? '';
    }
  }

  return nextDrafts;
}

function addReferralToSet(currentSet: Set<string>, referralId: string) {
  const nextSet = new Set(currentSet);
  nextSet.add(referralId);
  return nextSet;
}

function removeReferralFromSet(currentSet: Set<string>, referralId: string) {
  const nextSet = new Set(currentSet);
  nextSet.delete(referralId);
  return nextSet;
}

export function FreelancerWorkspacePage() {
  const [freelancer, setFreelancer] = useState<FreelancerRecord | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [applications, setApplications] = useState<FreelancerApplicationRecord[]>([]);
  const [pagination, setPagination] = useState<RecruitmentPagination | undefined>();
  const [tableLoading, setTableLoading] = useState(true);
  const [tableError, setTableError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingReferralIds, setSavingReferralIds] = useState<Set<string>>(() => new Set());
  const [viewingCvReferralIds, setViewingCvReferralIds] = useState<Set<string>>(() => new Set());
  const summaryLoadRef = useRef(0);
  const tableLoadRef = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(searchTimer.current);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const loadFreelancer = useCallback(async () => {
    const loadId = ++summaryLoadRef.current;
    setSummaryLoading(true);
    setSummaryError(null);

    try {
      const result = await getMyFreelancer();
      if (loadId !== summaryLoadRef.current) return;
      setFreelancer(result);
    } catch (error) {
      if (loadId !== summaryLoadRef.current) return;
      setFreelancer(null);
      setSummaryError(getInternalSafeErrorMessage(error));
    } finally {
      if (loadId === summaryLoadRef.current) {
        setSummaryLoading(false);
      }
    }
  }, [limit, page, search]);

  const loadApplications = useCallback(async () => {
    const loadId = ++tableLoadRef.current;
    setTableLoading(true);
    setTableError(null);

    try {
      const result = await listMyFreelancerApplications({
        page,
        limit,
        search: search || undefined,
      });

      if (loadId !== tableLoadRef.current) return;

      const total = result.pagination?.total ?? 0;
      if (result.data.length === 0 && page > 1 && total > 0) {
        setPage((current) => Math.max(1, current - 1));
        return;
      }

      setApplications(result.data);
      setPagination(result.pagination);
      setDrafts((currentDrafts) => mergeDrafts(currentDrafts, result.data));
    } catch (error) {
      if (loadId !== tableLoadRef.current) return;
      setApplications([]);
      setPagination(undefined);
      setTableError(getInternalSafeErrorMessage(error));
    } finally {
      if (loadId === tableLoadRef.current) {
        setTableLoading(false);
      }
    }
  }, [limit, page, search]);

  useEffect(() => {
    void loadFreelancer();
    void loadApplications();
  }, [loadApplications, loadFreelancer]);

  const handleViewCv = async (referralId: string) => {
    const previewWindow = window.open('', '_blank');
    if (!previewWindow) {
      toast({
        title: 'Không thể mở tab mới',
        description: 'Vui lòng cho phép popup cho trang này.',
        variant: 'destructive',
      });
      return;
    }

    setViewingCvReferralIds((currentSet) => addReferralToSet(currentSet, referralId));

    try {
      const blob = await downloadMyFreelancerCv(referralId);
      const objectUrl = URL.createObjectURL(blob);
      previewWindow.location.href = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), OBJECT_URL_REVOKE_DELAY_MS);
    } catch (error) {
      previewWindow.close();
      toast({
        title: 'Không thể mở CV',
        description: getInternalSafeErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setViewingCvReferralIds((currentSet) => removeReferralFromSet(currentSet, referralId));
    }
  };

  const handleSaveEvaluation = async (application: FreelancerApplicationRecord) => {
    const draft = drafts[application.referralId] ?? application.evaluation ?? '';
    const nextEvaluation = normalizeEvaluation(draft);

    setSavingReferralIds((currentSet) => addReferralToSet(currentSet, application.referralId));

    try {
      const updated = await updateMyFreelancerApplicationEvaluation(
        application.referralId,
        nextEvaluation,
      );

      setApplications((currentApplications) => currentApplications.map((currentApplication) => (
        currentApplication.referralId === application.referralId
          ? updated
          : currentApplication
      )));
      setDrafts((currentDrafts) => ({
        ...currentDrafts,
        [application.referralId]: updated.evaluation ?? '',
      }));
      toast({ title: 'Đã lưu đánh giá chung' });
    } catch (error) {
      toast({
        title: 'Không thể lưu đánh giá',
        description: getInternalSafeErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setSavingReferralIds((currentSet) => removeReferralFromSet(
        currentSet,
        application.referralId,
      ));
    }
  };

  const currentPagination = pagination ?? {
    page,
    limit,
    total: applications.length,
    totalPages: 1,
  };
  const hideTablePagination = tableLoading && !pagination && applications.length === 0;

  let freelancerSummaryContent: ReactNode;
  if (summaryLoading && !freelancer) {
    freelancerSummaryContent = (
      <p className="text-sm text-muted-foreground">
        Đang tải thông tin freelancer...
      </p>
    );
  } else if (freelancer) {
    freelancerSummaryContent = (
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{freelancer.name}</span>
        <span>•</span>
        <span>{freelancer.identifier}</span>
        <span>•</span>
        <span>{freelancer.applicationCount} hồ sơ</span>
      </div>
    );
  } else {
    freelancerSummaryContent = (
      <p className="text-sm text-muted-foreground">
        Không tải được thông tin freelancer.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Candidates</p>
        <h1 className="text-2xl font-semibold">Freelancer workspace</h1>

        {freelancerSummaryContent}

        <p className="text-sm text-muted-foreground">
          Chỉ hiển thị thông tin tối thiểu. Số điện thoại, email và dữ liệu nhạy cảm của ứng viên
          được ẩn trên màn hình này.
        </p>

        {summaryError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {summaryError}
          </div>
        ) : null}
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div className="space-y-1">
            <CardTitle className="text-lg">Danh sách ứng viên</CardTitle>
            <p className="text-sm text-muted-foreground">
              Tìm theo tên ứng viên hoặc JD. Bạn chỉ có thể cập nhật đánh giá chung của chính
              referral của mình.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr]">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Tìm theo ứng viên hoặc JD"
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {tableError ? (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {tableError}
            </div>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">STT</TableHead>
                <TableHead>Tên ứng viên</TableHead>
                <TableHead>JD</TableHead>
                <TableHead>Trạng thái process</TableHead>
                <TableHead>HR tiếp nhận hồ sơ</TableHead>
                <TableHead className="min-w-[280px]">Đánh giá chung</TableHead>
                <TableHead className="w-24">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    Đang tải danh sách ứng viên...
                  </TableCell>
                </TableRow>
              ) : null}

              {!tableLoading && applications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    Không có hồ sơ phù hợp.
                  </TableCell>
                </TableRow>
              ) : null}

              {!tableLoading && applications.map((application, index) => {
                const draftValue = drafts[application.referralId] ?? application.evaluation ?? '';
                const isRowSaving = savingReferralIds.has(application.referralId);
                const isViewingCv = viewingCvReferralIds.has(application.referralId);
                const isDraftUnchanged = normalizeEvaluation(draftValue)
                  === normalizeEvaluation(application.evaluation);

                return (
                  <TableRow key={application.referralId} className={isRowSaving ? 'opacity-70' : undefined}>
                    <TableCell>
                      {(currentPagination.page - 1) * currentPagination.limit + index + 1}
                    </TableCell>
                    <TableCell className="align-top">
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0 font-medium"
                        disabled={isRowSaving || isViewingCv}
                        onClick={() => void handleViewCv(application.referralId)}
                      >
                        {isViewingCv ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        {valueOrDash(application.candidateName)}
                      </Button>
                    </TableCell>
                    <TableCell className="align-top">
                      {valueOrDash(application.jobPostingTitle)}
                    </TableCell>
                    <TableCell className="align-top">
                      {application.processStatus ? (
                        <Badge className={getApplicationStatusClassName(application.processStatus)}>
                          {getApplicationStatusLabel(application.processStatus)}
                        </Badge>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      {application.hrReceptionStatus ? (
                        <Badge className={getApplicationStatusClassName(application.hrReceptionStatus)}>
                          {getApplicationStatusLabel(application.hrReceptionStatus)}
                        </Badge>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <Textarea
                        value={draftValue}
                        onChange={(event) => setDrafts((currentDrafts) => ({
                          ...currentDrafts,
                          [application.referralId]: event.target.value,
                        }))}
                        placeholder="Nhập đánh giá chung"
                        className="min-h-[30px] resize-y text-sm"
                        disabled={isRowSaving}
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <Button
                        type="button"
                        size="sm"
                        disabled={isRowSaving || isDraftUnchanged}
                        onClick={() => void handleSaveEvaluation(application)}
                      >
                        {isRowSaving ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Lưu
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {!hideTablePagination ? (
            <div className="mt-4">
              <DataTablePagination
                page={currentPagination.page}
                totalPages={currentPagination.totalPages}
                total={currentPagination.total}
                limit={currentPagination.limit}
                onPageChange={setPage}
                onLimitChange={setLimit}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
