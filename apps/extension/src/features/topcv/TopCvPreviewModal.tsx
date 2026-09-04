import { useEffect, useMemo, useState } from 'react';
import { BackIcon } from '@/assets/icons';
import { formatTopCvSalary, type TopCvFormData } from './topcv-form.types';
import {
  fetchTopCvDomainKnowledge,
  fetchTopCvOptions,
  getLanguageDisplay,
  type TopCvDomainKnowledge,
  type TopCvOption,
  type TopCvOptionsResponse,
} from './services/topcv-options.service';
import {
  formatTopCvDate,
  formatTopCvDay,
  renderSafeRichText,
} from './utils/topcv-preview.utils';

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
}: Readonly<TopCvPreviewModalProps>) {
  const [educationOptions, setEducationOptions] = useState<TopCvOption[]>([]);
  const [domainKnowledgeOptions, setDomainKnowledgeOptions] = useState<TopCvDomainKnowledge[]>([]);

  useEffect(() => {
    fetchTopCvOptions()
      .then((options) => {
        setEducationOptions(options.education);
      })
      .catch(() => {
        // Fallback gracefully if options not available
      });

    fetchTopCvDomainKnowledge()
      .then((dk) => {
        setDomainKnowledgeOptions(dk);
      })
      .catch(() => {
        // Fallback gracefully
      });
  }, []);

  const educationDisplay = useMemo(() => {
    if (!formData.education) return '';
    const num = Number(formData.education);
    if (!Number.isNaN(num)) {
      const found = educationOptions.find((opt) => opt.value === num);
      if (found) return found.name;
    }
    return String(formData.education);
  }, [formData.education, educationOptions]);

  const experienceDisplay = useMemo(() => {
    if (!formData.experience) return '';
    const exp = formData.experience.trim();
    if (exp.toLowerCase().includes('chuyên môn') || exp.toLowerCase().includes('kinh nghiệm')) {
      return exp;
    }
    return `${exp} chuyên môn`;
  }, [formData.experience]);

  const domainKnowledgeLabels = useMemo(() => {
    if (!formData.industryKnowledge || formData.industryKnowledge.length === 0) return [];
    return formData.industryKnowledge
      .map((id) => domainKnowledgeOptions.find((opt) => opt.id === id)?.name)
      .filter((name): name is string => Boolean(name));
  }, [formData.industryKnowledge, domainKnowledgeOptions]);

  const specialtyItems = useMemo(() => {
    const items: string[] = [];
    const positionName = formData.position?.trim() || formData.jobFamily?.level3Name || formData.jobFamily?.level2Name;
    if (positionName) {
      items.push(positionName);
    }
    domainKnowledgeLabels.forEach((name) => {
      if (!items.includes(name)) items.push(name);
    });
    formData.requiredSkills.forEach((s) => {
      if (s.label && !items.includes(s.label)) items.push(s.label);
    });
    formData.preferredSkills.forEach((s) => {
      if (s.label && !items.includes(s.label)) items.push(s.label);
    });
    return items;
  }, [formData.position, formData.jobFamily, domainKnowledgeLabels, formData.requiredSkills, formData.preferredSkills]);

  const schedules = useMemo(() => {
    if (formData.workingHours.schedules && formData.workingHours.schedules.length > 0) {
      return formData.workingHours.schedules;
    }
    if (formData.workingHours.fromDay && formData.workingHours.toDay) {
      return [
        {
          fromDay: formData.workingHours.fromDay,
          toDay: formData.workingHours.toDay,
          fromTime: formData.workingHours.fromTime,
          toTime: formData.workingHours.toTime,
        },
      ];
    }
    return [];
  }, [formData.workingHours]);

  return (
    <div className="topcv-screen-container is-preview">
      {/* Header */}
      <header className="topcv-preview-header">
        <button
          type="button"
          className="topcv-back-btn"
          onClick={onClose}
          title="Quay lại"
          aria-label="Quay lại"
        >
          <BackIcon />
        </button>
        <h2 id="topcv-preview-title" className="topcv-preview-title">
          Xem trước bài đăng TopCV
        </h2>
      </header>

      {/* Main Content */}
      <div className="topcv-preview-body">
        {/* HERO CARD */}
        <div className="topcv-hero-card">
          <div className="topcv-hero-header">
            <h3 className="topcv-hero-title">{formData.title || 'Chưa có tiêu đề bài đăng'}</h3>
            <div className="topcv-hero-salary">{formatTopCvSalary(formData)}</div>
          </div>
          <div className="topcv-hero-meta-grid">
            <div className="topcv-meta-box">
              <span className="topcv-meta-label">ĐỊA ĐIỂM</span>
              <strong className="topcv-meta-val">
                {formData.locations[0]?.province_name || 'Chưa cập nhật'}
              </strong>
            </div>
            <div className="topcv-meta-box">
              <span className="topcv-meta-label">KINH NGHIỆM</span>
              <strong className="topcv-meta-val">{formData.experience || 'Chưa cập nhật'}</strong>
            </div>
            <div className="topcv-meta-box">
              <span className="topcv-meta-label">HẠN ỨNG TUYỂN</span>
              <strong className="topcv-meta-val">{formatTopCvDate(formData.deadline)}</strong>
            </div>
          </div>
        </div>

        {/* DETAILED SECTIONS CONTAINER */}
        <div className="topcv-preview-sections-container">
          {/* SECTION 1: TỔNG QUAN */}
          <section className="topcv-preview-section" aria-labelledby="topcv-section-overview">
            <div className="topcv-section-title-wrap">
              <h4 id="topcv-section-overview" className="topcv-section-title">
                Tổng quan
              </h4>
            </div>
            <div className="topcv-overview-group">
              <div className="topcv-overview-label">Yêu cầu:</div>
              <div className="topcv-overview-chips">
                {experienceDisplay && <span className="topcv-pill-gray">{experienceDisplay}</span>}
                {educationDisplay && <span className="topcv-pill-gray">{educationDisplay}</span>}
                {formData.languages.map((l, i) => (
                  <span key={`lang-${i}`} className="topcv-pill-gray">
                    {getLanguageDisplay(l.language, l.certificate, foreignLanguageOptions)}
                  </span>
                ))}
                {!experienceDisplay && !educationDisplay && formData.languages.length === 0 && (
                  <span className="topcv-pill-gray">Chưa cập nhật</span>
                )}
              </div>
            </div>

            <div className="topcv-overview-group">
              <div className="topcv-overview-label">Chuyên môn:</div>
              <div className="topcv-overview-chips">
                {specialtyItems.length > 0 ? (
                  specialtyItems.map((item) => (
                    <span key={`specialty-${item}`} className="topcv-pill-green">
                      {item}
                    </span>
                  ))
                ) : (
                  <span className="topcv-pill-green">Chưa cập nhật</span>
                )}
              </div>
            </div>
          </section>

          {/* SECTION 2: MÔ TẢ CÔNG VIỆC */}
          <section className="topcv-preview-section" aria-labelledby="topcv-section-description">
            <div className="topcv-section-title-wrap">
              <h4 id="topcv-section-description" className="topcv-section-title">
                Mô tả công việc
              </h4>
            </div>
            <div className="topcv-preview-content">
              {renderSafeRichText(formData.jobDescription, 'Chưa có nội dung mô tả công việc.')}
            </div>
          </section>

          {/* SECTION 3: YÊU CẦU ỨNG VIÊN */}
          <section className="topcv-preview-section" aria-labelledby="topcv-section-requirements">
            <div className="topcv-section-title-wrap">
              <h4 id="topcv-section-requirements" className="topcv-section-title">
                Yêu cầu ứng viên
              </h4>
            </div>
            <div className="topcv-preview-content">
              {renderSafeRichText(formData.jobRequirement, 'Chưa có nội dung yêu cầu ứng viên.')}
            </div>
          </section>

          {/* SECTION 4: QUYỀN LỢI ỨNG VIÊN */}
          <section className="topcv-preview-section" aria-labelledby="topcv-section-benefits">
            <div className="topcv-section-title-wrap">
              <h4 id="topcv-section-benefits" className="topcv-section-title">
                Quyền lợi ứng viên
              </h4>
            </div>
            <div className="topcv-preview-content">
              {renderSafeRichText(formData.jobBenefit, 'Chưa có nội dung quyền lợi ứng viên.')}
            </div>
          </section>

          {/* SECTION 5: ĐỊA ĐIỂM VÀ THỜI GIAN */}
          <section className="topcv-preview-section topcv-preview-section-location" aria-labelledby="topcv-section-location">
            <div className="topcv-section-title-wrap">
              <h4 id="topcv-section-location" className="topcv-section-title">
                Địa điểm và thời gian
              </h4>
            </div>
            <div className="topcv-preview-content">
              <div className="topcv-preview-subtitle">Địa điểm làm việc</div>
              {formData.locations.length > 0 ? (
                formData.locations.map((loc, idx) => {
                  const districtAddresses = loc.addresses
                    .map((addr) => [addr.district_name, addr.working_address].filter(Boolean).join(', '))
                    .filter(Boolean)
                    .join('; ');
                  return (
                    <div key={`loc-${idx}`} className="topcv-preview-list-item">
                      - {loc.province_name}{districtAddresses ? `: ${districtAddresses}` : ''}
                    </div>
                  );
                })
              ) : (
                <div className="topcv-preview-list-item">- Chưa cập nhật</div>
              )}

              <div className="topcv-preview-subtitle" style={{ marginTop: 12 }}>
                Thời gian làm việc
              </div>
              {schedules.length > 0 ? (
                schedules.map((item, idx) => (
                  <div key={`schedule-${idx}`} className="topcv-preview-list-item">
                    - {item.fromDay && item.toDay
                      ? `${formatTopCvDay(item.fromDay)} - ${formatTopCvDay(item.toDay)} (từ ${item.fromTime || '08:00'} đến ${item.toTime || '17:30'})`
                      : 'Chưa cập nhật'}
                  </div>
                ))
              ) : (
                <div className="topcv-preview-list-item">- Chưa cập nhật</div>
              )}
              {formData.workingHours.lunchBreak ? (
                <div className="topcv-preview-list-item">- Nghỉ trưa: {formData.workingHours.lunchBreak}</div>
              ) : null}
            </div>
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className="topcv-preview-footer">
        <button
          type="button"
          className="topcv-btn-back-preview"
          onClick={onClose}
        >
          Quay lại
        </button>
        <button
          type="button"
          className="topcv-btn-edit-preview"
          onClick={onEdit}
        >
          Chỉnh sửa
        </button>
      </footer>
    </div>
  );
}
