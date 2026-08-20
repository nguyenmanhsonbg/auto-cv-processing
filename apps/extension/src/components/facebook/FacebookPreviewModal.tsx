import type {
  AmisJobSnapshot,
  FacebookAccount,
  FacebookPublishAttachment,
  JobDescriptionSummary,
} from '@/types/types';
import {
  CheckCircleIcon,
  CloseIcon,
  EditIcon,
  ImageFrameIcon,
  MenuLinesIcon,
  SparklesIcon,
} from '@/components/icons';
import { FACEBOOK_MAX_IMAGE_ATTACHMENTS } from '@/lib/config';

export type FacebookPreviewModalMode = 'PREVIEW' | 'EDIT' | null;

export type FacebookPreviewModalProps = {
  mode: FacebookPreviewModalMode;
  token: string | null;
  snapshot: AmisJobSnapshot | null;
  selectedJobDescription: JobDescriptionSummary | null;
  facebookAccount: FacebookAccount | null;
  facebookPreviewIdentity: Pick<FacebookAccount, 'displayName' | 'avatarUrl'> | null;
  facebookContentBusy: boolean;
  facebookContentDraft: string;
  facebookImageAttachments: FacebookPublishAttachment[];
  facebookImageUploadDisabled: boolean;
  facebookImageAddDisabled: boolean;
  isFacebookImageReading: boolean;
  facebookImageAttachmentError: string | null;
  getEffectiveFacebookContent: () => string;
  onClose: () => void;
  onSetMode: (mode: FacebookPreviewModalMode) => void;
  onContentDraftChange: (value: string) => void;
  onOpenImageFilePicker: () => void;
  onClearImageAttachment: (index?: number) => void;
  onSaveContentDraft: () => Promise<void> | void;
  onGeneratePostContent: (options?: { mode?: 'TEMPLATE' | 'AI' }) => Promise<void> | void;
  onGenerateDraftContent: () => Promise<void> | void;
  onOpenEditModal: () => Promise<void> | void;
};

