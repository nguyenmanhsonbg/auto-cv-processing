import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { UserRole } from '@interview-assistant/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { EvaluationsService } from './evaluations.service';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { UpdateEvaluationDto } from './dto/update-evaluation.dto';
import { AiEvaluationSuggestion } from '@interview-assistant/shared';

@ApiTags('Evaluations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('evaluations')
export class EvaluationsController {
  constructor(private readonly evaluationsService: EvaluationsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERVIEWER)
  @ApiOperation({ summary: 'Create an evaluation for a session' })
  create(@Body() dto: CreateEvaluationDto, @Request() req: any) {
    return this.evaluationsService.create(dto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List all evaluations' })
  findAll() {
    return this.evaluationsService.findAll();
  }

  @Get('by-session/:sessionId')
  @ApiOperation({ summary: 'Get evaluation by session ID' })
  findBySessionId(@Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.evaluationsService.findBySessionId(sessionId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an evaluation by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.evaluationsService.findOne(id);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERVIEWER)
  @ApiOperation({ summary: 'Update an evaluation' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEvaluationDto,
  ) {
    return this.evaluationsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERVIEWER)
  @ApiOperation({ summary: 'Delete an evaluation' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.evaluationsService.remove(id);
  }

  @Post(':id/generate-ai-summary')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERVIEWER)
  @ApiOperation({ summary: 'Generate AI summary for an evaluation using Claude' })
  generateAiSummary(@Param('id', ParseUUIDPipe) id: string) {
    return this.evaluationsService.generateAiSummary(id);
  }

  @Post(':id/generate-ai-evaluation')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERVIEWER)
  @ApiOperation({ summary: 'AI-analyze session Q&A and suggest BM04 ratings (does not save)' })
  generateAiEvaluation(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AiEvaluationSuggestion> {
    return this.evaluationsService.generateAiEvaluation(id);
  }
}
