import { EditIcon, ExternalLinkIcon } from '@/components/icons';
import { formatTopCvSalary, type TopCvFormData } from './topcv-form.types';
import { TopCvLoginForm } from './TopCvLoginForm';
import type { TopCvAuthState } from './topcv-auth';
import type { TopCvLoginResult } from './topcv-login.service';

interface TopCvContentPanelProps {
  formData: TopCvFormData;
  topCvAuth: TopCvAuthState | null;
  isCheckingAuth?: boolean;
  isLoadingFromBe?: boolean;
  onOpenEdit: () => void;
  onOpenPreview: () => void;
  onLoginSuccess: (result: TopCvLoginResult) => void;
  onLogout: () => void;
  onFetchFromBackend?: () => void;
}

export function TopCvContentPanel({
  formData,
  topCvAuth,
  isCheckingAuth,
  onOpenEdit,
  onOpenPreview,
  onLoginSuccess,
  onLogout,
}: TopCvContentPanelProps) {
  // If actively checking or probing background session
  if (isCheckingAuth && !topCvAuth?.ok) {
    return (
      <div className="topcv-content-panel">
        <div className="topcv-login-card" style={{ alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
          <span className="topcv-spinner" style={{ borderColor: 'rgba(0, 177, 79, 0.2)', borderTopColor: '#00B14F', width: 20, height: 20 }} />
          <span style={{ fontSize: 13, color: '#4b5563', marginTop: 8, fontWeight: 500 }}>
            Đang tự động đồng bộ tài khoản TopCV...
          </span>
        </div>
      </div>
    );
  }

  // If user is not authenticated with TopCV, render the in-sidepanel Login Form
  if (!topCvAuth?.ok) {
    return (
      <div className="topcv-content-panel">
        <TopCvLoginForm
          initialEmail={topCvAuth?.userEmail || ''}
          onSuccess={onLoginSuccess}
        />
      </div>
    );
  }


  return (
    <div className="topcv-content-panel">
      {/* Logged in Account Banner */}
      <div className="topcv-account-bar">
        <div className="topcv-account-info">
          <span className="topcv-account-dot" />
          <span className="topcv-account-email">
            {topCvAuth.userEmail || 'Tài khoản TopCV đã kết nối'}
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


