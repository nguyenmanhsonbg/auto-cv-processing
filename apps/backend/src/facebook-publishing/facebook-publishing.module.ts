import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobPostingEntity } from '../job-postings/entities/job-posting.entity';
import { FacebookPostContentService } from './content/facebook-post-content.service';
import { FacebookPublishHistoryEntity } from './entities/facebook-publish-history.entity';
import { FacebookPublishTargetEntity } from './entities/facebook-publish-target.entity';
import { FacebookPublishingService } from './facebook-publishing.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FacebookPublishHistoryEntity,
      FacebookPublishTargetEntity,
      JobPostingEntity,
    ]),
    AiModule,
  ],
  providers: [FacebookPostContentService, FacebookPublishingService],
  exports: [FacebookPublishingService],
})
export class FacebookPublishingModule {}
