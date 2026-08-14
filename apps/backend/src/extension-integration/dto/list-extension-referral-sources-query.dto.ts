import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { PaginatedQueryDto } from '../../common/dto/paginated-query.dto';

export enum ExtensionReferralSourceType {
  FREELANCER = 'FREELANCER',
  INTERNAL = 'INTERNAL',
}

export class ListExtensionReferralSourcesQueryDto extends PaginatedQueryDto {
  @ApiProperty({ enum: ExtensionReferralSourceType })
  @IsEnum(ExtensionReferralSourceType)
  source!: ExtensionReferralSourceType;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}
