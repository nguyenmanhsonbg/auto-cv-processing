import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import * as ejs from 'ejs';

import { FormSessionEntity } from './entities/form-session.entity';
import { FormAnswerEntity } from './entities/form-answer.entity';
import { QuestionSetEntity } from '../questions/entities/question-set.entity';
import { QuestionSetItemEntity } from '../questions/entities/question-set-item.entity';
import { QuestionEntity } from '../questions/entities/question.entity';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { AmisCareerEntity } from '../extension-integration/entities/amis-career.entity';
import { UserEntity } from '../auth/entities/user.entity';
import { MailService } from '../notification/mail.service';

import {
  ApplicationStatus,
  FormSessionStatus,
  QuestionSetStatus,
} from '../recruitment-common';
import { WorkflowStateService } from '../workflow-state/workflow-state.service';

@Injectable()
export class FormSessionsService {
  private readonly logger = new Logger(FormSessionsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly workflowStateService: WorkflowStateService,
    private readonly mailService: MailService,
    @InjectRepository(FormSessionEntity)
    private readonly formSessionRepo: Repository<FormSessionEntity>,
    @InjectRepository(FormAnswerEntity)
    private readonly formAnswerRepo: Repository<FormAnswerEntity>,
    @InjectRepository(QuestionSetEntity)
    private readonly questionSetRepo: Repository<QuestionSetEntity>,
    @InjectRepository(QuestionSetItemEntity)
    private readonly questionSetItemRepo: Repository<QuestionSetItemEntity>,
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepo: Repository<ApplicationEntity>,
  ) {}

  private normalizeString(str: string): string {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .trim();
  }

  private async getQuestionCategoriesForJob(jobTitle: string): Promise<string[]> {
    const defaultCategories = ['SOFT_SKILL', 'PERSONALITY'];
    const normalizedJobTitle = this.normalizeString(jobTitle);

    const careers = await this.dataSource.getRepository(AmisCareerEntity).find({
      where: { isActive: true },
    });

    // Substring / keyword matching
    let matchedCareer = careers.find((career) => {
      const normalizedCareerName = this.normalizeString(career.name);
      return (
        normalizedJobTitle.includes(normalizedCareerName) ||
        normalizedCareerName.includes(normalizedJobTitle)
      );
    });

    // Check IT/Software developer keywords
    if (!matchedCareer) {
      const isItRelated = [
        'cntt',
        'phan mem',
        'software',
        'developer',
        'lap trinh',
        'coder',
        'programmer',
        'tech',
        'it',
      ].some((kw) => normalizedJobTitle.includes(kw));

      if (isItRelated) {
        matchedCareer = careers.find(
          (c) =>
            this.normalizeString(c.name).includes('phan mem') ||
            this.normalizeString(c.name).includes('cntt'),
        );
      }
    }

    if (matchedCareer && matchedCareer.questionCategoryNames?.length) {
      return matchedCareer.questionCategoryNames;
    }

    if (matchedCareer) {
      const normalizedCareerName = this.normalizeString(matchedCareer.name);
      if (
        normalizedCareerName.includes('cntt') ||
        normalizedCareerName.includes('phan mem') ||
        normalizedCareerName.includes('software') ||
        normalizedCareerName.includes('developer') ||
        normalizedCareerName.includes('lap trinh')
      ) {
        return ['BACKEND_MUST', 'BACKEND_SHOULD', ...defaultCategories];
      }
      return defaultCategories;
    }

    const isItRelatedDirectly = [
      'cntt',
      'phan mem',
      'software',
      'developer',
      'lap trinh',
      'coder',
      'programmer',
      'tech',
      'it',
    ].some((kw) => normalizedJobTitle.includes(kw));

    if (isItRelatedDirectly) {
      return ['BACKEND_MUST', 'BACKEND_SHOULD', ...defaultCategories];
    }

    return defaultCategories;
  }

