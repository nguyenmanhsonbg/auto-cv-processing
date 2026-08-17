import { useState, type FormEvent } from 'react';
import {
  BackIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
} from '@/components/icons';
import type { TopCvFormData } from './topcv-form.types';
import { TopCvJobFamilyPicker } from './TopCvJobFamilyPicker';
import { TopCvLocationPicker } from './TopCvLocationPicker';
import { TopCvDatePicker } from './TopCvDatePicker';
import { TopCvTimePicker } from './TopCvTimePicker';

function TopCvWarningIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M13 8.66669V12.7634" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 16.8337L13 16.8852" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.41647 20.5833H20.5831C21.3009 20.5783 21.9696 20.2181 22.3687 19.6216C22.7678 19.025 22.8457 18.2695 22.5765 17.6041L14.8848 4.33331C14.5032 3.64363 13.7772 3.21558 12.989 3.21558C12.2008 3.21558 11.4747 3.64363 11.0931 4.33331L3.40147 17.6041C3.13757 18.2539 3.20444 18.9911 3.58093 19.5827C3.95742 20.1744 4.59697 20.5472 5.29731 20.5833" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface TopCvEditModalProps {
  formData: TopCvFormData;
  onChange: (data: TopCvFormData) => void;
  onSave: (data: TopCvFormData) => void;
  onPreview: () => void;
  onClose: () => void;
}

