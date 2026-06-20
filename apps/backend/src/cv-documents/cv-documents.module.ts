import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, resolve } from 'path';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { WorkflowStateModule } from '../workflow-state/workflow-state.module';
import { CvDocumentsController } from './cv-documents.controller';
import { CvDocumentsService } from './cv-documents.service';
import { CvDocumentEntity } from './entities/cv-document.entity';
import { ParsedProfileEntity } from './entities/parsed-profile.entity';

const quarantineDir = () => resolve(process.env.CV_QUARANTINE_DIR || './storage/cv-quarantine');

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApplicationEntity,
      CvDocumentEntity,
      ParsedProfileEntity,
    ]),
    WorkflowStateModule,
    MulterModule.register({
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const destination = quarantineDir();
          mkdirSync(destination, { recursive: true });
          cb(null, destination);
        },
        filename: (_req, file, cb) => {
          cb(null, `${Date.now()}-${randomUUID()}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  ],
  controllers: [CvDocumentsController],
  providers: [CvDocumentsService],
  exports: [CvDocumentsService],
})
export class CvDocumentsModule {}
