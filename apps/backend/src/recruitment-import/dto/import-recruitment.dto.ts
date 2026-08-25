import { ApiProperty } from '@nestjs/swagger';

export class ImportRecruitmentDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Recruitment workbook with candidates, applications, interview_rounds and offers sheets',
  })
  file: Express.Multer.File;
}
