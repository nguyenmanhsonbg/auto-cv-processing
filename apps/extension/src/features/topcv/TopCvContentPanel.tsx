import { useState } from 'react';
import { EditIcon, ExternalLinkIcon } from '@/components/icons';
import { formatTopCvSalary, type TopCvFormData } from './topcv-form.types';
import { checkTopCvAuth, type TopCvAuthState } from './services/topcv-auth.service';

interface TopCvContentPanelProps {
  formData: TopCvFormData;
  topCvAuth: TopCvAuthState | null;
  isCheckingAuth?: boolean;
  isLoadingFromBe?: boolean;
  onOpenEdit: () => void;
  onOpenPreview: () => void;
  onLogout: () => void;
  onSyncAuth?: (auth: TopCvAuthState) => void;
  onFetchFromBackend?: () => void;
}

export function TopCvContentPanel({
  formData,
  topCvAuth,
  isCheckingAuth,
  onOpenEdit,
  onOpenPreview,
  onLogout,
  onSyncAuth,
}: TopCvContentPanelProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const handleSyncFromTab = async () => {
    setSyncError(null);
    setIsSyncing(true);
    try {
      const auth = await checkTopCvAuth({ allowProbeTab: true });
      if (onSyncAuth) {
        onSyncAuth(auth);
      }
      if (!auth.ok) {
        setSyncError('Không tìm thấy phiên đăng nhập từ tab tuyendung.topcv.vn đang mở.');
      }
    } catch {
      setSyncError('Lỗi khi đồng bộ từ tab TopCV.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="topcv-content-panel">
      {/* Logged in Account Banner */}
      {topCvAuth?.ok && (topCvAuth.companyName || topCvAuth.userEmail) ? (
        <div className="topcv-account-bar">
          <div className="topcv-account-info">
            <span className="topcv-account-dot" />
            <span
              className="topcv-account-email"
              title={topCvAuth.companyName || topCvAuth.userEmail}
            >
              {topCvAuth.companyName || topCvAuth.userEmail}
            </span>
          </div>
          <button
            type="button"
            className="topcv-logout-btn"
            onClick={onLogout}
            title="Đăng xuất tài khoản TopCV"
          >
            Đăng xuất
          </button>
        </div>
      ) : (
        <div style={{ marginBottom: 8 }}>
          <button
            type="button"
            className="topcv-btn-sync-tab"
            onClick={handleSyncFromTab}
            disabled={isSyncing || isCheckingAuth}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={isSyncing || isCheckingAuth ? { animation: 'topcv-spin 0.8s linear infinite' } : undefined}
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <span>
              {isSyncing || isCheckingAuth
                ? 'Đang kiểm tra tab TopCV...'
                : 'Đồng bộ từ trang TopCV đang mở'}
            </span>
          </button>
          {syncError ? (
            <div className="topcv-login-alert" style={{ marginTop: 6, fontSize: 11 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{syncError}</span>
            </div>
          ) : null}
        </div>
      )}

      <div className="topcv-preview-card-compact">
        <div className="topcv-card-title">
          {formData.title || 'Chưa có tiêu đề bài đăng'}
        </div>
        <div className="topcv-card-salary">
          {formatTopCvSalary(formData)}
        </div>

        <div className="topcv-card-actions">
          <button
            type="button"
            className="topcv-action-btn topcv-edit-btn"
            onClick={onOpenEdit}
          >
            <EditIcon />
            <span>Chỉnh sửa</span>
          </button>
          <button
            type="button"
            className="topcv-action-btn topcv-preview-btn"
            onClick={onOpenPreview}
          >
            <ExternalLinkIcon />
            <span>Xem bản đầy đủ</span>
          </button>
        </div>
      </div>
    </div>
  );
}
