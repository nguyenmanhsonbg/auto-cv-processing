import { BadRequestException, Injectable } from '@nestjs/common';
import { CandidateLevel } from '@interview-assistant/shared';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { CandidateEntity } from '../candidates/entities/candidate.entity';
import { InterviewRoundEntity } from '../interview-rounds/entities/interview-round.entity';
import { JobPostingEntity } from '../job-postings/entities/job-posting.entity';
import { OfferEntity } from '../offers/entities/offer.entity';
import {
  ApplicationStage,
  ApplicationSourceType,
  ApplicationStatus,
  ContractType,
  InterviewGrade,
  InterviewResult,
  InterviewRoundType,
  OfferStatus,
  RecruitmentChannel,
} from '../recruitment-common';
import { RecruitmentImportParser } from './recruitment-import.parser';
import { ImportRow, ImportSummary, ParsedImportRow } from './recruitment-import.types';

@Injectable()
export class RecruitmentImportService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly parser: RecruitmentImportParser,
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepo: Repository<ApplicationEntity>,
    @InjectRepository(CandidateEntity)
    private readonly candidateRepo: Repository<CandidateEntity>,
    @InjectRepository(InterviewRoundEntity)
    private readonly interviewRoundRepo: Repository<InterviewRoundEntity>,
    @InjectRepository(JobPostingEntity)
    private readonly jobPostingRepo: Repository<JobPostingEntity>,
    @InjectRepository(OfferEntity)
    private readonly offerRepo: Repository<OfferEntity>,
  ) {}

  async importWorkbook(buffer: Buffer, actorId: string): Promise<ImportSummary> {
    const workbook = await this.parser.parse(buffer);
    this.validateWorkbook(workbook);

    return this.dataSource.transaction(async (manager) => {
      const candidateKeys = new Map<string, CandidateEntity>();
      const applicationKeys = new Map<string, ApplicationEntity>();
      const summary: ImportSummary = {
        candidates: workbook.candidates.length,
        applications: workbook.applications.length,
        interviewRounds: workbook.interviewRounds.length,
        offers: workbook.offers.length,
        created: 0,
        updated: 0,
      };

      for (const row of workbook.candidates) {
        const result = await this.upsertCandidate(manager, row);
        candidateKeys.set(this.required(row, 'candidate_key'), result.entity);
        result.created ? summary.created++ : summary.updated++;
      }

      for (const row of workbook.applications) {
        const result = await this.upsertApplication(
          manager,
          row,
          candidateKeys,
        );
        applicationKeys.set(this.required(row, 'application_key'), result.entity);
        result.created ? summary.created++ : summary.updated++;
      }

      for (const row of workbook.interviewRounds) {
        const application = applicationKeys.get(this.required(row, 'application_key'));
        if (!application) {
          throw this.rowError('interview_rounds', row, 'application_key', 'application reference not found');
        }
        const result = await this.upsertInterviewRound(manager, row, application.id);
        result.created ? summary.created++ : summary.updated++;
      }

      for (const row of workbook.offers) {
        const application = applicationKeys.get(this.required(row, 'application_key'));
        if (!application) {
          throw this.rowError('offers', row, 'application_key', 'application reference not found');
        }
        const result = await this.upsertOffer(manager, row, application, actorId);
        result.created ? summary.created++ : summary.updated++;
      }

      return summary;
    });
  }

  private validateWorkbook(workbook: {
    candidates: ParsedImportRow[];
    applications: ParsedImportRow[];
    interviewRounds: ParsedImportRow[];
    offers: ParsedImportRow[];
  }) {
    const candidateKeys = this.uniqueKeys(workbook.candidates, 'candidate_key', 'candidates');
    const applicationKeys = this.uniqueKeys(workbook.applications, 'application_key', 'applications');

    for (const row of workbook.candidates) {
      this.required(row, 'candidate_key', 'candidates');
      this.required(row, 'name', 'candidates');
      const birthYear = this.optionalNumber(row, 'birth_year', 'candidates');
      if (birthYear !== null && (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > 2100)) {
        throw this.rowError('candidates', row, 'birth_year', 'must be a valid year');
      }
      this.optionalEnum(row, 'level', CandidateLevel, 'candidates');
    }

    for (const row of workbook.applications) {
      const candidateKey = this.required(row, 'candidate_key', 'applications');
      if (!candidateKeys.has(candidateKey)) {
        throw this.rowError('applications', row, 'candidate_key', 'candidate reference not found in workbook');
      }
      this.required(row, 'job_posting_id', 'applications');
      this.uuid(row, 'job_posting_id', 'applications');
      this.uuid(row, 'assigned_recruiter_id', 'applications', true);
      this.optionalEnum(row, 'source_channel', RecruitmentChannel, 'applications');
      const stage = this.optionalEnum(row, 'current_stage', ApplicationStage, 'applications');
      this.optionalEnum(row, 'offer_status', OfferStatus, 'applications');
      const hiredAt = this.date(row, 'hired_at', 'applications');
      if (stage === ApplicationStage.HIRED && !hiredAt) {
        throw this.rowError('applications', row, 'hired_at', 'is required when current_stage is HIRED');
      }
      this.date(row, 'created_at', 'applications');
    }

    for (const row of workbook.interviewRounds) {
      const applicationKey = this.required(row, 'application_key', 'interview_rounds');
      if (!applicationKeys.has(applicationKey)) {
        throw this.rowError('interview_rounds', row, 'application_key', 'application reference not found in workbook');
      }
      this.enumValue(row, 'round_type', InterviewRoundType, 'interview_rounds');
      this.optionalEnum(row, 'result', InterviewResult, 'interview_rounds');
      this.optionalEnum(row, 'overall_grade', InterviewGrade, 'interview_rounds');
      this.date(row, 'scheduled_at', 'interview_rounds');
      this.date(row, 'started_at', 'interview_rounds');
      this.date(row, 'completed_at', 'interview_rounds');
      this.jsonObject(row, 'scores_json', 'interview_rounds');
    }

    for (const row of workbook.offers) {
      const applicationKey = this.required(row, 'application_key', 'offers');
      if (!applicationKeys.has(applicationKey)) {
        throw this.rowError('offers', row, 'application_key', 'application reference not found in workbook');
      }
      this.enumValue(row, 'status', OfferStatus, 'offers');
      this.required(row, 'job_title', 'offers');
      const version = this.optionalNumber(row, 'version', 'offers');
      if (version !== null && (!Number.isInteger(version) || version < 1)) {
        throw this.rowError('offers', row, 'version', 'must be a positive integer');
      }
      this.optionalNumber(row, 'gross_salary', 'offers');
      this.optionalEnum(row, 'contract_type', ContractType, 'offers');
      this.date(row, 'sent_at', 'offers');
      this.date(row, 'responded_at', 'offers');
      this.date(row, 'expires_at', 'offers');
    }
  }

  private async upsertCandidate(manager: EntityManager, row: ParsedImportRow) {
    const repo = manager.getRepository(CandidateEntity);
    const email = this.optional(row, 'email')?.toLowerCase() ?? null;
    const phone = this.optional(row, 'phone') ?? null;
    const matches = [
      email ? await repo.findOne({ where: { email } }) : null,
      phone ? await repo.findOne({ where: { phone } }) : null,
    ].filter((candidate): candidate is CandidateEntity => Boolean(candidate));
    const uniqueMatches = [...new Map(matches.map((candidate) => [candidate.id, candidate])).values()];
    if (uniqueMatches.length > 1) {
      throw this.rowError('candidates', row, 'email', 'email and phone match different candidates');
    }

    const entity = uniqueMatches[0] ?? repo.create();
    entity.name = this.required(row, 'name');
    entity.email = email ?? (null as unknown as string);
    entity.phone = phone ?? (null as unknown as string);
    entity.birthYear = (this.optionalNumber(row, 'birth_year', 'candidates') ?? null) as unknown as number;
    entity.position = this.optional(row, 'position') ?? entity.position ?? 'Backend Developer';
    entity.level = (this.optionalEnum(row, 'level', CandidateLevel, 'candidates') ?? entity.level ?? CandidateLevel.ENTRY) as CandidateLevel;
    const saved = await repo.save(entity);
    return { entity: saved, created: !uniqueMatches[0] };
  }

  private async upsertApplication(
    manager: EntityManager,
    row: ParsedImportRow,
    candidateKeys: Map<string, CandidateEntity>,
  ) {
    const repo = manager.getRepository(ApplicationEntity);
    const candidate = candidateKeys.get(this.required(row, 'candidate_key'));
    if (!candidate) throw this.rowError('applications', row, 'candidate_key', 'candidate reference not found');
    const jobPostingId = this.required(row, 'job_posting_id');
    const posting = await manager.getRepository(JobPostingEntity).findOne({ where: { id: jobPostingId } });
    if (!posting) throw this.rowError('applications', row, 'job_posting_id', 'job posting not found');

    const externalId = this.optional(row, 'external_application_id');
    const existingById = this.isUuid(this.optional(row, 'application_key'))
      ? await repo.findOne({ where: { id: this.required(row, 'application_key') } })
      : null;
    const existingByExternal = externalId
      ? await repo.find({ where: { externalApplicationId: externalId } })
      : [];
    if (existingByExternal.length > 1) {
      throw this.rowError('applications', row, 'external_application_id', 'matches multiple applications');
    }

    const entity = existingById ?? existingByExternal[0] ?? repo.create();
    entity.candidateId = candidate.id;
    entity.jobPostingId = posting.id;
    entity.jobDescriptionVersionId = posting.jobDescriptionVersionId;
    entity.source = ApplicationSourceType.MANUAL_IMPORT;
    entity.sourceChannel = (this.optionalEnum(row, 'source_channel', RecruitmentChannel, 'applications') ?? RecruitmentChannel.MANUAL) as RecruitmentChannel;
    entity.externalApplicationId = externalId;
    entity.status = ApplicationStatus.APPLICATION_CREATED;
    entity.currentStage = (this.optionalEnum(row, 'current_stage', ApplicationStage, 'applications') ?? ApplicationStage.APPLIED) as ApplicationStage;
    entity.assignedRecruiterId = this.optional(row, 'assigned_recruiter_id');
    entity.offerStatus = (this.optionalEnum(row, 'offer_status', OfferStatus, 'applications') ?? null) as OfferStatus | null;
    entity.hiredAt = this.date(row, 'hired_at', 'applications');
    const createdAt = this.date(row, 'created_at', 'applications');
    if (createdAt) entity.createdAt = createdAt;
    const saved = await repo.save(entity);
    return { entity: saved, created: !existingById && !existingByExternal[0] };
  }

  private async upsertInterviewRound(manager: EntityManager, row: ParsedImportRow, applicationId: string) {
    const repo = manager.getRepository(InterviewRoundEntity);
    const externalId = this.optional(row, 'external_round_id');
    const existing = externalId
      ? await repo.findOne({ where: { externalRoundId: externalId } })
      : await repo.findOne({ where: { applicationId, roundType: this.required(row, 'round_type') as InterviewRoundType } });
    const entity = existing ?? repo.create();
    entity.applicationId = applicationId;
    entity.roundType = this.required(row, 'round_type') as InterviewRoundType;
    entity.externalRoundId = externalId;
    entity.scheduledAt = this.date(row, 'scheduled_at', 'interview_rounds');
    entity.startedAt = this.date(row, 'started_at', 'interview_rounds');
    entity.completedAt = this.date(row, 'completed_at', 'interview_rounds');
    entity.result = (this.optionalEnum(row, 'result', InterviewResult, 'interview_rounds') ?? InterviewResult.PENDING) as InterviewResult;
    entity.overallGrade = (this.optionalEnum(row, 'overall_grade', InterviewGrade, 'interview_rounds') ?? null) as InterviewGrade | null;
    entity.scores = this.jsonObject(row, 'scores_json', 'interview_rounds');
    entity.summary = this.optional(row, 'summary');
    const saved = await repo.save(entity);
    return { entity: saved, created: !existing };
  }

  private async upsertOffer(manager: EntityManager, row: ParsedImportRow, application: ApplicationEntity, actorId: string) {
    const repo = manager.getRepository(OfferEntity);
    const externalId = this.optional(row, 'external_offer_id');
    const latest = await repo.findOne({ where: { applicationId: application.id }, order: { version: 'DESC' } });
    const version = this.optionalNumber(row, 'version', 'offers') ?? (latest?.version ?? 0) + 1;
    const existing = externalId
      ? await repo.findOne({ where: { externalOfferId: externalId } })
      : await repo.findOne({ where: { applicationId: application.id, version } });
    const entity = existing ?? repo.create();
    entity.applicationId = application.id;
    entity.version = version;
    entity.status = this.required(row, 'status') as OfferStatus;
    entity.jobTitle = this.required(row, 'job_title');
    entity.department = this.optional(row, 'department');
    entity.level = this.optional(row, 'level');
    entity.grossSalary = this.optionalNumber(row, 'gross_salary', 'offers');
    entity.startDate = this.optional(row, 'start_date');
    entity.contractType = (this.optionalEnum(row, 'contract_type', ContractType, 'offers') ?? null) as ContractType | null;
    entity.workLocation = this.optional(row, 'work_location');
    entity.sentAt = this.date(row, 'sent_at', 'offers');
    entity.respondedAt = this.date(row, 'responded_at', 'offers');
    entity.expiresAt = this.date(row, 'expires_at', 'offers');
    entity.notes = this.optional(row, 'notes');
    entity.externalOfferId = externalId;
    entity.hrCreatedById = actorId;
    const saved = await repo.save(entity);

    const status = entity.status as OfferStatus;
    const applicationRepo = manager.getRepository(ApplicationEntity);
    const update: {
      currentStage?: ApplicationStage;
      offerStatus?: OfferStatus;
      hiredAt?: Date | null;
    } = { offerStatus: status };
    if (status === OfferStatus.PENDING) update.currentStage = ApplicationStage.OFFER_PENDING;
    if (status === OfferStatus.SENT) update.currentStage = ApplicationStage.OFFER_SENT;
    if (status === OfferStatus.REVISED) update.currentStage = ApplicationStage.OFFER_REVISED;
    if (status === OfferStatus.ACCEPTED) {
      update.currentStage = ApplicationStage.HIRED;
      update.hiredAt = application.hiredAt ?? entity.respondedAt;
      if (!update.hiredAt) {
        throw this.rowError('offers', row, 'responded_at', 'is required for ACCEPTED offer when application has no hired_at');
      }
    }
    if ([OfferStatus.REJECTED_BY_CANDIDATE, OfferStatus.CANCELLED, OfferStatus.EXPIRED].includes(status)) {
      update.currentStage = ApplicationStage.REJECTED;
    }
    await applicationRepo.update(application.id, update);
    return { entity: saved, created: !existing };
  }

  private uniqueKeys(rows: ParsedImportRow[], field: string, sheet: string) {
    const keys = new Set<string>();
    for (const row of rows) {
      const key = this.required(row, field, sheet);
      if (keys.has(key)) throw this.rowError(sheet, row, field, 'duplicate key in workbook');
      keys.add(key);
    }
    return keys;
  }

  private required(row: ParsedImportRow, field: string, sheet = 'import'): string {
    const value = this.optional(row, field);
    if (!value) throw this.rowError(sheet, row, field, 'is required');
    return value;
  }

  private optional(row: ParsedImportRow, field: string): string | null {
    const value = row.values[field]?.trim();
    return value || null;
  }

  private uuid(row: ParsedImportRow, field: string, sheet: string, optional = false) {
    const value = this.optional(row, field);
    if (!value && optional) return null;
    if (!value || !this.isUuid(value)) throw this.rowError(sheet, row, field, 'must be a UUID');
    return value;
  }

  private isUuid(value: string | null): boolean {
    return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
  }

  private date(row: ParsedImportRow, field: string, sheet: string): Date | null {
    const value = this.optional(row, field);
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw this.rowError(sheet, row, field, 'must be a valid ISO date');
    return parsed;
  }

  private optionalNumber(row: ParsedImportRow, field: string, sheet: string): number | null {
    const value = this.optional(row, field);
    if (!value) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw this.rowError(sheet, row, field, 'must be a number');
    return parsed;
  }

  private enumValue<T extends string>(row: ParsedImportRow, field: string, enumObject: Record<string, T>, sheet: string): T {
    const value = this.required(row, field, sheet);
    if (!Object.values(enumObject).includes(value as T)) {
      throw this.rowError(sheet, row, field, `must be one of ${Object.values(enumObject).join(', ')}`);
    }
    return value as T;
  }

  private optionalEnum<T extends string>(row: ParsedImportRow, field: string, enumObject: Record<string, T>, sheet: string): T | null {
    const value = this.optional(row, field);
    if (!value) return null;
    if (!Object.values(enumObject).includes(value as T)) {
      throw this.rowError(sheet, row, field, `must be one of ${Object.values(enumObject).join(', ')}`);
    }
    return value as T;
  }

  private jsonObject(row: ParsedImportRow, field: string, sheet: string): Record<string, number> | null {
    const value = this.optional(row, field);
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      return parsed as Record<string, number>;
    } catch {
      throw this.rowError(sheet, row, field, 'must be a JSON object');
    }
  }

  private rowError(sheet: string, row: ParsedImportRow, field: string, message: string): BadRequestException {
    return new BadRequestException(`${sheet} row ${row.rowNumber}, ${field}: ${message}`);
  }
}
