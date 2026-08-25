import { useEffect, useRef, useState, type ChangeEvent, type FormEventHandler, type RefObject } from 'react';
import { ApiClientError, login as loginApi, requestInternalPassword } from '@/lib/api-client';
import { clearSavedCredentials, getSavedCredentials, saveCredentials, setAuthTokens } from './auth-store';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { AuthInput } from './AuthInput';
import { UserIcon, LockIcon, EyeIcon, InternalPasswordSentIcon } from '@/components/svg';
import { toErrorMessage } from '@/lib/utils';
import type { ExtensionUser } from '@/types/types';

export type LoginFormProps = {
  onLoginSuccess: (user: ExtensionUser, accessToken: string, mustChangePassword: boolean) => Promise<void> | void;
  onError?: (message: string) => void;
};

export function LoginForm({ onLoginSuccess, onError }: LoginFormProps) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [internalMode, setInternalMode] = useState(false);
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [internalEmail, setInternalEmail] = useState('');
  const [internalFullName, setInternalFullName] = useState('');
  const [internalMessage, setInternalMessage] = useState<string | null>(null);
  const [internalSubmitting, setInternalSubmitting] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<'login' | 'password' | null>(null);
  const [blurErrors, setBlurErrors] = useState<{
    login: string | null;
    password: string | null;
  }>({ login: null, password: null });

  const [internalFieldErrors, setInternalFieldErrors] = useState<{
    fullName: string | null;
    email: string | null;
  }>({ fullName: null, email: null });

  const loginInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const internalFullNameRef = useRef<HTMLInputElement | null>(null);
  const internalEmailRef = useRef<HTMLInputElement | null>(null);
  const skipLoginBlurValidationRef = useRef(false);

  useEffect(() => {
    let active = true;
    getSavedCredentials().then((saved) => {
      if (active && saved) {
        setLogin(saved.login);
        setPassword(saved.password);
        setRememberMe(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (forgotPasswordMode) return;

    const focusField = () => {
      if (internalMode) {
        if (!internalMessage) {
          internalFullNameRef.current?.focus();
        }
      } else {
        loginInputRef.current?.focus();
      }
    };

    focusField();
    const frameId = requestAnimationFrame(focusField);
    const timer = setTimeout(focusField, 60);
    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(timer);
    };
  }, [forgotPasswordMode, internalMode, internalMessage]);

  const [lockoutSeconds, setLockoutSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!error) {
      setLockoutSeconds(null);
      return;
    }
    const match = error.match(/(?:00:)?(\d{2}):(\d{2})/);
    if (match && error.toLowerCase().includes('tạm khóa')) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const totalSec = minutes * 60 + seconds;
      if (totalSec > 0) {
        setLockoutSeconds(totalSec);
      }
    }
  }, [error]);

  useEffect(() => {
    if (lockoutSeconds === null || lockoutSeconds <= 0) return;

    const timer = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev === null || prev <= 1) {
          setError(null);
          return null;
        }
        const nextSec = prev - 1;
        const mStr = Math.floor(nextSec / 60).toString().padStart(2, '0');
        const sStr = (nextSec % 60).toString().padStart(2, '0');
        setError(`Tài khoản của bạn đã bị tạm khóa. Vui lòng thử lại sau 00:${mStr}:${sStr}.`);
        return nextSec;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  const isLockedOut = lockoutSeconds !== null && lockoutSeconds > 0;
  const hasLoginError = Boolean(blurErrors.login) || errorField === 'login' || isLockedOut;
  const hasPasswordError = Boolean(blurErrors.password) || errorField === 'password' || isLockedOut;

  const handleLoginChange = (e: ChangeEvent<HTMLInputElement>) => {
    setBlurErrors((current) => ({ ...current, login: null }));
    if (!isLockedOut && (localError || errorField || error)) {
      setLocalError(null);
      setErrorField(null);
      setError(null);
    }
    setLogin(e.target.value);
  };

  const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>) => {
    setBlurErrors((current) => ({ ...current, password: null }));
    if (!isLockedOut && (localError || errorField || error)) {
      setLocalError(null);
      setErrorField(null);
      setError(null);
    }
    setPassword(e.target.value);
  };

  const handleLoginBlur = () => {
    if (skipLoginBlurValidationRef.current) {
      skipLoginBlurValidationRef.current = false;
      return;
    }
    setBlurErrors((current) => ({
      ...current,
      login: login.trim() ? null : 'Tên đăng nhập là bắt buộc',
    }));
  };

  const handlePasswordBlur = () => {
    if (skipLoginBlurValidationRef.current) {
      skipLoginBlurValidationRef.current = false;
      return;
    }
    setBlurErrors((current) => ({
      ...current,
      password: password ? null : 'Mật khẩu là bắt buộc',
    }));
  };

  const handleLoginClear = () => {
    setLogin('');
    setBlurErrors((current) => ({ ...current, login: null }));
    if (!isLockedOut) {
      setLocalError(null);
      setErrorField(null);
      setError(null);
    }
    loginInputRef.current?.focus();
  };

  const handlePasswordClear = () => {
    setPassword('');
    setBlurErrors((current) => ({ ...current, password: null }));
    if (!isLockedOut) {
      setLocalError(null);
      setErrorField(null);
      setError(null);
    }
    passwordInputRef.current?.focus();
  };

  const handleLoginSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    if (isLockedOut) {
      return;
    }
    setError(null);
    const trimmedEmail = login.trim();
    if (!trimmedEmail) {
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
    setBlurErrors({ login: null, password: null });
    setSubmitting(true);

    try {
      const auth = await loginApi(trimmedEmail, password);
      if (rememberMe) {
        await saveCredentials({ login: trimmedEmail, password });
      } else {
        await clearSavedCredentials();
      }

      if (
        auth.user.role !== 'ADMIN'
        && auth.user.role !== 'HR'
        && auth.user.role !== 'INTERVIEWER'
        && auth.user.role !== 'COMMITTEE'
        && auth.user.role !== 'FREELANCER'
        && auth.user.role !== 'INTERNAL'
      ) {
        throw new ApiClientError('FORBIDDEN', 'Bạn không có quyền truy cập extension.', 403);
      }

      await setAuthTokens(
        {
          accessToken: auth.accessToken,
          refreshToken: auth.refreshToken,
        },
        { rememberMe },
      );

      await onLoginSuccess(auth.user, auth.accessToken, Boolean(auth.mustChangePassword));
    } catch (err) {
      const msg = toErrorMessage(err);
      setError(msg);
      if (onError && !msg.toLowerCase().includes('tạm khóa')) {
        onError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleInternalFullNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInternalFieldErrors((current) => ({ ...current, fullName: null }));
    setInternalFullName(e.target.value);
  };

  const handleInternalEmailChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInternalFieldErrors((current) => ({ ...current, email: null }));
    const val = e.target.value.length > 255 ? e.target.value.slice(0, 255) : e.target.value;
    setInternalEmail(val);
  };

  const handleInternalFullNameBlur = () => {
    if (!internalFullName.trim()) {
      setInternalFieldErrors((current) => ({ ...current, fullName: 'Họ tên nhân sự là bắt buộc' }));
      return;
    }
    setInternalFieldErrors((current) => ({ ...current, fullName: null }));
  };

  const handleInternalEmailBlur = () => {
    const normalizedEmail = internalEmail.trim();
    if (!normalizedEmail) {
      setInternalFieldErrors((current) => ({ ...current, email: 'Gmail nội bộ nhân sự là bắt buộc' }));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setInternalFieldErrors((current) => ({ ...current, email: 'Email không đúng định dạng vui lòng nhập lại.' }));
      return;
    }
    setInternalFieldErrors((current) => ({ ...current, email: null }));
  };

  const handleInternalFullNameClear = () => {
    setInternalFullName('');
    setInternalFieldErrors((current) => ({ ...current, fullName: null }));
    internalFullNameRef.current?.focus();
  };

  const handleInternalEmailClear = () => {
    setInternalEmail('');
    setInternalFieldErrors((current) => ({ ...current, email: null }));
    internalEmailRef.current?.focus();
  };

  const handleInternalSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setError(null);
    setInternalMessage(null);

    const normalizedEmail = internalEmail.trim().toLowerCase();
    const fullNameError = internalFullName.trim() ? null : 'Họ tên nhân sự là bắt buộc';
    const emailError = !normalizedEmail
      ? 'Gmail nội bộ nhân sự là bắt buộc'
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(normalizedEmail)
        ? 'Email nhân sự không chính xác. Vui lòng kiểm tra và thử lại.'
        : null;
    setInternalFieldErrors({ fullName: fullNameError, email: emailError });

    if (fullNameError) {
      internalFullNameRef.current?.focus();
      return;
    }
    if (emailError) {
      internalEmailRef.current?.focus();
      return;
    }

    setInternalSubmitting(true);
    try {
      const response = await requestInternalPassword(normalizedEmail);
      setInternalMessage(response.message);
      setInternalEmail(normalizedEmail);
    } catch (err) {
      const msg = toErrorMessage(err);
      onError ? onError(msg) : setError(msg);
    } finally {
      setInternalSubmitting(false);
    }
  };

  const handleInternalCancel = () => {
    setInternalMode(false);
    setInternalMessage(null);
    setInternalFieldErrors({ fullName: null, email: null });
  };

  const handleForgotPassword = () => {
    skipLoginBlurValidationRef.current = false;
    setForgotPasswordMode(true);
    setError(null);
    setLocalError(null);
    setBlurErrors({ login: null, password: null });
  };

  const handleInternalModeChange = () => {
    skipLoginBlurValidationRef.current = false;
    setInternalMode(true);
    setInternalMessage(null);
    setError(null);
    setLocalError(null);
    setBlurErrors({ login: null, password: null });
  };

  if (forgotPasswordMode) {
    return (
      <section className="extension-login-shell">
        <ForgotPasswordForm onCancel={() => setForgotPasswordMode(false)} />
      </section>
    );
  }

  if (internalMode) {
    return internalMessage
      ? <InternalPasswordSentView email={internalEmail} onCancel={handleInternalCancel} />
      : <InternalPasswordRequestView
        email={internalEmail}
        fullName={internalFullName}
        error={error}
        message={internalMessage}
        submitting={internalSubmitting}
        fullNameRef={internalFullNameRef}
        emailRef={internalEmailRef}
        onFullNameChange={handleInternalFullNameChange}
        onFullNameBlur={handleInternalFullNameBlur}
        onFullNameClear={handleInternalFullNameClear}
        onEmailChange={handleInternalEmailChange}
        onEmailBlur={handleInternalEmailBlur}
        onEmailClear={handleInternalEmailClear}
        fullNameError={internalFieldErrors.fullName}
        emailError={internalFieldErrors.email}
        onCancel={handleInternalCancel}
        onSubmit={handleInternalSubmit}
      />;
  }

  return <LoginCredentialsView
    login={login}
    password={password}
    rememberMe={rememberMe}
    error={error}
    showPassword={showPassword}
    loginInputRef={loginInputRef}
    passwordInputRef={passwordInputRef}
    onLoginChange={handleLoginChange}
    onPasswordChange={handlePasswordChange}
    onLoginBlur={handleLoginBlur}
    onPasswordBlur={handlePasswordBlur}
    onLoginClear={handleLoginClear}
    onPasswordClear={handlePasswordClear}
    hasLoginError={hasLoginError}
    hasPasswordError={hasPasswordError}
    isLockedOut={isLockedOut}
    loginErrorMessage={blurErrors.login ?? (errorField === 'login' ? localError : null)}
    passwordErrorMessage={blurErrors.password ?? (errorField === 'password' ? localError : null)}
    onRememberMeChange={(event) => setRememberMe(event.target.checked)}
    onForgotPassword={handleForgotPassword}
    onInternalModeChange={handleInternalModeChange}
    onAuthLinkMouseDown={() => { skipLoginBlurValidationRef.current = true; }}
    onPasswordVisibilityChange={() => setShowPassword((visible) => !visible)}
    submitting={submitting}
    onSubmit={handleLoginSubmit}
  />;
}

