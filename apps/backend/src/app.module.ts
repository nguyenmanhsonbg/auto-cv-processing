import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from './ai/ai.module';
import { ApplicationsModule } from './applications/applications.module';
import { AuthModule } from './auth/auth.module';
import { CandidatesModule } from './candidates/candidates.module';
import { CategoriesModule } from './categories/categories.module';
import { CvDocumentsModule } from './cv-documents/cv-documents.module';
import { EvaluationsModule } from './evaluations/evaluations.module';
import { ExportModule } from './export/export.module';
import { FileParserModule } from './file-parser/file-parser.module';
import { JobDescriptionsModule } from './job-descriptions/job-descriptions.module';
import { JobPostingsModule } from './job-postings/job-postings.module';
import { LevelsModule } from './levels/levels.module';
import { NotificationModule } from './notification/notification.module';
import { PositionsModule } from './positions/positions.module';
import { QuestionsModule } from './questions/questions.module';
import { SessionsModule } from './sessions/sessions.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { UploadsModule } from './uploads/uploads.module';
import { WebSocketModule } from './websocket/websocket.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 5000 },  // 5000 req/min global
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
            // Connection pool: keep connections alive and reuse them
            max: 5,
            min: 1,
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 5_000,
            // TCP keepalive prevents stale connections being dropped silently
            keepAlive: true,
            keepAliveInitialDelayMillis: 10_000,
          },
        };
      },
      inject: [ConfigService],
    }),
    AuthModule,
    CandidatesModule,
    QuestionsModule,
    SessionsModule,
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
    JobDescriptionsModule,
    JobPostingsModule,
    AiModule,
    UploadsModule,
    NotificationModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule { }
