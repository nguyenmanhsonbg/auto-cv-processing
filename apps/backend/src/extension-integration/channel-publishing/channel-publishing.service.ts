import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobPostingEntity } from '../../job-postings/entities/job-posting.entity';
import { RecruitmentChannel } from '../../recruitment-common';
import { ChannelPrepareResult } from './channel-publishing.types';
import { TopCvMapper } from './topcv/topcv.mapper';

@Injectable()
export class ChannelPublishingService {
  constructor(
    @InjectRepository(JobPostingEntity)
    private readonly jobPostingsRepo: Repository<JobPostingEntity>,
    private readonly topCvMapper: TopCvMapper,
  ) {}

  async prepare(channel: RecruitmentChannel, jobPostingId: string): Promise<ChannelPrepareResult> {
    const posting = await this.jobPostingsRepo.findOne({
      where: { id: jobPostingId },
      relations: [
        'jobDescription',
        'jobDescriptionVersion',
        'jobDescription.position',
        'jobDescription.level',
      ],
    });

    if (!posting) {
      throw new BadRequestException('Job posting not found');
    }

    if (channel !== RecruitmentChannel.TOPCV) {
      throw new BadRequestException({
        code: 'CHANNEL_ADAPTER_NOT_CONFIGURED',
        message: `No channel adapter is configured for ${channel}.`,
      });
    }

    const mapped = this.topCvMapper.map(posting);
    return {
      channel,
      jobPostingId: posting.id,
      snapshotHash: mapped.snapshotHash,
      executionMode: 'EXTENSION',
      form: mapped.form as unknown as Record<string, unknown>,
      missingRequiredFields: mapped.missingRequiredFields,
      warnings: mapped.warnings,
      auth: {
        required: true,
        host: 'tuyendung.topcv.vn',
        tokenKey: 'local_storage__token.refresh',
        expirationKey: 'local_storage__token_expiration.refresh',
        publishRequiresBearer: true,
        exchangeTokenUrl: 'https://tuyendung-api.topcv.vn/api/v1/auth/exchange-token',
      },
    };
  }
}
