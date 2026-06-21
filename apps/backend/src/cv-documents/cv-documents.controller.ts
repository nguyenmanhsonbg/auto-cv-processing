import { UserRole } from '@interview-assistant/shared';
import { createReadStream } from 'fs';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiErrorResponses } from '../common/swagger/api-envelope.schema';
import { CvParsingService } from '../cv-parsing/cv-parsing.service';
import { CvSanitizationService } from '../cv-sanitization/cv-sanitization.service';
import { CvDocumentType, CvSanitizeStatus, StorageZone } from '../recruitment-common';
import { ParseCvDto } from './dto/parse-cv.dto';
import { SanitizeCvDto } from './dto/sanitize-cv.dto';
import { UploadCvDto } from './dto/upload-cv.dto';
import { CvDocumentEntity } from './entities/cv-document.entity';
import { ParsedProfileEntity } from './entities/parsed-profile.entity';
import { CvDocumentsService } from './cv-documents.service';

interface CvDocumentMetadataResponse {
  applicationId: string;
  cvDocumentId: string;
  documentType: CvDocumentType;
  versionNo: number;
  fileName: string;
  fileType: string;
  fileSize: number;
  originalFileHash: string | null;
  cleanFileHash: string | null;
  storageZone: string;
  storageKeyRecorded: boolean;
  scanStatus: string;
  sanitizeStatus: string;
  parseStatus: string;
  isCurrent: boolean;
  cleanFileUrl?: string | null;
  createdAt?: string;
}

interface CvVersionResponse {
  versionNo: number;
  isCurrent: boolean;
  original: CvDocumentMetadataResponse | null;
  clean: CvDocumentMetadataResponse | null;
}

