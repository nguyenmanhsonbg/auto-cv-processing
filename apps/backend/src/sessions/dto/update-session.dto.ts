import { PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional } from 'class-validator';
import { SessionStatus } from '@interview-assistant/shared';
import { CreateSessionDto } from './create-session.dto';

export class UpdateSessionDto extends PartialType(CreateSessionDto) {
  @ApiPropertyOptional({ enum: SessionStatus })
  @IsEnum(SessionStatus)
  @IsOptional()
  status?: SessionStatus;

  @ApiPropertyOptional({ description: 'Category/subcategory ratings keyed by "CATEGORY::Subcategory"' })
  @IsObject()
  @IsOptional()
  categoryRatings?: Record<string, number>;
}
