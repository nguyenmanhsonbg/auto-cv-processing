import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { FormSessionsService } from './form-sessions.service';
import { DataSource, EntityManager } from 'typeorm';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { CandidateEntity } from '../candidates/entities/candidate.entity';
import { JobPostingEntity } from '../job-postings/entities/job-posting.entity';
import { JobDescriptionEntity } from '../job-descriptions/entities/job-description.entity';
import { JobDescriptionVersionEntity } from '../job-descriptions/entities/job-description-version.entity';
import { AmisCareerEntity } from '../extension-integration/entities/amis-career.entity';
import { QuestionEntity } from '../questions/entities/question.entity';
import { FormSessionEntity } from './entities/form-session.entity';
import { FormAnswerEntity } from './entities/form-answer.entity';
import { UserEntity } from '../auth/entities/user.entity';
import {
  ApplicationStatus,
  ApplicationSourceType,
  JobDescriptionStatus,
  JobPostingStatus,
  JobDescriptionVersionStatus,
} from '../recruitment-common';

import { QuestionType } from '@interview-assistant/shared';

type LifecycleFixtures = {
  user: UserEntity;
  career: AmisCareerEntity;
  questions: QuestionEntity[];
  jd: JobDescriptionEntity;
  jdVersion: JobDescriptionVersionEntity;
  jp: JobPostingEntity;
  candidate: CandidateEntity;
  appEntity: ApplicationEntity;
};

type LifecycleVerification = {
  genResult: Awaited<ReturnType<FormSessionsService['generateFormSession']>>;
  updatedSession: FormSessionEntity | null;
  recordedAnswers: FormAnswerEntity[];
  updatedApp: ApplicationEntity | null;
};

async function bootstrap() {
  console.log('Bootstrapping application context...');
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const dataSource = app.get(DataSource);
    const formSessionsService = app.get(FormSessionsService);
    console.log('Setting up mock database entities for testing...');
    const fixtures = await createLifecycleFixtures(dataSource.manager);
    const verification = await executeLifecycle(dataSource.manager, formSessionsService, fixtures);
    await cleanupLifecycleFixtures(dataSource.manager, fixtures, verification);
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  } finally {
    await app.close();
  }
}

async function createLifecycleFixtures(manager: EntityManager): Promise<LifecycleFixtures> {
  const user = await findOrCreateUser(manager);
  const career = await findOrCreateCareer(manager);
  const questions = await createLifecycleQuestions(manager);
  const jd = await createLifecycleJobDescription(manager, user);
  const jdVersion = await createLifecycleJobDescriptionVersion(manager, jd, user);
  const jp = await createLifecycleJobPosting(manager, jd, jdVersion, user);
  const candidate = await createLifecycleCandidate(manager, user);
  const appEntity = await createLifecycleApplication(manager, candidate, jp, jdVersion);
  return { user, career, questions, jd, jdVersion, jp, candidate, appEntity };
}

async function findOrCreateUser(manager: EntityManager) {
  let user = await manager.findOne(UserEntity, { where: {} });
  if (!user) {
    user = manager.create(UserEntity, {
      email: 'admin.test@example.com',
      passwordHash: 'dummy',
      role: 'ADMIN' as any,
      displayName: 'Admin Test',
    });
    user = await manager.save(UserEntity, user);
  }
  console.log('User:', user.email);
  return user;
}

async function findOrCreateCareer(manager: EntityManager) {
  let career = await manager.findOne(AmisCareerEntity, { where: { name: 'Công nghệ thông tin' } });
  if (!career) {
    career = manager.create(AmisCareerEntity, {
      amisCareerId: 'IT-001',
      name: 'Công nghệ thông tin',
      lastSyncedAt: new Date(),
    });
    career = await manager.save(AmisCareerEntity, career);
  }
  console.log('Career category:', career.name);
  return career;
}

