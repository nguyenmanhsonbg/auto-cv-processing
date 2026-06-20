import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JobPostingStatus } from '../recruitment-common';
import { JobPostingEntity } from './entities/job-posting.entity';
import { JobPostingsService } from './job-postings.service';

interface PublicJobDescriptionSnapshot extends Record<string, unknown> {
  jobDescription?: {
    description?: unknown;
    requirements?: unknown;
    benefits?: unknown;
  };
  position?: {
    id?: unknown;
    name?: unknown;
  } | null;
  level?: {
    id?: unknown;
    name?: unknown;
    displayName?: unknown;
  } | null;
}

@ApiTags('Public Job Postings')
@Controller('public/job-postings')
export class PublicJobPostingsController {
  constructor(private readonly jobPostingsService: JobPostingsService) {}

  @Get(':slug')
  @ApiOperation({ summary: 'Get published job posting detail by public slug' })
  @ApiParam({ name: 'slug', description: 'Public job posting slug' })
  async findBySlug(@Param('slug') slug: string) {
    const posting = await this.jobPostingsService.findPublishedBySlug(slug);
    return {
      success: true,
      data: this.toPublicDetail(posting),
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  private toPublicDetail(posting: JobPostingEntity) {
    const snapshot = posting.jobDescriptionVersion
      ?.snapshot as PublicJobDescriptionSnapshot | undefined;
    const jobDescription = snapshot?.jobDescription;

    return {
      jobPostingId: posting.id,
      title: posting.title,
      status: JobPostingStatus.PUBLISHED,
      publicSlug: posting.publicSlug,
      description: this.asString(jobDescription?.description)
        ?? posting.jobDescription?.description
        ?? '',
      requirements: this.asRecord(jobDescription?.requirements)
        ?? posting.jobDescription?.requirements
        ?? {},
      benefits: this.asRecord(jobDescription?.benefits)
        ?? posting.jobDescription?.benefits
        ?? null,
      position: this.toPublicPosition(snapshot),
      level: this.toPublicLevel(snapshot),
      openAt: posting.openAt?.toISOString() ?? null,
      closeAt: posting.closeAt?.toISOString() ?? null,
      applyUrl: `/api/public/job-postings/${posting.id}/apply`,
    };
  }

  private toPublicPosition(snapshot?: PublicJobDescriptionSnapshot) {
    const position = snapshot?.position;
    if (!position) return null;
    return {
      name: this.asString(position.name),
    };
  }

  private toPublicLevel(snapshot?: PublicJobDescriptionSnapshot) {
    const level = snapshot?.level;
    if (!level) return null;
    return {
      name: this.asString(level.name),
      displayName: this.asString(level.displayName),
    };
  }

  private asString(value: unknown) {
    return typeof value === 'string' ? value : null;
  }

  private asRecord(value: unknown) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }
}
