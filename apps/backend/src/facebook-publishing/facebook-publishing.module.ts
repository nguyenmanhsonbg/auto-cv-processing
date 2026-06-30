import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacebookPostContentService } from './content/facebook-post-content.service';
import { FacebookPublishHistoryEntity } from './entities/facebook-publish-history.entity';
import { FacebookPublishTargetEntity } from './entities/facebook-publish-target.entity';
import { FacebookPublishingController } from './facebook-publishing.controller';
import { FacebookPublishingService } from './facebook-publishing.service';
import { FacebookSessionService } from './facebook-session.service';
import { FacebookPageClient } from './page/facebook-page.client';
import { FacebookGroupRpaClient } from './rpa/facebook-group-rpa.client';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FacebookPublishHistoryEntity,
      FacebookPublishTargetEntity,
    ]),
  ],
  controllers: [FacebookPublishingController],
  providers: [
    FacebookGroupRpaClient,
    FacebookPageClient,
    FacebookPostContentService,
    FacebookPublishingService,
    FacebookSessionService,
  ],
  exports: [FacebookPublishingService],
})
export class FacebookPublishingModule {}
