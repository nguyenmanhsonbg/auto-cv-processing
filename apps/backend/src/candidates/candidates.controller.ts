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

type StoredCandidateFile = { filePath: string; isXlsx: boolean };
type UploadProgressStage = 'parsing' | 'analyzing' | 'saving' | 'done' | 'error';
type UploadProgressEmitter = (
  fileIndex: number,
  fileName: string,
  stage: UploadProgressStage,
  extra?: Record<string, unknown>,
) => void;

interface ParsedUploadFiles {
  fileErrors: Array<{ fileName: string; error: string }>;
  rawTexts: string[];
  regexFieldSets: Array<Record<string, unknown>>;
  firstNewFileForFallback: Express.Multer.File | null;
  resumeUrl: string | null;
  profileXlsxUrl: string | null;
}

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
    const { rawTexts, regexFieldSets } = await this.parseStoredCandidateFiles([
      { url: candidate.resumeUrl, isXlsx: false },
      { url: candidate.profileXlsxUrl, isXlsx: true },
    ]);

    const combinedRawText = rawTexts.join('\n\n---\n\n');
    const combinedRegexFields = mergeParsedFields(regexFieldSets);

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

    const uploadContext = await this.resolveUploadContext(candidateId, scope, hasNewPdf, hasNewXlsx);
    const parsedFiles = await this.parseUploadedFiles(
      files,
      emit,
      uploadContext.resumeUrl,
      uploadContext.profileXlsxUrl,
    );

    if (parsedFiles.fileErrors.length === files.length) {
      throw new BadRequestException('Could not parse any of the uploaded files.');
    }

    const complementary = await this.parseComplementaryFiles(uploadContext.complementaryFiles);
    const rawTexts = [...complementary.rawTexts, ...parsedFiles.rawTexts];
    const regexFieldSets = [...complementary.regexFieldSets, ...parsedFiles.regexFieldSets];

    // Phase 2: single AI call on the combined corpus
    emit(lastIdx, lastFileName, 'analyzing');
    const combinedRawText = rawTexts.join('\n\n---\n\n');
    const combinedRegexFields = mergeParsedFields(regexFieldSets);
    const mergedProfile = await this.buildMergedUploadProfile(
      combinedRawText,
      combinedRegexFields,
      parsedFiles.firstNewFileForFallback,
    );

    if (!mergedProfile['name']) {
      mergedProfile['name'] = path.parse(files[0].originalname).name.replace(/[-_.]/g, ' ');
    }

    // Phase 3: upsert a single candidate with the merged profile
    const savingFileName = lastFileName;
    emit(files.length - 1, savingFileName, 'saving');
    const candidate = await this.candidatesService.upsertFromUpload(
      mergedProfile,
      parsedFiles.resumeUrl,
      parsedFiles.profileXlsxUrl,
      req.user.id,
      scope,
      candidateId,
    );

    emit(files.length - 1, savingFileName, 'done', { candidateId: candidate.id, slug: candidate.slug });
    return { candidateId: candidate.id, slug: candidate.slug, errors: parsedFiles.fileErrors };
  }

  @Post('backfill-slugs')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Backfill slugs for existing candidates (admin only)' })
  backfillSlugs() {
    return this.candidatesService.backfillSlugs();
  }

  private async resolveUploadContext(
    candidateId: string | undefined,
    scope: { userId: string; isAdmin: boolean },
    hasNewPdf: boolean,
    hasNewXlsx: boolean,
  ) {
    const complementaryFiles: StoredCandidateFile[] = [];
    let resumeUrl: string | null = null;
    let profileXlsxUrl: string | null = null;

    if (!candidateId) return { complementaryFiles, resumeUrl, profileXlsxUrl };

    try {
      const existing = await this.candidatesService.findByIdOrSlug(candidateId, scope);
      if (!hasNewPdf && existing.resumeUrl) {
        complementaryFiles.push({ filePath: existing.resumeUrl.replace(/^\//, ''), isXlsx: false });
      }
      if (!hasNewXlsx && existing.profileXlsxUrl) {
        complementaryFiles.push({ filePath: existing.profileXlsxUrl.replace(/^\//, ''), isXlsx: true });
      }
      return {
        complementaryFiles,
        resumeUrl: existing.resumeUrl ?? null,
        profileXlsxUrl: existing.profileXlsxUrl ?? null,
      };
    } catch {
      // candidateId not found — fall through to create
      return { complementaryFiles, resumeUrl, profileXlsxUrl };
    }
  }

  private async parseUploadedFiles(
    files: Express.Multer.File[],
    emit: UploadProgressEmitter,
    initialResumeUrl: string | null,
    initialProfileXlsxUrl: string | null,
  ): Promise<ParsedUploadFiles> {
    const result: ParsedUploadFiles = {
      fileErrors: [],
      rawTexts: [],
      regexFieldSets: [],
      firstNewFileForFallback: null,
      resumeUrl: initialResumeUrl,
      profileXlsxUrl: initialProfileXlsxUrl,
    };

    for (const [index, file] of files.entries()) {
      const fileName = file.originalname;

      try {
        emit(index, fileName, 'parsing');
        const parsed = await this.fileParserService.parseFile(file.path);
        this.mergeUploadedFileResult(result, file, parsed as Record<string, unknown>);
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        emit(index, fileName, 'error', { error });
        result.fileErrors.push({ fileName, error });
      }
    }

    return result;
  }

  private mergeUploadedFileResult(
    result: ParsedUploadFiles,
    file: Express.Multer.File,
    parsed: Record<string, unknown>,
  ) {
    const rawText = typeof parsed.rawText === 'string' ? parsed.rawText : '';
    if (rawText) result.rawTexts.push(rawText);
    if (!parsed.error) result.regexFieldSets.push(this.withoutParserMetadata(parsed));
    if (!result.firstNewFileForFallback && !parsed.rawText) result.firstNewFileForFallback = file;

    const fileUrl = `/uploads/${file.filename}`;
    if (['.xlsx', '.xls'].includes(path.extname(file.originalname).toLowerCase())) {
      result.profileXlsxUrl = fileUrl;
    } else {
      result.resumeUrl = fileUrl;
    }
  }

  private withoutParserMetadata(parsed: Record<string, unknown>) {
    const { rawText: _rawText, error: _error, ...fields } = parsed;
    return fields;
  }

  private async parseComplementaryFiles(files: StoredCandidateFile[]) {
    const rawTexts: string[] = [];
    const regexFieldSets: Array<Record<string, unknown>> = [];

    for (const stored of files) {
      try {
        const parsed = await this.fileParserService.parseFile(stored.filePath);
        const rawText: string = (parsed as any).rawText ?? '';
        if (rawText) rawTexts.unshift(rawText);
        if (!(parsed as any).error) {
          const { rawText: _r, error: _e, ...fields } = parsed as Record<string, unknown> & { rawText: string };
          regexFieldSets.unshift(fields);
        }
      } catch {
        // Silently skip if stored file is missing or unreadable
      }
    }

    return { rawTexts, regexFieldSets };
  }

  private async buildMergedUploadProfile(
    combinedRawText: string,
    combinedRegexFields: Record<string, unknown>,
    firstNewFileForFallback: Express.Multer.File | null,
  ): Promise<Record<string, unknown>> {
    if (!combinedRawText && firstNewFileForFallback) {
      const direct = await this.aiService.analyzeFileDirectly(
        firstNewFileForFallback.path,
        firstNewFileForFallback.mimetype,
      );
      return (direct ?? combinedRegexFields) as Record<string, unknown>;
    }

    return (
      (await this.aiService.enrichParsedProfile(combinedRawText, combinedRegexFields))
      ?? combinedRegexFields
    ) as Record<string, unknown>;
  }

  private async parseStoredCandidateFiles(
    files: Array<{ url: string | null; isXlsx: boolean }>,
  ) {
    const rawTexts: string[] = [];
    const regexFieldSets: Array<Record<string, unknown>> = [];

    for (const { url, isXlsx } of files) {
      const parsed = await this.parseStoredCandidateFile(url);
      if (!parsed) continue;
      this.addParsedStoredValue(rawTexts, parsed.rawText, isXlsx);
      if (parsed.fields) this.addParsedStoredValue(regexFieldSets, parsed.fields, isXlsx);
    }

    return { rawTexts, regexFieldSets };
  }

  private async parseStoredCandidateFile(url: string | null) {
    if (!url) return null;
    try {
      const parsed = await this.fileParserService.parseFile(url.replace(/^\//, '')) as Record<string, unknown>;
      return {
        rawText: typeof parsed.rawText === 'string' ? parsed.rawText : '',
        fields: parsed.error ? null : this.withoutParserMetadata(parsed),
      };
    } catch {
      // Silently skip unreadable files
      return null;
    }
  }

  private addParsedStoredValue<T>(values: T[], value: T | null, addToFront: boolean) {
    if (!value) return;
    if (addToFront) values.unshift(value);
    else values.push(value);
  }
}

function mergeParsedFields(fieldSets: Array<Record<string, unknown>>): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const fields of fieldSets) {
    for (const [key, value] of Object.entries(fields)) {
      if (value != null) merged[key] = value;
    }
  }
  return merged;
}
