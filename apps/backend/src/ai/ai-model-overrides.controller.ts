import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@interview-assistant/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PROMPT_DEFAULTS } from './ai-prompts.defaults';
import { AiPromptsService } from './ai-prompts.service';
import { AiModelOverridesService } from './ai-model-overrides.service';
import { AiService, AVAILABLE_MODELS } from './ai.service';
import { UpdateAiModelOverrideDto } from './dto/update-ai-model-override.dto';

@ApiTags('AI Model Overrides')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('ai-model-overrides')
export class AiModelOverridesController {
  constructor(
    private readonly overrides: AiModelOverridesService,
    private readonly prompts: AiPromptsService,
    private readonly ai: AiService,
  ) {}

  @Get('models')
  @ApiOperation({ summary: 'Get available AI models' })
  getAvailableModels() {
    return Object.entries(AVAILABLE_MODELS).map(([key, identifier]) => ({
      key,
      identifier,
      family: key.split('-')[1],
    }));
  }

  @Get()
  @ApiOperation({
    summary: 'List all prompts with their current model override (null if none)',
  })
  async list() {
    const [prompts, overrides] = await Promise.all([
      this.prompts.findAll(),
      this.overrides.findAll(),
    ]);
    const byKey = new Map(overrides.map((o) => [o.promptKey, o]));
    return prompts.map((p) => {
      const override = byKey.get(p.key);
      const defaultModel = PROMPT_DEFAULTS[p.key as keyof typeof PROMPT_DEFAULTS]?.model ?? null;
      return {
        promptKey: p.key,
        name: p.name,
        description: p.description,
        model: override?.model ?? null,
        defaultModel,
        updatedAt: override?.updatedAt ?? null,
      };
    });
  }

  @Put(':promptKey')
  @ApiOperation({ summary: 'Set or update the model override for a prompt' })
  async upsert(
    @Param('promptKey') promptKey: string,
    @Body() dto: UpdateAiModelOverrideDto,
  ) {
    const result = await this.overrides.upsert(promptKey, dto.model);
    this.ai.clearPromptCache();
    return result;
  }

  @Delete(':promptKey')
  @ApiOperation({ summary: 'Remove a model override, falling back to the prompt default' })
  async remove(@Param('promptKey') promptKey: string) {
    await this.overrides.remove(promptKey);
    this.ai.clearPromptCache();
    return { promptKey };
  }

  @Post('reset')
  @ApiOperation({ summary: 'Clear all model overrides' })
  async reset() {
    const result = await this.overrides.resetAll();
    this.ai.clearPromptCache();
    return result;
  }
}
