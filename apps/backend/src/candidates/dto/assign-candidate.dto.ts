import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class AssignCandidateDto {
  @ApiProperty({ type: [String], description: 'Array of user UUIDs to assign (empty array unassigns all)' })
  @IsArray()
  @IsUUID('4', { each: true })
  userIds: string[];
}
