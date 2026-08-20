import { useRef, useState } from 'react';
import type { FacebookPublishTarget } from '@/types/types';
import {
  BackIcon,
  ChevronRightIcon,
  CloseIcon,
  EditIcon,
  ExternalLinkIcon,
  RefreshIcon,
  TrashIcon,
} from '@/components/icons';
import { SearchField } from '@/components/filters';
import { FacebookGroupFormModal } from '@/components/facebook/FacebookGroupFormModal';
import { FacebookGroupDeleteModal } from '@/components/facebook/FacebookGroupDeleteModal';
import {
  getFacebookEligibilityLabel,
  getFacebookGroupBadgeClass,
  isSelectableFacebookGroup,
} from '@/features/facebook/facebook-group-utils';

export const FACEBOOK_GROUP_PAGE_SIZE = 5;

export type FacebookGroupModalMode = 'SETTINGS' | 'EDIT' | 'DELETE';

export type FacebookGroupSettingsModalProps = {
  isOpen: boolean;
  facebookGroups: FacebookPublishTarget[];
  facebookSettingsState: 'IDLE' | 'LOADING' | 'READY' | 'SAVING' | 'VERIFYING' | 'ERROR' | 'DISCOVERING';
  facebookSettingsMessage: string | null;
  verifyingFacebookGroupIds: string[];
  queuedFacebookGroupIds: string[];
  isGroupFormOpen: boolean;
  onClose: () => void;
  onOpenCreateModal: () => void;
  onCheckEligibility: (group: FacebookPublishTarget) => Promise<void> | void;
  onEditGroup: (group: FacebookPublishTarget, name: string, url: string) => Promise<void> | void;
  onDeleteGroup: (group: FacebookPublishTarget) => Promise<void> | void;
  onCreateGroup: (name: string, url: string) => Promise<void> | void;
  createGroupName: string;
  createGroupUrl: string;
  createGroupNameError: string | null;
  createGroupUrlError: string | null;
  onCreateGroupNameChange: (name: string) => void;
  onCreateGroupUrlChange: (url: string) => void;
  onCloseCreateModal: () => void;
};

