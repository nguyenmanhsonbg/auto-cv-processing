import { useState } from 'react';
import type { FacebookGroupSyncDetailItem, FacebookGroupSyncDetails } from '@/types/types';
import { BackIcon, ChevronRightIcon, CloseIcon } from '@/assets/icons';
import { getFacebookGroupDetailKey } from '@/features/facebook/facebook-group-utils';

export const FACEBOOK_INELIGIBLE_PAGE_SIZE = 5;

export type FacebookGroupSyncDetailsModalProps = {
  isOpen: boolean;
  syncDetails: FacebookGroupSyncDetails | null;
  totalGroupCount: number;
  manualIncludingKeys: string[];
  onClose: () => void;
  onManuallyInclude: (group: FacebookGroupSyncDetailItem) => Promise<void> | void;
};

export function FacebookGroupSyncDetailsModal({
  isOpen,
  syncDetails,
  totalGroupCount,
  manualIncludingKeys,
  onClose,
  onManuallyInclude,
}: FacebookGroupSyncDetailsModalProps) {
  const [page, setPage] = useState(1);

  if (!isOpen) return null;

  const filteredItems: FacebookGroupSyncDetailItem[] = syncDetails?.filtered ?? [];
  const totalItems = filteredItems.length;
  const pageCount = Math.max(1, Math.ceil(totalItems / FACEBOOK_INELIGIBLE_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleStart = totalItems === 0 ? 0 : ((currentPage - 1) * FACEBOOK_INELIGIBLE_PAGE_SIZE) + 1;
  const visibleEnd = Math.min(visibleStart + FACEBOOK_INELIGIBLE_PAGE_SIZE - 1, totalItems);
  const pageItems = filteredItems.slice(
    (currentPage - 1) * FACEBOOK_INELIGIBLE_PAGE_SIZE,
    currentPage * FACEBOOK_INELIGIBLE_PAGE_SIZE,
  );
  const paginationItems = buildPaginationPages(currentPage, pageCount);

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="facebook-group-modal facebook-ineligible-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="facebook-group-sync-details-title"
      >
        <header className="modal-header facebook-ineligible-modal-header">
          <div className="facebook-ineligible-modal-heading">
            <div>
              <h2 id="facebook-group-sync-details-title">DANH SÁCH NHÓM KHÔNG PHÙ HỢP</h2>
            </div>
          </div>
          <button
            type="button"
            className="icon-button"
            title="Đóng"
            aria-label="Đóng danh sách nhóm không phù hợp"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>
        <div className="modal-body facebook-ineligible-modal-body">
          <div className="facebook-ineligible-modal-total">
            <span>
              {`${totalItems} nhóm không phù hợp / ${totalGroupCount} nhóm`}
            </span>
          </div>
          <div className="facebook-ineligible-modal-list">
            {pageItems.length > 0 ? (
              pageItems.map((group: FacebookGroupSyncDetailItem) => {
                const groupKey = getFacebookGroupDetailKey(group);
                const isAdding = manualIncludingKeys.includes(groupKey);
                return (
                  <div className="facebook-ineligible-modal-item" key={groupKey}>
                    <div className="facebook-ineligible-modal-copy">
                      <strong>{group.name}</strong>
                      {group.reason ? <span>{group.reason}</span> : null}
                    </div>
                    <div className="facebook-ineligible-modal-actions">
                      <button
                        type="button"
                        className="facebook-ineligible-open-link"
                        disabled={!group.url}
                        onClick={() => {
                          if (group.url) window.open(group.url, '_blank', 'noopener,noreferrer');
                        }}
                      >
                        Mở trong tab mới
                      </button>
                      <button
                        type="button"
                        className="facebook-ineligible-add-button"
                        disabled={isAdding || !group.url}
                        onClick={() => void onManuallyInclude(group)}
                      >
                        {isAdding ? 'Đang thêm...' : 'Thêm nhóm'}
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="channel-subselection-empty">Không có nhóm không phù hợp.</p>
            )}
            {totalItems > 0 ? (
              <div className="facebook-ineligible-modal-pagination">
                <div className="facebook-ineligible-modal-pagination-summary">
                  <span>
                    {`Hiển thị từ ${visibleStart} - ${visibleEnd} của ${totalItems} kết quả`}
                  </span>
                </div>
                <div className="facebook-ineligible-modal-pagination-actions">
                  <div className="facebook-ineligible-modal-pagination-buttons">
                    <button
                      type="button"
                      title="Trang trước"
                      aria-label="Trang trước danh sách nhóm không phù hợp"
                      disabled={currentPage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <BackIcon />
                    </button>
                    {paginationItems.map((p, idx) =>
                      typeof p === 'number' ? (
                        <button
                          key={p}
                          type="button"
                          className={p === currentPage ? 'is-active' : undefined}
                          aria-current={p === currentPage ? 'page' : undefined}
                          onClick={() => setPage(p)}
                        >
                          {p}
                        </button>
                      ) : (
                        <span key={`ellipsis-${idx}`} className="facebook-ineligible-modal-pagination-ellipsis">...</span>
                      ),
                    )}
                    <button
                      type="button"
                      title="Trang sau"
                      aria-label="Trang sau danh sách nhóm không phù hợp"
                      disabled={currentPage >= pageCount}
                      onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    >
                      <ChevronRightIcon />
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function buildPaginationPages(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: Array<number | 'ellipsis'> = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) pages.push('ellipsis');
  for (let p = start; p <= end; p += 1) pages.push(p);
  if (end < totalPages - 1) pages.push('ellipsis');
  pages.push(totalPages);

  return pages;
}
