import { UserRole } from '@interview-assistant/shared';
import {
  BadRequestException,
  Controller,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ImportRecruitmentDto } from './dto/import-recruitment.dto';
import { RecruitmentImportService } from './recruitment-import.service';

@ApiTags('Recruitment Import')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.HR)
@Controller('recruitment-import')
export class RecruitmentImportController {
  constructor(private readonly importService: RecruitmentImportService) {}

  @Post('workbook')
  @ApiOperation({ summary: 'Import recruitment workbook' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ImportRecruitmentDto })
  @UseInterceptors(FileInterceptor('file'))
  async importWorkbook(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('XLSX file is required');
    }

    const data = await this.importService.importWorkbook(file.buffer, req.user.id);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
