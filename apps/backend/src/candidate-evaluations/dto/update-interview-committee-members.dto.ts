import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

export class UpdateInterviewCommitteeMembersDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  userIds: string[];
}
