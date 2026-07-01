import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AmisCareerEntity, ExtensionIdempotencyRecordEntity, RecruitmentExternalReferenceEntity } from './entities';
import { ExtensionIdempotencyService } from './extension-idempotency.service';
import { ExtensionIntegrationController } from './extension-integration.controller';
import { ExtensionIntegrationService } from './extension-integration.service';
import { QuestionsModule } from '../questions/questions.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RecruitmentExternalReferenceEntity,
      ExtensionIdempotencyRecordEntity,
      AmisCareerEntity,
    ]),
    QuestionsModule,
    CategoriesModule,
  ],
  controllers: [ExtensionIntegrationController],
  providers: [ExtensionIntegrationService, ExtensionIdempotencyService],
  exports: [ExtensionIntegrationService, ExtensionIdempotencyService],
})
export class ExtensionIntegrationModule {}
