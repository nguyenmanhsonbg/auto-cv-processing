import { useRef, useState } from 'react';
import { ApiClientError, completePasswordReset, requestPasswordReset, verifyPasswordReset } from '@/lib/api-client';
import { ChangePasswordForm } from './ChangePasswordForm';
import { AuthInput, UserIcon } from './AuthInput';

type Step = 'IDENTIFIER' | 'METHOD' | 'OTP' | 'RESET';

export function ForgotPasswordForm({ onCancel }: { onCancel: () => void }) {
  const [step, setStep] = useState<Step>('IDENTIFIER');
  const [login, setLogin] = useState('');
  const [method, setMethod] = useState<'PHONE' | 'EMAIL'>('PHONE');
  const [challengeId, setChallengeId] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [targetEmail, setTargetEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendRemaining, setResendRemaining] = useState(3);
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  async function confirmMethod() {
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
      setError(err instanceof ApiClientError ? err.message : 'Không thể gửi mã xác nhận. Vui lòng thử lại.');
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
      setError(err instanceof ApiClientError ? err.message : 'OTP không đúng. Vui lòng kiểm tra lại.');
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
      setResendRemaining((current) => current - 1);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Không thể gửi lại mã xác nhận.');
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
      setError(err instanceof ApiClientError ? err.message : 'Không thể đổi mật khẩu. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'RESET') {
    return <ChangePasswordForm error={error} isSaving={loading} isResetPassword onCancel={onCancel} onSubmit={completeReset} />;
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
        <>
          <div className="extension-auth-fields">
            <AuthInput
              label="Tên đăng nhập"
              required
              icon={<UserIcon />}
              value={login}
              onChange={(event) => { setLogin(event.target.value); setError(null); }}
              placeholder="Nhập tên đăng nhập"
              autoFocus
              hasError={Boolean(error)}
            />
          </div>
          {error ? <p className="extension-login-error">{error}</p> : null}
          <div className="extension-login-actions">
            <button type="button" className="secondary-button" onClick={onCancel}>Quay lại</button>
            <button type="button" className="confirm-button" onClick={() => { setError(null); setStep('METHOD'); }} disabled={!login.trim()}>
              Xác nhận
            </button>
          </div>
        </>
      ) : step === 'METHOD' ? (
        <>
          <div className="extension-forgot-method-heading">
            <h2>Chọn phương thức khôi phục mật khẩu</h2>
            <p>Bạn muốn nhận mã xác nhận bằng phương thức nào?</p>
          </div>
          <div className="extension-forgot-method-list">
            <label className={`extension-forgot-method${method === 'PHONE' ? ' is-selected' : ''}`}>
              <input type="radio" name="reset-method" checked={method === 'PHONE'} onChange={() => { setMethod('PHONE'); setError(null); }} />
              <span className="extension-forgot-method-content">
                <strong>Gửi mã xác nhận qua SĐT</strong>
                <small>Mã xác nhận sẽ được gửi qua SĐT người dùng. Vui lòng truy cập và lấy mã xác nhận.</small>
              </span>
            </label>
            <label className={`extension-forgot-method${method === 'EMAIL' ? ' is-selected' : ''}`}>
              <input type="radio" name="reset-method" checked={method === 'EMAIL'} onChange={() => { setMethod('EMAIL'); setError(null); }} />
              <span className="extension-forgot-method-content">
                <strong>Gửi mã xác nhận qua Gmail</strong>
                <small>Mã xác nhận sẽ được gửi qua Gmail người dùng. Vui lòng truy cập và lấy mã xác nhận.</small>
              </span>
            </label>
          </div>
          {error ? <p className="extension-login-error">{error}</p> : null}
          <div className="extension-login-actions">
            <button type="button" className="secondary-button" onClick={() => setStep('IDENTIFIER')}>Quay lại</button>
            <button type="button" className="confirm-button" onClick={() => void confirmMethod()} disabled={loading}>
              {loading ? 'Đang gửi...' : 'Xác nhận'}
            </button>
          </div>
        </>
      ) : (
        <div className="extension-otp-view">
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
          {error ? <p className="extension-login-error">{error}</p> : null}
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
            <button type="button" className="secondary-button" onClick={() => setStep('METHOD')}>Quay lại</button>
            <button type="button" className="confirm-button" onClick={() => void confirmOtp()} disabled={loading || otp.length !== 6}>
              {loading ? 'Đang xác nhận...' : 'Xác nhận'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
