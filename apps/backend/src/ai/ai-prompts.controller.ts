import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@interview-assistant/shared';
import { AiPromptsService } from './ai-prompts.service';
import { AiService, AVAILABLE_MODELS } from './ai.service';
import { UpdateAiPromptDto } from './dto/update-ai-prompt.dto';

@ApiTags('AI Prompts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('ai-prompts')
export class AiPromptsController {
  constructor(
    private readonly service: AiPromptsService,
    private readonly ai: AiService,
  ) {}

  @Get('models')
  @ApiOperation({ summary: 'Get available AI models' })
  getAvailableModels() {
    return Object.entries(AVAILABLE_MODELS).map(([key, identifier]) => ({
      key,
      identifier,
      family: key.split('-')[1], // 'opus', 'sonnet', or 'haiku'
    }));
  }

  @Get()
  @ApiOperation({ summary: 'List AI prompts (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
  ) {
    return this.service.findPaginated({
      page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined,
      search, sortBy, sortOrder,
    });
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an AI prompt' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAiPromptDto,
  ) {
    const result = await this.service.update(id, dto);
    this.ai.clearPromptCache();
    return result;
  }

  @Post('seed')
  @ApiOperation({ summary: 'Reset all AI prompts to built-in defaults' })
  async seed() {
    const result = await this.service.resetToDefaults();
    this.ai.clearPromptCache();
    return result;
  }
}
