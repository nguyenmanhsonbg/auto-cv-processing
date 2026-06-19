import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { CandidatesModule } from './candidates/candidates.module';
import { CategoriesModule } from './categories/categories.module';
import { EvaluationsModule } from './evaluations/evaluations.module';
import { ExportModule } from './export/export.module';
import { FileParserModule } from './file-parser/file-parser.module';
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
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: true,
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
      }),
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
    AiModule,
    UploadsModule,
    NotificationModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule { }
