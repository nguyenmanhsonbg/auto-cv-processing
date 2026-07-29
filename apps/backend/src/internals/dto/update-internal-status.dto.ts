import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateInternalStatusDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  isActive!: boolean;
}
