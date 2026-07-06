import { Controller, Get, Param, Res, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { ExportService } from './export.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Export')
@Controller('export')
export class ExportController {
  constructor(private exportService: ExportService) {}

  @Get(':sessionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export evaluation as Excel (BM04 template)' })
  async exportEvaluation(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.exportService.exportEvaluation(sessionId);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="evaluation_${sessionId}.xlsx"`,
    );
    res.send(buffer);
  }
}
