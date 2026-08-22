import { Injectable } from '@nestjs/common';
import { JobDescriptionEntity } from '../../../job-descriptions/entities/job-description.entity';
import { JobPostingEntity } from '../../../job-postings/entities/job-posting.entity';
import { sha256Hex } from '../../utils';
import {
  ChannelPublishWarning,
  MappedFormField,
} from '../channel-publishing.types';
import { TopCvJobForm } from './topcv.types';

interface TopCvMappedResult {
  form: TopCvJobForm;
  warnings: ChannelPublishWarning[];
  missingRequiredFields: string[];
  snapshotHash: string;
}

@Injectable()
export class TopCvMapper {
  map(posting: JobPostingEntity): TopCvMappedResult {
    const description = posting.jobDescription;
    if (!description) {
      throw new Error('Job description is required to prepare a TopCV form.');
    }

    const warnings: ChannelPublishWarning[] = [];
    const missingRequiredFields: string[] = [];
    const form: TopCvJobForm = {
      title: this.fromJobPosting(posting.title, true),
      jobDescription: this.fromJobPosting(
        description.responsibilities ?? description.description,
        true,
      ),
      jobRequirement: this.fromJobPosting(description.requirements, true),
      jobBenefit: this.fromJobPosting(this.benefitText(description), false),
      salaryFrom: this.userRequired('TopCV salary_from is not mapped from the internal salary text.'),
      salaryTo: this.userRequired('TopCV salary_to is not mapped from the internal salary text.'),
      deadline: this.fromJobPosting(this.toDateOnly(posting.closeAt), false),
      locations: this.userRequired('TopCV locations require user selection.'),
      categoryIds: this.userRequired('TopCV categories require user selection.'),
      employeeLevel: this.userRequired('TopCV employee level requires user selection.'),
      experience: this.userRequired('TopCV experience requires user input.'),
      quantity: this.withDefault(1),
      contactEmail: this.userRequired('TopCV contact email requires user input.'),
      contactPhone: this.userRequired('TopCV contact phone requires user input.'),
      requireCv: this.withDefault(true),
    };

    for (const [field, value] of Object.entries(form)) {
      if (value.required && (value.value === null || value.value === undefined)) {
        missingRequiredFields.push(field);
      }
      if (value.warning) {
        warnings.push({ code: `TOPCV_${field.toUpperCase()}_REQUIRED`, field, message: value.warning });
      }
    }

    const snapshotHash = sha256Hex(JSON.stringify({
      jobPostingId: posting.id,
      title: posting.title,
      jobDescriptionId: posting.jobDescriptionId,
      jobDescriptionVersionId: posting.jobDescriptionVersionId,
      form,
    }));

    return { form, warnings, missingRequiredFields, snapshotHash };
  }

  private fromJobPosting<T>(value: T | null | undefined, required: boolean): MappedFormField<T> {
    const normalized = typeof value === 'string' ? value.trim() : value;
    return {
      value: normalized || normalized === 0 ? normalized as T : null,
      source: normalized || normalized === 0 ? 'JOB_POSTING' : 'USER_REQUIRED',
      editable: true,
      required,
    };
  }

  private withDefault<T>(value: T): MappedFormField<T> {
    return { value, source: 'DEFAULT', editable: true, required: false };
  }

  private userRequired(message: string): MappedFormField<never> {
    return {
      value: null,
      source: 'USER_REQUIRED',
      editable: true,
      required: true,
      warning: message,
    };
  }

  private benefitText(description: JobDescriptionEntity) {
    if (!description.benefits) return null;
    return Object.values(description.benefits)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join('\n');
  }

  private toDateOnly(value: Date | null) {
    return value ? value.toISOString().slice(0, 10) : null;
  }
}
