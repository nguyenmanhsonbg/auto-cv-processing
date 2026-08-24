import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsDateString,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { OfferStatus, ContractType } from '../../recruitment-common';

class OfferBenefitsDto {
  @ApiPropertyOptional({ description: 'Insurance benefits' })
  @IsOptional()
  @IsString()
  insurance?: string;

  @ApiPropertyOptional({ description: 'Bonus structure' })
  @IsOptional()
  @IsString()
  bonus?: string;

  @ApiPropertyOptional({ description: 'Allowances' })
  @IsOptional()
  @IsString()
  allowances?: string;

  @ApiPropertyOptional({ description: 'Other benefits' })
  @IsOptional()
  @IsObject()
  others?: Record<string, string>;
}

export class CreateOfferDto {
  @ApiProperty({ description: 'Job title for the offer' })
  @IsString()
  @IsNotEmpty()
  jobTitle: string;

  @ApiPropertyOptional({ description: 'Department' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ description: 'Level/Title' })
  @IsOptional()
  @IsString()
  level?: string;

  @ApiPropertyOptional({ description: 'Gross salary' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  grossSalary?: number;

  @ApiPropertyOptional({ description: 'Contract start date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ enum: ContractType, description: 'Contract type' })
  @IsOptional()
  @IsEnum(ContractType)
  contractType?: ContractType;

  @ApiPropertyOptional({ description: 'Work location' })
  @IsOptional()
  @IsString()
  workLocation?: string;

  @ApiPropertyOptional({ description: 'Benefits package' })
  @IsOptional()
  @ValidateNested()
  @Type(() => OfferBenefitsDto)
  benefits?: OfferBenefitsDto;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Offer expiration date' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ description: 'External offer ID from AMIS' })
  @IsOptional()
  @IsString()
  externalOfferId?: string;
}