function InternalPasswordSentView({ email, onCancel }: { email: string; onCancel: () => void }) {
  return (
        <section className="extension-login-shell">
          <div className="extension-login-card extension-auth-form extension-internal-success">
            <div className="extension-auth-heading-group">
              <h1>Lấy mật khẩu Extension</h1>
            </div>
            <div className="extension-internal-success-body">
              <InternalPasswordSentIcon />
              <div className="extension-internal-success-texts">
                <strong>Mật khẩu đã được gửi đến email {email}</strong>
                <p>Vui lòng kiểm tra để lấy mật khẩu đăng nhập và đổi lại mật khẩu mới sau khi đăng nhập lần đầu.</p>
              </div>
            </div>
            <button
              type="button"
              className="primary-button extension-auth-btn-back"
              onClick={onCancel}
            >
              Quay lại màn hình đăng nhập
            </button>
          </div>
        </section>
  );
}

function InternalPasswordRequestView({
  fullName,
  email,
  error,
  message,
  submitting,
  fullNameRef,
  emailRef,
  onFullNameChange,
  onFullNameBlur,
  onFullNameClear,
  onEmailChange,
  onEmailBlur,
  onEmailClear,
  fullNameError,
  emailError,
  onCancel,
  onSubmit,
}: {
  fullName: string;
  email: string;
  error: string | null;
  message: string | null;
  submitting: boolean;
  fullNameRef: RefObject<HTMLInputElement | null>;
  emailRef: RefObject<HTMLInputElement | null>;
  onFullNameChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onFullNameBlur: () => void;
  onFullNameClear: () => void;
  onEmailChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onEmailBlur: () => void;
  onEmailClear: () => void;
  fullNameError: string | null;
  emailError: string | null;
  onCancel: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}) {
  return (
      <section className="extension-login-shell">
        <form className="extension-login-card extension-auth-form" onSubmit={onSubmit}>
          <div className="extension-auth-heading-group">
            <h1>Lấy mật khẩu Extension</h1>
          </div>
          <div className="extension-auth-fields">
            <AuthInput
              ref={fullNameRef as RefObject<HTMLInputElement>}
              label="Họ tên nhân sự"
              required
              icon={<UserIcon />}
              value={fullName}
              onChange={onFullNameChange}
              onBlur={onFullNameBlur}
              onClear={onFullNameClear}
              placeholder="Nhập tên nhân sự"
              hasError={Boolean(fullNameError)}
              errorMessage={fullNameError}
              maxLength={255}
            />
            <AuthInput
              ref={emailRef as RefObject<HTMLInputElement>}
              label="Email nhân sự"
              required
              icon={<UserIcon />}
              value={email}
              onChange={onEmailChange}
              onBlur={onEmailBlur}
              onClear={onEmailClear}
              type="email"
              autoComplete="email"
              placeholder="Nhập email nhân sự"
              hasError={Boolean(emailError || error)}
              errorMessage={emailError ?? error}
              maxLength={255}
            />
          </div>
          {message ? <p className="extension-login-success">{message}</p> : null}
          <div className="extension-login-actions">
            <button type="button" className="secondary-button" onClick={onCancel}>Hủy</button>
            <button
              type="submit"
              className="confirm-button"
              disabled={
                submitting
                || Boolean(fullNameError || emailError)
                || (!fullName.trim() && !email.trim())
              }
            >
              {submitting ? 'Đang gửi...' : 'Xác nhận'}
            </button>
          </div>
        </form>
      </section>
  );
}

