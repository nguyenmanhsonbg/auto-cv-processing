import { BadRequestException, Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { AuditLogEntity } from '../audit-logs/entities/audit-log.entity';
import { CvParsingModule } from '../cv-parsing/cv-parsing.module';
import { CvSanitizationModule } from '../cv-sanitization/cv-sanitization.module';
import { WorkflowStateModule } from '../workflow-state/workflow-state.module';
import { CvDocumentsController } from './cv-documents.controller';
import { CvDocumentsService } from './cv-documents.service';
import { CvDocumentEntity } from './entities/cv-document.entity';
import { ParsedProfileEntity } from './entities/parsed-profile.entity';
import {
  buildCvQuarantineFileName,
  ensureCvQuarantineRoot,
} from './storage/cv-quarantine-storage';

const allowedMimeByExtension: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApplicationEntity,
      AuditLogEntity,
      CvDocumentEntity,
      ParsedProfileEntity,
    ]),
    CvParsingModule,
    CvSanitizationModule,
    WorkflowStateModule,
    MulterModule.register({
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          try {
            cb(null, ensureCvQuarantineRoot());
          } catch (error) {
            cb(error instanceof Error ? error : new Error('CV quarantine storage is invalid'), '');
          }
        },
        filename: (_req, file, cb) => {
          cb(null, buildCvQuarantineFileName(file.originalname));
        },
      }),
      fileFilter: (_req, file, cb) => {
        const extension = extname(file.originalname).toLowerCase();
        const expectedMime = allowedMimeByExtension[extension];

        if (!expectedMime || file.mimetype !== expectedMime) {
          cb(new BadRequestException('Unsupported CV file type'), false);
          return;
        }

        cb(null, true);
      },
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  ],
  controllers: [CvDocumentsController],
  providers: [CvDocumentsService],
  exports: [CvDocumentsService],
})
export class CvDocumentsModule {}
