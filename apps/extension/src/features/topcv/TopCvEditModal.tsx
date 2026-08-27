import { useState, useEffect, type FormEvent } from 'react';
import {
  BackIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
} from '@/components/icons';
import { InputField, RichTextEditor } from '@/components/form';
import { MultiSelectFilter, SelectFilter } from '@/components/filters';
import { ComboboxFilter } from '@/components/filters/ComboboxFilter';
import { hasTopCvRichTextContent, type TopCvFormData, type WorkingHourSchedule } from './topcv-form.types';
import { TopCvJobFamilyPicker } from './TopCvJobFamilyPicker';
import { TopCvLocationPicker } from './TopCvLocationPicker';
import { TopCvDatePicker } from './TopCvDatePicker';
import { TopCvTimePicker } from './TopCvTimePicker';
import { fetchTopCvDomainKnowledge, fetchTopCvOptions, type TopCvDomainKnowledge, type TopCvOption } from './services/topcv-options.service';
import type { TopCvOptionsResponse } from './services/topcv-options.service';
import { fetchTopCvSkills, type TopCvSkill } from './services/topcv-api.service';

const DAY_OPTIONS = [
  { value: '1', label: 'Thứ 2' },
  { value: '2', label: 'Thứ 3' },
  { value: '3', label: 'Thứ 4' },
  { value: '4', label: 'Thứ 5' },
  { value: '5', label: 'Thứ 6' },
  { value: '6', label: 'Thứ 7' },
  { value: '7', label: 'Chủ Nhật' },
];

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
  onForeignLanguageOptions?: (options: TopCvOptionsResponse['data']['certificate_foreign_languages']) => void;
}

