import type {
  FacebookPublishHistoriesResponse,
  FacebookReviewStatus,
} from '@/types/types';
import {
  BackIcon,
  CloseIcon,
  DoubleBackIcon,
  DoubleChevronRightIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  HistoryIcon,
  RefreshIcon,
} from '@/components/icons';
import { SelectFilter } from '@/components/filters';
import { getValidFacebookGroupPostUrl } from '@/features/facebook/facebook-post-url';
import { formatDate } from '@/lib/utils';

export type FacebookPostHistoryFilter = 'ALL' | FacebookReviewStatus;
export type FacebookPostHistoryLoadState = 'IDLE' | 'LOADING' | 'READY' | 'ERROR';

export interface FacebookHistoryGroup {
  id: string | null;
  name: string;
  url?: string | null;
  externalId?: string | null;
}

export const FACEBOOK_HISTORY_PAGE_SIZE = 5;
export const FACEBOOK_HISTORY_REFRESH_BATCH_SIZE = 4;
export const FACEBOOK_HISTORY_FILTERS: Array<{ value: FacebookPostHistoryFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'POSTED', label: 'Đã đăng' },
  { value: 'PENDING_REVIEW', label: 'Chờ duyệt' },
  { value: 'REJECTED', label: 'Bị từ chối' },
];

export type FacebookPostHistoryModalProps = {
  group: FacebookHistoryGroup | null;
  historyData: FacebookPublishHistoriesResponse | null;
  page: number;
  filter: FacebookPostHistoryFilter;
  loadState: FacebookPostHistoryLoadState;
  message: string | null;
  isRefreshing: boolean;
  onClose: () => void;
  onChangeFilter: (filter: FacebookPostHistoryFilter) => void;
  onChangePage: (page: number) => void;
  onRefresh: () => void;
};

