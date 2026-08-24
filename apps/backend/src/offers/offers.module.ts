import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OffersController } from './offers.controller';
import { OffersService } from './services/offers.service';
import { OfferEntity } from './entities/offer.entity';
import { ApplicationEntity } from '../applications/entities/application.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OfferEntity, ApplicationEntity])],
  controllers: [OffersController],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}
