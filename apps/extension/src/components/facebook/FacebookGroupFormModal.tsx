import type { ChangeEventHandler, FormEventHandler, FocusEventHandler } from 'react';
import { CloseIcon, SaveIcon } from '@/components/icons';
import { InputField } from '@/components/form';

type FacebookGroupFormModalProps = {
  mode: 'create' | 'edit';
  name: string;
  url: string;
  title: string;
  nameError?: string | null;
  urlError?: string | null;
  message?: string | null;
  messageIsError?: boolean;
  isSaving: boolean;
  onNameChange: ChangeEventHandler<HTMLInputElement>;
  onUrlChange?: ChangeEventHandler<HTMLInputElement>;
  onUrlBlur?: FocusEventHandler<HTMLInputElement>;
  onClearName?: () => void;
  onClearUrl?: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onCancel: () => void;
  onClose: () => void;
};

export function FacebookGroupFormModal({
  mode,
  name,
  url,
  title,
  nameError,
  urlError,
  message,
  messageIsError = false,
  isSaving,
  onNameChange,
  onUrlChange,
  onUrlBlur,
  onClearName,
  onClearUrl,
  onSubmit,
  onCancel,
  onClose,
}: FacebookGroupFormModalProps) {
  const isCreate = mode === 'create';
  const modalClassName = isCreate
    ? 'facebook-group-create-modal'
    : 'facebook-group-modal facebook-group-edit-modal';
  const formClassName = isCreate
    ? 'facebook-group-form is-create'
    : 'modal-body facebook-group-form is-standalone';
  const titleId = isCreate ? 'facebook-group-create-title' : 'facebook-group-edit-title';

  const renderNameField = () => (
    <InputField
      label="TÊN NHÓM"
      value={name}
      maxLength={255}
      placeholder={isCreate ? 'Ví dụ: Việc làm IT Đà Nẵng' : 'Hội Dev Java VN'}
      title={name || undefined}
      required
      disabled={isSaving}
      error={nameError ?? undefined}
      inputWrapperClassName={isCreate ? 'facebook-group-input-wrap' : undefined}
      className={isCreate ? 'facebook-group-form-input' : 'facebook-group-edit-input'}
      containerClassName={isCreate ? undefined : 'facebook-group-edit-field'}
      trailing={isCreate && name && onClearName ? (
        <button
          type="button"
          className="facebook-group-input-clear"
          title="Xóa tên nhóm"
          aria-label="Xóa tên nhóm"
          disabled={isSaving}
          onClick={onClearName}
        >
          <CloseIcon />
        </button>
      ) : null}
      onChange={onNameChange}
    />
  );

  const renderCreateUrlField = () => (
    <InputField
      label="Link URL"
      value={url}
      maxLength={500}
      placeholder="https://facebook.com/groups/..."
      required
      disabled={isSaving}
      error={urlError ?? undefined}
      inputWrapperClassName="facebook-group-input-wrap"
      className="facebook-group-form-input"
      trailing={url && onClearUrl ? (
        <button
          type="button"
          className="facebook-group-input-clear"
          title="Xóa link URL"
          aria-label="Xóa link URL"
          disabled={isSaving}
          onClick={onClearUrl}
        >
          <CloseIcon />
        </button>
      ) : null}
      onChange={onUrlChange ?? (() => undefined)}
      onBlur={onUrlBlur}
    />
  );

  const renderEditUrlField = () => (
    <label>
      <span className="facebook-group-field-label">Link URL</span>
      {url ? (
        <a className="facebook-group-edit-url" href={url} target="_blank" rel="noreferrer">{url}</a>
      ) : (
        <span className="facebook-group-edit-url is-empty">Chưa có URL</span>
      )}
    </label>
  );

  const renderFooter = () => (
    <div className={isCreate ? 'facebook-group-create-footer' : 'form-actions'}>
      <button type="button" className="text-button" disabled={isSaving} onClick={onCancel}>
        {isCreate ? 'Hủy' : 'HỦY'}
      </button>
      <button
        type="submit"
        className={isCreate ? 'primary-button compact-button' : 'facebook-group-edit-save-button'}
        disabled={isSaving}
      >
        <SaveIcon />
        <span>{isSaving ? 'Đang lưu...' : isCreate ? 'Lưu' : 'LƯU'}</span>
      </button>
    </div>
  );

  return (
    <div className={isCreate ? 'facebook-group-create-backdrop' : 'modal-backdrop'} role="presentation">
      <section
        className={modalClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className={isCreate ? 'facebook-group-create-header' : 'modal-header'}>
          <div>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            title="Đóng"
            aria-label="Đóng"
            disabled={isSaving}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>

        <form className={formClassName} noValidate={isCreate} onSubmit={onSubmit}>
          {message ? (
            <p className={`modal-status${messageIsError ? ' is-error' : ''}`}>
              {message}
            </p>
          ) : null}

          {renderNameField()}

          {isCreate ? renderCreateUrlField() : renderEditUrlField()}

          {isCreate ? (
            <small className="facebook-group-form-hint">Link trực tiếp đến trang chủ của nhóm Facebook.</small>
          ) : null}

          {renderFooter()}
        </form>
      </section>
    </div>
  );
}
