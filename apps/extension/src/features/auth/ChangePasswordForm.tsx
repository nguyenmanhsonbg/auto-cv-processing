import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AuthInput } from './AuthInput';
import { LockIcon, EyeIcon } from '@/components/svg';

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

  const currentPasswordRef = useRef<HTMLInputElement | null>(null);
  const newPasswordRef = useRef<HTMLInputElement | null>(null);
  const confirmPasswordRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const focusField = () => {
      if (isResetPassword) {
        newPasswordRef.current?.focus();
      } else {
        currentPasswordRef.current?.focus();
      }
    };
    focusField();
    const frameId = requestAnimationFrame(focusField);
    const timer = setTimeout(focusField, 60);
    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(timer);
    };
  }, [isResetPassword]);

  const passwordRules = useMemo(() => ({
    hasCaseAndNumber: /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) && /\d/.test(newPassword),
    hasSpecial: /[^A-Za-z0-9]/.test(newPassword),
    hasValidLength: newPassword.length >= 8 && newPassword.length <= 16,
  }), [newPassword]);

  const isFormFilled = isResetPassword
    ? Boolean(newPassword && confirmPassword)
    : Boolean(currentPassword && newPassword && confirmPassword);

  function updateField(field: PasswordField, value: string) {
    const trimmed = value.slice(0, 64);
    if (field === 'current') setCurrentPassword(trimmed);
    if (field === 'new') setNewPassword(trimmed);
    if (field === 'confirm') setConfirmPassword(trimmed);
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  function handleBlur(field: PasswordField) {
    if (field === 'current' && !isResetPassword && !currentPassword.trim()) {
      setFieldErrors((current) => ({ ...current, current: 'Nhập mật khẩu cũ là bắt buộc' }));
    }
    if (field === 'new' && !newPassword.trim()) {
      setFieldErrors((current) => ({ ...current, new: 'Nhập mật khẩu mới là bắt buộc' }));
    }
    if (field === 'confirm' && !confirmPassword.trim()) {
      setFieldErrors((current) => ({ ...current, confirm: 'Xác nhận mật khẩu mới là bắt buộc' }));
    }
  }

  function handleClear(field: PasswordField) {
    updateField(field, '');
    if (field === 'current') currentPasswordRef.current?.focus();
    if (field === 'new') newPasswordRef.current?.focus();
    if (field === 'confirm') confirmPasswordRef.current?.focus();
  }

  function toggleVisibility(field: PasswordField) {
    setVisibleFields((current) => ({ ...current, [field]: !current[field] }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving || !isFormFilled) return;
    const nextErrors: Partial<Record<PasswordField, string>> = {};
    if (!isResetPassword && !currentPassword.trim()) {
      nextErrors.current = 'Nhập mật khẩu cũ là bắt buộc';
    }
    if (!newPassword.trim()) {
      nextErrors.new = 'Nhập mật khẩu mới là bắt buộc';
    } else if (!passwordRules.hasCaseAndNumber || !passwordRules.hasSpecial || !passwordRules.hasValidLength) {
      nextErrors.new = 'Mật khẩu mới không hợp lệ. Vui lòng nhập lại.';
    }
    if (!confirmPassword.trim()) {
      nextErrors.confirm = 'Xác nhận mật khẩu mới là bắt buộc';
    } else if (newPassword !== confirmPassword) {
      nextErrors.confirm = 'Xác nhận mật khẩu mới không trùng khớp. Vui lòng kiểm tra lại';
    }
    setFieldErrors(nextErrors);
    if (nextErrors.current) {
      currentPasswordRef.current?.focus();
      return;
    }
    if (nextErrors.new) {
      newPasswordRef.current?.focus();
      return;
    }
    if (nextErrors.confirm) {
      confirmPasswordRef.current?.focus();
      return;
    }
    await onSubmit({ currentPassword, newPassword, confirmPassword });
  }

  const serverErrors = getServerFieldErrors(error);
  const inputError = (field: PasswordField) => fieldErrors[field] ?? serverErrors[field];

  return (
    <form className="extension-login-card extension-auth-form extension-change-password-form" onSubmit={submit}>
      <div className="extension-auth-heading-group">
        <h1>{isResetPassword ? 'Đặt lại mật khẩu' : 'Đổi mật khẩu'}</h1>
      </div>

      <div className="extension-auth-fields">
        {!isResetPassword ? (
          <div>
            <AuthInput
              ref={currentPasswordRef}
              label="Nhập mật khẩu cũ"
              required
              placeholder="Nhập mật khẩu cũ"
              icon={<LockIcon />}
              value={currentPassword}
              hasError={Boolean(inputError('current'))}
              type={visibleFields.current ? 'text' : 'password'}
              onChange={(e) => updateField('current', e.target.value)}
              onBlur={() => handleBlur('current')}
              onClear={() => handleClear('current')}
              allowClear
              autoComplete="current-password"
              autoFocus={!isResetPassword}
              maxLength={64}
              trailing={
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => toggleVisibility('current')}
                  onMouseDown={(e) => e.preventDefault()}
                  aria-label={visibleFields.current ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  <EyeIcon visible={visibleFields.current} />
                </button>
              }
            />
            {inputError('current') ? <p className="extension-login-error" style={{ marginTop: '6px' }}>{inputError('current')}</p> : null}
          </div>
        ) : null}

        <div>
          <AuthInput
            ref={newPasswordRef}
            label="Nhập mật khẩu mới"
            required
            placeholder="Nhập mật khẩu mới"
            icon={<LockIcon />}
            value={newPassword}
            hasError={Boolean(inputError('new'))}
            type={visibleFields.new ? 'text' : 'password'}
            onChange={(e) => updateField('new', e.target.value)}
            onBlur={() => handleBlur('new')}
            onClear={() => handleClear('new')}
            allowClear
            autoComplete="new-password"
            autoFocus={isResetPassword}
            maxLength={64}
            trailing={
              <button
                type="button"
                className="password-toggle"
                onClick={() => toggleVisibility('new')}
                onMouseDown={(e) => e.preventDefault()}
                aria-label={visibleFields.new ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                <EyeIcon visible={visibleFields.new} />
              </button>
            }
          />
          {inputError('new') ? <p className="extension-login-error" style={{ marginTop: '6px' }}>{inputError('new')}</p> : null}
        </div>

        <div>
          <AuthInput
            ref={confirmPasswordRef}
            label="Xác nhận mật khẩu mới"
            required
            placeholder="Xác nhận mật khẩu mới"
            icon={<LockIcon />}
            value={confirmPassword}
            hasError={Boolean(inputError('confirm'))}
            type={visibleFields.confirm ? 'text' : 'password'}
            onChange={(e) => updateField('confirm', e.target.value)}
            onBlur={() => handleBlur('confirm')}
            onClear={() => handleClear('confirm')}
            allowClear
            autoComplete="new-password"
            maxLength={64}
            trailing={
              <button
                type="button"
                className="password-toggle"
                onClick={() => toggleVisibility('confirm')}
                onMouseDown={(e) => e.preventDefault()}
                aria-label={visibleFields.confirm ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                <EyeIcon visible={visibleFields.confirm} />
              </button>
            }
          />
          {inputError('confirm') ? <p className="extension-login-error" style={{ marginTop: '6px' }}>{inputError('confirm')}</p> : null}
        </div>
      </div>

      <div className="extension-password-conditions" aria-live="polite">
        <PasswordCondition isValid={passwordRules.hasCaseAndNumber && Boolean(newPassword)}>
          Có ít nhất 1 chữ hoa, 1 chữ thường và 1 chữ số.
        </PasswordCondition>
        <PasswordCondition isValid={passwordRules.hasSpecial && Boolean(newPassword)}>
          Có ít nhất 1 ký tự đặc biệt.
        </PasswordCondition>
        <PasswordCondition isValid={passwordRules.hasValidLength && Boolean(newPassword)}>
          Có từ 8 - 16 ký tự.
        </PasswordCondition>
      </div>

      <div className="extension-login-actions">
        <button type="button" className="secondary-button" onClick={onCancel} disabled={isSaving}>
          Quay lại
        </button>
        <button type="submit" className="confirm-button" disabled={isSaving || !isFormFilled}>
          {isSaving ? 'Đang lưu...' : (isResetPassword ? 'Đặt lại mật khẩu' : 'Đặt lại mật khẩu')}
        </button>
      </div>
    </form>
  );
}

function PasswordCondition({ isValid, children }: { isValid: boolean; children: string }) {
  return (
    <div className={`extension-password-condition${isValid ? ' is-valid' : ''}`}>
      <span className="extension-condition-tick" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M2.75 8.75L6.25 12.25L13.25 4.75"
            stroke={isValid ? '#15803d' : '#737373'}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="extension-condition-text">{children}</span>
    </div>
  );
}

function getServerFieldErrors(error?: string | null): Partial<Record<PasswordField, string>> {
  if (!error) return {};
  if (error.includes('hiện tại')) return { current: 'Mật khẩu cũ không chính xác. Vui lòng kiểm tra lại' };
  if (error.includes('không khớp')) return { confirm: 'Xác nhận mật khẩu mới không trùng khớp. Vui lòng kiểm tra lại' };
  return { new: error };
}