export function FacebookPreviewModal({
  mode,
  token,
  snapshot,
  selectedJobDescription,
  facebookAccount,
  facebookPreviewIdentity,
  facebookContentBusy,
  facebookContentDraft,
  facebookImageAttachments,
  facebookImageUploadDisabled,
  facebookImageAddDisabled,
  isFacebookImageReading,
  facebookImageAttachmentError,
  getEffectiveFacebookContent,
  onClose,
  onSetMode,
  onContentDraftChange,
  onOpenImageFilePicker,
  onClearImageAttachment,
  onSaveContentDraft,
  onGeneratePostContent,
  onGenerateDraftContent,
  onOpenEditModal,
}: FacebookPreviewModalProps) {
  if (!mode) return null;

  const content = getEffectiveFacebookContent();
  const previewTitle = snapshot?.title ?? selectedJobDescription?.title ?? 'Bài đăng tuyển dụng';
  const previewImages = facebookImageAttachments;
  const canGenerate = Boolean(token && snapshot) && !facebookContentBusy;
  const imageCount = facebookImageAttachments.length;
  const previewIdentity = facebookPreviewIdentity ?? facebookAccount;
  const facebookPreviewDisplayName = previewIdentity?.displayName?.trim() || 'Facebook';
  const facebookPreviewInitial = facebookPreviewDisplayName.charAt(0).toUpperCase() || 'F';

  if (mode === 'EDIT') {
    return (
      <div className="modal-backdrop facebook-preview-backdrop" role="presentation">
        <section
          className="facebook-composer-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="facebook-composer-title"
        >
          <header className="facebook-preview-modal-header">
            <h2 id="facebook-composer-title">Chỉnh sửa bài đăng Facebook</h2>
            <button
              type="button"
              className="icon-button"
              title="Đóng"
              aria-label="Đóng chỉnh sửa bài đăng Facebook"
              onClick={() => onSetMode('PREVIEW')}
            >
              <CloseIcon />
            </button>
          </header>
          <div className="facebook-composer-body">
            <div className="facebook-composer-content-heading">
              <div className="facebook-composer-section-title">
                <MenuLinesIcon />
                <strong>Nội dung bài viết</strong>
              </div>
              <button
                type="button"
                className="primary-button facebook-composer-generate-button"
                disabled={!canGenerate}
                onClick={() => void onGenerateDraftContent()}
              >
                <SparklesIcon />
                <span>{facebookContentBusy ? 'Đang sinh...' : 'Sinh bài'}</span>
              </button>
            </div>
            <label className="facebook-composer-textarea-wrap">
              <span className="visually-hidden">Nội dung bài đăng Facebook</span>
              <textarea
                className="facebook-content-textarea facebook-composer-textarea"
                value={facebookContentDraft}
                onChange={(event) => onContentDraftChange(event.target.value)}
                placeholder="Sinh bài hoặc nhập nội dung Facebook tại đây."
                rows={16}
              />
              <span>{facebookContentDraft.trim().length} ký tự</span>
            </label>

            <div className="facebook-composer-image-heading">
              <div className="facebook-composer-section-title">
                <ImageFrameIcon />
                <strong>Hình ảnh</strong>
              </div>
              <span>{imageCount}/{FACEBOOK_MAX_IMAGE_ATTACHMENTS} ảnh</span>
            </div>
            <div className="facebook-composer-image-library">
              <div className="facebook-composer-image-grid">
                {facebookImageAttachments.map((attachment, index) => (
                  <article className="facebook-composer-image-card" key={`${attachment.fileName}-${attachment.size}-${index}`}>
                    <img src={attachment.dataUrl} alt={`Ảnh bài đăng ${index + 1}`} />
                    <button
                      type="button"
                      className="facebook-composer-image-remove"
                      title="Xóa ảnh"
                      aria-label={`Xóa ảnh ${index + 1}`}
                      disabled={facebookImageUploadDisabled}
                      onClick={() => void onClearImageAttachment(index)}
                    >
                      <svg
                        width="12"
                        height="14"
                        viewBox="0 0 12 14"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden="true"
                      >
                        <path
                          d="M2.25 13.5C1.8375 13.5 1.48438 13.3531 1.19062 13.0594C0.896875 12.7656 0.75 12.4125 0.75 12V2.25H0V0.75H3.75V0H8.25V0.75H12V2.25H11.25V12C11.25 12.4125 11.1031 12.7656 10.8094 13.0594C10.5156 13.3531 10.1625 13.5 9.75 13.5H2.25ZM9.75 2.25H2.25V12H9.75V2.25ZM3.75 10.5H5.25V3.75H3.75V10.5ZM6.75 10.5H8.25V3.75H6.75V10.5Z"
                          fill="#EF2424"
                        />
                      </svg>
                    </button>
                  </article>
                ))}
                <button
                  type="button"
                  className="facebook-composer-add-image-tile"
                  disabled={facebookImageAddDisabled}
                  onClick={onOpenImageFilePicker}
                  aria-label="Tải lên ảnh bài đăng"
                >
                  <span aria-hidden="true">+</span>
                </button>
              </div>
              {isFacebookImageReading ? (
                <p className="channel-subselection-empty">Đang xử lý ảnh...</p>
              ) : null}
              {facebookImageAttachmentError ? (
                <div className="facebook-image-error-row">
                  <p className="channel-subselection-empty is-error">{facebookImageAttachmentError}</p>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => void onClearImageAttachment()}
                  >
                    Bỏ ảnh
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <footer className="facebook-preview-modal-footer">
            <button
              type="button"
              className="secondary-button facebook-modal-cancel-button"
              onClick={() => onSetMode('PREVIEW')}
            >
              Hủy
            </button>
            <button
              type="button"
              className="primary-button facebook-modal-primary-button"
              onClick={() => void onSaveContentDraft()}
            >
              <CheckCircleIcon />
              <span>Lưu thay đổi</span>
            </button>
          </footer>
        </section>
      </div>
    );
  }

  return (
    <div className="modal-backdrop facebook-preview-backdrop" role="presentation">
      <section
        className="facebook-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="facebook-preview-modal-title"
      >
        <header className="facebook-preview-modal-header">
          <h2 id="facebook-preview-modal-title">Xem trước bài đăng Facebook</h2>
          <button
            type="button"
            className="icon-button"
            title="Đóng"
            aria-label="Đóng xem trước bài đăng Facebook"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>
        <div className="facebook-preview-modal-body">
          <article className="facebook-post-preview-frame">
            <header className="facebook-post-preview-header">
              {previewIdentity?.avatarUrl ? (
                <img
                  className="facebook-post-avatar"
                  src={previewIdentity.avatarUrl}
                  alt={`${facebookPreviewDisplayName} avatar`}
                />
              ) : (
                <span className="facebook-post-avatar">{facebookPreviewInitial}</span>
              )}
              <div className="facebook-post-preview-details">
                <div className="facebook-post-preview-name">{facebookPreviewDisplayName}</div>
                <small>Vừa xong · Công khai</small>
              </div>
            </header>
            <div className="facebook-post-preview-content">{content || 'Chưa có nội dung bài đăng.'}</div>
            <div className="facebook-post-preview-image">
              {previewImages.length > 0 ? (
                <div className="facebook-post-preview-image-grid">
                  {previewImages.map((attachment, index) => (
                    <img key={`${attachment.fileName}-${attachment.size}-${index}`} src={attachment.dataUrl} alt={`Ảnh bài đăng ${index + 1}`} />
                  ))}
                </div>
              ) : (
                <div>
                  <strong title={previewTitle}>{previewTitle}</strong>
                  <span>VCS Recruitment</span>
                </div>
              )}
            </div>
          </article>
        </div>
        <footer className="facebook-preview-modal-footer">
          <button
            type="button"
            className="primary-button facebook-modal-secondary-button"
            disabled={!canGenerate}
            onClick={() => void onGeneratePostContent({ mode: 'AI' })}
          >
            <SparklesIcon />
            <span>{facebookContentBusy ? 'Đang sinh...' : 'Sinh bài'}</span>
          </button>
          <button
            type="button"
            className="primary-button facebook-modal-primary-button"
            onClick={() => void onOpenEditModal()}
          >
            <EditIcon />
            <span>Chỉnh sửa</span>
          </button>
        </footer>
      </section>
    </div>
  );
}
