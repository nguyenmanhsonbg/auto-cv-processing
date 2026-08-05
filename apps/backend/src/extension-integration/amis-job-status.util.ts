import { BadRequestException } from '@nestjs/common';
import { JobPostingStatus } from '../recruitment-common';

export type AmisJobStatus = 1 | 2 | 3 | 5;

export function mapAmisJobStatus(status: number): JobPostingStatus {
  switch (status) {
    case 1:
      return JobPostingStatus.PUBLISHED;
    case 2:
      return JobPostingStatus.INTERNAL;
    case 3:
      return JobPostingStatus.CLOSED;
    case 5:
      return JobPostingStatus.NOT_ACCEPTING_APPLICATIONS;
    default:
      throw new BadRequestException(`Unsupported AMIS job status: ${status}`);
  }
}
