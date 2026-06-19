import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsNotEmpty,
} from 'class-validator';
import { CandidateLevel } from '@interview-assistant/shared';

export class CreateCandidateDto {
  @ApiProperty({ description: 'Candidate full name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  birthYear?: number;

  @ApiPropertyOptional({ default: 'Backend Developer' })
  @IsString()
  @IsOptional()
  position?: string;

  @ApiPropertyOptional({ enum: CandidateLevel, default: CandidateLevel.ENTRY })
  @IsEnum(CandidateLevel)
  @IsOptional()
  level?: CandidateLevel;
}