  private async getConfiguredQuestionsForJob(
    manager: DataSource['manager'],
    questionIds?: string[] | null,
  ): Promise<QuestionEntity[]> {
    const uniqueQuestionIds = [...new Set((questionIds ?? []).filter(Boolean))];
    if (uniqueQuestionIds.length === 0) return [];

    const questions = await manager.getRepository(QuestionEntity).find({
      where: { id: In(uniqueQuestionIds), isActive: true },
    });
    const questionById = new Map(questions.map((question) => [question.id, question]));

    return uniqueQuestionIds
      .map((questionId) => questionById.get(questionId))
      .filter((question): question is QuestionEntity => Boolean(question));
  }

  async generateFormSession(applicationId: string, createdById?: string | null) {
    return this.dataSource.transaction(async (manager) => {
      const application = await manager.getRepository(ApplicationEntity).findOne({
        where: { id: applicationId },
        relations: ['candidate', 'jobPosting', 'jobPosting.jobDescription'],
      });

      if (!application) {
        throw new NotFoundException('Application not found');
      }

      const jobPosting = application.jobPosting;
      if (!jobPosting) {
        throw new BadRequestException('Job posting not found for this application');
      }

      // 1. Prefer questions explicitly configured on the AMIS job posting.
      let selectedQuestions = await this.getConfiguredQuestionsForJob(
        manager,
        jobPosting.formQuestionIds,
      );

      if (jobPosting.formQuestionIds?.length && selectedQuestions.length === 0) {
        throw new BadRequestException(
          'Configured questionnaire questions are not active or no longer exist.',
        );
      }

      // Fallback for postings without an explicit question selection.
      if (selectedQuestions.length === 0) {
        const categoryNames = await this.getQuestionCategoriesForJob(jobPosting.title);
        let questions = await manager.getRepository(QuestionEntity).find({
          where: { category: In(categoryNames), isActive: true },
        });

        // Fallback: If no questions match categories, fetch any active questions
        if (questions.length === 0) {
          questions = await manager.getRepository(QuestionEntity).find({
            where: { isActive: true },
          });
        }

        if (questions.length === 0) {
          throw new BadRequestException(
            'No active questions available in the question bank to generate a questionnaire.',
          );
        }

        // Shuffle and take 5 questions for legacy/default postings.
        selectedQuestions = questions
          .sort(() => 0.5 - Math.random())
          .slice(0, 5);
      }

      // Resolve createdById user
      let finalCreatedById = createdById || null;
      if (!finalCreatedById) {
        const firstUser = await manager.getRepository(UserEntity).findOne({
          where: {},
          order: { createdAt: 'ASC' },
        });
        if (firstUser) {
          finalCreatedById = firstUser.id;
        } else {
          throw new BadRequestException('No users available in database to attribute creation.');
        }
      }

      // 2. Create QuestionSet
      const questionSet = manager.create(QuestionSetEntity, {
        name: `Form Questionnaire for ${application.candidate?.name || 'Candidate'} - ${jobPosting.title}`,
        jobDescriptionId: jobPosting.jobDescriptionId,
        jobDescriptionVersionId: jobPosting.jobDescriptionVersionId,
        positionId: jobPosting.jobDescription?.positionId || null,
        levelId: jobPosting.jobDescription?.levelId || null,
        status: QuestionSetStatus.ACTIVE,
        createdById: finalCreatedById,
      });

      const savedSet = await manager.save(QuestionSetEntity, questionSet);

      // Create QuestionSetItems
      const items = selectedQuestions.map((q, idx) =>
        manager.create(QuestionSetItemEntity, {
          questionSetId: savedSet.id,
          questionId: q.id,
          questionTextSnapshot: q.text,
          questionType: q.type,
          orderIndex: idx,
          required: true,
          metadata: null,
        }),
      );

      await manager.save(QuestionSetItemEntity, items);

      // 3. Deactivate any previous CREATED/SENT form sessions for this application
      await manager.getRepository(FormSessionEntity).update(
        { applicationId, status: In([FormSessionStatus.CREATED, FormSessionStatus.SENT]) },
        { status: FormSessionStatus.CANCELLED },
      );

      // 4. Generate plain token and tokenHash
      const plainToken = 'form_' + randomBytes(24).toString('hex');
      const tokenHash = createHash('sha256').update(plainToken).digest('hex');

      // 5-minute expiration window for testing
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      const formSession = manager.create(FormSessionEntity, {
        applicationId,
        questionSetId: savedSet.id,
        tokenHash,
        status: FormSessionStatus.SENT,
        expiresAt,
        sentAt: new Date(),
        openedAt: null,
        submittedAt: null,
      });

      const savedSession = await manager.save(FormSessionEntity, formSession);

      // 5. Update Application Status to FORM_SENT
      await this.workflowStateService.recordStatusTransition(
        {
          applicationId,
          toStatus: ApplicationStatus.FORM_SENT,
          eventType: 'FORM_QUESTIONNAIRE_SENT',
          actorType: 'SYSTEM',
          actorId: finalCreatedById,
          metadata: {
            formSessionId: savedSession.id,
            expiresAt: expiresAt.toISOString(),
          },
        },
        manager,
      );

      // 6. Send actual email to candidate
      const frontendUrl = this.configService.get<string>('FRONTEND_URL');
      const formUrl = `${frontendUrl}/form/${plainToken}`;
      const candidateEmail = application.candidate?.email;
      if (candidateEmail && candidateEmail.includes('@')) {
        const candidateName = application.candidate?.name || 'Ứng viên';
        const jobTitle = jobPosting.title;
        const expirationMinutes = 5;
        const expiresAtFormatted = expiresAt.toLocaleString('vi-VN', {
          timeZone: 'Asia/Ho_Chi_Minh',
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });

        const subject = `[VCS] Khảo sát năng lực ứng tuyển - Vị trí ${jobTitle}`;
        const html = await ejs.renderFile(
          join(__dirname, 'templates', 'form-questionnaire-email.ejs'),
          {
            candidateName,
            jobTitle,
            formUrl,
            expiresAtFormatted,
            expirationMinutes,
          },
        );

        this.mailService.sendMail(candidateEmail, subject, html).catch((mailErr) => {
          this.logger.error(`Failed to send background email: ${mailErr.message}`);
        });
      }

      return {
        formSessionId: savedSession.id,
        plainToken,
        formUrl,
        expiresAt,
        questions: selectedQuestions.map((q) => ({
          id: q.id,
          category: q.category,
          text: q.text,
          type: q.type,
        })),
      };
    });
  }