export function FacebookPostHistoryModal({
  group,
  historyData,
  page,
  filter,
  loadState,
  message,
  isRefreshing,
  onClose,
  onChangeFilter,
  onChangePage,
  onRefresh,
}: FacebookPostHistoryModalProps) {
  if (!group) return null;

  const summary = historyData?.summary ?? {
    total: 0,
    posted: 0,
    pendingReview: 0,
    rejected: 0,
    deleted: 0,
    unknown: 0,
  };
  const pageItems = historyData?.items ?? [];
  const pageCount = Math.max(1, historyData?.totalPages ?? 1);
  const currentPage = Math.min(page, pageCount);
  const totalItems = historyData?.total ?? 0;
  const visibleStart = totalItems === 0 ? 0 : ((currentPage - 1) * FACEBOOK_HISTORY_PAGE_SIZE) + 1;
  const visibleEnd = Math.min(visibleStart + pageItems.length - 1, totalItems);
  const isLoadingHistory = loadState === 'LOADING';
  const isHistoryBusy = isLoadingHistory || isRefreshing;
  const paginationItems = buildPostHistoryPaginationItems(currentPage, pageCount);

  return (
    <div className="modal-backdrop post-history-backdrop" role="presentation">
      <section
        className="post-history-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="facebook-post-history-title"
      >
        <header className="post-history-header">
          <div className="post-history-title">
            <HistoryIcon />
            <h2 id="facebook-post-history-title">Lịch sử đăng bài - {group.name}</h2>
          </div>
          <div className="post-history-header-actions">
            <button
              type="button"
              className="icon-button post-history-close-button"
              title="Đóng"
              aria-label="Đóng lịch sử đăng bài"
              disabled={isRefreshing}
              onClick={onClose}
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className="post-history-body">
          <div className="post-history-summary-grid">
            <article className="post-history-metric is-total">
              <span>Tổng số bài</span>
              <strong>{summary.total}</strong>
            </article>
            <article className="post-history-metric is-posted">
              <span>Đã đăng</span>
              <strong>{summary.posted}</strong>
            </article>
            <article className="post-history-metric is-pending">
              <span>Chờ duyệt</span>
              <strong>{summary.pendingReview}</strong>
            </article>
            <article className="post-history-metric is-rejected">
              <span>Bị từ chối</span>
              <strong>{summary.rejected}</strong>
            </article>
          </div>

          <div className="post-history-filter-row">
            <SelectFilter
              label="Trạng thái bài đăng"
              ariaLabel="Trạng thái bài đăng"
              value={filter}
              options={FACEBOOK_HISTORY_FILTERS}
              disabled={isHistoryBusy}
              onChange={(value) => void onChangeFilter(value as FacebookPostHistoryFilter)}
            />
            <div className="post-history-filter-controls">
              <button
                type="button"
                className={`post-history-refresh-all-button${isRefreshing ? ' is-loading' : ''}`}
                title="Refresh trạng thái các bài đang chờ duyệt hoặc chưa rõ"
                disabled={isHistoryBusy}
                onClick={onRefresh}
              >
                <RefreshIcon />
                <span>{isRefreshing ? 'Đang kiểm tra' : 'Tải lại'}</span>
              </button>
            </div>
          </div>

          {message ? (
            <div className={`post-history-message ${loadState === 'ERROR' ? 'is-error' : ''}`}>
              {message}
            </div>
          ) : null}

          <div className="post-history-table-card">
            <table>
              <colgroup>
                <col className="post-history-date-column" />
                <col className="post-history-title-column" />
                <col className="post-history-status-column" />
                <col className="post-history-action-column" />
              </colgroup>
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Tiêu đề bài đăng</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.length > 0 ? (
                  pageItems.map((item) => {
                    const postUrl = getValidFacebookGroupPostUrl(item.externalPostUrl);
                    return (
                      <tr key={item.id}>
                        <td>{formatDate(item.submittedAt ?? item.createdAt ?? undefined) ?? '-'}</td>
                        <td>
                          <span>{item.title}</span>
                        </td>
                        <td>
                          <span className={`post-history-status is-${item.facebookReviewStatus.toLowerCase().replace('_', '-')}`}>
                            {getFacebookHistoryStatusLabel(item.facebookReviewStatus)}
                          </span>
                        </td>
                        <td>
                          <div className="post-history-actions">
                            {postUrl ? (
                              <button
                                type="button"
                                className="post-history-action-button is-post-link"
                                title="Mở bài viết Facebook"
                                aria-label={`Mở bài viết ${item.title}`}
                                disabled={isHistoryBusy}
                                onClick={() => window.open(postUrl, '_blank', 'noopener,noreferrer')}
                              >
                                <ExternalLinkIcon />
                              </button>
                            ) : (
                              <span className="post-history-no-action">-</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : isLoadingHistory ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="post-history-empty">
                        <strong>Đang tải lịch sử</strong>
                        <span>Đang lấy dữ liệu bài đăng Facebook từ backend.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={4}>
                      <div className="post-history-empty">
                        <strong>{loadState === 'ERROR' ? 'Không tải được lịch sử' : 'Chưa có dữ liệu lịch sử'}</strong>
                        <span>
                          {loadState === 'ERROR'
                            ? (message ?? 'Vui lòng thử lại sau.')
                            : 'Các bài đã auto đăng vào group này sẽ hiển thị tại đây.'}
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="post-history-pagination">
              <span>
                Hiển thị <strong>{visibleStart}</strong> đến <strong>{visibleEnd}</strong> trong <strong>{totalItems}</strong> kết quả
              </span>
              <div>
                <button
                  type="button"
                  title="Trang đầu"
                  aria-label="Trang đầu"
                  disabled={currentPage <= 1 || isHistoryBusy}
                  onClick={() => onChangePage(1)}
                >
                  <DoubleBackIcon />
                </button>
                <button
                  type="button"
                  title="Trang trước"
                  aria-label="Trang trước"
                  disabled={currentPage <= 1 || isHistoryBusy}
                  onClick={() => onChangePage(currentPage - 1)}
                >
                  <BackIcon />
                </button>
                {paginationItems.map((item, index) =>
                  typeof item === 'number' ? (
                    <button
                      key={item}
                      type="button"
                      className={item === currentPage ? 'is-active' : ''}
                      aria-current={item === currentPage ? 'page' : undefined}
                      disabled={isHistoryBusy || item === currentPage}
                      onClick={() => onChangePage(item)}
                    >
                      {item}
                    </button>
                  ) : (
                    <span key={`ellipsis-${index}`} className="post-history-page-ellipsis">...</span>
                  ),
                )}
                <button
                  type="button"
                  title="Trang sau"
                  aria-label="Trang sau"
                  disabled={currentPage >= pageCount || isHistoryBusy}
                  onClick={() => onChangePage(currentPage + 1)}
                >
                  <ChevronRightIcon />
                </button>
                <button
                  type="button"
                  title="Trang cuối"
                  aria-label="Trang cuối"
                  disabled={currentPage >= pageCount || isHistoryBusy}
                  onClick={() => onChangePage(pageCount)}
                >
                  <DoubleChevronRightIcon />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export type PostHistoryPaginationItem = number | 'ellipsis-left' | 'ellipsis-right';

export function buildPostHistoryPaginationItems(currentPage: number, pageCount: number): PostHistoryPaginationItem[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const items: PostHistoryPaginationItem[] = [1];
  const start =
    currentPage <= 4
      ? 2
      : currentPage >= pageCount - 3
        ? pageCount - 4
        : currentPage - 1;
  const end =
    currentPage <= 4
      ? 5
      : currentPage >= pageCount - 3
        ? pageCount - 1
        : currentPage + 1;

  if (start > 2) {
    items.push('ellipsis-left');
  } else {
    for (let page = 2; page < start; page += 1) items.push(page);
  }

  for (let page = start; page <= end; page += 1) {
    items.push(page);
  }

  if (end < pageCount - 1) {
    items.push('ellipsis-right');
  } else {
    for (let page = end + 1; page <= pageCount; page += 1) items.push(page);
  }

  if (!items.includes(pageCount)) items.push(pageCount);

  return items;
}

export function getFacebookHistoryStatusLabel(status: Exclude<FacebookPostHistoryFilter, 'ALL'>) {
  if (status === 'PENDING_REVIEW') return 'Chờ duyệt';
  if (status === 'REJECTED') return 'Bị từ chối';
  if (status === 'DELETED') return 'Đã xóa';
  if (status === 'UNKNOWN') return 'Không rõ';
  return 'Đã đăng';
}
