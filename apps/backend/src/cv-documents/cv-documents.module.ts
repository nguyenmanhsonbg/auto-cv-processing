import { BadRequestException, Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { extname } from 'node:path';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { DuplicateCheckEntity } from '../applications/entities/duplicate-check.entity';
import { AuditLogEntity } from '../audit-logs/entities/audit-log.entity';
import { CvParsingModule } from '../cv-parsing/cv-parsing.module';
import { CvSanitizationModule } from '../cv-sanitization/cv-sanitization.module';
import { FileParserModule } from '../file-parser/file-parser.module';
import { WorkflowStateModule } from '../workflow-state/workflow-state.module';
import { CvDocumentsController } from './cv-documents.controller';
import { CvDocumentsService } from './cv-documents.service';
import { CvDocumentEntity } from './entities/cv-document.entity';
import { ParsedProfileEntity } from './entities/parsed-profile.entity';
import {
  createCvQuarantineStorage,
  CV_UPLOAD_SIZE_LIMIT_BYTES,
} from './storage/cv-upload-storage';

const allowedCvUploadExtensions = new Set(['.pdf', '.docx', '.xlsx']);

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApplicationEntity,
      AuditLogEntity,
      DuplicateCheckEntity,
      CvDocumentEntity,
      ParsedProfileEntity,
    ]),
    CvParsingModule,
    CvSanitizationModule,
    FileParserModule,
    WorkflowStateModule,
    MulterModule.register({
      storage: createCvQuarantineStorage(),
      fileFilter: (_req, file, cb) => {
        const extension = extname(file.originalname).toLowerCase();

        if (!allowedCvUploadExtensions.has(extension)) {
          cb(new BadRequestException('Unsupported CV file type'), false);
          return;
        }

        cb(null, true);
      },
      limits: { fileSize: CV_UPLOAD_SIZE_LIMIT_BYTES },
    }),
  ],
  controllers: [CvDocumentsController],
  providers: [CvDocumentsService],
  exports: [CvDocumentsService],
})
export class CvDocumentsModule {}