  async getFormSessionByToken(token: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const session = await this.formSessionRepo.findOne({
      where: { tokenHash },
      relations: [
        'application',
        'application.candidate',
        'application.jobPosting',
        'questionSet',
        'questionSet.items',
        'questionSet.items.question',
      ],
    });

    if (!session) {
      throw new NotFoundException('Questionnaire form not found');
    }

    if (
      session.status === FormSessionStatus.CANCELLED ||
      session.status === FormSessionStatus.SUBMITTED
    ) {
      throw new BadRequestException(`This form is already ${session.status.toLowerCase()}`);
    }

    const now = new Date();
    if (session.expiresAt < now || session.status === FormSessionStatus.EXPIRED) {
      if (session.status !== FormSessionStatus.EXPIRED) {
        session.status = FormSessionStatus.EXPIRED;
        await this.formSessionRepo.save(session);

        await this.workflowStateService.recordStatusTransition({
          applicationId: session.applicationId,
          toStatus: ApplicationStatus.FORM_EXPIRED,
          eventType: 'FORM_QUESTIONNAIRE_EXPIRED',
          actorType: 'SYSTEM',
          metadata: { formSessionId: session.id },
        });
      }
      throw new BadRequestException('This form has expired (5-minute expiration limit exceeded)');
    }

    // Update session status to OPENED if it was SENT
    if (session.status === FormSessionStatus.SENT) {
      session.status = FormSessionStatus.OPENED;
      session.openedAt = now;
      await this.formSessionRepo.save(session);

      await this.workflowStateService.recordStatusTransition({
        applicationId: session.applicationId,
        toStatus: ApplicationStatus.FORM_OPENED,
        eventType: 'FORM_QUESTIONNAIRE_OPENED',
        actorType: 'PUBLIC',
        metadata: { formSessionId: session.id },
      });
    }

    // Sort items by orderIndex
    const sortedItems = (session.questionSet?.items || []).sort(
      (a, b) => a.orderIndex - b.orderIndex,
    );

    return {
      formSessionId: session.id,
      expiresAt: session.expiresAt,
      status: session.status,
      candidateName: session.application?.candidate?.name || 'Candidate',
      jobTitle: session.application?.jobPosting?.title || 'Applied Position',
      questions: sortedItems.map((item) => ({
        questionSetItemId: item.id,
        questionId: item.questionId,
        text: item.questionTextSnapshot,
        type: item.questionType,
        required: item.required,
        options: item.question?.options || null,
      })),
    };
  }

