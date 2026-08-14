import { useState, type ChangeEvent, type FormEventHandler } from 'react';
import { ForgotPasswordForm } from './ForgotPasswordForm';

type LoginFormProps = {
  login: string;
  password: string;
  rememberMe: boolean;
  error: string | null;
  internalMode: boolean;
  forgotPasswordMode: boolean;
  internalEmail: string;
  internalMessage: string | null;
  internalSubmitting: boolean;
  onLoginChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPasswordChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onInternalEmailChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRememberMeChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onForgotPassword: () => void;
  onForgotPasswordCancel: () => void;
  onInternalModeChange: () => void;
  onInternalCancel: () => void;
  onInternalSubmit: FormEventHandler<HTMLFormElement>;
  onSubmit: FormEventHandler<HTMLFormElement>;
};

export function LoginForm({
  login,
  password,
  rememberMe,
  error,
  internalMode,
  forgotPasswordMode,
  internalEmail,
  internalMessage,
  internalSubmitting,
  onLoginChange,
  onPasswordChange,
  onInternalEmailChange,
  onRememberMeChange,
  onForgotPassword,
  onForgotPasswordCancel,
  onInternalModeChange,
  onInternalCancel,
  onInternalSubmit,
  onSubmit,
}: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false);

  if (forgotPasswordMode) {
    return <section className="extension-login-shell"><ForgotPasswordForm onCancel={onForgotPasswordCancel} /></section>;
  }

  if (internalMode) {
    if (internalMessage) {
      return (
        <section className="extension-login-shell">
          <div className="extension-login-card extension-auth-form extension-internal-success">
            <h1>Lấy mật khẩu Extension</h1>
            <InternalPasswordSentIcon />
            <strong>Mật khẩu đã được gửi đến gmail {internalEmail}</strong>
            <p>Vui lòng kiểm tra để lấy mật khẩu đăng nhập và đổi lại mật khẩu mới sau khi đăng nhập lần đầu.</p>
            <button type="button" className="primary-button" onClick={onInternalCancel}>
              QUAY LẠI MÀN HÌNH ĐĂNG NHẬP
            </button>
          </div>
        </section>
      );
    }

    return (
      <section className="extension-login-shell">
        <form className="extension-login-card extension-auth-form" onSubmit={onInternalSubmit}>
          <h1>Lấy mật khẩu Extension</h1>
          <label>
            <span className="extension-field-label">Gmail nội bộ nhân sự <span className="required-mark">*</span></span>
            <span className={`extension-input-shell${error ? ' has-error' : ''}`}>
              <span className="extension-input-icon" aria-hidden="true"><UserIcon /></span>
              <input
                value={internalEmail}
                onChange={onInternalEmailChange}
                type="email"
                autoComplete="email"
                placeholder="Nhập gmail nội bộ nhân sự"
                autoFocus
                aria-invalid={Boolean(error)}
              />
            </span>
          </label>
          {error ? <p className="extension-login-error">{error}</p> : null}
          {internalMessage ? <p className="extension-login-success">{internalMessage}</p> : null}
          <div className="extension-login-actions extension-login-actions-centered">
            <button type="button" className="secondary-button" onClick={onInternalCancel}>Hủy</button>
            <button type="submit" className="confirm-button" disabled={internalSubmitting}>
              {internalSubmitting ? 'Đang gửi...' : 'Xác nhận'}
            </button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className="extension-login-shell">
      <form className="extension-login-card extension-auth-form" onSubmit={onSubmit}>
        <h1>Đăng nhập Extension</h1>
        <label>
          <span className="extension-field-label">Tên đăng nhập <span className="required-mark">*</span></span>
          <span className={`extension-input-shell${error ? ' has-error' : ''}`}>
            <span className="extension-input-icon" aria-hidden="true"><UserIcon /></span>
            <input value={login} onChange={onLoginChange} type="text" autoComplete="username" placeholder="Nhập tên đăng nhập" />
          </span>
        </label>
        <label>
          <span className="extension-field-label">Mật khẩu <span className="required-mark">*</span></span>
          <span className={`extension-input-shell${error ? ' has-error' : ''}`}>
            <span className="extension-input-icon" aria-hidden="true"><LockIcon /></span>
            <input value={password} onChange={onPasswordChange} type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Nhập mật khẩu" />
            <button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
              <EyeIcon hidden={showPassword} />
            </button>
          </span>
        </label>
        {error ? <p className="extension-login-error">{error}</p> : null}
        <div className="extension-login-options">
          <label className="remember-me-control">
            <input type="checkbox" checked={rememberMe} onChange={onRememberMeChange} />
            <span>Ghi nhớ mật khẩu</span>
          </label>
          <div className="extension-login-links">
            <button type="button" className="text-button" onClick={onForgotPassword}>Quên mật khẩu</button>
            <button type="button" className="text-button" onClick={onInternalModeChange}>Là nhân sự nội bộ</button>
          </div>
        </div>
        <button type="submit" className="primary-button">ĐĂNG NHẬP</button>
      </form>
    </section>
  );
}

function UserIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-5.33 0-9 2.67-9 6v2h18v-2c0-3.33-3.67-6-9-6Z" /></svg>;
}

function LockIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="10" width="14" height="11" rx="1" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2.5 12s3.2-5 9.5-5 9.5 5 9.5 5-3.2 5-9.5 5-9.5-5-9.5-5Z" /><circle cx="12" cy="12" r="2.2" />{hidden ? <path d="m4 4 16 16" /> : null}</svg>;
}

function InternalPasswordSentIcon() {
  return (
    <svg className="extension-internal-success-icon" width="50" height="50" viewBox="0 0 50 50" fill="none" aria-hidden="true">
      <path d="M27.5 37.5H22.5V32.5H27.5V37.5ZM27.5 27.5H22.5V12.5H27.5V27.5Z" fill="currentColor" />
      <path d="M25 2.5C30.9674 2.5 36.6903 4.87053 40.9099 9.0901C45.1295 13.3097 47.5 19.0326 47.5 25C47.5 30.9674 45.1295 36.6903 40.9099 40.9099C36.6903 45.1295 30.9674 47.5 25 47.5C19.0326 47.5 13.3097 45.1295 9.0901 40.9099C4.87053 36.6903 2.5 30.9674 2.5 25C2.5 19.0326 4.87053 13.3097 9.0901 9.0901C13.3097 4.87053 19.0326 2.5 25 2.5ZM25 7.5C22.7019 7.5 20.4262 7.95265 18.303 8.83211C16.1798 9.71157 14.2507 11.0006 12.6256 12.6256C11.0006 14.2507 9.71157 16.1798 8.83211 18.303C7.95265 20.4262 7.5 22.7019 7.5 25C7.5 27.2981 7.95265 29.5738 8.83211 31.697C9.71157 33.8202 11.0006 35.7493 12.6256 37.3744C14.2507 38.9994 16.1798 40.2884 18.303 41.1679C20.4262 42.0474 22.7019 42.5 25 42.5C29.6413 42.5 34.0925 40.6563 37.3744 37.3744C40.6563 34.0925 42.5 29.6413 42.5 25C42.5 20.3587 40.6563 15.9075 37.3744 12.6256C34.0925 9.34374 29.6413 7.5 25 7.5Z" fill="currentColor" />
    </svg>
  );
}
