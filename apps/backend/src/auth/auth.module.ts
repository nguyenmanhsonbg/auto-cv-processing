import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserEntity } from './entities/user.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { FreelancerEntity } from '../freelancers/entities/freelancer.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { InternalEntity } from '../internals/entities/internal.entity';
import { NotificationModule } from '../notification/notification.module';
import { PasswordResetRequestEntity } from './entities/password-reset-request.entity';
import { EvaluationHandoffEntity } from './entities/evaluation-handoff.entity';
import { CommonModule } from '../common/common.module';

import { LocalAuthGuard } from './guards/local-auth.guard';

@Module({
  imports: [
    CommonModule,
    TypeOrmModule.forFeature([
      UserEntity,
      RefreshTokenEntity,
      FreelancerEntity,
      InternalEntity,
      PasswordResetRequestEntity,
      EvaluationHandoffEntity,
    ]),
    NotificationModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '15m'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, LocalStrategy, GoogleStrategy, LocalAuthGuard],
  exports: [AuthService],
})
export class AuthModule {}
