import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { AuditLogEntity } from '../audit-logs/entities/audit-log.entity';
import { CvParsingModule } from '../cv-parsing/cv-parsing.module';
import { CvDocumentEntity } from '../cv-documents/entities/cv-document.entity';
import { WorkflowStateModule } from '../workflow-state/workflow-state.module';
import { CvSanitizationService } from './cv-sanitization.service';
import { CLEAN_CV_SANITIZER } from './sanitizer/clean-cv-sanitizer.interface';
import { GhostscriptDockerPdfSanitizer } from './sanitizer/ghostscript-docker-pdf-sanitizer';
import { GhostscriptHttpPdfSanitizer } from './sanitizer/ghostscript-http-pdf-sanitizer';
import { CV_MALWARE_SCANNER } from './scanner/cv-malware-scanner.interface';
import { ClamAvCvMalwareScanner } from './scanner/clamav-cv-malware-scanner';
import { StubCvMalwareScanner } from './scanner/stub-cv-malware-scanner';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApplicationEntity,
      AuditLogEntity,
      CvDocumentEntity,
    ]),
    CvParsingModule,
    WorkflowStateModule,
  ],
  providers: [
    CvSanitizationService,
    {
      provide: CV_MALWARE_SCANNER,
      useFactory: () => {
        const provider = (process.env.CV_SCANNER_PROVIDER ?? 'stub').trim().toLowerCase();
        if (provider === 'stub') return new StubCvMalwareScanner();
        if (provider === 'clamav') return new ClamAvCvMalwareScanner();
        throw new Error(`Unsupported CV_SCANNER_PROVIDER: ${provider}`);
      },
    },
    {
      provide: CLEAN_CV_SANITIZER,
      useFactory: () => {
        const mode = (process.env.CV_PDF_SANITIZER_MODE ?? 'GHOSTSCRIPT_DOCKER')
          .trim()
          .toUpperCase();
        if (mode === 'HTTP_SERVICE') return new GhostscriptHttpPdfSanitizer();
        if (mode === 'GHOSTSCRIPT_DOCKER') return new GhostscriptDockerPdfSanitizer();
        throw new Error(`Unsupported CV_PDF_SANITIZER_MODE: ${mode}`);
      },
    },
  ],
  exports: [
    CV_MALWARE_SCANNER,
    CvSanitizationService,
  ],
})
export class CvSanitizationModule {}
