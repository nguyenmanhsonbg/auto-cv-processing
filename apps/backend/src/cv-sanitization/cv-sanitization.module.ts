import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { AuditLogEntity } from '../audit-logs/entities/audit-log.entity';
import { CvParsingModule } from '../cv-parsing/cv-parsing.module';
import { CvDocumentEntity } from '../cv-documents/entities/cv-document.entity';
import { WorkflowStateModule } from '../workflow-state/workflow-state.module';
import { CvSanitizationService } from './cv-sanitization.service';
import { CvSanitizationJobEntity } from './jobs/cv-sanitization-job.entity';
import { CvSanitizationJobService } from './jobs/cv-sanitization-job.service';
import { CleanPdfOutputValidator } from './output/clean-pdf-output-validator';
import { SanitizerPoolHealthService } from './pool/sanitizer-pool-health.service';
import { SanitizerPoolManagerService } from './pool/sanitizer-pool-manager.service';
import { CLEAN_CV_SANITIZER } from './sanitizer/clean-cv-sanitizer.interface';
import { DisposableGhostscriptSanitizer } from './sanitizer/disposable-ghostscript-sanitizer';
import { GhostscriptDockerPdfSanitizer } from './sanitizer/ghostscript-docker-pdf-sanitizer';
import { GhostscriptHttpPdfSanitizer } from './sanitizer/ghostscript-http-pdf-sanitizer';
import { DockerCliSanitizerContainerRuntime } from './worker-runtime/docker-cli-sanitizer-container-runtime';
import { CvSanitizerWorkerEntity } from './workers/cv-sanitizer-worker.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApplicationEntity,
      AuditLogEntity,
      CvDocumentEntity,
      CvSanitizationJobEntity,
      CvSanitizerWorkerEntity,
    ]),
    CvParsingModule,
    WorkflowStateModule,
  ],
  providers: [
    CvSanitizationService,
    CvSanitizationJobService,
    CleanPdfOutputValidator,
    DockerCliSanitizerContainerRuntime,
    SanitizerPoolHealthService,
    SanitizerPoolManagerService,
    {
      provide: CLEAN_CV_SANITIZER,
      useFactory: (jobService: CvSanitizationJobService) => {
        const mode = (process.env.CV_PDF_SANITIZER_MODE ?? 'GHOSTSCRIPT_DOCKER')
          .trim()
          .toUpperCase();
        if (mode === 'DISPOSABLE_POOL') return new DisposableGhostscriptSanitizer(jobService);
        if (mode === 'HTTP_SERVICE') return new GhostscriptHttpPdfSanitizer();
        if (mode === 'GHOSTSCRIPT_DOCKER') return new GhostscriptDockerPdfSanitizer();
        throw new Error(`Unsupported CV_PDF_SANITIZER_MODE: ${mode}`);
      },
      inject: [CvSanitizationJobService],
    },
  ],
  exports: [
    CvSanitizationService,
    CvSanitizationJobService,
    SanitizerPoolHealthService,
  ],
})
export class CvSanitizationModule {}
