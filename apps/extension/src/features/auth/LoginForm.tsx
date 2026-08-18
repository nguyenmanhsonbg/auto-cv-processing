import { useRef, useState, type ChangeEvent, type FormEventHandler } from 'react';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { AuthInput, UserIcon, LockIcon, EyeIcon } from './AuthInput';

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
  const [internalFullName, setInternalFullName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<'login' | 'password' | null>(null);

  const [internalLocalError, setInternalLocalError] = useState<string | null>(null);
  const [internalErrorField, setInternalErrorField] = useState<'fullName' | 'email' | null>(null);

  const loginInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const internalFullNameRef = useRef<HTMLInputElement | null>(null);
  const internalEmailRef = useRef<HTMLInputElement | null>(null);

  const displayedError = localError || error;
  const hasLoginError = errorField === 'login' || (Boolean(error) && !errorField);
  const hasPasswordError = errorField === 'password' || (Boolean(error) && !errorField);

  const displayedInternalError = internalLocalError || error;
  const hasInternalFullNameError = internalErrorField === 'fullName';
  const hasInternalEmailError = internalErrorField === 'email' || (Boolean(error) && !internalErrorField);

  const handleLoginChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (localError || errorField) {
      setLocalError(null);
      setErrorField(null);
    }
    onLoginChange(e);
  };

  const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (localError || errorField) {
      setLocalError(null);
      setErrorField(null);
    }
    onPasswordChange(e);
  };

  const handleLoginBlur = () => {
    if (!login.trim()) {
      setLocalError('Tên đăng nhập là bắt buộc');
      setErrorField('login');
    }
  };

  const handlePasswordBlur = () => {
    if (!password) {
      setLocalError('Mật khẩu là bắt buộc');
      setErrorField('password');
    }
  };

  const handleLoginClear = () => {
    onLoginChange({ target: { value: '' }, currentTarget: { value: '' } } as ChangeEvent<HTMLInputElement>);
    setLocalError(null);
    setErrorField(null);
    loginInputRef.current?.focus();
  };

  const handlePasswordClear = () => {
    onPasswordChange({ target: { value: '' }, currentTarget: { value: '' } } as ChangeEvent<HTMLInputElement>);
    setLocalError(null);
    setErrorField(null);
    passwordInputRef.current?.focus();
  };

  const handleLoginSubmit: FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    if (!login.trim()) {
      setLocalError('Tên đăng nhập là bắt buộc');
      setErrorField('login');
      loginInputRef.current?.focus();
      return;
    }
    if (!password) {
      setLocalError('Mật khẩu là bắt buộc');
      setErrorField('password');
      passwordInputRef.current?.focus();
      return;
    }
    setLocalError(null);
    setErrorField(null);
    onSubmit(e);
  };

  const handleInternalFullNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (internalLocalError || internalErrorField === 'fullName') {
      setInternalLocalError(null);
      setInternalErrorField(null);
    }
    setInternalFullName(e.target.value);
  };

  const handleInternalEmailChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (internalLocalError || internalErrorField === 'email') {
      setInternalLocalError(null);
      setInternalErrorField(null);
    }
    onInternalEmailChange(e);
  };

  const handleInternalFullNameBlur = () => {
    if (!internalFullName.trim()) {
      setInternalLocalError('Họ tên nhân sự là bắt buộc');
      setInternalErrorField('fullName');
    }
  };

  const handleInternalEmailBlur = () => {
    if (!internalEmail.trim()) {
      setInternalLocalError('Gmail nội bộ nhân sự là bắt buộc');
      setInternalErrorField('email');
    }
  };

  const handleInternalFullNameClear = () => {
    setInternalFullName('');
    setInternalLocalError(null);
    setInternalErrorField(null);
    internalFullNameRef.current?.focus();
  };

  const handleInternalEmailClear = () => {
    onInternalEmailChange({ target: { value: '' }, currentTarget: { value: '' } } as ChangeEvent<HTMLInputElement>);
    setInternalLocalError(null);
    setInternalErrorField(null);
    internalEmailRef.current?.focus();
  };

  const handleInternalSubmit: FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    if (!internalFullName.trim()) {
      setInternalLocalError('Họ tên nhân sự là bắt buộc');
      setInternalErrorField('fullName');
      internalFullNameRef.current?.focus();
      return;
    }
    if (!internalEmail.trim()) {
      setInternalLocalError('Gmail nội bộ nhân sự là bắt buộc');
      setInternalErrorField('email');
      internalEmailRef.current?.focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(internalEmail.trim())) {
      setInternalLocalError('Gmail nội bộ không chính xác. Vui lòng kiểm tra và thử lại.');
      setInternalErrorField('email');
      internalEmailRef.current?.focus();
      return;
    }
    setInternalLocalError(null);
    setInternalErrorField(null);
    onInternalSubmit(e);
  };

  if (forgotPasswordMode) {
    return (
      <section className="extension-login-shell">
        <ForgotPasswordForm onCancel={onForgotPasswordCancel} />
      </section>
    );
  }

  if (internalMode) {
    if (internalMessage) {
      return (
        <section className="extension-login-shell">
          <div className="extension-login-card extension-auth-form extension-internal-success">
            <div className="extension-auth-heading-group">
              <h1>Lấy mật khẩu Extension</h1>
            </div>
            <div className="extension-internal-success-body">
              <InternalPasswordSentIcon />
              <div className="extension-internal-success-texts">
                <strong>Mật khẩu đã được gửi đến gmail {internalEmail}</strong>
                <p>Vui lòng kiểm tra để lấy mật khẩu đăng nhập và đổi lại mật khẩu mới sau khi đăng nhập lần đầu.</p>
              </div>
            </div>
            <button type="button" className="primary-button extension-auth-btn-back" onClick={onInternalCancel}>
              Quay lại màn hình đăng nhập
            </button>
          </div>
        </section>
      );
    }

    return (
      <section className="extension-login-shell">
        <form className="extension-login-card extension-auth-form" onSubmit={handleInternalSubmit}>
          <div className="extension-auth-heading-group">
            <h1>Lấy mật khẩu Extension</h1>
          </div>
          <div className="extension-auth-fields">
            <AuthInput
              ref={internalFullNameRef}
              label="Họ tên nhân sự"
              required
              icon={<UserIcon />}
              value={internalFullName}
              onChange={handleInternalFullNameChange}
              onBlur={handleInternalFullNameBlur}
              onClear={handleInternalFullNameClear}
              placeholder="Nhập tên nhân sự"
              hasError={hasInternalFullNameError}
              maxLength={64}
            />
            <AuthInput
              ref={internalEmailRef}
              label="Gmail nội bộ nhân sự"
              required
              icon={<UserIcon />}
              value={internalEmail}
              onChange={handleInternalEmailChange}
              onBlur={handleInternalEmailBlur}
              onClear={handleInternalEmailClear}
              type="email"
              autoComplete="email"
              placeholder="Nhập gmail nội bộ nhân sự"
              autoFocus
              hasError={hasInternalEmailError}
              maxLength={64}
            />
          </div>
          {displayedInternalError ? <p className="extension-login-error">{displayedInternalError}</p> : null}
          <div className="extension-login-actions">
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
      <form className="extension-login-card extension-auth-form" onSubmit={handleLoginSubmit}>
        <div className="extension-auth-heading-group">
          <h1>Đăng nhập Extension</h1>
        </div>

        <div className="extension-auth-fields">
          <AuthInput
            ref={loginInputRef}
            label="Tên đăng nhập"
            required
            icon={<UserIcon />}
            value={login}
            onChange={handleLoginChange}
            onBlur={handleLoginBlur}
            onClear={handleLoginClear}
            autoComplete="username"
            placeholder="Nhập tên đăng nhập"
            hasError={hasLoginError}
            maxLength={64}
          />

          <AuthInput
            ref={passwordInputRef}
            label="Mật khẩu"
            required
            icon={<LockIcon />}
            value={password}
            onChange={handlePasswordChange}
            onBlur={handlePasswordBlur}
            onClear={handlePasswordClear}
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Nhập mật khẩu"
            hasError={hasPasswordError}
            maxLength={64}
            trailing={
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                <EyeIcon visible={showPassword} />
              </button>
            }
          />
        </div>

        {displayedError ? (
          <div className="extension-login-error-row">
            <p className="extension-login-error">{displayedError}</p>
            {error && !localError ? (
              <button type="button" className="text-button extension-error-forgot-link" onClick={onForgotPassword}>
                Quên mật khẩu?
              </button>
            ) : null}
          </div>
        ) : null}

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

        <button type="submit" className="primary-button extension-submit-btn">Đăng nhập</button>
      </form>
    </section>
  );
}

