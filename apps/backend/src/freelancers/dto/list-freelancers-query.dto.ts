import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export enum FreelancerStatusFilter {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export class ListFreelancersQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: FreelancerStatusFilter })
  @IsOptional()
  @IsEnum(FreelancerStatusFilter)
  status?: FreelancerStatusFilter;

  @ApiPropertyOptional({
    enum: ['identifier', 'name', 'email', 'createdAt', 'updatedAt'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(['identifier', 'name', 'email', 'createdAt', 'updatedAt'])
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
