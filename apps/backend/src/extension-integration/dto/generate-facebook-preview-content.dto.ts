import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { AmisJobSnapshotDto } from './sync-amis-job-posting.dto';

export class GenerateFacebookPreviewContentDto {
  @ApiProperty({ type: () => AmisJobSnapshotDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => AmisJobSnapshotDto)
  snapshot: AmisJobSnapshotDto;

  @ApiProperty({
    enum: ['TEMPLATE', 'AI'],
    description: 'Required generation mode: TEMPLATE or AI.',
  })
  @IsDefined()
  @IsIn(['TEMPLATE', 'AI'])
  mode: 'TEMPLATE' | 'AI';

  @ApiPropertyOptional({
    maxLength: 10000,
    description: 'Current edited content. Reserved for future rewrite flows.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  facebookContent?: string;
}
