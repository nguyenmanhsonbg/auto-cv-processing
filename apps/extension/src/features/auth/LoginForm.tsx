import { useEffect, useRef, useState, type ChangeEvent, type FormEventHandler } from 'react';
import { ApiClientError, login as loginApi, requestInternalPassword } from '@/lib/api-client';
import { clearSavedCredentials, getSavedCredentials, saveCredentials, setAuthTokens } from './auth-store';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { AuthInput } from './AuthInput';
import { UserIcon, LockIcon, EyeIcon, InternalPasswordSentIcon } from '@/components/svg';
import { toErrorMessage } from '@/lib/utils';
import type { ExtensionUser } from '@/types/types';

export type LoginFormProps = {
  onLoginSuccess: (user: ExtensionUser, accessToken: string) => Promise<void> | void;
};

export function LoginForm({ onLoginSuccess }: LoginFormProps) {
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

  const [internalLocalError, setInternalLocalError] = useState<string | null>(null);
  const [internalErrorField, setInternalErrorField] = useState<'fullName' | 'email' | null>(null);

  const loginInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const internalFullNameRef = useRef<HTMLInputElement | null>(null);
  const internalEmailRef = useRef<HTMLInputElement | null>(null);

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

  const displayedError = localError || error;
  const hasLoginError = errorField === 'login' || (Boolean(error) && !errorField);
  const hasPasswordError = errorField === 'password' || (Boolean(error) && !errorField);

  const displayedInternalError = internalLocalError || error;
  const hasInternalFullNameError = internalErrorField === 'fullName';
  const hasInternalEmailError = internalErrorField === 'email' || (Boolean(error) && !internalErrorField);

  const handleLoginChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (localError || errorField || error) {
      setLocalError(null);
      setErrorField(null);
      setError(null);
    }
    setLogin(e.target.value);
  };

  const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (localError || errorField || error) {
      setLocalError(null);
      setErrorField(null);
      setError(null);
    }
    setPassword(e.target.value);
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
    setLogin('');
    setLocalError(null);
    setErrorField(null);
    setError(null);
    loginInputRef.current?.focus();
  };

  const handlePasswordClear = () => {
    setPassword('');
    setLocalError(null);
    setErrorField(null);
    setError(null);
    passwordInputRef.current?.focus();
  };

  const handleLoginSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
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

      await onLoginSuccess(auth.user, auth.accessToken);
    } catch (err) {
      if (err instanceof ApiClientError && (err.status === 401 || err.code === 'HTTP_401')) {
        setError('Thông tin đăng nhập không hợp lệ. Vui lòng kiểm tra lại.');
      } else {
        setError(toErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
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
    const val = e.target.value.length > 255 ? e.target.value.slice(0, 255) : e.target.value;
    setInternalEmail(val);
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
    setInternalEmail('');
    setInternalLocalError(null);
    setInternalErrorField(null);
    internalEmailRef.current?.focus();
  };

  const handleInternalSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setError(null);
    setInternalMessage(null);

    if (!internalFullName.trim()) {
      setInternalLocalError('Họ tên nhân sự là bắt buộc');
      setInternalErrorField('fullName');
      internalFullNameRef.current?.focus();
      return;
    }
    const normalizedEmail = internalEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setInternalLocalError('Gmail nội bộ nhân sự là bắt buộc');
      setInternalErrorField('email');
      internalEmailRef.current?.focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(normalizedEmail)) {
      setInternalLocalError('Gmail nội bộ không chính xác. Vui lòng kiểm tra và thử lại.');
      setInternalErrorField('email');
      internalEmailRef.current?.focus();
      return;
    }

    setInternalLocalError(null);
    setInternalErrorField(null);
    setInternalSubmitting(true);
    try {
      const response = await requestInternalPassword(normalizedEmail);
      setInternalMessage(response.message);
      setInternalEmail(normalizedEmail);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setInternalSubmitting(false);
    }
  };

  if (forgotPasswordMode) {
    return (
      <section className="extension-login-shell">
        <ForgotPasswordForm onCancel={() => setForgotPasswordMode(false)} />
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
            <button
              type="button"
              className="primary-button extension-auth-btn-back"
              onClick={() => {
                setInternalMode(false);
                setInternalMessage(null);
              }}
            >
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
              maxLength={255}
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
              maxLength={255}
            />
          </div>
          {displayedInternalError ? <p className="extension-login-error">{displayedInternalError}</p> : null}
          <div className="extension-login-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setInternalMode(false);
                setError(null);
                setInternalLocalError(null);
              }}
            >
              Hủy
            </button>
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
              <button
                type="button"
                className="text-button extension-error-forgot-link"
                onClick={() => setForgotPasswordMode(true)}
              >
                Quên mật khẩu?
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="extension-login-options">
          <label className="remember-me-control">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            <span>Ghi nhớ mật khẩu</span>
          </label>
          <div className="extension-login-links">
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setForgotPasswordMode(true);
                setError(null);
                setLocalError(null);
              }}
            >
              Quên mật khẩu
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setInternalMode(true);
                setInternalMessage(null);
                setError(null);
                setLocalError(null);
              }}
            >
              Nhân sự nội bộ đăng nhập lần đầu
            </button>
          </div>
        </div>

        <button type="submit" className="primary-button extension-submit-btn" disabled={submitting}>
          {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
    </section>
  );
}
