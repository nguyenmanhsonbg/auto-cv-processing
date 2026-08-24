import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { resolve } from 'node:path';
import { CommonModule } from './common/common.module';
import { AiModule } from './ai/ai.module';
import { ApplicationsModule } from './applications/applications.module';
import { AuthModule } from './auth/auth.module';
import { CandidatesModule } from './candidates/candidates.module';
import { CategoriesModule } from './categories/categories.module';
import { CvDocumentsModule } from './cv-documents/cv-documents.module';
import { EvaluationsModule } from './evaluations/evaluations.module';
import { ExtensionIntegrationModule } from './extension-integration/extension-integration.module';
import { ExportModule } from './export/export.module';
import { FileParserModule } from './file-parser/file-parser.module';
import { FreelancersModule } from './freelancers/freelancers.module';
import { InternalsModule } from './internals/internals.module';
import { JobDescriptionsModule } from './job-descriptions/job-descriptions.module';
import { JobPostingsModule } from './job-postings/job-postings.module';
import { LevelsModule } from './levels/levels.module';
import { NotificationModule } from './notification/notification.module';
import { PositionsModule } from './positions/positions.module';
import { QuestionsModule } from './questions/questions.module';
import { SessionsModule } from './sessions/sessions.module';
import { FormSessionsModule } from './form-sessions/form-sessions.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { UploadsModule } from './uploads/uploads.module';
import { VcsPortalWebhooksModule } from './vcs-portal-webhooks/vcs-portal-webhooks.module';
import { WebSocketModule } from './websocket/websocket.module';
import { InterviewRoundsModule } from './interview-rounds/interview-rounds.module';
import { TestRoundsModule } from './test-rounds/test-rounds.module';
import { OffersModule } from './offers/offers.module';
import { AmisSyncModule } from './amis-sync/amis-sync.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [resolve(__dirname, '../.env')],
    }),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 5000 },
    ]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const nodeEnv = configService.get<string>('NODE_ENV')?.toLowerCase();
        const synchronizeFlag = configService.get<string>('TYPEORM_SYNCHRONIZE')?.toLowerCase();
        const synchronize = nodeEnv === 'development' && synchronizeFlag === 'true';

        return {
          type: 'postgres',
          url: configService.get<string>('DATABASE_URL'),
          autoLoadEntities: true,
          synchronize,
          ssl: false,
          extra: {
            client_encoding: 'UTF8',
            max: 5,
            min: 1,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
            keepAlive: true,
            keepAliveInitialDelayMillis: 10000,
          },
        };
      },
      inject: [ConfigService],
    }),
    AuthModule,
    CommonModule,
    CandidatesModule,
    QuestionsModule,
    SessionsModule,
    FormSessionsModule,
    EvaluationsModule,
    SubmissionsModule,
    ExportModule,
    FileParserModule,
    WebSocketModule,
    PositionsModule,
    CategoriesModule,
    LevelsModule,
    ApplicationsModule,
    CvDocumentsModule,
    FreelancersModule,
    InternalsModule,
    JobDescriptionsModule,
    JobPostingsModule,
    ExtensionIntegrationModule,
    AiModule,
    UploadsModule,
    VcsPortalWebhooksModule,
    NotificationModule,
    // Recruitment Pipeline Modules
    InterviewRoundsModule,
    TestRoundsModule,
    OffersModule,
    AmisSyncModule,
    DashboardModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule { }
