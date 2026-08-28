import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InterviewRoundEntity } from '../entities/interview-round.entity';
import { ApplicationEntity } from '../../applications/entities/application.entity';
import { ApplicationStage, InterviewRoundType, InterviewResult } from '../../recruitment-common';
import { CreateInterviewRoundDto } from '../dto/create-interview-round.dto';
import { UpdateInterviewRoundDto } from '../dto/update-interview-round.dto';

@Injectable()
export class InterviewRoundsService {
  constructor(
    @InjectRepository(InterviewRoundEntity)
    private readonly interviewRoundRepo: Repository<InterviewRoundEntity>,
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepo: Repository<ApplicationEntity>,
  ) {}

  async create(applicationId: string, dto: CreateInterviewRoundDto): Promise<InterviewRoundEntity> {
    // Verify application exists
    const application = await this.applicationRepo.findOne({ where: { id: applicationId } });
    if (!application) {
      throw new NotFoundException('Application not found');
    }

    // Check if round already exists for this application and type
    const existingRound = await this.interviewRoundRepo.findOne({
      where: { applicationId, roundType: dto.roundType },
    });
    if (existingRound) {
      throw new BadRequestException(
        `Interview round ${dto.roundType} already exists for this application`,
      );
    }

    const round = this.interviewRoundRepo.create({
      applicationId,
      roundType: dto.roundType,
      interviewerIds: dto.interviewerIds ?? null,
      externalInterviewerIds: dto.externalInterviewerIds ?? null,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      result: dto.result ?? InterviewResult.PENDING,
      overallGrade: dto.overallGrade ?? null,
      scores: dto.scores ?? null,
      summary: dto.summary ?? null,
      externalRoundId: dto.externalRoundId ?? null,
    });

    const savedRound = await this.interviewRoundRepo.save(round);

    // Scheduling a round is the event that moves the application into that interview stage.
    await this.applicationRepo.update(applicationId, {
      currentStage: dto.roundType === InterviewRoundType.INTERVIEW_1
        ? ApplicationStage.INTERVIEW_1
        : ApplicationStage.INTERVIEW_2,
    });

    return savedRound;
  }

  async findByApplication(applicationId: string): Promise<InterviewRoundEntity[]> {
    return this.interviewRoundRepo.find({
      where: { applicationId },
      order: { createdAt: 'ASC' },
    });
  }

  async findOne(id: string): Promise<InterviewRoundEntity> {
    const round = await this.interviewRoundRepo.findOne({
      where: { id },
      relations: ['application'],
    });
    if (!round) {
      throw new NotFoundException('Interview round not found');
    }
    return round;
  }

  async update(id: string, dto: UpdateInterviewRoundDto): Promise<InterviewRoundEntity> {
    const round = await this.findOne(id);

    // Update fields
    if (dto.startedAt !== undefined) {
      round.startedAt = new Date(dto.startedAt);
    }
    if (dto.completedAt !== undefined) {
      round.completedAt = new Date(dto.completedAt);
    }
    if (dto.result !== undefined) {
      round.result = dto.result;
    }
    if (dto.overallGrade !== undefined) {
      round.overallGrade = dto.overallGrade;
    }
    if (dto.scores !== undefined) {
      round.scores = dto.scores;
    }
    if (dto.summary !== undefined) {
      round.summary = dto.summary;
    }
    if (dto.interviewerIds !== undefined) {
      round.interviewerIds = dto.interviewerIds;
    }
    if (dto.scheduledAt !== undefined) {
      round.scheduledAt = new Date(dto.scheduledAt);
    }

    const savedRound = await this.interviewRoundRepo.save(round);

    // Update application stage if result changed
    if (dto.result !== undefined) {
      await this.updateApplicationStage(round.applicationId, round.roundType, dto.result);
    }

    return savedRound;
  }

  async completeInterview(
    id: string,
    result: InterviewResult,
    overallGrade?: string,
    scores?: Record<string, number>,
    summary?: string,
  ): Promise<InterviewRoundEntity> {
    const round = await this.findOne(id);

    round.startedAt = round.startedAt ?? new Date();
    round.completedAt = new Date();
    round.result = result;
    if (overallGrade) round.overallGrade = overallGrade as any;
    if (scores) round.scores = scores;
    if (summary) round.summary = summary;

    const savedRound = await this.interviewRoundRepo.save(round);

    // Update application stage
    await this.updateApplicationStage(round.applicationId, round.roundType, result);

    return savedRound;
  }

  private async updateApplicationStage(
    applicationId: string,
    roundType: InterviewRoundType,
    result: InterviewResult,
  ): Promise<void> {
    const application = await this.applicationRepo.findOne({ where: { id: applicationId } });
    if (!application) return;

    let newStage: ApplicationStage | null = null;

    switch (roundType) {
      case InterviewRoundType.INTERVIEW_1:
        if (result === InterviewResult.PASS) {
          newStage = ApplicationStage.PRE_TEST_2;
        } else if (result === InterviewResult.FAIL || result === InterviewResult.NO_SHOW) {
          newStage = ApplicationStage.REJECTED;
        }
        break;

      case InterviewRoundType.INTERVIEW_2:
        if (result === InterviewResult.PASS) {
          newStage = ApplicationStage.OFFER_PENDING;
        } else if (result === InterviewResult.FAIL || result === InterviewResult.NO_SHOW) {
          newStage = ApplicationStage.REJECTED;
        }
        break;
    }

    if (newStage) {
      await this.applicationRepo.update(applicationId, { currentStage: newStage });
    }
  }

  async delete(id: string): Promise<void> {
    const round = await this.findOne(id);
    await this.interviewRoundRepo.remove(round);
  }
}
