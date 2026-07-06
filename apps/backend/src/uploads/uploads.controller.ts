import * as path from 'path';
import {
  Controller,
  Get,
  Param,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { UserRole } from '@interview-assistant/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.INTERVIEWER, UserRole.HR)
@Controller('uploads')
export class UploadsController {
  @Get(':filename')
  @ApiOperation({ summary: 'Download an uploaded file (ADMIN, INTERVIEWER, HR only)' })
  serveFile(
    @Param('filename') filename: string,
    @Res() res: Response,
  ): void {
    // Block path traversal: no slashes or dot-dot sequences allowed
    if (!filename || /[/\\]|\.\./.test(filename)) {
      throw new BadRequestException('Invalid filename');
    }
    const uploadDir = process.env.UPLOAD_DIR
      ? path.resolve(process.env.UPLOAD_DIR)
      : path.resolve(process.cwd(), 'uploads');
    const filePath = path.join(uploadDir, filename);
    res.sendFile(filePath, (err) => {
      if (err) throw new BadRequestException('File not found');
    });
  }
}
