import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { UserEntity } from '../auth/entities/user.entity';
import { InternalEntity } from '../internals/entities/internal.entity';
import { CvDocumentsModule } from '../cv-documents/cv-documents.module';
import { FreelancersController } from './freelancers.controller';
import { FreelancersService } from './freelancers.service';
import { ApplicationReferralEntity } from './entities/application-referral.entity';
import { FreelancerIdentifierCounterEntity } from './entities/freelancer-identifier-counter.entity';
import { FreelancerEntity } from './entities/freelancer.entity';

@Module({
  imports: [
    CvDocumentsModule,
    TypeOrmModule.forFeature([
      ApplicationEntity,
      ApplicationReferralEntity,
      FreelancerEntity,
      FreelancerIdentifierCounterEntity,
      UserEntity,
      InternalEntity,
    ]),
  ],
  controllers: [FreelancersController],
  providers: [FreelancersService],
  exports: [FreelancersService],
})
export class FreelancersModule {}
