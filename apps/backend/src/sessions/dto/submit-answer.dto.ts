import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, IsNotEmpty } from 'class-validator';

export class SubmitAnswerDto {
  @ApiProperty()
  @IsUUID()
  sessionQuestionId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  answer: string;
}
