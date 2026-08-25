import { Controller, Post, Body, Logger, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AmisSyncService } from './services/amis-sync.service';
import { AmisPollService } from './services/amis-poll.service';
import { AmisWebhookPayloadDto } from './dto/amis-webhook.dto';

@ApiTags('AMIS Sync')
@Controller('webhooks')
export class AmisSyncController {
  private readonly logger = new Logger(AmisSyncController.name);

  constructor(
    private readonly amisSyncService: AmisSyncService,
    private readonly amisPollService: AmisPollService,
  ) {}

  /**
   * Webhook endpoint để extension gửi AMIS response
   * Khi user chuyển round trên AMIS, extension bắt response và gửi sang đây
   */
  @Post('amis')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook: Nhận AMIS response khi chuyển round' })
  async handleAmisWebhook(@Body() payload: AmisWebhookPayloadDto): Promise<{
    success: boolean;
    message: string;
    syncedCount: number;
  }> {
    this.logger.log(`Received AMIS webhook: ${JSON.stringify(payload).substring(0, 200)}...`);
    return this.amisSyncService.handleAmisWebhook(payload);
  }

  /**
   * Alternative endpoint name
   */
  @Post('amis-round-update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook: Nhận AMIS round update' })
  async handleRoundUpdate(@Body() payload: AmisWebhookPayloadDto): Promise<{
    success: boolean;
    message: string;
    syncedCount: number;
  }> {
    return this.amisSyncService.handleAmisWebhook(payload);
  }

  /**
   * Trigger manual sync (nếu cần)
   */
  @Post('amis/sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger manual sync từ AMIS' })
  async triggerSync(): Promise<{ synced: number; errors: number }> {
    this.logger.log('Manual AMIS sync triggered');
    return this.amisPollService.triggerSync();
  }
}
