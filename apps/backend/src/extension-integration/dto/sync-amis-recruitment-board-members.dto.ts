import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class SyncAmisRecruitmentBoardMemberItemDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  amisBoardId?: string | null;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  amisUserId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  fullName: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  isAdmin = false;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  isViewOffer = false;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  isPushNotification = false;
}

export class SyncAmisRecruitmentBoardMembersDto {
  @ApiProperty({ type: () => [SyncAmisRecruitmentBoardMemberItemDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SyncAmisRecruitmentBoardMemberItemDto)
  members: SyncAmisRecruitmentBoardMemberItemDto[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sourceUrl?: string | null;
}