export function TopCvEditModal({
  formData,
  onChange,
  onSave,
  onClose,
}: TopCvEditModalProps) {
  const [form, setForm] = useState<TopCvFormData>(formData);

  // Trạng thái mở/đóng từng Accordion - mặc định ban đầu là ĐÓNG (false) theo thiết kế
  const [expandedSections, setExpandedSections] = useState({
    general: false,
    description: false,
    expectation: false,
    contact: false,
  });

  const [newRequiredSkill, setNewRequiredSkill] = useState('');
  const [newPreferredSkill, setNewPreferredSkill] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const update = (patch: Partial<TopCvFormData>) => {
    const next = { ...form, ...patch };
    setForm(next);
    onChange(next);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  // Kiểm tra thiếu trường bắt buộc để hiện icon tam giác cảnh báo màu đỏ
  const isGeneralIncomplete = !form.title?.trim() || !form.position?.trim() || !form.employeeLevel?.trim();
  const isDescriptionIncomplete = !form.jobDescription?.trim() || !form.jobRequirement?.trim() || !form.jobBenefit?.trim() || form.locations.length === 0;
  const isExpectationIncomplete = !form.education?.trim() || !form.experience?.trim();
  const isContactIncomplete = !form.deadline?.trim() || !form.quantity || !form.contactName?.trim() || !form.contactPhone?.trim() || form.contactEmails.length === 0;

  // Rich text mini-toolbar helper
  const handleFormatText = (field: 'jobDescription' | 'jobRequirement' | 'jobBenefit', tag: string) => {
    const currentVal = form[field] || '';
    if (tag === 'list') {
      update({ [field]: currentVal ? `${currentVal}\n• ` : '• ' });
    } else if (tag === 'numlist') {
      update({ [field]: currentVal ? `${currentVal}\n1. ` : '1. ' });
    } else {
      update({ [field]: `${currentVal} ` });
    }
  };

  const addRequiredSkill = () => {
    if (!newRequiredSkill.trim()) return;
    update({ requiredSkills: [...form.requiredSkills, newRequiredSkill.trim()] });
    setNewRequiredSkill('');
  };

  const removeRequiredSkill = (index: number) => {
    update({ requiredSkills: form.requiredSkills.filter((_, i) => i !== index) });
  };

  const addPreferredSkill = () => {
    if (!newPreferredSkill.trim()) return;
    update({ preferredSkills: [...form.preferredSkills, newPreferredSkill.trim()] });
    setNewPreferredSkill('');
  };

  const removePreferredSkill = (index: number) => {
    update({ preferredSkills: form.preferredSkills.filter((_, i) => i !== index) });
  };

  const addEmail = () => {
    if (!newEmail.trim() || form.contactEmails.length >= 5) return;
    update({ contactEmails: [...form.contactEmails, newEmail.trim()] });
    setNewEmail('');
  };

  const removeEmail = (index: number) => {
    update({ contactEmails: form.contactEmails.filter((_, i) => i !== index) });
  };

  return (
    <div className="topcv-screen-container">
      {/* HEADER */}
      <header className="topcv-screen-header">
        <button type="button" className="topcv-back-btn" onClick={onClose} title="Quay lại" aria-label="Quay lại">
          <BackIcon />
        </button>
        <h2 className="topcv-screen-title">Chỉnh sửa thông tin bài đăng TopCV</h2>
      </header>

      {/* FORM BODY WITH ACCORDION SECTIONS */}
      <form className="topcv-screen-body" onSubmit={handleSubmit}>
        
        {/* ================= SECTION 1: THÔNG TIN CHUNG ================= */}
        <section className={`topcv-accordion-card ${expandedSections.general ? 'is-open' : ''}`}>
          <div className="topcv-accordion-header" onClick={() => toggleSection('general')}>
            <h3 className="topcv-accordion-title">1. Thông tin chung</h3>
            <div className="topcv-accordion-status">
              {isGeneralIncomplete && (
                <span className="topcv-warning-badge" title="Chưa điền đủ thông tin bắt buộc">
                  <TopCvWarningIcon />
                </span>
              )}
              <span className="topcv-chevron-icon">
                {expandedSections.general ? <ChevronUpIcon /> : <ChevronDownIcon />}
              </span>
            </div>
          </div>

          {expandedSections.general && (
            <div className="topcv-accordion-content">
              <div className="topcv-form-group">
                <label className="topcv-form-label">
                  Tiêu đề <span className="req">*</span>
                </label>
                <input
                  type="text"
                  className="topcv-input"
                  value={form.title}
                  onChange={(e) => update({ title: e.target.value })}
                  placeholder="Nhập tiêu đề bài đăng"
                  required
                />
              </div>

              <div className="topcv-form-group">
                <TopCvJobFamilyPicker
                  initialLevel3Id={form.jobFamily?.categoryIds?.[2]}
                  selectedPathName={
                    form.jobFamily?.level3Name || form.position || ''
                  }
                  onChange={(path) => {
                    if (path) {
                      update({
                        position: path.level3.name,
                        jobFamily: {
                          categoryIds: path.categoryIds,
                          mappedJobFamilyCategory: path.mappedJobFamilyCategory,
                          level1Name: path.level1.name,
                          level2Name: path.level2.name,
                          level3Name: path.level3.name,
                        },
                      });
                    }
                  }}
                />
              </div>

              <div className="topcv-form-group">
                <label className="topcv-form-label">Kiến thức ngành</label>
                <select
                  className="topcv-select"
                  value={form.industryKnowledge}
                  onChange={(e) => update({ industryKnowledge: e.target.value })}
                >
                  <option value="">Chọn kiến thức ngành</option>
                  <option value="IT - Phần mềm">IT - Phần mềm</option>
                  <option value="IT - Phần cứng và máy tính">IT - Phần cứng và máy tính</option>
                  <option value="Viễn thông">Viễn thông</option>
                  <option value="Tài chính / Ngân hàng">Tài chính / Ngân hàng</option>
                  <option value="Điện toán đám mây (Cloud)">Điện toán đám mây (Cloud)</option>
                  <option value="An toàn thông tin">An toàn thông tin</option>
                </select>
              </div>

              <div className="topcv-form-group">
                <label className="topcv-form-label">
                  Cấp bậc <span className="req">*</span>
                </label>
                <select
                  className="topcv-select"
                  value={form.employeeLevel}
                  onChange={(e) => update({ employeeLevel: e.target.value })}
                  required
                >
                  <option value="">Chọn cấp bậc</option>
                  <option value="Nhân viên">Nhân viên</option>
                  <option value="Trưởng nhóm">Trưởng nhóm</option>
                  <option value="Trưởng phòng">Trưởng phòng</option>
                  <option value="Quản lý / Giám đốc">Quản lý / Giám đốc</option>
                  <option value="Thực tập sinh">Thực tập sinh</option>
                </select>
              </div>

              <div className="topcv-form-group">
                <label className="topcv-form-label">
                  Loại công việc <span className="req">*</span>
                </label>
                <select
                  className="topcv-select"
                  value={form.jobType}
                  onChange={(e) => update({ jobType: e.target.value })}
                  required
                >
                  <option value="">Chọn loại công việc</option>
                  <option value="Toàn thời gian">Toàn thời gian</option>
                  <option value="Bán thời gian">Bán thời gian</option>
                  <option value="Thực tập">Thực tập</option>
                </select>
              </div>

              <div className="topcv-form-group">
                <label className="topcv-form-label">
                  Hình thức làm việc <span className="req">*</span>
                </label>
                <select
                  className="topcv-select"
                  value={form.workingType}
                  onChange={(e) => update({ workingType: e.target.value })}
                  required
                >
                  <option value="">Chọn hình thức làm việc</option>
                  <option value="Trực tiếp">Trực tiếp</option>
                  <option value="Hybrid">Hybrid</option>
                  <option value="Remote">Remote</option>
                </select>
              </div>

              <div className="topcv-form-group">
                <div className="topcv-label-with-addon">
                  <label className="topcv-form-label">
                    Mức lương <span className="req">*</span>
                  </label>
                  <label className="topcv-checkbox-label">
                    <input
                      type="checkbox"
                      checked={form.salaryType === 'negotiable'}
                      onChange={(e) => update({ salaryType: e.target.checked ? 'negotiable' : 'range' })}
                    />
                    <span>Thỏa thuận</span>
                  </label>
                </div>

                <div className={`topcv-salary-control ${form.salaryType === 'negotiable' ? 'is-disabled' : ''}`}>
                  <div className="topcv-salary-inputs">
                    <input
                      type="number"
                      className="topcv-salary-field"
                      value={form.salaryFrom ?? ''}
                      onChange={(e) => update({ salaryFrom: Number(e.target.value) || null })}
                      placeholder="0"
                      disabled={form.salaryType === 'negotiable'}
                    />
                    <span className="topcv-dash">—</span>
                    <input
                      type="number"
                      className="topcv-salary-field"
                      value={form.salaryTo ?? ''}
                      onChange={(e) => update({ salaryTo: Number(e.target.value) || null })}
                      placeholder="0"
                      disabled={form.salaryType === 'negotiable'}
                    />
                  </div>
                  <div className="topcv-salary-currency">
                    <select
                      className="topcv-currency-select"
                      value={form.salaryCurrency}
                      onChange={(e) => update({ salaryCurrency: e.target.value as 'VND' | 'USD' })}
                      disabled={form.salaryType === 'negotiable'}
                    >
                      <option value="VND">VND</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ================= SECTION 2: MÔ TẢ CÔNG VIỆC ================= */}
        <section className={`topcv-accordion-card ${expandedSections.description ? 'is-open' : ''}`}>
          <div className="topcv-accordion-header" onClick={() => toggleSection('description')}>
            <h3 className="topcv-accordion-title">2. Mô tả công việc</h3>
            <div className="topcv-accordion-status">
              {isDescriptionIncomplete && (
                <span className="topcv-warning-badge" title="Chưa điền đủ thông tin bắt buộc">
                  <TopCvWarningIcon />
                </span>
              )}
              <span className="topcv-chevron-icon">
                {expandedSections.description ? <ChevronUpIcon /> : <ChevronDownIcon />}
              </span>
            </div>
          </div>

          {expandedSections.description && (
            <div className="topcv-accordion-content">
              {/* Mô tả công việc */}
              <div className="topcv-form-group">
                <label className="topcv-form-label">
                  Mô tả công việc <span className="req">*</span>
                </label>
                <div className="topcv-editor-box">
                  <div className="topcv-editor-toolbar">
                    <button type="button" title="Undo" onClick={() => {}}>↶</button>
                    <button type="button" title="Redo" onClick={() => {}}>↷</button>
                    <span className="topcv-toolbar-divider" />
                    <button type="button" title="Bold" onClick={() => handleFormatText('jobDescription', 'b')}><strong>B</strong></button>
                    <button type="button" title="Italic" onClick={() => handleFormatText('jobDescription', 'i')}><em>I</em></button>
                    <button type="button" title="Underline" onClick={() => handleFormatText('jobDescription', 'u')}><u>U</u></button>
                    <span className="topcv-toolbar-divider" />
                    <button type="button" title="Bullet list" onClick={() => handleFormatText('jobDescription', 'list')}>≡</button>
                    <button type="button" title="Numbered list" onClick={() => handleFormatText('jobDescription', 'numlist')}>⁝</button>
                  </div>
                  <textarea
                    className="topcv-editor-textarea"
                    rows={4}
                    value={form.jobDescription}
                    onChange={(e) => update({ jobDescription: e.target.value })}
                    placeholder="Nhập mô tả công việc"
                    required
                  />
                </div>
              </div>

              {/* Yêu cầu ứng viên */}
              <div className="topcv-form-group">
                <label className="topcv-form-label">
                  Yêu cầu ứng viên <span className="req">*</span>
                </label>
                <div className="topcv-editor-box">
                  <div className="topcv-editor-toolbar">
                    <button type="button" title="Undo" onClick={() => {}}>↶</button>
                    <button type="button" title="Redo" onClick={() => {}}>↷</button>
                    <span className="topcv-toolbar-divider" />
                    <button type="button" title="Bold" onClick={() => handleFormatText('jobRequirement', 'b')}><strong>B</strong></button>
                    <button type="button" title="Italic" onClick={() => handleFormatText('jobRequirement', 'i')}><em>I</em></button>
                    <button type="button" title="Underline" onClick={() => handleFormatText('jobRequirement', 'u')}><u>U</u></button>
                    <span className="topcv-toolbar-divider" />
                    <button type="button" title="Bullet list" onClick={() => handleFormatText('jobRequirement', 'list')}>≡</button>
                    <button type="button" title="Numbered list" onClick={() => handleFormatText('jobRequirement', 'numlist')}>⁝</button>
                  </div>
                  <textarea
                    className="topcv-editor-textarea"
                    rows={4}
                    value={form.jobRequirement}
                    onChange={(e) => update({ jobRequirement: e.target.value })}
                    placeholder="Nhập yêu cầu ứng viên"
                    required
                  />
                </div>
              </div>

              {/* Quyền lợi ứng viên */}
              <div className="topcv-form-group">
                <label className="topcv-form-label">
                  Quyền lợi ứng viên <span className="req">*</span>
                </label>
                <div className="topcv-editor-box">
                  <div className="topcv-editor-toolbar">
                    <button type="button" title="Undo" onClick={() => {}}>↶</button>
                    <button type="button" title="Redo" onClick={() => {}}>↷</button>
                    <span className="topcv-toolbar-divider" />
                    <button type="button" title="Bold" onClick={() => handleFormatText('jobBenefit', 'b')}><strong>B</strong></button>
                    <button type="button" title="Italic" onClick={() => handleFormatText('jobBenefit', 'i')}><em>I</em></button>
                    <button type="button" title="Underline" onClick={() => handleFormatText('jobBenefit', 'u')}><u>U</u></button>
                    <span className="topcv-toolbar-divider" />
                    <button type="button" title="Bullet list" onClick={() => handleFormatText('jobBenefit', 'list')}>≡</button>
                    <button type="button" title="Numbered list" onClick={() => handleFormatText('jobBenefit', 'numlist')}>⁝</button>
                  </div>
                  <textarea
                    className="topcv-editor-textarea"
                    rows={4}
                    value={form.jobBenefit}
                    onChange={(e) => update({ jobBenefit: e.target.value })}
                    placeholder="Nhập quyền lợi ứng viên"
                    required
                  />
                </div>
              </div>

              {/* Địa điểm làm việc */}
              <div className="topcv-form-group">
                <TopCvLocationPicker
                  value={form.locations}
                  onChange={(locations) => update({ locations })}
                />
              </div>

              {/* Thời gian làm việc */}
              <div className="topcv-form-group">
                <label className="topcv-form-label">
                  Thời gian làm việc <span className="req">*</span>
                </label>
                <div className="topcv-worktime-row">
                  <select
                    className="topcv-select compact"
                    value={form.workingHours.fromDay}
                    onChange={(e) => {
                      update({ workingHours: { ...form.workingHours, fromDay: e.target.value } });
                    }}
                  >
                    <option value="Thứ 2">Thứ 2</option>
                    <option value="Thứ 3">Thứ 3</option>
                    <option value="Thứ 4">Thứ 4</option>
                  </select>

                  <span className="topcv-dash">—</span>

                  <select
                    className="topcv-select compact"
                    value={form.workingHours.toDay}
                    onChange={(e) => {
                      update({ workingHours: { ...form.workingHours, toDay: e.target.value } });
                    }}
                  >
                    <option value="Thứ 6">Thứ 6</option>
                    <option value="Thứ 7">Thứ 7</option>
                    <option value="Chủ nhật">Chủ nhật</option>
                  </select>

                  <TopCvTimePicker
                    value={form.workingHours.fromTime}
                    onChange={(val) => {
                      update({ workingHours: { ...form.workingHours, fromTime: val } });
                    }}
                    placeholder="08:30"
                  />

                  <TopCvTimePicker
                    value={form.workingHours.toTime}
                    onChange={(val) => {
                      update({ workingHours: { ...form.workingHours, toTime: val } });
                    }}
                    placeholder="18:00"
                    align="right"
                  />

                  <button
                    type="button"
                    className="topcv-remove-icon-btn"
                    onClick={() => {}}
                    title="Xóa"
                  >
                    <CloseIcon />
                  </button>
                </div>

                <button type="button" className="topcv-action-link" style={{ marginTop: 6 }}>
                  + Thêm thời gian
                </button>

                <div style={{ marginTop: 8 }}>
                  <input
                    type="text"
                    className="topcv-input"
                    value={form.workingHours.lunchBreak}
                    onChange={(e) => {
                      update({ workingHours: { ...form.workingHours, lunchBreak: e.target.value } });
                    }}
                    placeholder="Nghỉ trưa 12h-13h30"
                  />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ================= SECTION 3: KỲ VỌNG VỀ ỨNG VIÊN ================= */}
        <section className={`topcv-accordion-card ${expandedSections.expectation ? 'is-open' : ''}`}>
          <div className="topcv-accordion-header" onClick={() => toggleSection('expectation')}>
            <h3 className="topcv-accordion-title">3. Kỳ vọng về ứng viên</h3>
            <div className="topcv-accordion-status">
              {isExpectationIncomplete && (
                <span className="topcv-warning-badge" title="Chưa điền đủ thông tin bắt buộc">
                  <TopCvWarningIcon />
                </span>
              )}
              <span className="topcv-chevron-icon">
                {expandedSections.expectation ? <ChevronUpIcon /> : <ChevronDownIcon />}
              </span>
            </div>
          </div>

          {expandedSections.expectation && (
            <div className="topcv-accordion-content">
              {/* Row 1: Học vấn & Kinh nghiệm */}
              <div className="topcv-grid-2">
                <div className="topcv-form-group">
                  <label className="topcv-form-label">
                    Học vấn tối thiểu <span className="req">*</span>
                  </label>
                  <select
                    className="topcv-select"
                    value={form.education}
                    onChange={(e) => update({ education: e.target.value })}
                    required
                  >
                    <option value="">Chọn học vấn tối thiểu</option>
                    <option value="Đại Học trở lên">Đại Học trở lên</option>
                    <option value="Cao đẳng">Cao đẳng</option>
                    <option value="Trung cấp">Trung cấp</option>
                    <option value="Không yêu cầu">Không yêu cầu</option>
                  </select>
                </div>

                <div className="topcv-form-group">
                  <label className="topcv-form-label">
                    Số năm kinh nghiệm <span className="req">*</span>
                  </label>
                  <select
                    className="topcv-select"
                    value={form.experience}
                    onChange={(e) => update({ experience: e.target.value })}
                    required
                  >
                    <option value="">Chọn kinh nghiệm</option>
                    <option value="Không yêu cầu">Không yêu cầu</option>
                    <option value="Dưới 1 năm">Dưới 1 năm</option>
                    <option value="1 năm">1 năm</option>
                    <option value="2 năm">2 năm</option>
                    <option value="3 năm">3 năm</option>
                    <option value="5 năm">5 năm</option>
                    <option value="Trên 5 năm">Trên 5 năm</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Giới tính & Độ tuổi */}
              <div className="topcv-grid-2">
                <div className="topcv-form-group">
                  <label className="topcv-form-label">Giới tính</label>
                  <select
                    className="topcv-select"
                    value={form.gender}
                    onChange={(e) => update({ gender: e.target.value })}
                  >
                    <option value="Không yêu cầu">Chọn giới tính</option>
                    <option value="Không yêu cầu">Không yêu cầu</option>
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                  </select>
                </div>

                <div className="topcv-form-group">
                  <label className="topcv-form-label">Độ tuổi</label>
                  <div className="topcv-age-row">
                    <input
                      type="number"
                      className="topcv-input"
                      value={form.ageFrom ?? ''}
                      onChange={(e) => update({ ageFrom: Number(e.target.value) || null })}
                      placeholder="VD: 18"
                    />
                    <span className="topcv-dash">—</span>
                    <input
                      type="number"
                      className="topcv-input"
                      value={form.ageTo ?? ''}
                      onChange={(e) => update({ ageTo: Number(e.target.value) || null })}
                      placeholder="VD: 25"
                    />
                  </div>
                </div>
              </div>

              {/* Kỹ năng cần có */}
              <div className="topcv-form-group">
                <label className="topcv-form-label">Kỹ năng cần có</label>
                <div className="topcv-chips-wrap">
                  {form.requiredSkills.map((skill, index) => (
                    <span key={skill + index} className="topcv-chip">
                      {skill}
                      <button type="button" onClick={() => removeRequiredSkill(index)} title="Xóa">×</button>
                    </span>
                  ))}
                </div>
                <div className="topcv-add-input-row">
                  <input
                    type="text"
                    className="topcv-input compact"
                    value={newRequiredSkill}
                    onChange={(e) => setNewRequiredSkill(e.target.value)}
                    placeholder="Chọn kỹ năng hoặc nhập để thêm..."
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRequiredSkill(); } }}
                  />
                  <button type="button" className="secondary-button compact-button" onClick={addRequiredSkill}>+ Thêm</button>
                </div>
              </div>

              {/* Kỹ năng nên có */}
              <div className="topcv-form-group">
                <label className="topcv-form-label">Kỹ năng nên có</label>
                <div className="topcv-chips-wrap">
                  {form.preferredSkills.map((skill, index) => (
                    <span key={skill + index} className="topcv-chip">
                      {skill}
                      <button type="button" onClick={() => removePreferredSkill(index)} title="Xóa">×</button>
                    </span>
                  ))}
                </div>
                <div className="topcv-add-input-row">
                  <input
                    type="text"
                    className="topcv-input compact"
                    value={newPreferredSkill}
                    onChange={(e) => setNewPreferredSkill(e.target.value)}
                    placeholder="Chọn kỹ năng..."
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPreferredSkill(); } }}
                  />
                  <button type="button" className="secondary-button compact-button" onClick={addPreferredSkill}>+ Thêm</button>
                </div>
              </div>

              {/* Ngoại ngữ */}
              <div className="topcv-form-group">
                <label className="topcv-form-label">Ngoại ngữ</label>
                {form.languages.map((lang, idx) => (
                  <div key={idx} className="topcv-sub-card">
                    <div className="topcv-sub-card-header">
                      <span>Ngoại ngữ {idx + 1}:</span>
                      <button
                        type="button"
                        className="topcv-remove-icon-btn"
                        onClick={() => {
                          update({ languages: form.languages.filter((_, i) => i !== idx) });
                        }}
                      >
                        <CloseIcon />
                      </button>
                    </div>
                    <div className="topcv-sub-card-row">
                      <select
                        className="topcv-select"
                        value={lang.language}
                        onChange={(e) => {
                          const next = [...form.languages];
                          next[idx].language = e.target.value;
                          update({ languages: next });
                        }}
                      >
                        <option value="Tiếng Anh">Tiếng Anh</option>
                        <option value="Tiếng Nhật">Tiếng Nhật</option>
                        <option value="Tiếng Trung">Tiếng Trung</option>
                        <option value="Tiếng Hàn">Tiếng Hàn</option>
                      </select>

                      <input
                        type="text"
                        className="topcv-input"
                        value={lang.certificate}
                        onChange={(e) => {
                          const next = [...form.languages];
                          next[idx].certificate = e.target.value;
                          update({ languages: next });
                        }}
                        placeholder="Chứng chỉ (VD: TOEIC 550, IELTS 6.0)"
                      />
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  className="topcv-action-link"
                  style={{ marginTop: 6 }}
                  onClick={() => {
                    update({
                      languages: [...form.languages, { language: 'Tiếng Anh', certificate: '' }],
                    });
                  }}
                >
                  + Thêm Ngoại ngữ
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ================= SECTION 4: THÔNG TIN NHẬN HỒ SƠ ================= */}
        <section className={`topcv-accordion-card ${expandedSections.contact ? 'is-open' : ''}`}>
          <div className="topcv-accordion-header" onClick={() => toggleSection('contact')}>
            <h3 className="topcv-accordion-title">4. Thông tin nhận hồ sơ</h3>
            <div className="topcv-accordion-status">
              {isContactIncomplete && (
                <span className="topcv-warning-badge" title="Chưa điền đủ thông tin bắt buộc">
                  <TopCvWarningIcon />
                </span>
              )}
              <span className="topcv-chevron-icon">
                {expandedSections.contact ? <ChevronUpIcon /> : <ChevronDownIcon />}
              </span>
            </div>
          </div>

          {expandedSections.contact && (
            <div className="topcv-accordion-content">
              {/* Row 1: Hạn nhận & Số lượng */}
              <div className="topcv-grid-2">
                <div className="topcv-form-group">
                  <label className="topcv-form-label">
                    Hạn nhận hồ sơ <span className="req">*</span>
                  </label>
                  <TopCvDatePicker
                    value={form.deadline}
                    onChange={(val) => update({ deadline: val })}
                    required
                  />
                </div>

                <div className="topcv-form-group">
                  <label className="topcv-form-label">
                    Số lượng tuyển <span className="req">*</span>
                  </label>
                  <div className="topcv-stepper-box">
                    <button
                      type="button"
                      className="topcv-stepper-btn"
                      onClick={() => update({ quantity: Math.max(1, (form.quantity || 1) - 1) })}
                    >
                      —
                    </button>
                    <input
                      type="number"
                      className="topcv-stepper-input"
                      min={1}
                      value={form.quantity}
                      onChange={(e) => update({ quantity: Math.max(1, Number(e.target.value) || 1) })}
                      required
                    />
                    <button
                      type="button"
                      className="topcv-stepper-btn"
                      onClick={() => update({ quantity: (form.quantity || 1) + 1 })}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Row 2: Họ tên & SĐT */}
              <div className="topcv-grid-2">
                <div className="topcv-form-group">
                  <label className="topcv-form-label">
                    Họ và tên người nhận <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    className="topcv-input"
                    value={form.contactName}
                    onChange={(e) => update({ contactName: e.target.value })}
                    placeholder="Nguyễn Văn A"
                    required
                  />
                </div>

                <div className="topcv-form-group">
                  <label className="topcv-form-label">
                    Số điện thoại <span className="req">*</span>
                  </label>
                  <input
                    type="tel"
                    className="topcv-input"
                    value={form.contactPhone}
                    onChange={(e) => update({ contactPhone: e.target.value })}
                    placeholder="0987098098"
                    required
                  />
                </div>
              </div>

              {/* Email nhận hồ sơ */}
              <div className="topcv-form-group">
                <label className="topcv-form-label">
                  Email nhận hồ sơ <span className="topcv-muted-note">(Tối đa 5 email)</span> <span className="req">*</span>
                </label>
                <div className="topcv-email-chips-container">
                  {form.contactEmails.map((email, index) => (
                    <span key={email + index} className="topcv-green-chip">
                      <button type="button" className="topcv-chip-close-btn" onClick={() => removeEmail(index)}>×</button>
                      {email}
                    </span>
                  ))}
                  {form.contactEmails.length < 5 && (
                    <input
                      type="email"
                      className="topcv-tag-input-inline"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder={form.contactEmails.length === 0 ? "Nhập email rồi nhấn Enter..." : "+ Thêm email..."}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          addEmail();
                        }
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ================= FOOTER ACTIONS ================= */}
        <footer className="topcv-screen-footer">
          <div className="topcv-footer-right-actions">
            <button type="button" className="topcv-btn-cancel" onClick={onClose}>
              HỦY
            </button>
            <button type="submit" className="topcv-btn-save">
              LƯU
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
