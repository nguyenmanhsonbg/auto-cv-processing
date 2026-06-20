import { UserRole } from '@interview-assistant/shared';
import {
  Body,
  Controller,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
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
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UploadCvDto } from './dto/upload-cv.dto';
import { CvDocumentEntity } from './entities/cv-document.entity';
import { CvDocumentsService } from './cv-documents.service';

@ApiTags('CV Documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.HR)
@Controller('applications/:applicationId/cv')
export class CvDocumentsController {
  constructor(private readonly cvDocumentsService: CvDocumentsService) {}

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

  private toUploadResponse(cvDocument: CvDocumentEntity) {
    return {
      applicationId: cvDocument.applicationId,
      cvDocumentId: cvDocument.id,
      fileName: cvDocument.originalFileName,
      fileType: cvDocument.mimeType,
      fileSize: Number(cvDocument.fileSize),
      documentType: cvDocument.documentType,
      versionNo: cvDocument.versionNo,
      status: 'UPLOADED',
      scanStatus: cvDocument.scanStatus,
      sanitizeStatus: cvDocument.sanitizeStatus,
      parseStatus: cvDocument.parseStatus,
      isCurrent: cvDocument.isCurrent,
      nextStep: 'CV_SANITIZE_PENDING',
      createdAt: cvDocument.createdAt?.toISOString(),
    };
  }
}
