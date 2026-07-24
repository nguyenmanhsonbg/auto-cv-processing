import { BadRequestException, Body, Controller, Headers, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { buildCvQuarantineFileName, ensureCvQuarantineRoot } from '../cv-documents/storage/cv-quarantine-storage';
import { VcsPortalApplyWebhookService } from './vcs-portal-apply-webhook.service';

const vcsPortalApplyWebhookFileInterceptor = FileInterceptor('cv', {
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

    if (extension !== '.pdf') {
      cb(new BadRequestException('Webhook CV file must be a PDF'), false);
      return;
    }

    cb(null, true);
  },
  limits: { fileSize: 20 * 1024 * 1024 },
});

@ApiTags('VCS Portal Webhooks')
@Controller('webhooks/vcs-portal')
export class VcsPortalApplyWebhookController {
  constructor(
    private readonly vcsPortalApplyWebhookService: VcsPortalApplyWebhookService,
  ) {}

  @Post('apply')
  @ApiOperation({ summary: 'Receive sanitized candidate CV applications from VCS Portal' })
  @ApiHeader({
    name: 'X-VCS-Webhook-Key',
    required: true,
    description: 'Shared secret configured in VCS_APPLY_WEBHOOK_KEY.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['payload', 'cv'],
      properties: {
        payload: {
          type: 'string',
          description: 'JSON payload describing the WPForms apply entry and sanitized CV metadata.',
        },
        cv: {
          type: 'string',
          format: 'binary',
          description: 'Sanitized candidate CV PDF.',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Webhook accepted and persisted.' })
  @UseInterceptors(vcsPortalApplyWebhookFileInterceptor)
  receiveApplyWebhook(
    @Body('payload') payloadJson: string | undefined,
    @UploadedFile() cvFile: Express.Multer.File | undefined,
    @Headers('x-vcs-webhook-key') webhookKey: string | string[] | undefined,
  ) {
    return this.vcsPortalApplyWebhookService.handleApplyWebhook({
      payloadJson,
      cvFile,
      webhookKey,
    });
  }
}
