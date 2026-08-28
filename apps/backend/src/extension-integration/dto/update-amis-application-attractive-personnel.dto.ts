import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAmisApplicationAttractivePersonnelDto {
  @ApiProperty({ description: 'The AMIS user id captured from the successful Candidate/save response.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  attractivePersonnelId: string;

  @ApiProperty({ description: 'The attractive personnel name captured from the successful Candidate/save response.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  attractivePersonnelName: string;

  @ApiPropertyOptional({ description: 'The AMIS Candidate/save endpoint that produced this event.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceUrl?: string;

  @ApiPropertyOptional({ description: 'The AMIS page where the candidate was edited.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pageUrl?: string;

  @ApiPropertyOptional({ description: 'The extension capture timestamp for this successful save.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  changedAt?: string;

  @ApiPropertyOptional({ description: 'Candidate display name included as capture evidence.' })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  candidateName?: string;
}
