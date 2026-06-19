import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiService } from './ai.service';
import { AiPromptsService } from './ai-prompts.service';
import { AiPromptsController } from './ai-prompts.controller';
import { AiModelOverridesService } from './ai-model-overrides.service';
import { AiModelOverridesController } from './ai-model-overrides.controller';
import { AiPromptEntity } from './entities/ai-prompt.entity';
import { AiModelOverrideEntity } from './entities/ai-model-override.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AiPromptEntity, AiModelOverrideEntity])],
  controllers: [AiPromptsController, AiModelOverridesController],
  providers: [AiService, AiPromptsService, AiModelOverridesService],
  exports: [AiService, AiPromptsService, AiModelOverridesService],
})
export class AiModule {}
