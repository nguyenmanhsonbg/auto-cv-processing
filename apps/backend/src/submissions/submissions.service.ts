import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubmissionStatus } from '@interview-assistant/shared';
import { CodeSubmissionEntity } from './entities/code-submission.entity';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { runInSandbox } from './sandbox-runner';
import { SessionQuestionEntity } from '../sessions/entities/session-question.entity';
import { InterviewWebSocketGateway } from '../websocket/websocket.gateway';

const SUPPORTED_LANGUAGES = ['javascript', 'typescript'];

@Injectable()
export class SubmissionsService {
  constructor(
    @InjectRepository(CodeSubmissionEntity)
    private readonly submissionRepo: Repository<CodeSubmissionEntity>,
    @InjectRepository(SessionQuestionEntity)
    private readonly sqRepo: Repository<SessionQuestionEntity>,
    private readonly wsGateway: InterviewWebSocketGateway,
  ) {}

  async create(dto: CreateSubmissionDto): Promise<CodeSubmissionEntity> {
    const submission = this.submissionRepo.create({
      ...dto,
      status: SubmissionStatus.PENDING,
    });
    const saved = await this.submissionRepo.save(submission);
    // Run asynchronously - don't block the HTTP response.
    this.runCode(saved.id).catch(() => {});
    return saved;
  }

  async runCode(submissionId: string): Promise<void> {
    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
      relations: ['sessionQuestion', 'sessionQuestion.question'],
    });
    if (!submission) return;

    const lang = submission.language?.toLowerCase();
    if (!SUPPORTED_LANGUAGES.includes(lang)) {
      // Mark as not runnable but leave PENDING for display.
      return;
    }

    const testCases: { input: string; expectedOutput: string; description?: string }[] =
      submission.sessionQuestion?.question?.testCases || [];

    if (testCases.length === 0) {
      await this.submissionRepo.update(submissionId, { status: SubmissionStatus.PASSED, results: [] });
      return;
    }

    const results: Record<string, unknown>[] = [];
    let passed = 0;

    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      const start = Date.now();
      try {
        const actual = await runInSandbox(submission.code, tc.input);
        const runtime = Date.now() - start;
        const ok = actual === tc.expectedOutput.trim();
        if (ok) passed++;
        results.push({
          testCaseIndex: i,
          passed: ok,
          input: tc.input,
          expected: tc.expectedOutput,
          actual,
          runtime,
        });
      } catch (err: any) {
        results.push({
          testCaseIndex: i,
          passed: false,
          input: tc.input,
          expected: tc.expectedOutput,
          actual: null,
          error: err.message,
          runtime: Date.now() - start,
        });
      }
    }

    const status =
      passed === testCases.length
        ? SubmissionStatus.PASSED
        : passed > 0
          ? SubmissionStatus.PARTIAL
          : SubmissionStatus.FAILED;

    await this.submissionRepo.update(submissionId, { status, results: results as any });

    const sessionId = submission.sessionQuestion?.sessionId;
    if (sessionId) {
      this.wsGateway.emitCodeExecutionCompleted(sessionId, {
        sessionQuestionId: submission.sessionQuestionId,
        submissionId: submission.id,
        status,
      });
    }
  }

  async findAll(): Promise<CodeSubmissionEntity[]> {
    return this.submissionRepo.find({
      relations: ['sessionQuestion', 'sessionQuestion.question'],
      order: { submittedAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<CodeSubmissionEntity> {
    const submission = await this.submissionRepo.findOne({
      where: { id },
      relations: ['sessionQuestion', 'sessionQuestion.question'],
    });
    if (!submission) throw new BadRequestException(`Submission ${id} not found`);
    return submission;
  }

  async findBySessionQuestionId(sessionQuestionId: string): Promise<CodeSubmissionEntity[]> {
    return this.submissionRepo.find({
      where: { sessionQuestionId },
      relations: ['sessionQuestion', 'sessionQuestion.question'],
      order: { submittedAt: 'DESC' },
    });
  }

  async remove(id: string): Promise<void> {
    const submission = await this.findOne(id);
    await this.submissionRepo.remove(submission);
  }
}
