import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CvSanitizationModule } from './cv-sanitization.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const nodeEnv = configService.get<string>('NODE_ENV')?.toLowerCase();
        const synchronizeFlag = configService.get<string>('TYPEORM_SYNCHRONIZE')?.toLowerCase();
        const synchronize = nodeEnv === 'development' && synchronizeFlag === 'true';

        return {
          type: 'postgres' as const,
          url: configService.get<string>('DATABASE_URL'),
          entities: [__dirname + '/../**/*.entity{.ts,.js}'],
          autoLoadEntities: true,
          synchronize,
          ssl: false,
          extra: {
            client_encoding: 'UTF8',
            max: 5,
            min: 1,
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 5_000,
            keepAlive: true,
            keepAliveInitialDelayMillis: 10_000,
          },
        };
      },
      inject: [ConfigService],
    }),
    CvSanitizationModule,
  ],
})
class CvSanitizerPoolManagerModule {}

async function bootstrap() {
  process.env.CV_SANITIZER_POOL_MANAGER = 'true';
  const app = await NestFactory.createApplicationContext(CvSanitizerPoolManagerModule);

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

void bootstrap();