export function FacebookGroupSettingsModal({
  isOpen,
  facebookGroups,
  facebookSettingsState,
  facebookSettingsMessage,
  verifyingFacebookGroupIds,
  queuedFacebookGroupIds,
  isGroupFormOpen,
  onClose,
  onOpenCreateModal,
  onCheckEligibility,
  onEditGroup,
  onDeleteGroup,
  onCreateGroup,
  createGroupName,
  createGroupUrl,
  createGroupNameError,
  createGroupUrlError,
  onCreateGroupNameChange,
  onCreateGroupUrlChange,
  onCloseCreateModal,
}: FacebookGroupSettingsModalProps) {
  const [modalMode, setModalMode] = useState<FacebookGroupModalMode>('SETTINGS');
  const [selectedGroup, setSelectedGroup] = useState<FacebookPublishTarget | null>(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  if (isGroupFormOpen) {
    return (
      <div className="modal-backdrop" role="presentation">
        <FacebookGroupFormModal
          mode="create"
          title="Thêm nhóm Facebook mới"
          name={createGroupName}
          url={createGroupUrl}
          nameError={createGroupNameError}
          urlError={createGroupUrlError}
          message={facebookSettingsMessage}
          messageIsError={facebookSettingsState === 'ERROR'}
          isSaving={facebookSettingsState === 'SAVING'}
          onNameChange={(event) => onCreateGroupNameChange(event.target.value)}
          onUrlChange={(event) => onCreateGroupUrlChange(event.target.value)}
          onSubmit={(event) => {
            event.preventDefault();
            void onCreateGroup(createGroupName, createGroupUrl);
          }}
          onCancel={onCloseCreateModal}
          onClose={onCloseCreateModal}
        />
      </div>
    );
  }

  const query = searchQuery.trim().toLocaleLowerCase('vi-VN');
  const filteredGroups = query
    ? facebookGroups.filter((g) => g.targetName.toLocaleLowerCase('vi-VN').includes(query))
    : facebookGroups;

  const totalItems = filteredGroups.length;
  const pageCount = Math.max(1, Math.ceil(totalItems / FACEBOOK_GROUP_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleStart = totalItems === 0 ? 0 : ((currentPage - 1) * FACEBOOK_GROUP_PAGE_SIZE) + 1;
  const pageItems = filteredGroups.slice(
    (currentPage - 1) * FACEBOOK_GROUP_PAGE_SIZE,
    currentPage * FACEBOOK_GROUP_PAGE_SIZE,
  );
  const visibleEnd = totalItems === 0 ? 0 : visibleStart + pageItems.length - 1;
  const paginationItems = buildPaginationPages(currentPage, pageCount);

  function openEdit(group: FacebookPublishTarget) {
    setSelectedGroup(group);
    setEditName(group.targetName);
    setEditUrl(group.targetUrl ?? '');
    setModalMode('EDIT');
  }

  function openDelete(group: FacebookPublishTarget) {
    setSelectedGroup(group);
    setModalMode('DELETE');
  }

  function closeSubModal() {
    setSelectedGroup(null);
    setModalMode('SETTINGS');
  }

  return (
    <div className="modal-backdrop" role="presentation">
      {modalMode === 'SETTINGS' ? (
        <section
          className="facebook-group-modal facebook-group-settings-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="facebook-group-settings-title"
        >
          <header className="modal-header">
            <div>
              <h2 id="facebook-group-settings-title">Cài đặt nhóm Facebook</h2>
            </div>
            <button
              type="button"
              className="icon-button"
              title="Đóng"
              aria-label="Đóng"
              onClick={onClose}
            >
              <CloseIcon />
            </button>
          </header>

          <div className="modal-body">
            <div className="modal-toolbar">
              <p className="section-title">Danh sách nhóm</p>
              <button
                type="button"
                className="secondary-button compact-button"
                onClick={onOpenCreateModal}
              >
                Thêm nhóm mới
              </button>
            </div>

            <SearchField
              className="facebook-settings-search"
              inputRef={searchInputRef as any}
              value={searchInput}
              maxLength={255}
              placeholder="Tìm kiếm nhóm Facebook"
              ariaLabel="Tìm kiếm nhóm Facebook"
              onChange={setSearchInput}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                const trimmed = searchInput.trim();
                setSearchInput(trimmed);
                setSearchQuery(trimmed);
                setPage(1);
              }}
              clearButton={searchInput.length > 0 ? (
                <button
                  type="button"
                  className="facebook-settings-search-clear"
                  title="Xóa tìm kiếm nhóm Facebook"
                  aria-label="Xóa tìm kiếm nhóm Facebook"
                  onClick={() => {
                    setSearchInput('');
                    setSearchQuery('');
                    setPage(1);
                    searchInputRef.current?.focus();
                  }}
                >
                  <CloseIcon />
                </button>
              ) : null}
            />

            {facebookSettingsMessage ? (
              <p className={`modal-status${facebookSettingsState === 'ERROR' ? ' is-error' : ''}`}>
                {facebookSettingsMessage}
              </p>
            ) : null}

            {facebookSettingsState === 'LOADING' ? (
              <p className="muted-text">Đang tải danh sách nhóm từ backend...</p>
            ) : (
              <div className="facebook-group-list">
                {pageItems.length > 0 ? (
                  pageItems.map((group) => {
                    const isGroupChecking = Boolean(group.targetId && verifyingFacebookGroupIds.includes(group.targetId));
                    const isGroupQueued = Boolean(group.targetId && queuedFacebookGroupIds.includes(group.targetId));
                    const groupStatusMessage = isGroupChecking ? 'Đang kiểm tra...' : null;

                    return (
                      <article
                        key={group.targetId ?? group.targetExternalId ?? group.targetUrl ?? group.targetName}
                        className={`facebook-group-item${!isSelectableFacebookGroup(group) ? ' is-disabled' : ''}`}
                      >
                        <div className="facebook-group-info">
                          <div className="facebook-group-title-row">
                            <strong>{group.targetName}</strong>
                          </div>
                        </div>
                        <div className="facebook-group-item-actions">
                          {group.targetUrl ? (
                            <a
                              className="facebook-group-open-link"
                              href={group.targetUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Mở trong tab mới
                              <ExternalLinkIcon />
                            </a>
                          ) : null}
                          <div className="group-icon-button-wrapper">
                            <button
                              type="button"
                              className={`group-icon-button${isGroupChecking ? ' is-loading' : ''}`}
                              title={isGroupQueued ? 'Đang chờ kiểm tra' : 'Kiểm tra khả năng đăng bài'}
                              aria-label={`${isGroupQueued ? 'Đang chờ kiểm tra' : 'Kiểm tra khả năng đăng bài'} ${group.targetName}`}
                              disabled={facebookSettingsState === 'SAVING' || isGroupChecking || isGroupQueued || !group.targetId}
                              onClick={() => void onCheckEligibility(group)}
                            >
                              <RefreshIcon />
                            </button>
                            <button
                              type="button"
                              className="group-icon-button"
                              title="Chỉnh sửa nhóm"
                              aria-label={`Chỉnh sửa nhóm ${group.targetName}`}
                              onClick={() => openEdit(group)}
                            >
                              <EditIcon />
                            </button>
                            <button
                              type="button"
                              className="group-icon-button is-danger"
                              title="Xóa nhóm"
                              aria-label={`Xóa nhóm ${group.targetName}`}
                              onClick={() => openDelete(group)}
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </div>
                        <div className="facebook-group-status-row">
                          <span className={`facebook-group-badge ${getFacebookGroupBadgeClass(group.eligibilityStatus)}`}>
                            {getFacebookEligibilityLabel(group.eligibilityStatus)}
                          </span>
                          <span className={`facebook-group-badge${group.quotaExceeded ? ' is-danger' : ' is-neutral'}`}>
                            Hôm nay đã đăng {group.quotaLabel ?? `${group.todayPublishCount ?? 0}/${group.dailyPublishLimit ?? 10}`}
                          </span>
                        </div>
                        {groupStatusMessage ? (
                          <p className="facebook-group-reason">{groupStatusMessage}</p>
                        ) : null}
                      </article>
                    );
                  })
                ) : searchQuery ? (
                  <div className="facebook-group-empty">
                    <strong>Không tìm thấy nhóm Facebook phù hợp</strong>
                  </div>
                ) : (
                  <div className="facebook-group-empty">
                    <strong>Chưa có nhóm Facebook</strong>
                    <p>Danh sách sẽ được nạp sau lần đồng bộ đầu tiên.</p>
                    <button
                      type="button"
                      className="primary-button compact-button"
                      onClick={onOpenCreateModal}
                    >
                      Thêm nhóm mới
                    </button>
                  </div>
                )}
              </div>
            )}

            {totalItems > FACEBOOK_GROUP_PAGE_SIZE ? (
              <div className="facebook-group-pagination">
                <span>
                  Hiển thị <strong>{visibleStart}</strong> đến <strong>{visibleEnd}</strong> trong <strong>{totalItems}</strong> nhóm
                </span>
                <div>
                  <button
                    type="button"
                    title="Trang trước"
                    aria-label="Trang trước danh sách nhóm Facebook"
                    disabled={currentPage <= 1 || facebookSettingsState === 'SAVING'}
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
                        disabled={facebookSettingsState === 'SAVING'}
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </button>
                    ) : (
                      <span
                        key={`facebook-group-ellipsis-${idx}`}
                        className="facebook-group-pagination-ellipsis"
                        aria-hidden="true"
                      >
                        ...
                      </span>
                    ),
                  )}
                  <button
                    type="button"
                    title="Trang sau"
                    aria-label="Trang sau danh sách nhóm Facebook"
                    disabled={currentPage >= pageCount || facebookSettingsState === 'SAVING'}
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  >
                    <ChevronRightIcon />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {modalMode === 'EDIT' && selectedGroup ? (
        <FacebookGroupFormModal
          mode="edit"
          title="Chỉnh sửa thông tin nhóm Facebook"
          name={editName}
          url={editUrl}
          message={facebookSettingsMessage}
          messageIsError={facebookSettingsState === 'ERROR'}
          isSaving={facebookSettingsState === 'SAVING'}
          onNameChange={(event) => setEditName(event.target.value)}
          onSubmit={(event) => {
            event.preventDefault();
            void onEditGroup(selectedGroup, editName, editUrl);
          }}
          onCancel={closeSubModal}
          onClose={closeSubModal}
        />
      ) : null}

      {modalMode === 'DELETE' && selectedGroup ? (
        <FacebookGroupDeleteModal
          groupName={selectedGroup.targetName}
          isDeleting={facebookSettingsState === 'SAVING'}
          message={facebookSettingsMessage}
          messageIsError={facebookSettingsState === 'ERROR'}
          onConfirm={() => void onDeleteGroup(selectedGroup)}
          onCancel={closeSubModal}
          onClose={closeSubModal}
        />
      ) : null}
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
