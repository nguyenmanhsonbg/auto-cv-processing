import { MappedFormField } from '../channel-publishing.types';

export interface TopCvLocation {
  province_id: number | null;
  province_name: string;
  addresses: Array<{
    district_id: number | null;
    district_name: string;
    working_address: string;
  }>;
}

export interface TopCvJobForm {
  title: MappedFormField<string>;
  jobDescription: MappedFormField<string>;
  jobRequirement: MappedFormField<string>;
  jobBenefit: MappedFormField<string>;
  salaryFrom: MappedFormField<number>;
  salaryTo: MappedFormField<number>;
  deadline: MappedFormField<string>;
  locations: MappedFormField<TopCvLocation[]>;
  categoryIds: MappedFormField<number[]>;
  employeeLevel: MappedFormField<number>;
  experience: MappedFormField<string>;
  quantity: MappedFormField<number>;
  contactEmail: MappedFormField<string[]>;
  contactPhone: MappedFormField<string>;
  requireCv: MappedFormField<boolean>;
}
