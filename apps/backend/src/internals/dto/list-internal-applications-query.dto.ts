import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { PaginatedQueryDto } from '../../common/dto/paginated-query.dto';
import { ApplicationStatus, HrReviewDecisionType } from '../../recruitment-common';

export class ListInternalApplicationsQueryDto extends PaginatedQueryDto {
  @ApiPropertyOptional({ enum: ApplicationStatus })
  @IsOptional()
  @IsEnum(ApplicationStatus)
  processStatus?: ApplicationStatus;

  @ApiPropertyOptional({ enum: HrReviewDecisionType })
  @IsOptional()
  @IsEnum(HrReviewDecisionType)
  hrReceptionStatus?: HrReviewDecisionType;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