  async submitAnswers(
    token: string,
    answers: { questionSetItemId: string; answer: Record<string, any> }[],
  ) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const session = await this.formSessionRepo.findOne({
      where: { tokenHash },
      relations: ['questionSet', 'questionSet.items'],
    });

    if (!session) {
      throw new NotFoundException('Questionnaire form not found');
    }

    if (session.status === FormSessionStatus.SUBMITTED) {
      throw new BadRequestException('Form has already been submitted');
    }

    const now = new Date();
    if (session.expiresAt < now) {
      session.status = FormSessionStatus.EXPIRED;
      await this.formSessionRepo.save(session);

      await this.workflowStateService.recordStatusTransition({
        applicationId: session.applicationId,
        toStatus: ApplicationStatus.FORM_EXPIRED,
        eventType: 'FORM_QUESTIONNAIRE_EXPIRED',
        actorType: 'SYSTEM',
        metadata: { formSessionId: session.id },
      });

      throw new BadRequestException('This form has expired and cannot be submitted');
    }

    // Validate required answers
    const items = session.questionSet?.items || [];
    for (const item of items) {
      if (item.required) {
        const provided = answers.find((ans) => ans.questionSetItemId === item.id);
        const val = provided?.answer;
        const isEmpty =
          val == null ||
          (typeof val === 'string' && (val as string).trim() === '') ||
          (typeof val === 'object' && Object.keys(val).length === 0);
        if (isEmpty) {
          throw new BadRequestException(`Answer is required for question: ${item.questionTextSnapshot}`);
        }
      }
    }

    await this.dataSource.transaction(async (manager) => {
      // Create and save answers
      const answerEntities = answers.map((ans) =>
        manager.create(FormAnswerEntity, {
          formSessionId: session.id,
          applicationId: session.applicationId,
          questionSetItemId: ans.questionSetItemId,
          answer: ans.answer,
          answeredAt: now,
        }),
      );

      await manager.save(FormAnswerEntity, answerEntities);

      // Update session status to SUBMITTED
      session.status = FormSessionStatus.SUBMITTED;
      session.submittedAt = now;
      await manager.save(FormSessionEntity, session);

      // Record workflow transition to FORM_SUBMITTED
      await this.workflowStateService.recordStatusTransition(
        {
          applicationId: session.applicationId,
          toStatus: ApplicationStatus.FORM_SUBMITTED,
          eventType: 'FORM_QUESTIONNAIRE_SUBMITTED',
          actorType: 'PUBLIC',
          metadata: { formSessionId: session.id },
        },
        manager,
      );
    });

    return { success: true };
  }

  async getFormSessionDetailsForAdmin(applicationId: string) {
    const session = await this.formSessionRepo.findOne({
      where: { applicationId },
      order: { createdAt: 'DESC' },
      relations: [
        'questionSet',
        'questionSet.items',
        'questionSet.items.question',
      ],
    });

    if (!session) {
      return null;
    }

    const answers = await this.formAnswerRepo.find({
      where: { formSessionId: session.id },
    });

    const sortedItems = (session.questionSet?.items || []).sort(
      (a, b) => a.orderIndex - b.orderIndex,
    );

    return {
      formSessionId: session.id,
      expiresAt: session.expiresAt,
      status: session.status,
      sentAt: session.sentAt,
      openedAt: session.openedAt,
      submittedAt: session.submittedAt,
      questions: sortedItems.map((item) => {
        const matchingAnswer = answers.find((ans) => ans.questionSetItemId === item.id);
        return {
          questionSetItemId: item.id,
          text: item.questionTextSnapshot,
          type: item.questionType,
          required: item.required,
          options: item.question?.options || null,
          answer: matchingAnswer ? matchingAnswer.answer : null,
          answeredAt: matchingAnswer ? matchingAnswer.answeredAt : null,
        };
      }),
    };
  }
}
