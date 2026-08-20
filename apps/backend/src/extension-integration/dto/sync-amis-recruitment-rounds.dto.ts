import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class SyncAmisRecruitmentRoundItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  amisRoundId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsInt()
  sortOrder: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  roundType?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  roundTypeId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  color?: string | null;
}

export class SyncAmisRecruitmentRoundsDto {
  @ApiProperty({ type: () => [SyncAmisRecruitmentRoundItemDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SyncAmisRecruitmentRoundItemDto)
  rounds: SyncAmisRecruitmentRoundItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceUrl?: string;
}
