export interface JobFamilySelection {
  categoryIds: [number, number, number]; // [level1.id, level2.id, level3.id]
  mappedJobFamilyCategory: unknown; // Will be set by buildJobFamilyPath
  level1Name: string;
  level2Name: string;
  level3Name: string;
}

export interface TopCvFormData {
  // 1. Thông tin chung
  title: string;
  position: string;
  industryKnowledge: string;
  employeeLevel: string;
  jobType: string;
  workingType: string;
  salaryType: 'negotiable' | 'range';
  salaryFrom: number | null;
  salaryTo: number | null;
  salaryCurrency: 'VND' | 'USD';

  // Vị trí chuyên môn (3-level từ TopCV API)
  jobFamily: JobFamilySelection | null;

  // 2. Mô tả công việc
  jobDescription: string;
  jobRequirement: string;
  jobBenefit: string;

  // Locations (dạng TopCV API)
  locations: Array<{
    id: string;
    province_id: number;
    province_name: string;
    addresses: Array<{
      district_id: number;
      district_name: string;
      working_address: string;
    }>;
  }>;

  workingHours: {
    fromDay: string;
    toDay: string;
    fromTime: string;
    toTime: string;
    lunchBreak: string;
  };

  // 3. Kỳ vọng về ứng viên
  education: string;
  experience: string;
  gender: string;
  ageFrom: number | null;
  ageTo: number | null;
  requiredSkills: string[];
  preferredSkills: string[];
  languages: Array<{
    language: string;
    certificate: string;
  }>;

  // 4. Thông tin nhận hồ sơ
  deadline: string;
  quantity: number;
  contactName: string;
  contactPhone: string;
  contactEmails: string[];
}

export const DEFAULT_TOPCV_FORM: TopCvFormData = {
  title: '',
  position: '',
  industryKnowledge: '',
  employeeLevel: '',
  jobType: '',
  workingType: '',
  salaryType: 'range',
  salaryFrom: null,
  salaryTo: null,
  salaryCurrency: 'VND',

  jobFamily: null,

  jobDescription: '',
  jobRequirement: '',
  jobBenefit: '',
  locations: [],
  workingHours: {
    fromDay: '',
    toDay: '',
    fromTime: '',
    toTime: '',
    lunchBreak: '',
  },

  education: '',
  experience: '',
  gender: '',
  ageFrom: null,
  ageTo: null,
  requiredSkills: [],
  preferredSkills: [],
  languages: [],

  deadline: '',
  quantity: 1,
  contactName: '',
  contactPhone: '',
  contactEmails: [],
};


export function formatTopCvSalary(form: Pick<TopCvFormData, 'salaryType' | 'salaryFrom' | 'salaryTo' | 'salaryCurrency'>): string {
  if (form.salaryType === 'negotiable' || (!form.salaryFrom && !form.salaryTo)) {
    return 'Thỏa thuận';
  }
  const unit = form.salaryCurrency === 'USD' ? 'USD' : 'Triệu';
  const divisor = form.salaryCurrency === 'USD' ? 1 : 1000000;

  if (form.salaryFrom && form.salaryTo) {
    const from = (form.salaryFrom / divisor).toLocaleString('vi-VN');
    const to = (form.salaryTo / divisor).toLocaleString('vi-VN');
    return `${from} - ${to} ${unit}`;
  }
  if (form.salaryFrom) {
    const from = (form.salaryFrom / divisor).toLocaleString('vi-VN');
    return `Từ ${from} ${unit}`;
  }
  if (form.salaryTo) {
    const to = (form.salaryTo / divisor).toLocaleString('vi-VN');
    return `Lên tới ${to} ${unit}`;
  }
  return 'Thỏa thuận';
}
