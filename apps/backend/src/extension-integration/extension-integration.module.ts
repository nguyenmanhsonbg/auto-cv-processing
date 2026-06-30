import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExtensionIdempotencyRecordEntity, RecruitmentExternalReferenceEntity } from './entities';
import { ExtensionIdempotencyService } from './extension-idempotency.service';
import { ExtensionIntegrationController } from './extension-integration.controller';
import { ExtensionIntegrationService } from './extension-integration.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RecruitmentExternalReferenceEntity,
      ExtensionIdempotencyRecordEntity,
    ]),
  ],
  controllers: [ExtensionIntegrationController],
  providers: [ExtensionIntegrationService, ExtensionIdempotencyService],
  exports: [ExtensionIntegrationService, ExtensionIdempotencyService],
})
export class ExtensionIntegrationModule {}