async function createLifecycleQuestions(manager: EntityManager) {
  const questions: QuestionEntity[] = [];
  for (let index = 1; index <= 6; index++) {
    const question = await findOrCreateQuestion(manager, index);
    questions.push(question);
  }
  console.log('Questions created/found:', questions.length);
  return questions;
}

async function findOrCreateQuestion(manager: EntityManager, index: number) {
  let question = await manager.findOne(QuestionEntity, {
    where: { text: `Câu hỏi trắc nghiệm IT thứ ${index}` },
  });
  if (question) return question;

  question = manager.create(QuestionEntity, {
    text: `Câu hỏi trắc nghiệm IT thứ ${index}`,
    type: index % 2 === 0 ? QuestionType.OPEN_ENDED : QuestionType.SINGLE_CHOICE,
    category: 'BACKEND_MUST',
    subcategory: 'General',
    options: index % 2 === 0 ? undefined : [
      { id: 'a', text: 'Đáp án A' },
      { id: 'b', text: 'Đáp án B' },
      { id: 'c', text: 'Đáp án C' },
    ],
  } as any);
  return manager.save(QuestionEntity, question);
}

async function createLifecycleJobDescription(manager: EntityManager, user: UserEntity) {
  const jd = manager.create(JobDescriptionEntity, {
    title: 'Kỹ sư phát triển phần mềm IT chuyên nghiệp',
    summary: 'Lập trình backend nodejs',
    description: 'Lập trình nodejs',
    requirements: 'Có kinh nghiệm lập trình backend nodejs.',
    status: JobDescriptionStatus.ACTIVE,
    createdById: user.id,
  });
  const saved = await manager.save(JobDescriptionEntity, jd);
  console.log('Job description created:', saved.title);
  return saved;
}

async function createLifecycleJobDescriptionVersion(manager: EntityManager, jd: JobDescriptionEntity, user: UserEntity) {
  const version = manager.create(JobDescriptionVersionEntity, {
    jobDescriptionId: jd.id,
    versionNo: 1,
    snapshot: { title: jd.title },
    status: JobDescriptionVersionStatus.ACTIVE,
    createdById: user.id,
  });
  const saved = await manager.save(JobDescriptionVersionEntity, version);
  console.log('Job description version created:', saved.versionNo);
  return saved;
}

async function createLifecycleJobPosting(manager: EntityManager, jd: JobDescriptionEntity, version: JobDescriptionVersionEntity, user: UserEntity) {
  const posting = manager.create(JobPostingEntity, {
    title: jd.title,
    jobDescriptionId: jd.id,
    jobDescriptionVersionId: version.id,
    status: JobPostingStatus.PUBLISHED,
    publicSlug: `ky-su-phan-mem-${Date.now()}`,
    createdById: user.id,
  });
  const saved = await manager.save(JobPostingEntity, posting);
  console.log('Job posting created:', saved.title);
  return saved;
}

async function createLifecycleCandidate(manager: EntityManager, user: UserEntity) {
  const candidate = manager.create(CandidateEntity, {
    name: 'Nguyễn Văn Test',
    email: 'dmsdeveloping@gmail.com',
    phone: '0987654321',
    createdById: user.id,
  });
  const saved = await manager.save(CandidateEntity, candidate);
  console.log('Candidate created:', saved.name);
  return saved;
}

async function createLifecycleApplication(
  manager: EntityManager,
  candidate: CandidateEntity,
  posting: JobPostingEntity,
  version: JobDescriptionVersionEntity,
) {
  const application = manager.create(ApplicationEntity, {
    candidateId: candidate.id,
    jobPostingId: posting.id,
    jobDescriptionVersionId: version.id,
    status: ApplicationStatus.APPLICATION_CREATED,
    source: ApplicationSourceType.PORTAL,
  });
  const saved = await manager.save(ApplicationEntity, application);
  console.log('Application created. ID:', saved.id);
  return saved;
}

