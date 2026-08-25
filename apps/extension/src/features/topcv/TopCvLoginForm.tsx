import { useState } from 'react';
import type { TopCvLoginResult } from './topcv-login.service';
import { checkTopCvAuth } from './topcv-auth';

interface TopCvLoginFormProps {
  onSuccess: (result: TopCvLoginResult) => void;
}

export function TopCvLoginForm({ onSuccess }: TopCvLoginFormProps) {
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

  return (
    <div className="topcv-login-card">
      <div className="topcv-login-header">
        <p className="topcv-login-desc">
          Đăng nhập tài khoản TopCV bằng cách đồng bộ từ trang tuyendung.topcv.vn
        </p>
      </div>

      <button
        type="button"
        className="topcv-btn-sync-tab"
        onClick={handleSyncFromTab}
        disabled={isSyncing}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
        </svg>
        <span>{isSyncing ? 'Đang kiểm tra tab TopCV...' : 'Đồng bộ từ trang TopCV đang mở'}</span>
      </button>

      {error ? (
        <div className="topcv-login-alert" style={{ marginTop: 8, fontSize: 11 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}

