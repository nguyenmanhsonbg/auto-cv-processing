import { useRef, useState } from 'react';
import { ApiClientError, completePasswordReset, requestPasswordReset, verifyPasswordReset } from '@/lib/api-client';
import { ChangePasswordForm } from './ChangePasswordForm';

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
    <section className="extension-forgot-password-card">
      <h1>{step === 'OTP' ? 'Kiểm tra mã xác nhận từ Gmail' : 'Quên mật khẩu'}</h1>
      {step === 'IDENTIFIER' ? (
        <>
          <label className="extension-forgot-field">
            <span>Tên đăng nhập <span className="required-mark">*</span></span>
            <span className={`extension-input-shell${error ? ' has-error' : ''}`}>
              <span className="extension-input-icon" aria-hidden="true"><UserIcon /></span>
              <input value={login} onChange={(event) => { setLogin(event.target.value); setError(null); }} placeholder="Nhập tên đăng nhập" autoFocus />
            </span>
          </label>
          {error ? <p className="extension-login-error">{error}</p> : null}
          <div className="extension-forgot-actions">
            <button type="button" className="secondary-button" onClick={onCancel}>Quay lại</button>
            <button type="button" className="confirm-button" onClick={() => { setError(null); setStep('METHOD'); }} disabled={!login.trim()}>Xác nhận</button>
          </div>
        </>
      ) : step === 'METHOD' ? (
        <>
          <div className="extension-forgot-method-heading"><h2>Chọn phương thức khôi phục mật khẩu</h2><p>Bạn muốn nhận mã xác nhận bằng phương thức nào?</p></div>
          <label className="extension-forgot-method"><input type="radio" checked={method === 'PHONE'} onChange={() => { setMethod('PHONE'); setError(null); }} /><span><strong>Gửi mã xác nhận qua SĐT</strong><small>Mã xác nhận sẽ được gửi qua SĐT người dùng. Vui lòng truy cập và lấy mã xác nhận.</small></span></label>
          <label className="extension-forgot-method"><input type="radio" checked={method === 'EMAIL'} onChange={() => { setMethod('EMAIL'); setError(null); }} /><span><strong>Gửi mã xác nhận qua Gmail</strong><small>Mã xác nhận sẽ được gửi qua Gmail người dùng. Vui lòng truy cập và lấy mã xác nhận.</small></span></label>
          {error ? <p className="extension-login-error">{error}</p> : null}
          <div className="extension-forgot-actions"><button type="button" className="secondary-button" onClick={() => setStep('IDENTIFIER')}>Quay lại</button><button type="button" className="confirm-button" onClick={() => void confirmMethod()} disabled={loading}>{loading ? 'Đang gửi...' : 'Xác nhận'}</button></div>
        </>
      ) : (
        <div className="extension-otp-view">
          <p className="extension-otp-description">Kiểm tra mã xác nhận được gửi tới Gmail<br />{targetEmail}</p>
          <div className="extension-otp-inputs">
            {Array.from({ length: 6 }, (_, index) => (
              <input
                key={index}
                className={error ? 'has-error' : undefined}
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
          <button type="button" className="extension-otp-resend" onClick={() => void resendOtp()} disabled={loading || resendRemaining <= 0}><u>Gửi lại</u> <span>(Còn lại {resendRemaining} lần)</span></button>
          <p className="extension-otp-hint">Mỗi mã OTP khả dụng trong 15'</p>
          <p className="extension-otp-hint">Bạn có thể gửi lại mã OTP 5 lần / 1 ngày, tại lúc 00:00:00 hằng ngày</p>
          <div className="extension-forgot-actions"><button type="button" className="secondary-button" onClick={() => setStep('METHOD')}>Quay lại</button><button type="button" className="confirm-button" onClick={() => void confirmOtp()} disabled={loading || otp.length !== 6}>{loading ? 'Đang xác nhận...' : 'Xác nhận'}</button></div>
        </div>
      )}
    </section>
  );
}

function UserIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-5.33 0-9 2.67-9 6v2h18v-2c0-3.33-3.67-6-9-6Z" /></svg>; }
