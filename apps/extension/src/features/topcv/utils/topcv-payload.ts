import type { TopCvFormData } from '../topcv-form.types';

function toTopCvRichText(html: string): string {
  return html.trim() || '<p></p>';
}

export function transformTopCvPayload(formData: TopCvFormData): Record<string, unknown> {
  const employee_level = formData.employeeLevel === '' ? 1 : formData.employeeLevel;
  const experience = formData.experience || '0-0';
  const education = typeof formData.education === 'number' ? formData.education : 5;
  const salary_type = formData.salaryType === 'negotiable' ? 2 : 1;
  const working_methods = formData.workingType.length > 0 ? formData.workingType : [1];

  const locations = formData.locations.length > 0 ? formData.locations.map((loc) => ({
    province_id: loc.province_id,
    province_name: loc.province_name,
    addresses: loc.addresses.map((addr) => ({
      district_id: addr.district_id,
      district_name: addr.district_name,
      working_address: addr.working_address,
    })),
    id: loc.id,
  })) : [{
    province_id: 1,
    province_name: 'Hà Nội',
    addresses: [],
    id: 'TjIPX',
  }];

  return {
    title: formData.title,
    type: formData.jobType === '' ? 11 : formData.jobType,
    salary_level: 1,
    salary_from: formData.salaryFrom || 0,
    salary_to: formData.salaryTo || 0,
    salary_currency: formData.salaryCurrency || 'VND',
    salary_type,
    quantity: formData.quantity || 1,
    description: '',
    job_description: toTopCvRichText(formData.jobDescription),
    job_requirement: toTopCvRichText(formData.jobRequirement),
    job_benefit: toTopCvRichText(formData.jobBenefit),
    employee_level,
    experience,
    education,
    gender: formData.gender || null,
    required_skills: formData.requiredSkills.map((s) => s.label),
    should_have_skills: formData.preferredSkills.map((s) => s.label),
    locations,
    working_time: {
      working_time_settings: (formData.workingHours.schedules && formData.workingHours.schedules.length > 0)
        ? formData.workingHours.schedules.map((s) => ({
            date_from: parseInt(s.fromDay, 10) || 1,
            date_to: parseInt(s.toDay, 10) || 5,
            start_time: s.fromTime || '08:30',
            end_time: s.toTime || '18:00',
          }))
        : formData.workingHours.fromDay ? [{
            date_from: parseInt(formData.workingHours.fromDay, 10) || 1,
            date_to: parseInt(formData.workingHours.toDay, 10) || 5,
            start_time: formData.workingHours.fromTime || '08:30',
            end_time: formData.workingHours.toTime || '18:00',
          }] : [{
            date_from: 1,
            date_to: 5,
            start_time: '08:30',
            end_time: '18:00',
          }],
      working_time_text: formData.workingHours.lunchBreak || '',
      category: 2,
      shift: null,
    },
    job_status: { name_status: '', str_status: '' },
    job_approve_status: { name_status: '', str_status: '' },
    working_methods,
    contact_name: formData.contactName,
    contact_phone: formData.contactPhone,
    contact_email: formData.contactEmails,
    deadline: formData.deadline,
    job_family_category: formData.jobFamily?.categoryIds ?? [177, 178, 182],
    mappedJobFamilyCategory: formData.jobFamily?.mappedJobFamilyCategory ?? {
      name: 'Tuyển dụng',
      level: 3,
      id: 182,
      tag: null,
      fields: [],
      parents: [
        { name: 'Nhân sự', level: 2, id: 178, tag: null, fields: [], parents: [
          { name: 'Nhân sự/Hành chính/Pháp chế', level: 1, id: 177, tag: null, fields: [] }
        ]}
      ]
    },
    category_names: [],
    has_ai_check_content: true,
    require_cv: false,
    categories: [],
    must_have_skills: [],
    job_tag_ids: [],
    services: [],
    medias: [],
    raw_title: '',
    recruitment_position_title: '',
    can_use_top_job_title_service: false,
    base_salary_level: -1,
    requirement_more_info: [],
    age_range: { from: '', to: '' },
    save_logs_job_blocked: false,
    job_blocked_type: null,
    foreign_languages: formData.languages
      .filter((lang) => lang.language !== 0 && lang.certificate !== '')
      .map((lang) => ({
        language: lang.language,
        certificate: lang.certificate,
      })),
    apply_reasons: ['', '', ''],
    publish_request_days: 30,
    campaign_id: null,
    domain_knowledge_ids: formData.industryKnowledge,
    subsidy_ids: [],
    benefit_ids: [],
    salary_label_type: 2,
    update_job_option: 3,
    request_active_service: [],
    request_delete_service: [],
    request_update_service: [],
  };
}
