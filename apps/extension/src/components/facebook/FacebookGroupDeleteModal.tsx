import { CloseIcon, WarningIcon } from '@/assets/icons';

type FacebookGroupDeleteModalProps = {
  groupName: string;
  isDeleting: boolean;
  message?: string | null;
  messageIsError?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onClose: () => void;
};

export function FacebookGroupDeleteModal({
  groupName,
  isDeleting,
  message,
  messageIsError = false,
  onConfirm,
  onCancel,
  onClose,
}: FacebookGroupDeleteModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="facebook-group-modal delete-group-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="facebook-group-delete-title"
      >
        <header className="delete-modal-header">
          <h2 id="facebook-group-delete-title">Xác nhận xóa nhóm</h2>
          <button
            type="button"
            className="delete-modal-close-btn"
            title="Đóng"
            aria-label="Đóng"
            disabled={isDeleting}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>

        <div className="delete-modal-body">
          <div className="delete-modal-warning-icon" aria-hidden="true">
            <WarningIcon />
          </div>

          <div className="delete-modal-copy">
            <h3>Bạn có chắc chắn muốn xóa nhóm này không?</h3>
            <p>Hành động này không thể hoàn tác và dữ liệu liên quan sẽ bị mất.</p>
          </div>

          <div className="delete-target-preview">
            <span className="delete-target-label">NHÓM SẼ BỊ XÓA:</span>
            <strong className="delete-target-name">{groupName}</strong>
          </div>

          {message ? (
            <p className={`modal-status${messageIsError ? ' is-error' : ''}`}>
              {message}
            </p>
          ) : null}
        </div>

        <footer className="delete-modal-footer">
          <button
            type="button"
            className="delete-btn-cancel"
            disabled={isDeleting}
            onClick={onCancel}
          >
            HỦY
          </button>
          <button
            type="button"
            className="delete-btn-confirm"
            disabled={isDeleting}
            onClick={onConfirm}
          >
            {isDeleting ? 'ĐANG XÓA...' : 'XÁC NHẬN'}
          </button>
        </footer>
      </section>
    </div>
  );
}
