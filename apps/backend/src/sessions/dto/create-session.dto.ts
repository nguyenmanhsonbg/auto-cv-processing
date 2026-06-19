import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsUUID,
  IsBoolean,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { MeetingPlatform } from '@interview-assistant/shared';

export class CreateSessionDto {
  @ApiProperty()
  @IsUUID()
  candidateId: string;

  @ApiPropertyOptional({ default: 'ENTRY' })
  @IsString()
  @IsOptional()
  targetLevel?: string;

  @ApiPropertyOptional({ default: 'Backend Developer' })
  @IsString()
  @IsOptional()
  templatePosition?: string;

  @ApiPropertyOptional({ description: 'Position UUID — preferred over templatePosition (string name). When provided the position name is resolved server-side.' })
  @IsUUID()
  @IsOptional()
  positionId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  questionIds?: string[];

  @ApiPropertyOptional({ default: false, description: 'Show questions one at a time; candidate must submit before seeing the next' })
  @IsBoolean()
  @IsOptional()
  sequentialMode?: boolean;

  @ApiPropertyOptional({ description: 'Scheduled interview date and time' })
  @IsDateString()
  @IsOptional()
  scheduledAt?: string;

  @ApiPropertyOptional({ enum: MeetingPlatform, description: 'Meeting platform (MS Teams or Google Meet)' })
  @IsEnum(MeetingPlatform)
  @IsOptional()
  meetingPlatform?: MeetingPlatform;

  @ApiPropertyOptional({ description: 'Online meeting URL' })
  @IsString()
  @IsOptional()
  meetingLink?: string;

}