@ApiTags('CV Documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.HR)
@Controller('applications/:applicationId/cv')
@ApiErrorResponses([400, 401, 403, 404, 409, 422, 500, 503])
export class CvDocumentsController {
  constructor(
    private readonly cvDocumentsService: CvDocumentsService,
    private readonly cvSanitizationService: CvSanitizationService,
    private readonly cvParsingService: CvParsingService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Upload an original CV for an application' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['cvFile'],
      properties: {
        cvFile: { type: 'string', format: 'binary' },
        replaceCurrent: { type: 'boolean', default: true },
        reason: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('cvFile'))
  async uploadCv(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadCvDto,
    @Request() req: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const cvDocument = await this.cvDocumentsService.uploadOriginalCv({
      applicationId,
      file,
      replaceCurrent: dto.replaceCurrent,
      reason: dto.reason,
      actorId: req?.user?.id,
      idempotencyKey,
    });

    return {
      success: true,
      data: this.toUploadResponse(cvDocument),
      meta: {
        idempotencyKey: idempotencyKey ?? null,
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Get()
  @ApiOperation({ summary: 'List CV document versions for an application' })
  async listCvDocuments(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ) {
    const cvDocuments = await this.cvDocumentsService.listCvDocumentsByApplication(
      applicationId,
    );

    return {
      success: true,
      data: {
        applicationId,
        versions: this.toCvVersionResponses(cvDocuments),
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Get(':cvDocumentId')
  @ApiOperation({ summary: 'Get CV document metadata without exposing the stored file' })
  async getCvDocumentMetadata(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Param('cvDocumentId', ParseUUIDPipe) cvDocumentId: string,
  ) {
    const cvDocument = await this.cvDocumentsService.findCvDocumentMetadata(
      applicationId,
      cvDocumentId,
    );

    return {
      success: true,
      data: this.toCvDocumentMetadataResponse(cvDocument),
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Get(':cvDocumentId/clean-file')
  @ApiOperation({ summary: 'Preview or download a sanitized clean CV file' })
  @ApiResponse({
    status: 200,
    description: 'Sanitized clean CV binary stream. Success is not wrapped in an envelope.',
    content: {
      'application/pdf': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async getCleanCvFile(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Param('cvDocumentId', ParseUUIDPipe) cvDocumentId: string,
    @Query('disposition') disposition: string | undefined,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const accessMode = this.normalizeCleanFileDisposition(disposition);
    const cleanFile = await this.cvDocumentsService.getCleanCvFileForAccess({
      applicationId,
      cvDocumentId,
      actorId: req?.user?.id,
      actorRole: req?.user?.role,
      accessMode,
    });

    res.setHeader('Content-Type', cleanFile.mimeType);
    res.setHeader('Content-Length', String(cleanFile.fileSize));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `${accessMode}; filename="${cleanFile.fileName}"`,
    );

    const stream = createReadStream(cleanFile.filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.removeHeader('Content-Type');
        res.removeHeader('Content-Length');
        res.removeHeader('Content-Disposition');
        res.status(503).json({
          success: false,
          error: {
            code: 'CLEAN_CV_FILE_UNAVAILABLE',
            message: 'Clean CV file is not available.',
            details: [],
          },
          meta: {
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      res.end();
    });
    stream.pipe(res);
  }

  @Post(':cvDocumentId/sanitize')
  @ApiOperation({ summary: 'Sanitize an original CV after malware scan has passed' })
  @ApiBody({ type: SanitizeCvDto })
  async sanitizeCv(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Param('cvDocumentId', ParseUUIDPipe) cvDocumentId: string,
    @Body() dto: SanitizeCvDto,
    @Request() req: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const cleanCvDocument = await this.cvSanitizationService.sanitizeCvDocument({
      applicationId,
      cvDocumentId,
      force: dto.force,
      actorId: req?.user?.id,
      idempotencyKey,
    });

    return {
      success: true,
      data: this.toSanitizeResponse(cleanCvDocument),
      meta: {
        idempotencyKey: idempotencyKey ?? null,
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Post(':cvDocumentId/parse')
  @ApiOperation({ summary: 'Parse a clean CV after sanitization has succeeded' })
  @ApiBody({ type: ParseCvDto })
  async parseCv(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Param('cvDocumentId', ParseUUIDPipe) cvDocumentId: string,
    @Body() dto: ParseCvDto,
    @Request() req: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const parsedProfile = await this.cvParsingService.parseCleanCvDocument({
      applicationId,
      cvDocumentId,
      actorId: req?.user?.id,
      idempotencyKey,
      parserMode: dto.parserMode,
    });

    return {
      success: true,
      data: this.toParseResponse(parsedProfile),
      meta: {
        idempotencyKey: idempotencyKey ?? null,
        timestamp: new Date().toISOString(),
      },
    };
  }

  private toUploadResponse(cvDocument: CvDocumentEntity) {
    return {
      applicationId: cvDocument.applicationId,
      cvDocumentId: cvDocument.id,
      fileName: cvDocument.originalFileName,
      fileType: cvDocument.mimeType,
      fileSize: Number(cvDocument.fileSize),
      documentType: cvDocument.documentType,
      versionNo: cvDocument.versionNo,
      status: 'CV_SCAN_PASSED',
      processingStatus: 'ACCEPTED',
      scanStatus: cvDocument.scanStatus,
      sanitizeStatus: cvDocument.sanitizeStatus,
      parseStatus: cvDocument.parseStatus,
      isCurrent: cvDocument.isCurrent,
      nextStep: 'CV_SANITIZE_PENDING',
      message: 'CV upload accepted. Sanitization and parsing will continue asynchronously.',
      createdAt: cvDocument.createdAt?.toISOString(),
    };
  }

  private toCvVersionResponses(cvDocuments: CvDocumentEntity[]) {
    const versions = new Map<number, CvVersionResponse>();

    for (const cvDocument of cvDocuments) {
      const version = versions.get(cvDocument.versionNo) ?? {
        versionNo: cvDocument.versionNo,
        isCurrent: false,
        original: null,
        clean: null,
      };
      const metadata = this.toCvDocumentMetadataResponse(cvDocument);

      version.isCurrent = version.isCurrent || cvDocument.isCurrent;
      if (cvDocument.documentType === CvDocumentType.ORIGINAL) {
        version.original = metadata;
      } else if (cvDocument.documentType === CvDocumentType.CLEAN) {
        version.clean = metadata;
      }

      versions.set(cvDocument.versionNo, version);
    }

    return Array.from(versions.values())
      .sort((left, right) => right.versionNo - left.versionNo);
  }

  private toCvDocumentMetadataResponse(
    cvDocument: CvDocumentEntity,
  ): CvDocumentMetadataResponse {
    return {
      applicationId: cvDocument.applicationId,
      cvDocumentId: cvDocument.id,
      documentType: cvDocument.documentType,
      versionNo: cvDocument.versionNo,
      fileName: cvDocument.originalFileName,
      fileType: cvDocument.mimeType,
      fileSize: Number(cvDocument.fileSize),
      originalFileHash: cvDocument.originalFileHash,
      cleanFileHash: cvDocument.cleanFileHash,
      storageZone: cvDocument.storageZone,
      storageKeyRecorded: Boolean(cvDocument.storagePath),
      scanStatus: cvDocument.scanStatus,
      sanitizeStatus: cvDocument.sanitizeStatus,
      parseStatus: cvDocument.parseStatus,
      isCurrent: cvDocument.isCurrent,
      cleanFileUrl: this.buildCleanFileUrl(cvDocument),
      createdAt: cvDocument.createdAt?.toISOString(),
    };
  }

  private buildCleanFileUrl(cvDocument: CvDocumentEntity) {
    if (
      cvDocument.documentType !== CvDocumentType.CLEAN ||
      cvDocument.storageZone !== StorageZone.SAFE ||
      cvDocument.sanitizeStatus !== CvSanitizeStatus.SANITIZED
    ) {
      return null;
    }

    return `/api/applications/${cvDocument.applicationId}/cv/${cvDocument.id}/clean-file`;
  }

  private normalizeCleanFileDisposition(value?: string): 'inline' | 'attachment' {
    return value?.toLowerCase() === 'attachment' ? 'attachment' : 'inline';
  }

  private toSanitizeResponse(cvDocument: CvDocumentEntity) {
    return {
      applicationId: cvDocument.applicationId,
      cvDocumentId: cvDocument.id,
      cleanCvDocumentId: cvDocument.id,
      documentType: cvDocument.documentType,
      versionNo: cvDocument.versionNo,
      sanitizeStatus: cvDocument.sanitizeStatus,
      cleanFileHashRecorded: Boolean(cvDocument.cleanFileHash),
      storageZone: cvDocument.storageZone,
      nextStatus: 'CV_SANITIZED',
      nextStep: 'CV_PARSE_PENDING',
      createdAt: cvDocument.createdAt?.toISOString(),
    };
  }

  private toParseResponse(parsedProfile: ParsedProfileEntity) {
    return {
      applicationId: parsedProfile.applicationId,
      cvDocumentId: parsedProfile.cvDocumentId,
      parsedProfileId: parsedProfile.id,
      candidateId: parsedProfile.candidateId,
      status: 'CV_PARSED',
      normalizedTextHashRecorded: Boolean(parsedProfile.normalizedTextHash),
      parserVersion: parsedProfile.parserVersion,
      createdAt: parsedProfile.createdAt?.toISOString(),
    };
  }
}
