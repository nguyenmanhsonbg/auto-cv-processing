import { useRef, useState, type FocusEvent } from 'react';
import { ApiClientError, checkPasswordResetLogin, completePasswordReset, requestPasswordReset, verifyPasswordReset } from '@/lib/api-client';
import { ChangePasswordForm } from './ChangePasswordForm';
import { AuthInput } from './AuthInput';
import { UserIcon } from '@/components/svg';

type Step = 'IDENTIFIER' | 'METHOD' | 'OTP' | 'RESET';

const NETWORK_ERROR_MESSAGE = 'Có lỗi kết nối mạng, vui lòng kiểm tra lại.';

function isNetworkError(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.code === 'NETWORK_ERROR' || error.status === 0;
  }

  const message = error instanceof Error ? error.message : String(error);
  return /network error|networkerror|failed to fetch|network request failed|err_network|err_failed|load failed|fetch failed/i.test(message);
}

export function ForgotPasswordForm({
  onCancel,
  onError,
}: {
  onCancel: () => void;
  onError?: (message: string) => void;
}) {
  const [step, setStep] = useState<Step>('IDENTIFIER');
  const [login, setLogin] = useState('');
  const [method, setMethod] = useState<'PHONE' | 'EMAIL'>('PHONE');
  const [availableMethods, setAvailableMethods] = useState<Array<'PHONE' | 'EMAIL'>>(['EMAIL']);
  const [challengeId, setChallengeId] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [targetEmail, setTargetEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [identifierError, setIdentifierError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendRemaining, setResendRemaining] = useState(5);
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const loginInputRef = useRef<HTMLInputElement | null>(null);
  const skipIdentifierBlurValidationRef = useRef(false);

  function handleRequestError(error: unknown, fallback: string, notifyNetwork = true) {
    if (isNetworkError(error)) {
      if (notifyNetwork && onError) {
        setError(null);
        onError(NETWORK_ERROR_MESSAGE);
      } else if (notifyNetwork) {
        setError(NETWORK_ERROR_MESSAGE);
      } else {
        setError(null);
      }
      return;
    }

    setError(error instanceof ApiClientError ? error.message : fallback);
  }

  function handleIdentifierBlur(event: FocusEvent<HTMLInputElement>) {
    const relatedTarget = event.relatedTarget;
    const isActionButton = relatedTarget instanceof HTMLElement && relatedTarget.tagName === 'BUTTON';
    if (skipIdentifierBlurValidationRef.current || isActionButton) {
      skipIdentifierBlurValidationRef.current = false;
      return;
    }
    if (!login.trim()) {
      setIdentifierError('Tên đăng nhập là bắt buộc');
      loginInputRef.current?.focus();
      return;
    }
    setIdentifierError(null);
  }

  async function confirmIdentifier() {
    const trimmed = login.trim();
    if (!trimmed) {
      setIdentifierError('Tên đăng nhập là bắt buộc');
      loginInputRef.current?.focus();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await checkPasswordResetLogin(trimmed);
      if (!result.exists) {
        if (result.hint === 'HR_NOT_ALLOWED' || result.hint === 'INTERNAL_PASSWORD_REQUIRED') {
          setError('Bạn không có quyền thực hiện chức năng này.');
        } else {
          setError('Tên đăng nhập không hợp lệ. Vui lòng kiểm tra lại.');
        }
        loginInputRef.current?.focus();
        return;
      }
      const recoveryMethods = result.availableMethods ?? ['EMAIL'];
      setAvailableMethods(recoveryMethods);
      if (recoveryMethods.length > 1) {
        setMethod(recoveryMethods.includes('PHONE') ? 'PHONE' : 'EMAIL');
        setStep('METHOD');
        return;
      }
      await sendOtpAndAdvance();
    } catch (err) {
      handleRequestError(err, 'Không thể kiểm tra tên đăng nhập. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }

  async function sendOtpAndAdvance() {
    try {
      const response = await requestPasswordReset(login.trim());
      setChallengeId(response.challengeId);
      setTargetEmail(response.email);
      setMethod('EMAIL');
      setOtp('');
      setStep('OTP');
    } catch (err) {
      handleRequestError(err, 'Không thể gửi mã xác nhận. Vui lòng thử lại.', false);
      throw err;
    }
  }

  async function confirmMethod() {
    setOtp('');
    if (method === 'PHONE') {
      setError('Luồng SMS chưa được hỗ trợ. Vui lòng chọn Gmail.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await requestPasswordReset(login.trim());
      setChallengeId(response.challengeId);
      setTargetEmail(response.email);
      setStep('OTP');
    } catch (err) {
      handleRequestError(err, 'Không thể gửi mã xác nhận. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }

  async function confirmOtp() {
    setLoading(true);
    setError(null);
    try {
      const response = await verifyPasswordReset(challengeId, otp);
      setResetToken(response.resetToken);
      setStep('RESET');
    } catch (err) {
      setOtp('');
      otpInputRefs.current[0]?.focus();
      handleRequestError(err, 'OTP không đúng. Vui lòng kiểm tra lại.');
    } finally {
      setLoading(false);
    }
  }

  async function resendOtp() {
    if (resendRemaining <= 0 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await requestPasswordReset(login.trim());
      setChallengeId(response.challengeId);
      setTargetEmail(response.email);
      setOtp('');
      otpInputRefs.current[0]?.focus();
      setResendRemaining((current) => current - 1);
    } catch (err) {
      handleRequestError(err, 'Không thể gửi lại mã xác nhận.');
    } finally {
      setLoading(false);
    }
  }

  async function completeReset(input: { currentPassword: string; newPassword: string; confirmPassword: string }) {
    setLoading(true);
    setError(null);
    try {
      await completePasswordReset(resetToken, {
        newPassword: input.newPassword,
        confirmPassword: input.confirmPassword,
      });
      onCancel();
    } catch (err) {
      handleRequestError(err, 'Không thể đổi mật khẩu. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'RESET') {
    return <ChangePasswordForm error={error} isSaving={loading} isResetPassword onCancel={() => setStep('METHOD')} onSubmit={completeReset} />;
  }

  return (
    <div className="extension-login-card extension-forgot-password-card">
      <div className="extension-auth-heading-group">
        <h1>{step === 'OTP' ? (method === 'PHONE' ? 'Kiểm tra mã xác nhận từ SĐT' : 'Kiểm tra mã xác nhận từ Gmail') : 'Quên mật khẩu'}</h1>
        {step === 'OTP' ? (
          <p className="extension-auth-subtext">
            {method === 'PHONE' ? 'Kiểm tra mã xác nhận được gửi tới SĐT' : `Kiểm tra mã xác nhận được gửi tới gmail ${targetEmail || 'người dùng'}`}
          </p>
        ) : null}
      </div>

      {step === 'IDENTIFIER' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!login.trim() || loading) return;
            void confirmIdentifier();
          }}
        >
          <div className="extension-auth-fields">
            <AuthInput
              ref={loginInputRef}
              label="Tên đăng nhập"
              required
              icon={<UserIcon />}
              value={login}
              onChange={(event) => {
                setLogin(event.target.value);
                setIdentifierError(null);
                setError(null);
              }}
              onBlur={handleIdentifierBlur}
              placeholder="Nhập tên đăng nhập"
              autoFocus
              hasError={Boolean(identifierError || error)}
              errorMessage={identifierError}
              maxLength={255}
            />
          </div>
          {error ? <p className="extension-login-error">{error}</p> : null}
          <div className="extension-login-actions">
            <button
              type="button"
              className="secondary-button"
              onMouseDown={() => { skipIdentifierBlurValidationRef.current = true; }}
              onClick={() => {
                skipIdentifierBlurValidationRef.current = false;
                setIdentifierError(null);
                setError(null);
                onCancel();
              }}
            >Quay lại</button>
            <button type="submit" className="confirm-button" disabled={!login.trim() || loading}>
              {loading ? 'Đang kiểm tra...' : 'Xác nhận'}
            </button>
          </div>
        </form>
      ) : step === 'METHOD' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (loading) return;
            void confirmMethod();
          }}
        >
          <div className="extension-forgot-method-heading">
            <h2>Chọn phương thức khôi phục mật khẩu</h2>
            <p>Bạn muốn nhận mã xác nhận bằng phương thức nào?</p>
          </div>
          <div className="extension-forgot-method-list">
            {availableMethods.includes('PHONE') ? (
              <label className={`extension-forgot-method${method === 'PHONE' ? ' is-selected' : ''}`}>
                <input type="radio" name="reset-method" checked={method === 'PHONE'} onChange={() => { setMethod('PHONE'); setError(null); }} />
                <span className="extension-forgot-method-content">
                  <strong>Gửi mã xác nhận qua SĐT</strong>
                  <small>Mã xác nhận sẽ được gửi qua SĐT người dùng. Vui lòng truy cập và lấy mã xác nhận.</small>
                </span>
              </label>
            ) : null}
            {availableMethods.includes('EMAIL') ? (
              <label className={`extension-forgot-method${method === 'EMAIL' ? ' is-selected' : ''}`}>
                <input type="radio" name="reset-method" checked={method === 'EMAIL'} onChange={() => { setMethod('EMAIL'); setError(null); }} />
                <span className="extension-forgot-method-content">
                  <strong>Gửi mã xác nhận qua Gmail</strong>
                  <small>Mã xác nhận sẽ được gửi qua Gmail người dùng. Vui lòng truy cập và lấy mã xác nhận.</small>
                </span>
              </label>
            ) : null}
          </div>
          {error ? <p className="extension-login-error">{error}</p> : null}
          <div className="extension-login-actions">
            <button type="button" className="secondary-button" onClick={() => { setError(null); setStep('IDENTIFIER'); }}>Quay lại</button>
            <button type="submit" className="confirm-button" disabled={loading}>
              {loading ? 'Đang gửi...' : 'Xác nhận'}
            </button>
          </div>
        </form>
      ) : (
        <form
          className="extension-otp-view"
          onSubmit={(e) => {
            e.preventDefault();
            if (loading || otp.length !== 6) return;
            void confirmOtp();
          }}
        >
          <div className="extension-otp-inputs">
            {Array.from({ length: 6 }, (_, index) => (
              <input
                key={index}
                className={`extension-otp-input${error ? ' has-error' : ''}`}
                ref={(element) => { otpInputRefs.current[index] = element; }}
                value={otp[index] ?? ''}
                onChange={(event) => {
                  const digit = event.target.value.replace(/\D/g, '').slice(-1);
                  setOtp((current) => `${current.slice(0, index)}${digit}${current.slice(index + 1)}`.slice(0, 6));
                  setError(null);
                  if (digit && index < 5) otpInputRefs.current[index + 1]?.focus();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Backspace' && !otp[index] && index > 0) otpInputRefs.current[index - 1]?.focus();
                }}
                onPaste={(event) => {
                  const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                  if (!pasted) return;
                  event.preventDefault();
                  setOtp(pasted);
                  setError(null);
                  otpInputRefs.current[Math.min(pasted.length, 6) - 1]?.focus();
                }}
                inputMode="numeric"
                maxLength={1}
                autoFocus={index === 0}
                aria-label={`Số OTP thứ ${index + 1}`}
              />
            ))}
          </div>
          {error ? <p className="extension-login-error extension-otp-error">{error}</p> : null}
          <div className="extension-otp-resend-row">
            <button type="button" className="extension-otp-resend-btn" onClick={() => void resendOtp()} disabled={loading || resendRemaining <= 0}>
              Gửi lại
            </button>
            <span className="extension-otp-resend-count">(Còn lại {resendRemaining} lần)</span>
          </div>
          <div className="extension-otp-hints">
            <p className="extension-otp-hint">Mỗi Mã OTP khả dụng trong 15’</p>
            <p className="extension-otp-hint">Bạn có thể gửi lại mã OTP 5 lần / 1 ngày, cài lại lúc 00:00:00 hàng ngày</p>
          </div>
          <div className="extension-login-actions">
            <button type="button" className="secondary-button" onClick={() => { setOtp(''); setError(null); setStep('METHOD'); }}>Quay lại</button>
            <button type="submit" className="confirm-button" disabled={loading || otp.length !== 6}>
              {loading ? 'Đang xác nhận...' : 'Xác nhận'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
