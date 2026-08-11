import { useMemo, useState, type FormEvent } from 'react';

type ChangePasswordFormProps = {
  error?: string | null;
  isSaving?: boolean;
  onCancel: () => void;
  onSubmit: (input: { currentPassword: string; newPassword: string; confirmPassword: string }) => Promise<void>;
  isResetPassword?: boolean;
};

type PasswordField = 'current' | 'new' | 'confirm';

export function ChangePasswordForm({ error, isSaving = false, onCancel, onSubmit, isResetPassword = false }: ChangePasswordFormProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [visibleFields, setVisibleFields] = useState<Record<PasswordField, boolean>>({ current: false, new: false, confirm: false });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<PasswordField, string>>>({});

  const passwordRules = useMemo(() => ({
    hasCaseAndNumber: /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) && /\d/.test(newPassword),
    hasSpecial: /[^A-Za-z0-9]/.test(newPassword),
    hasValidLength: newPassword.length >= 8 && newPassword.length <= 16,
  }), [newPassword]);

  function updateField(field: PasswordField, value: string) {
    if (field === 'current') setCurrentPassword(value);
    if (field === 'new') setNewPassword(value);
    if (field === 'confirm') setConfirmPassword(value);
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  function toggleVisibility(field: PasswordField) {
    setVisibleFields((current) => ({ ...current, [field]: !current[field] }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Partial<Record<PasswordField, string>> = {};
    if (!isResetPassword && !currentPassword) nextErrors.current = 'Vui lòng nhập mật khẩu cũ.';
    if (!passwordRules.hasCaseAndNumber || !passwordRules.hasSpecial || !passwordRules.hasValidLength) {
      nextErrors.new = 'Mật khẩu mới không hợp lệ. Vui lòng nhập lại.';
    }
    if (newPassword !== confirmPassword) nextErrors.confirm = 'Xác nhận mật khẩu mới không trùng khớp. Vui lòng kiểm tra lại';
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    await onSubmit({ currentPassword, newPassword, confirmPassword });
  }

  const serverErrors = getServerFieldErrors(error);
  const inputError = (field: PasswordField) => fieldErrors[field] ?? serverErrors[field];

  return (
    <form className="freelancer-change-password-form" onSubmit={submit}>
      <div className="freelancer-change-password-heading">
        <h2>{isResetPassword ? 'Đặt lại mật khẩu' : 'Đổi mật khẩu'}</h2>
      </div>
      {!isResetPassword ? (
        <PasswordFieldInput
          label="Nhập mật khẩu cũ"
          placeholder="Nhập mật khẩu cũ"
          value={currentPassword}
          error={inputError('current')}
          visible={visibleFields.current}
          onChange={(value) => updateField('current', value)}
          onToggleVisibility={() => toggleVisibility('current')}
          autoComplete="current-password"
        />
      ) : null}
      <PasswordFieldInput
        label="Nhập mật khẩu mới"
        placeholder="Nhập mật khẩu mới"
        value={newPassword}
        error={inputError('new')}
        visible={visibleFields.new}
        onChange={(value) => updateField('new', value)}
        onToggleVisibility={() => toggleVisibility('new')}
        autoComplete="new-password"
      />
      <PasswordFieldInput
        label="Xác nhận mật khẩu mới"
        placeholder="Xác nhận mật khẩu mới"
        value={confirmPassword}
        error={inputError('confirm')}
        visible={visibleFields.confirm}
        onChange={(value) => updateField('confirm', value)}
        onToggleVisibility={() => toggleVisibility('confirm')}
        autoComplete="new-password"
      />

      <div className="freelancer-password-rules" aria-live="polite">
        <PasswordRule status={getRuleStatus(newPassword, passwordRules.hasCaseAndNumber)}>Có ít nhất 1 chữ hoa, 1 chữ thường và 1 chữ số.</PasswordRule>
        <PasswordRule status={getRuleStatus(newPassword, passwordRules.hasSpecial)}>Có ít nhất 1 ký tự đặc biệt.</PasswordRule>
        <PasswordRule status={getRuleStatus(newPassword, passwordRules.hasValidLength)}>Có từ 8 - 16 ký tự.</PasswordRule>
      </div>

      <div className="freelancer-change-password-actions">
        <button type="button" className="secondary-button" onClick={onCancel} disabled={isSaving}>Quay lại</button>
        <button type="submit" className="primary-button" disabled={isSaving}>
          {isSaving ? 'Đang lưu...' : 'ĐẶT LẠI MẬT KHẨU'}
        </button>
      </div>
    </form>
  );
}

function PasswordFieldInput({
  label,
  placeholder,
  value,
  error,
  visible,
  onChange,
  onToggleVisibility,
  autoComplete,
}: {
  label: string;
  placeholder: string;
  value: string;
  error?: string;
  visible: boolean;
  onChange: (value: string) => void;
  onToggleVisibility: () => void;
  autoComplete: string;
}) {
  return (
    <label className="freelancer-password-field">
      <span className="freelancer-password-label">{label} <span className="required-mark">*</span></span>
      <span className={`freelancer-password-input-shell${error ? ' has-error' : ''}`}>
        <span className="freelancer-password-lock-icon" aria-hidden="true"><LockIcon /></span>
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
        <button type="button" className="freelancer-password-toggle" onClick={onToggleVisibility} aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
          <EyeIcon hidden={!visible} />
        </button>
      </span>
      {error ? <span className="freelancer-password-field-error">{error}</span> : null}
    </label>
  );
}

function PasswordRule({ status, children }: { status: 'valid' | 'invalid' | 'neutral'; children: string }) {
  return <span className={`freelancer-password-rule is-${status}`}><span aria-hidden="true">{status === 'invalid' ? '×' : '✓'}</span>{children}</span>;
}

function getRuleStatus(value: string, valid: boolean): 'valid' | 'invalid' | 'neutral' {
  if (!value) return 'neutral';
  return valid ? 'valid' : 'invalid';
}

function getServerFieldErrors(error?: string | null): Partial<Record<PasswordField, string>> {
  if (!error) return {};
  if (error.includes('hiện tại')) return { current: 'Mật khẩu cũ không chính xác. Vui lòng kiểm tra lại' };
  if (error.includes('không khớp')) return { confirm: 'Xác nhận mật khẩu mới không trùng khớp. Vui lòng kiểm tra lại' };
  return { new: error };
}

function LockIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="10" width="14" height="11" rx="1" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2.5 12s3.2-5 9.5-5 9.5 5 9.5 5-3.2 5-9.5 5-9.5-5-9.5-5Z" /><circle cx="12" cy="12" r="2.2" />{hidden ? <path d="m4 4 16 16" /> : null}</svg>;
}
