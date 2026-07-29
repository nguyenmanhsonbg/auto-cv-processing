import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationReferralEntity } from '../freelancers/entities/application-referral.entity';
import { UserEntity } from '../auth/entities/user.entity';
import { InternalEntity } from './entities/internal.entity';
import { InternalsController } from './internals.controller';
import { InternalsService } from './internals.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([InternalEntity, ApplicationReferralEntity, UserEntity]),
  ],
  controllers: [InternalsController],
  providers: [InternalsService],
  exports: [InternalsService],
})
export class InternalsModule {}
