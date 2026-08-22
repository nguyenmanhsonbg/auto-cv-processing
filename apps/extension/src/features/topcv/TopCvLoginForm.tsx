import { useState, type FormEvent } from 'react';
import { loginTopCv, type TopCvLoginResult } from './topcv-login.service';
import { checkTopCvAuth } from './topcv-auth';

interface TopCvLoginFormProps {
  initialEmail?: string;
  onSuccess: (result: TopCvLoginResult) => void;
}

export function TopCvLoginForm({ initialEmail = '', onSuccess }: TopCvLoginFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSyncFromTab = async () => {
    setError(null);
    setIsSyncing(true);
    try {
      const auth = await checkTopCvAuth({ allowProbeTab: true });
      if (auth.ok) {
        onSuccess({ ok: true, userEmail: auth.userEmail });
      } else {
        setError('Không tìm thấy phiên đăng nhập từ tab tuyendung.topcv.vn đang mở.');
      }
    } catch {
      setError('Lỗi khi đồng bộ từ tab TopCV.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setError(null);
    setIsLoading(true);

    try {
      const result = await loginTopCv(email.trim(), password);
      if (result.ok) {
        onSuccess(result);
      } else {
        setError(result.error || 'Đăng nhập TopCV thất bại. Vui lòng kiểm tra lại tài khoản.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi kết nối tới TopCV.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="topcv-login-card">
      <div className="topcv-login-header">
        <div className="topcv-login-badge">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="24" height="24" rx="6" fill="#00B14F" />
            <path d="M7 12L10.5 15.5L17 9" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Tài khoản TopCV</span>
        </div>
        <h3 className="topcv-login-title">Đăng nhập Nhà tuyển dụng</h3>
        <p className="topcv-login-desc">
          Tự động đồng bộ từ tab TopCV đang mở hoặc đăng nhập trực tiếp từ tiện ích.
        </p>
      </div>

      <button
        type="button"
        className="topcv-btn-sync-tab"
        onClick={handleSyncFromTab}
        disabled={isSyncing || isLoading}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
        </svg>
        <span>{isSyncing ? 'Đang kiểm tra tab TopCV...' : 'Đồng bộ từ trang TopCV đang mở'}</span>
      </button>

      <div className="topcv-login-divider">
        <span>hoặc đăng nhập</span>
      </div>

      <form className="topcv-login-form" onSubmit={handleSubmit}>
        {error && (
          <div className="topcv-login-alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="#DC2626" strokeWidth="2" />
              <line x1="12" y1="8" x2="12" y2="12" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="16" r="1" fill="#DC2626" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <div className="topcv-form-group">
          <label className="topcv-form-label">
            Email tài khoản TopCV <span className="req">*</span>
          </label>
          <input
            type="email"
            className="topcv-input"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            placeholder="VD: tuyendung@domain.com"
            autoComplete="username"
            disabled={isLoading || isSyncing}
            required
          />
        </div>

        <div className="topcv-form-group">
          <label className="topcv-form-label">
            Mật khẩu <span className="req">*</span>
          </label>
          <div className="topcv-password-input-wrap">
            <input
              type={showPassword ? 'text' : 'password'}
              className="topcv-input"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Nhập mật khẩu TopCV"
              autoComplete="current-password"
              disabled={isLoading || isSyncing}
              required
            />
            <button
              type="button"
              className="topcv-password-toggle-btn"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          className="topcv-btn-login-submit"
          disabled={isLoading || isSyncing || !email.trim() || !password}
        >
          {isLoading ? (
            <span className="topcv-loading-text">
              <span className="topcv-spinner" />
              Đang xác thực với TopCV...
            </span>
          ) : (
            'Đăng nhập TopCV'
          )}
        </button>
      </form>
    </div>
  );
}