async function executeLifecycle(
  manager: EntityManager,
  formSessionsService: FormSessionsService,
  fixtures: LifecycleFixtures,
): Promise<LifecycleVerification> {
  console.log('\n--- Testing: generateFormSession ---');
  const genResult = await formSessionsService.generateFormSession(fixtures.appEntity.id);
  console.log('Generation success. Return payload:', genResult);
  const sessionDetails = await verifyGeneratedSession(formSessionsService, genResult.plainToken);
  const submitPayload = sessionDetails.questions.map((question) => ({
    questionSetItemId: question.questionSetItemId,
    answer: question.type === 'OPEN_ENDED'
      ? { text: 'Câu trả lời tự luận test' }
      : { selectedIds: ['a'] },
  }));

  console.log('\n--- Testing: submitAnswers ---');
  const submitRes = await formSessionsService.submitAnswers(genResult.plainToken, submitPayload);
  console.log('Submission result:', submitRes);
  console.log('\n--- Testing: Verification ---');
  const updatedSession = await manager.findOne(FormSessionEntity, { where: { id: genResult.formSessionId } });
  const recordedAnswers = await manager.find(FormAnswerEntity, { where: { formSessionId: genResult.formSessionId } });
  const updatedApp = await manager.findOne(ApplicationEntity, { where: { id: fixtures.appEntity.id } });
  verifySubmittedState(updatedSession, updatedApp, recordedAnswers.length);
  return { genResult, updatedSession, recordedAnswers, updatedApp };
}

async function verifyGeneratedSession(formSessionsService: FormSessionsService, token: string) {
  console.log('\n--- Testing: getFormSessionByToken ---');
  const sessionDetails = await formSessionsService.getFormSessionByToken(token);
  console.log('Session details resolved from token:');
  console.log('Candidate Name:', sessionDetails.candidateName);
  console.log('Job Title:', sessionDetails.jobTitle);
  console.log('Number of selected questions:', sessionDetails.questions.length);
  if (sessionDetails.questions.length !== 5) {
    throw new Error(`Expected exactly 5 questions, but got ${sessionDetails.questions.length}`);
  }
  console.log('SUCCESS: Exactly 5 questions selected!');
  return sessionDetails;
}

function verifySubmittedState(
  updatedSession: FormSessionEntity | null,
  updatedApp: ApplicationEntity | null,
  answerCount: number,
) {
  console.log('Updated FormSession status in DB:', updatedSession?.status);
  console.log('Submitted at:', updatedSession?.submittedAt);
  console.log('Number of recorded answers in DB:', answerCount);
  console.log('Updated Application status in DB:', updatedApp?.status);
  if (updatedSession?.status !== 'SUBMITTED') throw new Error('Form session status is not SUBMITTED!');
  if (updatedApp?.status !== ApplicationStatus.FORM_SUBMITTED) {
    throw new Error(`Application status is not FORM_SUBMITTED! Got: ${updatedApp?.status}`);
  }
  console.log('\n=====================================');
  console.log('ALL INTEGRATION TEST LIFECYCLE PASSES!');
  console.log('=====================================');
}

async function cleanupLifecycleFixtures(
  manager: EntityManager,
  fixtures: LifecycleFixtures,
  verification: LifecycleVerification,
) {
  console.log('\nCleaning up mock data...');
  try {
    await manager.query(`DELETE FROM workflow_events WHERE application_id = $1`, [fixtures.appEntity.id]);
    await manager.remove(FormAnswerEntity, verification.recordedAnswers);
    await manager.remove(FormSessionEntity, verification.updatedSession!);
    await manager.remove(ApplicationEntity, verification.updatedApp!);
    await manager.remove(CandidateEntity, fixtures.candidate);
    await manager.remove(JobPostingEntity, fixtures.jp);
    await manager.remove(JobDescriptionVersionEntity, fixtures.jdVersion);
    await manager.remove(JobDescriptionEntity, fixtures.jd);
    console.log('Cleanup complete!');
  } catch (cleanupErr: any) {
    console.warn('Cleanup warning (non-fatal):', cleanupErr.message);
  }
}

bootstrap().catch((err) => {
  console.error('Unhandled bootstrap error:', err);
  process.exit(1);
});
