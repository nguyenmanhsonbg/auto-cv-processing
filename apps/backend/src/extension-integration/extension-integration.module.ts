import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacebookPublishingModule } from '../facebook-publishing/facebook-publishing.module';
import { ExtensionIdempotencyRecordEntity, RecruitmentExternalReferenceEntity } from './entities';
import { ExtensionFacebookController } from './extension-facebook.controller';
import { ExtensionIdempotencyService } from './extension-idempotency.service';
import { ExtensionIntegrationController } from './extension-integration.controller';
import { ExtensionIntegrationService } from './extension-integration.service';

@Module({
  imports: [
    FacebookPublishingModule,
    TypeOrmModule.forFeature([
      RecruitmentExternalReferenceEntity,
      ExtensionIdempotencyRecordEntity,
    ]),
  ],
  controllers: [ExtensionIntegrationController, ExtensionFacebookController],
  providers: [ExtensionIntegrationService, ExtensionIdempotencyService],
  exports: [ExtensionIntegrationService, ExtensionIdempotencyService],
})
export class ExtensionIntegrationModule {}
