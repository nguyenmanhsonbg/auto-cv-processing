import * as path from 'path';
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  ParseUUIDPipe,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { CandidateLevel, UserRole } from '@interview-assistant/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CandidatesService } from './candidates.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { AssignCandidateDto } from './dto/assign-candidate.dto';
import { FileParserService } from '../file-parser/file-parser.service';
import { AiService } from '../ai/ai.service';
import { InterviewWebSocketGateway } from '../websocket/websocket.gateway';

@ApiTags('Candidates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('candidates')
export class CandidatesController {
  constructor(
    private readonly candidatesService: CandidatesService,
    private readonly fileParserService: FileParserService,
    private readonly aiService: AiService,
    private readonly wsGateway: InterviewWebSocketGateway,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new candidate' })
  create(@Body() dto: CreateCandidateDto, @Request() req: any) {
    return this.candidatesService.create(dto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List candidates (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'level', enum: CandidateLevel, required: false })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('level') level?: CandidateLevel,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
    @Request() req?: any,
  ) {
    const role = req?.user?.role;
    const isAdmin = role === UserRole.ADMIN;
    return this.candidatesService.findPaginated(
      { page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined, search, level, sortBy, sortOrder },
      { userId: req?.user?.id, isAdmin },
    );
  }

  @Get(':idOrSlug')
  @ApiOperation({ summary: 'Get a candidate by ID or slug' })
  findOne(@Param('idOrSlug') idOrSlug: string, @Request() req: any) {
    const role = req?.user?.role;
    const isAdmin = role === UserRole.ADMIN;
    return this.candidatesService.findByIdOrSlug(idOrSlug, { userId: req?.user?.id, isAdmin });
  }

  @Put(':idOrSlug')
  @ApiOperation({ summary: 'Update a candidate' })
  async update(
    @Param('idOrSlug') idOrSlug: string,
    @Body() dto: UpdateCandidateDto,
    @Request() req: any,
  ) {
    const isAdmin = req?.user?.role === 'ADMIN';
    const candidate = await this.candidatesService.findByIdOrSlug(idOrSlug, { userId: req?.user?.id, isAdmin });
    return this.candidatesService.update(candidate.id, dto, { userId: req?.user?.id, isAdmin });
  }

  @Patch(':idOrSlug/assign')
  @ApiOperation({ summary: 'Set assignees for a candidate (creator or admin only)' })
  async assign(
    @Param('idOrSlug') idOrSlug: string,
    @Body() dto: AssignCandidateDto,
    @Request() req: any,
  ) {
    const isAdmin = req?.user?.role === UserRole.ADMIN;
    const candidate = await this.candidatesService.findByIdOrSlug(idOrSlug, { userId: req?.user?.id, isAdmin });
    return this.candidatesService.assign(candidate.id, dto.userIds, { userId: req?.user?.id, isAdmin });
  }

  @Delete(':idOrSlug')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.INTERVIEWER)
  @ApiOperation({ summary: 'Delete a candidate' })
  async remove(@Param('idOrSlug') idOrSlug: string, @Request() req: any) {
    const isAdmin = req?.user?.role === 'ADMIN';
    const candidate = await this.candidatesService.findByIdOrSlug(idOrSlug, { userId: req?.user?.id, isAdmin });
    return this.candidatesService.remove(candidate.id, { userId: req?.user?.id, isAdmin });
  }

  /**
   * Re-analyze an existing candidate using their already-stored files.
   * Re-parses resumeUrl and/or profileXlsxUrl, then runs the AI enrichment again.
   * Useful when the AI prompt has been updated or when a previous analysis was incomplete.
   * Emits real-time CANDIDATE_ANALYZE_PROGRESS WebSocket events to the given socketId.
   */
  @Post(':idOrSlug/analyze')
  @ApiOperation({ summary: 'Re-analyze a candidate using their stored files' })
  async reanalyze(
    @Param('idOrSlug') idOrSlug: string,
    @Body('socketId') socketId: string | undefined,
    @Request() req: any,
  ) {
    const emit = (stage: 'parsing' | 'analyzing' | 'saving' | 'done' | 'error', error?: string) => {
      if (socketId) this.wsGateway.emitAnalyzeProgress(socketId, { stage, ...(error ? { error } : {}) });
    };

    const isAdmin = req?.user?.role === UserRole.ADMIN;
    const scope = { userId: req?.user?.id, isAdmin };
    const candidate = await this.candidatesService.findByIdOrSlug(idOrSlug, scope);

    if (!candidate.resumeUrl && !candidate.profileXlsxUrl) {
      throw new BadRequestException('No stored files found to re-analyze.');
    }

    await this.candidatesService.setAnalyzeStatus(candidate.id, 'analyzing');
    emit('parsing');
    const rawTexts: string[] = [];
    const regexFieldSets: Array<Record<string, unknown>> = [];

    for (const { url, isXlsx } of [
      { url: candidate.resumeUrl, isXlsx: false },
      { url: candidate.profileXlsxUrl, isXlsx: true },
    ]) {
      if (!url) continue;
      try {
        const parsed = await this.fileParserService.parseFile(url.replace(/^\//, ''));
        const rawText: string = (parsed as any).rawText ?? '';
        if (rawText) {
          if (isXlsx) rawTexts.unshift(rawText);
          else rawTexts.push(rawText);
        }
        if (!(parsed as any).error) {
          const { rawText: _r, error: _e, ...fields } = parsed as Record<string, unknown> & { rawText: string };
          if (isXlsx) regexFieldSets.unshift(fields);
          else regexFieldSets.push(fields);
        }
      } catch {
        // Silently skip unreadable files
      }
    }

    const combinedRawText = rawTexts.join('\n\n---\n\n');
    const combinedRegexFields: Record<string, unknown> = {};
    for (const fields of regexFieldSets) {
      for (const [key, value] of Object.entries(fields)) {
        if (value != null) combinedRegexFields[key] = value;
      }
    }

    if (!combinedRawText) {
      await this.candidatesService.setAnalyzeStatus(candidate.id, 'idle');
      emit('error', 'Could not extract text from stored files.');
      throw new BadRequestException('Could not extract text from stored files.');
    }

    emit('analyzing');
    const enriched = await this.aiService.enrichParsedProfile(combinedRawText, combinedRegexFields);
    if (!enriched) {
      await this.candidatesService.setAnalyzeStatus(candidate.id, 'idle');
      emit('error', 'AI enrichment returned no result.');
      throw new BadRequestException('AI enrichment returned no result.');
    }

    // Run anomaly detection on the enriched profile (graceful degradation if fails)
    const anomalyDetection = await this.aiService.detectProfileAnomalies(enriched);
    if (anomalyDetection) {
      enriched.anomalyDetection = anomalyDetection;
    }

    emit('saving');
    const result = await this.candidatesService.updateParsedProfile(candidate.id, enriched as Record<string, unknown>);
    await this.candidatesService.setAnalyzeStatus(candidate.id, 'idle');
    emit('done');
    return result;
  }

  /**
   * Unified file upload endpoint. All uploaded files (plus any existing complementary
   * file already stored on the candidate) are parsed together, combined into a single
   * raw-text corpus, and fed to the AI in ONE call — so the model sees the full picture.
   * The result is upserted onto ONE candidate:
   *   - If candidateId is provided → always updates that candidate.
   *   - Otherwise, upserts by extracted email (updates if found, creates if not).
   * Emits real-time UPLOAD_PROGRESS WebSocket events to the given socketId.
   */
  @Post('upload')
  @ApiOperation({ summary: 'Upload profile files — all files merged into one candidate; upserts by email if no candidateId' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
        socketId: { type: 'string' },
        candidateId: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 20))
  async uploadProfiles(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('socketId') socketId: string | undefined,
    @Body('candidateId') candidateId: string | undefined,
    @Request() req: any,
  ) {
    if (!files?.length) throw new BadRequestException('No files uploaded.');
    const role = req.user.role;
    const scope = { userId: req.user.id, isAdmin: role === UserRole.ADMIN };
    const totalFiles = files.length;
    const lastIdx = files.length - 1;
    const lastFileName = files[lastIdx].originalname;

    const emit = (fileIndex: number, fileName: string, stage: 'parsing' | 'analyzing' | 'saving' | 'done' | 'error', extra: Record<string, unknown> = {}) => {
      if (socketId) {
        this.wsGateway.emitUploadProgress(socketId, { fileIndex, fileName, stage, totalFiles, ...extra });
      }
    };

    // Determine which file types the new uploads cover
    const isXlsxExt = (name: string) => ['.xlsx', '.xls'].includes(path.extname(name).toLowerCase());
    const hasNewPdf  = files.some(f => !isXlsxExt(f.originalname));
    const hasNewXlsx = files.some(f =>  isXlsxExt(f.originalname));

    // If updating an existing candidate, pull their complementary stored file so the AI
    // sees both document types at once.
    type StoredFile = { filePath: string; isXlsx: boolean };
    const complementaryFiles: StoredFile[] = [];
    let resumeUrl: string | null = null;
    let profileXlsxUrl: string | null = null;

    if (candidateId) {
      try {
        const existing = await this.candidatesService.findByIdOrSlug(candidateId, scope);
        if (!hasNewPdf && existing.resumeUrl) {
          complementaryFiles.push({ filePath: existing.resumeUrl.replace(/^\//, ''), isXlsx: false });
        }
        if (!hasNewXlsx && existing.profileXlsxUrl) {
          complementaryFiles.push({ filePath: existing.profileXlsxUrl.replace(/^\//, ''), isXlsx: true });
        }
        // Preserve existing URLs for types not being replaced
        resumeUrl = existing.resumeUrl ?? null;
        profileXlsxUrl = existing.profileXlsxUrl ?? null;
      } catch {
        // candidateId not found — will fall through to create
      }
    }

    // Phase 1: parse each NEW file (emit progress per file) and collect raw corpora
    const fileErrors: Array<{ fileName: string; error: string }> = [];
    const rawTexts: string[] = [];
    const regexFieldSets: Array<Record<string, unknown>> = [];
    // Track which new-file direct-analysis fallback to use if all text extraction fails
    let firstNewFileForFallback: Express.Multer.File | null = null;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = file.originalname;
      const ext = path.extname(fileName).toLowerCase();

      try {
        emit(i, fileName, 'parsing');
        const parsed = await this.fileParserService.parseFile(file.path);
        const rawText: string = (parsed as any).rawText ?? '';
        if (rawText) rawTexts.push(rawText);
        if (!(parsed as any).error) {
          const { rawText: _r, error: _e, ...fields } = parsed as Record<string, unknown> & { rawText: string };
          regexFieldSets.push(fields);
        }
        if (!firstNewFileForFallback && !(parsed as any).rawText) {
          firstNewFileForFallback = file;
        }

        // Track new file URLs
        if (ext === '.xlsx' || ext === '.xls') profileXlsxUrl = `/uploads/${file.filename}`;
        else resumeUrl = `/uploads/${file.filename}`;
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        emit(i, fileName, 'error', { error });
        fileErrors.push({ fileName, error });
      }
    }

    if (fileErrors.length === files.length) {
      throw new BadRequestException('Could not parse any of the uploaded files.');
    }

    // Phase 1b: silently parse complementary existing files (no progress events — internal enrichment)
    for (const stored of complementaryFiles) {
      try {
        const parsed = await this.fileParserService.parseFile(stored.filePath);
        const rawText: string = (parsed as any).rawText ?? '';
        if (rawText) rawTexts.unshift(rawText); // existing file goes first (lower priority on merge)
        if (!(parsed as any).error) {
          const { rawText: _r, error: _e, ...fields } = parsed as Record<string, unknown> & { rawText: string };
          regexFieldSets.unshift(fields);
        }
      } catch {
        // Silently skip if stored file is missing or unreadable
      }
    }

    // Phase 2: single AI call on the combined corpus
    emit(lastIdx, lastFileName, 'analyzing');
    const combinedRawText = rawTexts.join('\n\n---\n\n');
    const combinedRegexFields: Record<string, unknown> = {};
    for (const fields of regexFieldSets) {
      for (const [key, value] of Object.entries(fields)) {
        if (value != null) combinedRegexFields[key] = value;
      }
    }

    let mergedProfile: Record<string, unknown>;
    if (!combinedRawText && firstNewFileForFallback) {
      // All text extraction failed — try direct document analysis on first new file
      const direct = await this.aiService.analyzeFileDirectly(firstNewFileForFallback.path, firstNewFileForFallback.mimetype);
      mergedProfile = (direct ?? combinedRegexFields) as Record<string, unknown>;
    } else {
      mergedProfile = ((await this.aiService.enrichParsedProfile(combinedRawText, combinedRegexFields)) ?? combinedRegexFields) as Record<string, unknown>;
    }

    if (!mergedProfile['name']) {
      mergedProfile['name'] = path.parse(files[0].originalname).name.replace(/[-_.]/g, ' ');
    }

    // Phase 3: upsert a single candidate with the merged profile
    const savingFileName = lastFileName;
    emit(files.length - 1, savingFileName, 'saving');
    const candidate = await this.candidatesService.upsertFromUpload(
      mergedProfile,
      resumeUrl,
      profileXlsxUrl,
      req.user.id,
      scope,
      candidateId,
    );

    emit(files.length - 1, savingFileName, 'done', { candidateId: candidate.id, slug: candidate.slug });
    return { candidateId: candidate.id, slug: candidate.slug, errors: fileErrors };
  }

  @Post('backfill-slugs')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Backfill slugs for existing candidates (admin only)' })
  backfillSlugs() {
    return this.candidatesService.backfillSlugs();
  }
}
