import { useEffect, useRef, useState, type ChangeEvent, type FormEventHandler } from 'react';
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
  const hasLoginError = errorField === 'login' || isLockedOut;
  const hasPasswordError = errorField === 'password' || isLockedOut;

  const hasInternalFullNameError = internalErrorField === 'fullName';
  const hasInternalEmailError = internalErrorField === 'email';

  const handleLoginChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!isLockedOut && (localError || errorField || error)) {
      setLocalError(null);
      setErrorField(null);
      setError(null);
    }
    setLogin(e.target.value);
  };

  const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!isLockedOut && (localError || errorField || error)) {
      setLocalError(null);
      setErrorField(null);
      setError(null);
    }
    setPassword(e.target.value);
  };

  const handleLoginBlur = () => {
    // Required validation is handled on submit to avoid premature errors when clicking action buttons/checkboxes
  };

  const handlePasswordBlur = () => {
    // Required validation is handled on submit to avoid premature errors when clicking action buttons/checkboxes
  };

  const handleLoginClear = () => {
    setLogin('');
    if (!isLockedOut) {
      setLocalError(null);
      setErrorField(null);
      setError(null);
    }
    loginInputRef.current?.focus();
  };

  const handlePasswordClear = () => {
    setPassword('');
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
    // Required validation is handled on submit
  };

  const handleInternalEmailBlur = () => {
    if (internalEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(internalEmail.trim())) {
      setInternalLocalError('Email không đúng định dạng vui lòng nhập lại.');
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
      setInternalLocalError('Email nhân sự là bắt buộc');
      setInternalErrorField('email');
      internalEmailRef.current?.focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(normalizedEmail)) {
      setInternalLocalError('Email nhân sự không chính xác. Vui lòng kiểm tra và thử lại.');
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
      const msg = toErrorMessage(err);
      onError ? onError(msg) : setError(msg);
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
                <strong>Mật khẩu đã được gửi đến email {internalEmail}</strong>
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
              autoFocus
              hasError={hasInternalFullNameError}
              errorMessage={internalErrorField === 'fullName' ? internalLocalError : null}
              maxLength={255}
            />
            <AuthInput
              ref={internalEmailRef}
              label="Email nhân sự"
              required
              icon={<UserIcon />}
              value={internalEmail}
              onChange={handleInternalEmailChange}
              onBlur={handleInternalEmailBlur}
              onClear={handleInternalEmailClear}
              type="email"
              autoComplete="email"
              placeholder="Nhập email nhân sự"
              hasError={hasInternalEmailError}
              errorMessage={internalErrorField === 'email' ? internalLocalError : null}
              maxLength={255}
            />
          </div>
          <div className="extension-login-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setInternalMode(false);
                setError(null);
                setLocalError(null);
                setErrorField(null);
                setInternalLocalError(null);
                setInternalErrorField(null);
                setInternalFullName('');
                setInternalEmail('');
              }}
            >
              Hủy
            </button>
            <button type="submit" className="confirm-button" disabled={internalSubmitting || !internalFullName.trim() || !internalEmail.trim()}>
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
            autoFocus
            hasError={hasLoginError}
            errorMessage={errorField === 'login' ? localError : null}
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
            errorMessage={errorField === 'password' ? localError : (error?.toLowerCase().includes('tạm khóa') ? error : null)}
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
                setErrorField(null);
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
                setInternalFullName('');
                setInternalEmail('');
                setError(null);
                setLocalError(null);
                setErrorField(null);
                setInternalLocalError(null);
                setInternalErrorField(null);
              }}
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