function LoginCredentialsView({
  login,
  password,
  rememberMe,
  error,
  showPassword,
  loginInputRef,
  passwordInputRef,
  onLoginChange,
  onPasswordChange,
  onLoginBlur,
  onPasswordBlur,
  onLoginClear,
  onPasswordClear,
  hasLoginError,
  hasPasswordError,
  isLockedOut,
  loginErrorMessage,
  passwordErrorMessage,
  onRememberMeChange,
  onForgotPassword,
  onInternalModeChange,
  onAuthLinkMouseDown,
  onPasswordVisibilityChange,
  submitting,
  onSubmit,
}: {
  login: string;
  password: string;
  rememberMe: boolean;
  error: string | null;
  showPassword: boolean;
  loginInputRef: RefObject<HTMLInputElement | null>;
  passwordInputRef: RefObject<HTMLInputElement | null>;
  onLoginChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPasswordChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onLoginBlur: () => void;
  onPasswordBlur: () => void;
  onLoginClear: () => void;
  onPasswordClear: () => void;
  hasLoginError: boolean;
  hasPasswordError: boolean;
  isLockedOut: boolean;
  loginErrorMessage: string | null;
  passwordErrorMessage: string | null;
  onRememberMeChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onForgotPassword: () => void;
  onInternalModeChange: () => void;
  onAuthLinkMouseDown: () => void;
  onPasswordVisibilityChange: () => void;
  submitting: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
}) {
  return (
    <section className="extension-login-shell">
      <form className="extension-login-card extension-auth-form" onSubmit={onSubmit}>
        <div className="extension-auth-heading-group">
          <h1>Đăng nhập Extension</h1>
        </div>

        <div className="extension-auth-fields">
          <AuthInput
            ref={loginInputRef as RefObject<HTMLInputElement>}
            label="Tên đăng nhập"
            required
            icon={<UserIcon />}
            value={login}
            onChange={onLoginChange}
            onBlur={onLoginBlur}
            onClear={onLoginClear}
            autoComplete="username"
            placeholder="Nhập tên đăng nhập"
            autoFocus
            hasError={hasLoginError}
            errorMessage={loginErrorMessage ?? (hasLoginError ? error : null)}
            maxLength={64}
          />

          <AuthInput
            ref={passwordInputRef as RefObject<HTMLInputElement>}
            label="Mật khẩu"
            required
            icon={<LockIcon />}
            value={password}
            onChange={onPasswordChange}
            onBlur={onPasswordBlur}
            onClear={onPasswordClear}
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Nhập mật khẩu"
            hasError={hasPasswordError}
            errorMessage={passwordErrorMessage ?? (hasPasswordError ? error : null)}
            maxLength={64}
            trailing={
              <button
                type="button"
                className="password-toggle"
                onClick={onPasswordVisibilityChange}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                <EyeIcon visible={showPassword} />
              </button>
            }
          />
        </div>
        <div className="extension-login-options">
          <label className="remember-me-control">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={onRememberMeChange}
            />
            <span>Ghi nhớ mật khẩu</span>
          </label>
          <div className="extension-login-links">
            <button
              type="button"
              className="text-button"
              onMouseDown={onAuthLinkMouseDown}
              onClick={onForgotPassword}
            >
              Quên mật khẩu
            </button>
            <button
              type="button"
              className="text-button"
              onMouseDown={onAuthLinkMouseDown}
              onClick={onInternalModeChange}
            >
              Là nhân sự nội bộ
            </button>
          </div>
        </div>

        <button
          type="submit"
          className="primary-button extension-submit-btn"
          disabled={submitting || isLockedOut || !login.trim() || !password}
        >
          {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
    </section>
  );
}
