import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobPostingEntity } from '../job-postings/entities/job-posting.entity';
import { FacebookPostContentService } from './content/facebook-post-content.service';
import { FacebookPublishHistoryEntity } from './entities/facebook-publish-history.entity';
import { FacebookPublishTargetEntity } from './entities/facebook-publish-target.entity';
import { FacebookAccountEntity } from './entities/facebook-account.entity';
import { FacebookGroupSyncStateEntity } from './entities/facebook-group-sync-state.entity';
import { FacebookPublishingService } from './facebook-publishing.service';

@Module({
  imports: [
    AiModule,
    TypeOrmModule.forFeature([
      FacebookPublishHistoryEntity,
      FacebookPublishTargetEntity,
      FacebookAccountEntity,
      FacebookGroupSyncStateEntity,
      JobPostingEntity,
    ]),
  ],
  providers: [FacebookPostContentService, FacebookPublishingService],
  exports: [FacebookPublishingService],
})
export class FacebookPublishingModule {}
