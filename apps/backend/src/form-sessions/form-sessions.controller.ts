import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@interview-assistant/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { FormSessionsService } from './form-sessions.service';

@ApiTags('Form Sessions')
@Controller('form-sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class FormSessionsController {
  constructor(private readonly formSessionsService: FormSessionsService) {}

  @Post('generate')
  @Roles(UserRole.ADMIN, UserRole.HR)
  @ApiOperation({ summary: 'Manually generate form session and link for an application' })
  async generateForm(
    @Body() body: { applicationId: string },
    @Request() req: any,
  ) {
    const userId = req?.user?.id;
    const result = await this.formSessionsService.generateFormSession(body.applicationId, userId);
    return {
      success: true,
      data: result,
    };
  }

  @Get('application/:applicationId')
  @Roles(UserRole.ADMIN, UserRole.HR)
  @ApiOperation({ summary: 'Get questionnaire form details and answers for an application' })
  async getFormDetailsForAdmin(@Param('applicationId') applicationId: string) {
    const result = await this.formSessionsService.getFormSessionDetailsForAdmin(applicationId);
    return {
      success: true,
      data: result,
    };
  }
}
