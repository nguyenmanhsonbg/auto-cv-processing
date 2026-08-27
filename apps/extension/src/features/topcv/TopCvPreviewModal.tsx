import { BackIcon, EditIcon } from '@/components/icons';
import { formatTopCvSalary, type TopCvFormData } from './topcv-form.types';
import { getLanguageDisplay, type TopCvOptionsResponse } from './services/topcv-options.service';

interface TopCvPreviewModalProps {
  formData: TopCvFormData;
  foreignLanguageOptions: TopCvOptionsResponse['data']['certificate_foreign_languages'];
  onEdit: () => void;
  onClose: () => void;
}

export function TopCvPreviewModal({
  formData,
  foreignLanguageOptions,
  onEdit,
  onClose,
}: TopCvPreviewModalProps) {
  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'Chưa xác định';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };

  return (
    <div className="topcv-screen-container">
      <header className="topcv-screen-header">
        <button type="button" className="icon-button" onClick={onClose} title="Quay lại" aria-label="Quay lại">
          <BackIcon />
        </button>
        <div className="topcv-screen-title-wrap">
          <span className="topcv-badge">TopCV</span>
          <h2 id="topcv-preview-title">Xem trước bài đăng TopCV</h2>
        </div>
      </header>

      <div className="topcv-screen-body">
        {/* HERO CARD */}
        <div className="topcv-hero-card">
          <div className="topcv-hero-header">
            <h3 className="topcv-hero-title">{formData.title || 'Chưa có tiêu đề bài đăng'}</h3>
            <div className="topcv-hero-salary">{formatTopCvSalary(formData)}</div>
          </div>
          <div className="topcv-hero-meta-grid">
            <div className="topcv-meta-box">
              <span className="topcv-meta-label">ĐỊA ĐIỂM</span>
              <strong className="topcv-meta-val">{formData.locations[0]?.province_name || 'Chưa cập nhật'}</strong>
            </div>
            <div className="topcv-meta-box">
              <span className="topcv-meta-label">KINH NGHIỆM</span>
              <strong className="topcv-meta-val">{formData.experience || 'Chưa cập nhật'}</strong>
            </div>
            <div className="topcv-meta-box">
              <span className="topcv-meta-label">HẠN ỨNG TUYỂN</span>
              <strong className="topcv-meta-val">{formatDate(formData.deadline)}</strong>
            </div>
          </div>
        </div>

        {/* OVERVIEW SECTION */}
        <div className="topcv-preview-section">
          <h4 className="topcv-preview-section-title">Tổng quan</h4>
          <div className="topcv-overview-grid">
            <div className="topcv-overview-row">
              <span className="topcv-overview-label">Yêu cầu:</span>
              <div className="topcv-overview-chips">
                <span className="topcv-tag">{formData.experience}</span>
                <span className="topcv-tag">{formData.education}</span>
                {formData.languages.map((l, i) => (
                  <span key={i} className="topcv-tag">
                    {getLanguageDisplay(l.language, l.certificate, foreignLanguageOptions)}
                  </span>
                ))}
              </div>
            </div>
            <div className="topcv-overview-row">
              <span className="topcv-overview-label">Chuyên môn:</span>
              <div className="topcv-overview-chips">
                {formData.requiredSkills.map((s) => (
                  <span key={s.value} className="topcv-tag is-primary">{s.label}</span>
                ))}
                {formData.preferredSkills.map((s) => (
                  <span key={s.value} className="topcv-tag">{s.label}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* JOB DESCRIPTION */}
        <div className="topcv-preview-section">
          <h4 className="topcv-preview-section-title">Mô tả công việc</h4>
          <div className="topcv-preview-text">
            {formData.jobDescription || 'Chưa có nội dung mô tả công việc.'}
          </div>
        </div>

        {/* JOB REQUIREMENTS */}
        <div className="topcv-preview-section">
          <h4 className="topcv-preview-section-title">Yêu cầu ứng viên</h4>
          <div className="topcv-preview-text">
            {formData.jobRequirement || 'Chưa có nội dung yêu cầu ứng viên.'}
          </div>
        </div>

        {/* BENEFITS */}
        <div className="topcv-preview-section">
          <h4 className="topcv-preview-section-title">Quyền lợi ứng viên</h4>
          <div className="topcv-preview-text">
            {formData.jobBenefit || 'Chưa có nội dung quyền lợi ứng viên.'}
          </div>
        </div>

        {/* LOCATION & TIME */}
        <div className="topcv-preview-section">
          <h4 className="topcv-preview-section-title">Địa điểm và thời gian</h4>
          <div className="topcv-preview-text">
            <p><strong>Địa điểm làm việc:</strong></p>
            {formData.locations.length > 0 ? (
              formData.locations.map((loc, idx) => (
                <div key={idx} style={{ marginBottom: 8 }}>
                  <p><strong>{loc.province_name}</strong></p>
                  {loc.addresses.map((addr, aIdx) => (
                    <p key={aIdx} style={{ paddingLeft: 12 }}>
                      • {addr.district_name}
                      {addr.working_address && <span> - {addr.working_address}</span>}
                    </p>
                  ))}
                </div>
              ))
            ) : (
              <p>Chưa cập nhật</p>
            )}
            <p style={{ marginTop: 8 }}><strong>Thời gian làm việc:</strong></p>
            {(() => {
              const DAY_MAP: Record<string | number, string> = {
                1: 'Thứ 2',
                2: 'Thứ 3',
                3: 'Thứ 4',
                4: 'Thứ 5',
                5: 'Thứ 6',
                6: 'Thứ 7',
                7: 'Chủ Nhật',
              };
              const formatDay = (val: string | number) => DAY_MAP[val] || val;
              const schedules = (formData.workingHours.schedules && formData.workingHours.schedules.length > 0)
                ? formData.workingHours.schedules
                : (formData.workingHours.fromDay && formData.workingHours.toDay)
                  ? [{
                      fromDay: formData.workingHours.fromDay,
                      toDay: formData.workingHours.toDay,
                      fromTime: formData.workingHours.fromTime,
                      toTime: formData.workingHours.toTime,
                    }]
                  : [];

              if (schedules.length === 0) {
                return <p>Chưa cập nhật</p>;
              }

              return schedules.map((item, idx) => (
                <p key={idx}>
                  {item.fromDay && item.toDay
                    ? `${formatDay(item.fromDay)} - ${formatDay(item.toDay)} (${item.fromTime || '08:30'} đến ${item.toTime || '18:00'})`
                    : 'Chưa cập nhật'}
                </p>
              ));
            })()}
            {formData.workingHours.lunchBreak && <p>{formData.workingHours.lunchBreak}</p>}
          </div>
        </div>
      </div>

      <footer className="topcv-screen-footer">
        <button type="button" className="secondary-button" onClick={onClose}>
          Đóng
        </button>
        <div className="topcv-modal-footer-actions">
          <button type="button" className="primary-button" onClick={onEdit}>
            <EditIcon /> Chỉnh sửa
          </button>
        </div>
      </footer>
    </div>
  );
}
