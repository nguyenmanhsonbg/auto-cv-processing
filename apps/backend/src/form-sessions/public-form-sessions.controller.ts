import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseFilters,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags, ApiResponse } from '@nestjs/swagger';
import { FormSessionsService } from './form-sessions.service';

@ApiTags('Public Forms')
@Controller('public/form-sessions')
export class PublicFormSessionsController {
  constructor(private readonly formSessionsService: FormSessionsService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Get questionnaire form details for candidate' })
  @ApiParam({ name: 'token', description: 'Form session plain token' })
  async getForm(@Param('token') token: string) {
    const data = await this.formSessionsService.getFormSessionByToken(token);
    return {
      success: true,
      data,
    };
  }

  @Post(':token/submit')
  @ApiOperation({ summary: 'Submit answers for questionnaire form' })
  @ApiParam({ name: 'token', description: 'Form session plain token' })
  async submitForm(
    @Param('token') token: string,
    @Body() body: { answers: { questionSetItemId: string; answer: Record<string, any> }[] },
  ) {
    const result = await this.formSessionsService.submitAnswers(token, body.answers);
    return {
      success: true,
      data: result,
    };
  }
}
