import { ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsNumber, IsObject, IsString, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { OfferStatus } from '../../recruitment-common';
import { CreateOfferDto } from './create-offer.dto';

export class UpdateOfferDto extends PartialType(CreateOfferDto) {
  @ApiPropertyOptional({ enum: OfferStatus, description: 'Offer status' })
  @IsOptional()
  @IsEnum(OfferStatus)
  status?: OfferStatus;

  @ApiPropertyOptional({ description: 'Mark offer as sent at' })
  @IsOptional()
  @IsDateString()
  sentAt?: string;

  @ApiPropertyOptional({ description: 'Candidate responded at' })
  @IsOptional()
  @IsDateString()
  respondedAt?: string;
}

export class SendOfferDto {
  @ApiPropertyOptional({ description: 'Custom send time' })
  @IsOptional()
  @IsDateString()
  sentAt?: string;

  @ApiPropertyOptional({ description: 'Custom expiration time' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class ReviseOfferDto extends PartialType(CreateOfferDto) {
  @ApiPropertyOptional({ description: 'Reason for revision' })
  @IsOptional()
  @IsString()
  revisionReason?: string;
}
