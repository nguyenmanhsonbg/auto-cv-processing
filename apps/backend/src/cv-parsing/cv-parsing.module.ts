import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { AuditLogEntity } from '../audit-logs/entities/audit-log.entity';
import { DuplicateCheckEntity } from '../applications/entities/duplicate-check.entity';
import { CvDocumentEntity } from '../cv-documents/entities/cv-document.entity';
import { ParsedProfileEntity } from '../cv-documents/entities/parsed-profile.entity';
import { FileParserModule } from '../file-parser/file-parser.module';
import { WorkflowStateModule } from '../workflow-state/workflow-state.module';
import { GeminiCvParserService } from './gemini-cv-parser.service';
import { CvParsingService } from './cv-parsing.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApplicationEntity,
      AuditLogEntity,
      DuplicateCheckEntity,
      CvDocumentEntity,
      ParsedProfileEntity,
    ]),
    FileParserModule,
    WorkflowStateModule,
  ],
  providers: [CvParsingService, GeminiCvParserService],
  exports: [CvParsingService],
})
export class CvParsingModule {}
