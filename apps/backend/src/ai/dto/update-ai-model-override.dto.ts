import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { AVAILABLE_MODELS } from '../ai.service';

const ALLOWED_MODEL_KEYS = Object.keys(AVAILABLE_MODELS);

export class UpdateAiModelOverrideDto {
  @ApiProperty({
    description: 'AI model identifier key (e.g., claude-sonnet-4.6)',
    enum: ALLOWED_MODEL_KEYS,
  })
  @IsString()
  @IsIn(ALLOWED_MODEL_KEYS)
  model: string;
}
