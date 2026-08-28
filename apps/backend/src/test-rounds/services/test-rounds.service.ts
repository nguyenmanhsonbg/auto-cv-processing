import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TestRoundEntity } from '../entities/test-round.entity';
import { ApplicationEntity } from '../../applications/entities/application.entity';
import { ApplicationStage, TestRoundType, TestResult } from '../../recruitment-common';
import { CreateTestRoundDto } from '../dto/create-test-round.dto';
import { UpdateTestRoundDto } from '../dto/update-test-round.dto';

@Injectable()
export class TestRoundsService {
  constructor(
    @InjectRepository(TestRoundEntity)
    private readonly testRoundRepo: Repository<TestRoundEntity>,
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepo: Repository<ApplicationEntity>,
  ) {}

  async create(applicationId: string, dto: CreateTestRoundDto): Promise<TestRoundEntity> {
    // Verify application exists
    const application = await this.applicationRepo.findOne({ where: { id: applicationId } });
    if (!application) {
      throw new NotFoundException('Application not found');
    }

    // Check if round already exists
    const existingRound = await this.testRoundRepo.findOne({
      where: { applicationId, roundType: dto.roundType },
    });
    if (existingRound) {
      throw new BadRequestException(
        `Test round ${dto.roundType} already exists for this application`,
      );
    }

    const round = this.testRoundRepo.create({
      applicationId,
      roundType: dto.roundType,
      testType: dto.testType ?? null,
      assignedAt: dto.assignedAt ? new Date(dto.assignedAt) : null,
      deadlineAt: dto.deadlineAt ? new Date(dto.deadlineAt) : null,
      passingScore: dto.passingScore ?? null,
      externalTestId: dto.externalTestId ?? null,
      result: TestResult.PENDING,
    });

    const savedRound = await this.testRoundRepo.save(round);

    // Assigning a test is the event that moves the application into that test stage.
    await this.applicationRepo.update(applicationId, {
      currentStage: dto.roundType === TestRoundType.PRE_TEST_1
        ? ApplicationStage.PRE_TEST_1
        : ApplicationStage.PRE_TEST_2,
    });

    return savedRound;
  }

  async findByApplication(applicationId: string): Promise<TestRoundEntity[]> {
    return this.testRoundRepo.find({
      where: { applicationId },
      order: { createdAt: 'ASC' },
    });
  }

  async findOne(id: string): Promise<TestRoundEntity> {
    const round = await this.testRoundRepo.findOne({
      where: { id },
      relations: ['application'],
    });
    if (!round) {
      throw new NotFoundException('Test round not found');
    }
    return round;
  }

  async update(id: string, dto: UpdateTestRoundDto): Promise<TestRoundEntity> {
    const round = await this.findOne(id);

    if (dto.assignedAt !== undefined) {
      round.assignedAt = new Date(dto.assignedAt);
    }
    if (dto.submittedAt !== undefined) {
      round.submittedAt = new Date(dto.submittedAt);
    }
    if (dto.evaluatedAt !== undefined) {
      round.evaluatedAt = new Date(dto.evaluatedAt);
    }
    if (dto.result !== undefined) {
      round.result = dto.result;
    }
    if (dto.score !== undefined) {
      round.score = dto.score;
    }
    if (dto.comment !== undefined) {
      round.comment = dto.comment;
    }

    const savedRound = await this.testRoundRepo.save(round);

    // Auto-evaluate based on score if passingScore is set
    if (dto.result === undefined && round.passingScore !== null && dto.score !== undefined) {
      round.result = dto.score >= (round.passingScore ?? 0) ? TestResult.PASS : TestResult.FAIL;
      const evaluatedRound = await this.testRoundRepo.save(round);
      await this.updateApplicationStage(round.applicationId, round.roundType, evaluatedRound.result as TestResult);
      return evaluatedRound;
    }

    // Update application stage if result changed
    if (dto.result !== undefined) {
      await this.updateApplicationStage(round.applicationId, round.roundType, dto.result);
    }

    return savedRound;
  }

  async submitTest(id: string, score?: number): Promise<TestRoundEntity> {
    const round = await this.findOne(id);

    round.submittedAt = new Date();
    if (score !== undefined) {
      round.score = score;
      if (round.passingScore !== null) {
        round.result = score >= (round.passingScore ?? 0) ? TestResult.PASS : TestResult.FAIL;
      }
    }

    const savedRound = await this.testRoundRepo.save(round);
    if (savedRound.result && savedRound.result !== TestResult.PENDING) {
      await this.updateApplicationStage(savedRound.applicationId, savedRound.roundType, savedRound.result);
    }
    return savedRound;
  }

  async evaluateTest(id: string, score: number, result: TestResult, comment?: string): Promise<TestRoundEntity> {
    const round = await this.findOne(id);

    round.evaluatedAt = new Date();
    round.score = score;
    round.result = result;
    if (comment) {
      round.comment = comment;
    }

    const savedRound = await this.testRoundRepo.save(round);

    // Update application stage
    await this.updateApplicationStage(round.applicationId, round.roundType, result);

    return savedRound;
  }

  private async updateApplicationStage(
    applicationId: string,
    roundType: TestRoundType,
    result: TestResult,
  ): Promise<void> {
    const application = await this.applicationRepo.findOne({ where: { id: applicationId } });
    if (!application) return;

    let newStage: ApplicationStage | null = null;

    switch (roundType) {
      case TestRoundType.PRE_TEST_1:
        if (result === TestResult.PASS) {
          newStage = ApplicationStage.INTERVIEW_1;
        } else if (result === TestResult.FAIL || result === TestResult.NO_SUBMIT) {
          newStage = ApplicationStage.REJECTED;
        }
        break;

      case TestRoundType.PRE_TEST_2:
        if (result === TestResult.PASS) {
          newStage = ApplicationStage.INTERVIEW_2;
        } else if (result === TestResult.FAIL || result === TestResult.NO_SUBMIT) {
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
    await this.testRoundRepo.remove(round);
  }
}