export function TopCvEditModal({
  formData,
  onChange,
  onSave,
  onClose,
  onForeignLanguageOptions,
}: TopCvEditModalProps) {
  const [form, setForm] = useState<TopCvFormData>(formData);
  const [educationOptions, setEducationOptions] = useState<TopCvOption[]>([]);
  const [jobTypeOptions, setJobTypeOptions] = useState<TopCvOption[]>([]);
  const [workingMethodOptions, setWorkingMethodOptions] = useState<TopCvOption[]>([]);
  const [isWorkingMethodSelectOpen, setIsWorkingMethodSelectOpen] = useState(false);
  const [domainKnowledgeOptions, setDomainKnowledgeOptions] = useState<TopCvDomainKnowledge[]>([]);
  const [isDomainKnowledgeSelectOpen, setIsDomainKnowledgeSelectOpen] = useState(false);
  const [skillOptions, setSkillOptions] = useState<TopCvSkill[]>([]);
  const [skillPage, setSkillPage] = useState(1);
  const [skillHasMore, setSkillHasMore] = useState(true);
  const [skillLoading, setSkillLoading] = useState(false);
  const [foreignLanguageOptions, setForeignLanguageOptions] = useState<TopCvOptionsResponse['data']['certificate_foreign_languages']>([]);

  // Trạng thái mở/đóng từng Accordion - mặc định ban đầu là ĐÓNG (false) theo thiết kế
  const [expandedSections, setExpandedSections] = useState({
    general: false,
    description: false,
    expectation: false,
    contact: false,
  });

  const [newEmail, setNewEmail] = useState('');
  const [salaryTouched, setSalaryTouched] = useState(false);
  const [touchedFields, setTouchedFields] = useState<{
    position: boolean;
    employeeLevel: boolean;
    jobType: boolean;
    workingType: boolean;
  }>({ position: false, employeeLevel: false, jobType: false, workingType: false });
  const markTouched = (field: keyof typeof touchedFields) => {
    setTouchedFields((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Fetch education options from TopCV API
  useEffect(() => {
    fetchTopCvOptions()
      .then((options) => {
        setEducationOptions(options.education);
        setJobTypeOptions(options.job_types);
        setWorkingMethodOptions(options.working_methods);
        setForeignLanguageOptions(options.certificate_foreign_languages);
        onForeignLanguageOptions?.(options.certificate_foreign_languages);
      })
      .catch(console.error);
    fetchTopCvDomainKnowledge()
      .then(setDomainKnowledgeOptions)
      .catch(console.error);
  }, []);

  // Fetch skills from TopCV API with pagination
  const loadMoreSkills = () => {
    if (!skillHasMore || skillLoading) return;
    setSkillLoading(true);
    fetchTopCvSkills(skillPage + 1, 200)
      .then((result) => {
        setSkillOptions(result.skills);
        setSkillPage((p) => p + 1);
        setSkillHasMore(result.hasMore);
      })
      .catch(console.error)
      .finally(() => setSkillLoading(false));
  };

  useEffect(() => {
    fetchTopCvSkills(1, 200)
      .then((result) => {
        setSkillOptions(result.skills);
        setSkillPage(1);
        setSkillHasMore(result.hasMore);
      })
      .catch(console.error);
  }, []);

  const update = (patch: Partial<TopCvFormData>) => {
    const next = { ...form, ...patch };
    setForm(next);
    onChange(next);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  let salaryError: string | null = null;
  if (form.salaryType === 'range') {
    if (form.salaryFrom === null || form.salaryTo === null) {
      if (salaryTouched) {
        salaryError = 'Mức lương không được để trống';
      }
    } else if (form.salaryFrom > form.salaryTo) {
      salaryError = 'Mức lương từ không được lớn hơn đến';
    }
  }

  const positionError = touchedFields.position && !form.position?.trim()
    ? 'Vị trí chuyên môn không được để trống'
    : null;
  const employeeLevelError = touchedFields.employeeLevel && !String(form.employeeLevel).trim()
    ? 'Cấp bậc không được để trống'
    : null;
  const jobTypeError = touchedFields.jobType && !String(form.jobType).trim()
    ? 'Loại công việc không được để trống'
    : null;
  const workingTypeError = touchedFields.workingType && form.workingType.length === 0
    ? 'Hình thức làm việc không được để trống'
    : null;

  // Kiểm tra thiếu trường bắt buộc để hiện icon tam giác cảnh báo màu đỏ
  const isGeneralIncomplete =
    !form.title?.trim() ||
    !form.position?.trim() ||
    !String(form.employeeLevel).trim() ||
    (form.salaryType === 'range' &&
      (form.salaryFrom === null || form.salaryTo === null || form.salaryFrom > form.salaryTo));
  const isDescriptionIncomplete = !hasTopCvRichTextContent(form.jobDescription)
    || !hasTopCvRichTextContent(form.jobRequirement)
    || !hasTopCvRichTextContent(form.jobBenefit)
    || form.locations.length === 0;
  const isExpectationIncomplete = !String(form.education).trim() || !form.experience?.trim();
  const isContactIncomplete = !form.deadline?.trim() || !form.quantity || !form.contactName?.trim() || !form.contactPhone?.trim() || form.contactEmails.length === 0;

  const addEmail = () => {
    if (!newEmail.trim() || form.contactEmails.length >= 5) return;
    update({ contactEmails: [...form.contactEmails, newEmail.trim()] });
    setNewEmail('');
  };

  const removeEmail = (index: number) => {
    update({ contactEmails: form.contactEmails.filter((_, i) => i !== index) });
  };

  const worktimeSchedules: WorkingHourSchedule[] =
    form.workingHours.schedules && form.workingHours.schedules.length > 0
      ? form.workingHours.schedules
      : [
          {
            fromDay: form.workingHours.fromDay || '1',
            toDay: form.workingHours.toDay || '5',
            fromTime: form.workingHours.fromTime || '08:30',
            toTime: form.workingHours.toTime || '18:00',
          },
        ];

  const updateWorktimeSchedules = (nextSchedules: WorkingHourSchedule[]) => {
    const first = nextSchedules[0] ?? {
      fromDay: '1',
      toDay: '5',
      fromTime: '08:30',
      toTime: '18:00',
    };
    update({
      workingHours: {
        ...form.workingHours,
        fromDay: first.fromDay,
        toDay: first.toDay,
        fromTime: first.fromTime,
        toTime: first.toTime,
        schedules: nextSchedules,
      },
    });
  };

  const handleAddWorktime = () => {
    if (worktimeSchedules.length >= 3) return;
    updateWorktimeSchedules([
      ...worktimeSchedules,
      {
        fromDay: '6',
        toDay: '6',
        fromTime: '08:30',
        toTime: '12:00',
      },
    ]);
  };

  const handleRemoveWorktime = (index: number) => {
    if (worktimeSchedules.length <= 1) {
      updateWorktimeSchedules([
        {
          fromDay: '1',
          toDay: '5',
          fromTime: '08:30',
          toTime: '18:00',
        },
      ]);
      return;
    }
    updateWorktimeSchedules(worktimeSchedules.filter((_, i) => i !== index));
  };

  const handleUpdateWorktimeSchedule = (
    index: number,
    field: keyof WorkingHourSchedule,
    val: string,
  ) => {
    updateWorktimeSchedules(
      worktimeSchedules.map((item, i) => (i === index ? { ...item, [field]: val } : item)),
    );
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
              <InputField
                label="Tiêu đề bài đăng"
                value={form.title}
                onChange={(e) => update({ title: e.target.value })}
                placeholder="Nhập tiêu đề bài đăng"
                required
                maxLength={255}
              />

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
                  onClose={() => markTouched('position')}
                  error={positionError}
                />
              </div>

              <div className="topcv-form-group">
                <MultiSelectFilter
                  label="Kiến thức ngành"
                  values={form.industryKnowledge}
                  options={domainKnowledgeOptions.map((option) => ({ value: option.id, label: option.name }))}
                  placeholder="Chọn kiến thức ngành"
                  maxValues={3}
                  isOpen={isDomainKnowledgeSelectOpen}
                  onToggle={() => setIsDomainKnowledgeSelectOpen((open) => !open)}
                  onClose={() => setIsDomainKnowledgeSelectOpen(false)}
                  onChange={(values) => update({ industryKnowledge: values.map(Number) })}
                />
              </div>

              <div className="topcv-form-group">
                <SelectFilter
                  label="Cấp bậc"
                  required
                  value={form.employeeLevel}
                  options={[
                    { value: '', label: 'Chọn cấp bậc' },
                    { value: 1, label: 'Nhân viên' },
                    { value: 2, label: 'Trưởng nhóm' },
                    { value: 3, label: 'Trưởng / Phó phòng' },
                    { value: 10, label: 'Quản lý / Giám sát' },
                    { value: 20, label: 'Trưởng chi nhánh' },
                    { value: 25, label: 'Phó giám đốc' },
                    { value: 30, label: 'Giám đốc' },
                    { value: 50, label: 'Thực tập sinh' },
                  ]}
                  onChange={(value) => update({ employeeLevel: value === '' ? '' : Number(value) })}
                  onBlur={() => markTouched('employeeLevel')}
                  error={employeeLevelError}
                />
              </div>

              <div className="topcv-form-group">
                <SelectFilter
                  label="Loại công việc"
                  required
                  value={form.jobType}
                  options={[
                    { value: '', label: 'Chọn loại công việc' },
                    ...jobTypeOptions.map((option) => ({ value: option.value, label: option.name })),
                  ]}
                  onChange={(value) => update({ jobType: value === '' ? '' : Number(value) })}
                  onBlur={() => markTouched('jobType')}
                  error={jobTypeError}
                />
              </div>

              <div className="topcv-form-group">
                <MultiSelectFilter
                  label="Hình thức làm việc"
                  required
                  values={form.workingType}
                  options={workingMethodOptions.map((option) => ({ value: option.value, label: option.name }))}
                  placeholder="Chọn hình thức làm việc"
                  isOpen={isWorkingMethodSelectOpen}
                  onToggle={() => setIsWorkingMethodSelectOpen((open) => !open)}
                  onClose={() => {
                    setIsWorkingMethodSelectOpen(false);
                    markTouched('workingType');
                  }}
                  onChange={(values) => update({ workingType: values.map(Number) })}
                  error={workingTypeError}
                />
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
                      onChange={(e) => {
                        const isNegotiable = e.target.checked;
                        update({
                          salaryType: isNegotiable ? 'negotiable' : 'range',
                          ...(isNegotiable ? { salaryFrom: 0, salaryTo: 0 } : {}),
                        });
                        if (isNegotiable) setSalaryTouched(false);
                      }}
                    />
                    <span>Thỏa thuận</span>
                  </label>
                </div>

                <div className={`topcv-salary-control ${form.salaryType === 'negotiable' ? 'is-disabled' : ''} ${salaryError ? 'has-error' : ''}`}>
                  <div className="topcv-salary-inputs">
                    <InputField
                      type="text"
                      inputMode="numeric"
                      containerClassName="topcv-salary-input-container"
                      className="topcv-salary-field"
                      value={form.salaryFrom != null ? String(form.salaryFrom) : ''}
                      onChange={(e) => {
                        setSalaryTouched(true);
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                        update({ salaryFrom: digits !== '' ? Number(digits) : null });
                      }}
                      onBlur={() => setSalaryTouched(true)}
                      placeholder="0"
                      maxLength={10}
                      disabled={form.salaryType === 'negotiable'}
                    />
                    <span className="topcv-dash">—</span>
                    <InputField
                      type="text"
                      inputMode="numeric"
                      containerClassName="topcv-salary-input-container"
                      className="topcv-salary-field"
                      value={form.salaryTo != null ? String(form.salaryTo) : ''}
                      onChange={(e) => {
                        setSalaryTouched(true);
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                        update({ salaryTo: digits !== '' ? Number(digits) : null });
                      }}
                      onBlur={() => setSalaryTouched(true)}
                      placeholder="0"
                      maxLength={10}
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
                {salaryError ? <p className="input-field-error">{salaryError}</p> : null}
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
              <RichTextEditor
                label="Mô tả công việc"
                value={form.jobDescription}
                onChange={(jobDescription) => update({ jobDescription })}
                placeholder="Nhập mô tả công việc"
                required
              />

              <RichTextEditor
                label="Yêu cầu ứng viên"
                value={form.jobRequirement}
                onChange={(jobRequirement) => update({ jobRequirement })}
                placeholder="Nhập yêu cầu ứng viên"
                required
              />

              <RichTextEditor
                label="Quyền lợi ứng viên"
                value={form.jobBenefit}
                onChange={(jobBenefit) => update({ jobBenefit })}
                placeholder="Nhập quyền lợi ứng viên"
                required
              />

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
                <div className="topcv-worktime-list">
                  {worktimeSchedules.map((schedule, idx) => (
                    <div key={idx} className="topcv-worktime-row">
                      <SelectFilter
                        label=""
                        ariaLabel="Từ thứ"
                        value={schedule.fromDay}
                        options={DAY_OPTIONS}
                        onChange={(val) =>
                          handleUpdateWorktimeSchedule(idx, 'fromDay', String(val))
                        }
                      />

                      <span className="topcv-dash">—</span>

                      <SelectFilter
                        label=""
                        ariaLabel="Đến thứ"
                        value={schedule.toDay}
                        options={DAY_OPTIONS}
                        onChange={(val) =>
                          handleUpdateWorktimeSchedule(idx, 'toDay', String(val))
                        }
                      />

                      <TopCvTimePicker
                        value={schedule.fromTime}
                        onChange={(val) =>
                          handleUpdateWorktimeSchedule(idx, 'fromTime', val)
                        }
                        placeholder="08:30"
                      />

                      <TopCvTimePicker
                        value={schedule.toTime}
                        onChange={(val) =>
                          handleUpdateWorktimeSchedule(idx, 'toTime', val)
                        }
                        placeholder="18:00"
                        align="right"
                      />

                      <button
                        type="button"
                        className="topcv-remove-icon-btn"
                        onClick={() => handleRemoveWorktime(idx)}
                        title="Xóa thời gian làm việc"
                        aria-label="Xóa thời gian làm việc"
                      >
                        <CloseIcon />
                      </button>
                    </div>
                  ))}
                </div>

                {worktimeSchedules.length < 3 && (
                  <button
                    type="button"
                    className="topcv-add-worktime-btn"
                    onClick={handleAddWorktime}
                  >
                    + Thêm thời gian
                  </button>
                )}

                <input
                  type="text"
                  className="topcv-worktime-lunch-input"
                  value={form.workingHours.lunchBreak}
                  onChange={(e) => {
                    update({
                      workingHours: { ...form.workingHours, lunchBreak: e.target.value },
                    });
                  }}
                  placeholder="Nghỉ trưa 12h-13h30"
                />
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
                <SelectFilter
                  label="Học vấn tối thiểu"
                  required
                  value={form.education}
                  options={[
                    { value: '', label: 'Chọn học vấn tối thiểu' },
                    ...educationOptions.map((opt) => ({ value: opt.value, label: opt.name })),
                  ]}
                  onChange={(value) => update({ education: String(value) })}
                />

                <SelectFilter
                  label="Số năm kinh nghiệm"
                  required
                  value={form.experience}
                  options={[
                    { value: '', label: 'Chọn kinh nghiệm' },
                    { value: '0-0', label: 'Chưa có kinh nghiệm' },
                    { value: '0-1', label: 'Dưới 1 năm kinh nghiệm' },
                    { value: '1-0', label: '1 năm kinh nghiệm' },
                    { value: '2-0', label: '2 năm kinh nghiệm' },
                    { value: '3-0', label: '3 năm kinh nghiệm' },
                    { value: '4-0', label: '4 năm kinh nghiệm' },
                    { value: '5-0', label: '5 năm kinh nghiệm' },
                    { value: '6-0', label: 'Trên 5 năm kinh nghiệm' },
                  ]}
                  onChange={(value) => update({ experience: String(value) })}
                />
              </div>

              {/* Row 2: Giới tính & Độ tuổi */}
              <div className="topcv-grid-2">
                <SelectFilter
                  label="Giới tính"
                  value={form.gender}
                  options={[
                    { value: '', label: 'Chọn giới tính' },
                    { value: 0, label: 'Không yêu cầu' },
                    { value: 1, label: 'Nữ' },
                    { value: 2, label: 'Nam' },
                  ]}
                  onChange={(value) => update({ gender: String(value) })}
                />

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
                <ComboboxFilter
                  label="Kỹ năng cần có"
                  values={form.requiredSkills}
                  options={skillOptions.map((opt) => ({ value: opt.value, label: opt.text }))}
                  onChange={(values) => update({ requiredSkills: values })}
                  onLoadMore={loadMoreSkills}
                  hasMore={skillHasMore}
                  loading={skillLoading}
                  placeholder="Chọn kỹ năng..."
                />
              </div>

              {/* Kỹ năng nên có */}
              <div className="topcv-form-group">
                <ComboboxFilter
                  label="Kỹ năng nên có"
                  values={form.preferredSkills}
                  options={skillOptions.map((opt) => ({ value: opt.value, label: opt.text }))}
                  onChange={(values) => update({ preferredSkills: values })}
                  onLoadMore={loadMoreSkills}
                  hasMore={skillHasMore}
                  loading={skillLoading}
                  placeholder="Chọn kỹ năng..."
                />
              </div>

              {/* Ngoại ngữ */}
              <div className="topcv-form-group">
                <label className="topcv-form-label">Ngoại ngữ</label>
                {form.languages.map((lang, idx) => {
                  const selectedLang = foreignLanguageOptions.find((l) => l.value === lang.language);
                  return (
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
                        <SelectFilter
                          label=""
                          value={lang.language}
                          options={[
                            { value: 0, label: 'Chọn ngoại ngữ' },
                            ...foreignLanguageOptions.map((opt) => ({ value: opt.value, label: opt.name })),
                          ]}
                          onChange={(value) => {
                            const next = form.languages.map((item, itemIdx) => itemIdx === idx
                              ? { ...item, language: Number(value), certificate: '' as const }
                              : item);
                            update({ languages: next });
                          }}
                        />
                        {lang.language !== 0 && (
                          <SelectFilter
                            label="Trình độ/Chứng chỉ ngoại ngữ"
                            value={lang.certificate}
                            options={[
                              { value: '', label: 'Chọn trình độ/chứng chỉ' },
                              ...(selectedLang?.data.map((cert) => ({ value: cert.value, label: cert.name })) ?? []),
                            ]}
                            onChange={(value) => {
                              const next = form.languages.map((item, itemIdx) => itemIdx === idx
                                ? { ...item, certificate: value === '' ? '' as const : Number(value) }
                                : item);
                              update({ languages: next });
                            }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  className="topcv-action-link"
                  style={{ marginTop: 6 }}
                  onClick={() => {
                    update({
                      languages: [...form.languages, { language: 0, certificate: '' }],
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