export function InternalPasswordSentIcon() {
  return (
    <svg className="extension-internal-success-icon" width="50" height="50" viewBox="0 0 50 50" fill="none" aria-hidden="true">
      <path d="M27.5 37.5H22.5V32.5H27.5V37.5ZM27.5 27.5H22.5V12.5H27.5V27.5Z" fill="currentColor" />
      <path d="M25 2.5C30.9674 2.5 36.6903 4.87053 40.9099 9.0901C45.1295 13.3097 47.5 19.0326 47.5 25C47.5 30.9674 45.1295 36.6903 40.9099 40.9099C36.6903 45.1295 30.9674 47.5 25 47.5C19.0326 47.5 13.3097 45.1295 9.0901 40.9099C4.87053 36.6903 2.5 30.9674 2.5 25C2.5 19.0326 4.87053 13.3097 9.0901 9.0901C13.3097 4.87053 19.0326 2.5 25 2.5ZM25 7.5C22.7019 7.5 20.4262 7.95265 18.303 8.83211C16.1798 9.71157 14.2507 11.0006 12.6256 12.6256C11.0006 14.2507 9.71157 16.1798 8.83211 18.303C7.95265 20.4262 7.5 22.7019 7.5 25C7.5 27.2981 7.95265 29.5738 8.83211 31.697C9.71157 33.8202 11.0006 35.7493 12.6256 37.3744C14.2507 38.9994 16.1798 40.2884 18.303 41.1679C20.4262 42.0474 22.7019 42.5 25 42.5C29.6413 42.5 34.0925 40.6563 37.3744 37.3744C40.6563 34.0925 42.5 29.6413 42.5 25C42.5 20.3587 40.6563 15.9075 37.3744 12.6256C34.0925 9.34374 29.6413 7.5 25 7.5Z" fill="currentColor" />
    </svg>
  );
}
