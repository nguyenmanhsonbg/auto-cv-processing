import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { FormSessionsService } from './form-sessions.service';
import { DataSource } from 'typeorm';
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

async function bootstrap() {
  console.log('Bootstrapping application context...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);
  const formSessionsService = app.get(FormSessionsService);

  console.log('Setting up mock database entities for testing...');
  const manager = dataSource.manager;

  try {
    // 0. Find or create a User
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

    // 1. Create or find Career
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

    // 2. Create 6 questions for this career category to make sure we can select 5
    const questions: QuestionEntity[] = [];
    for (let i = 1; i <= 6; i++) {
      let q = await manager.findOne(QuestionEntity, { where: { text: `Câu hỏi trắc nghiệm IT thứ ${i}` } });
      if (!q) {
        q = manager.create(QuestionEntity, {
          text: `Câu hỏi trắc nghiệm IT thứ ${i}`,
          type: i % 2 === 0 ? QuestionType.OPEN_ENDED : QuestionType.SINGLE_CHOICE,
          category: 'BACKEND_MUST',
          subcategory: 'General',
          options: i % 2 === 0 ? undefined : [
            { id: 'a', text: 'Đáp án A' },
            { id: 'b', text: 'Đáp án B' },
            { id: 'c', text: 'Đáp án C' },
          ],
        } as any);
        q = await manager.save(QuestionEntity, q);
      }
      questions.push(q);
    }
    console.log('Questions created/found:', questions.length);

    // 3. Create Job Description
    let jd = manager.create(JobDescriptionEntity, {
      title: 'Kỹ sư phát triển phần mềm IT chuyên nghiệp',
      summary: 'Lập trình backend nodejs',
      description: 'Lập trình nodejs',
      requirements: {},
      status: JobDescriptionStatus.ACTIVE,
      createdById: user.id,
    });
    jd = await manager.save(JobDescriptionEntity, jd);
    console.log('Job description created:', jd.title);

    // 4. Create Job Description Version
    let jdVersion = manager.create(JobDescriptionVersionEntity, {
      jobDescriptionId: jd.id,
      versionNo: 1,
      snapshot: { title: jd.title },
      status: JobDescriptionVersionStatus.ACTIVE,
      createdById: user.id,
    });
    jdVersion = await manager.save(JobDescriptionVersionEntity, jdVersion);
    console.log('Job description version created:', jdVersion.versionNo);

    // 5. Create Job Posting
    let jp = manager.create(JobPostingEntity, {
      title: jd.title,
      jobDescriptionId: jd.id,
      jobDescriptionVersionId: jdVersion.id,
      status: JobPostingStatus.PUBLISHED,
      publicSlug: `ky-su-phan-mem-${Date.now()}`,
      createdById: user.id,
    });
    jp = await manager.save(JobPostingEntity, jp);
    console.log('Job posting created:', jp.title);

    // 6. Create Candidate
    let candidate = manager.create(CandidateEntity, {
      name: 'Nguyễn Văn Test',
      email: 'dmsdeveloping@gmail.com',
      phone: '0987654321',
      createdById: user.id,
    });
    candidate = await manager.save(CandidateEntity, candidate);
    console.log('Candidate created:', candidate.name);

    // 7. Create Application
    let appEntity = manager.create(ApplicationEntity, {
      candidateId: candidate.id,
      jobPostingId: jp.id,
      jobDescriptionVersionId: jdVersion.id,
      status: ApplicationStatus.APPLICATION_CREATED,
      source: ApplicationSourceType.PORTAL,
    });
    appEntity = await manager.save(ApplicationEntity, appEntity);
    console.log('Application created. ID:', appEntity.id);

    // 8. Run manual session generation
    console.log('\n--- Testing: generateFormSession ---');
    const genResult = await formSessionsService.generateFormSession(appEntity.id);
    console.log('Generation success. Return payload:', genResult);

    // 9. Test lookup by token
    console.log('\n--- Testing: getFormSessionByToken ---');
    const sessionDetails = await formSessionsService.getFormSessionByToken(genResult.plainToken);
    console.log('Session details resolved from token:');
    console.log('Candidate Name:', sessionDetails.candidateName);
    console.log('Job Title:', sessionDetails.jobTitle);
    console.log('Number of selected questions:', sessionDetails.questions.length);

    if (sessionDetails.questions.length !== 5) {
      throw new Error(`Expected exactly 5 questions, but got ${sessionDetails.questions.length}`);
    }
    console.log('SUCCESS: Exactly 5 questions selected!');

    // 10. Submit answers
    console.log('\n--- Testing: submitAnswers ---');
    const submitPayload = sessionDetails.questions.map((q) => {
      return {
        questionSetItemId: q.questionSetItemId,
        answer: q.type === 'OPEN_ENDED' ? { text: 'Câu trả lời tự luận test' } : { selectedIds: ['a'] },
      };
    });

    const submitRes = await formSessionsService.submitAnswers(genResult.plainToken, submitPayload);
    console.log('Submission result:', submitRes);

    // 11. Verify updated status
    console.log('\n--- Testing: Verification ---');
    const updatedSession = await manager.findOne(FormSessionEntity, {
      where: { id: genResult.formSessionId },
    });
    console.log('Updated FormSession status in DB:', updatedSession?.status); // should be SUBMITTED
    console.log('Submitted at:', updatedSession?.submittedAt);

    const recordedAnswers = await manager.find(FormAnswerEntity, {
      where: { formSessionId: genResult.formSessionId },
    });
    console.log('Number of recorded answers in DB:', recordedAnswers.length);

    const updatedApp = await manager.findOne(ApplicationEntity, {
      where: { id: appEntity.id },
    });
    console.log('Updated Application status in DB:', updatedApp?.status); // should be FORM_SUBMITTED

    if (updatedSession?.status !== 'SUBMITTED') {
      throw new Error('Form session status is not SUBMITTED!');
    }
    if (updatedApp?.status !== ApplicationStatus.FORM_SUBMITTED) {
      throw new Error(`Application status is not FORM_SUBMITTED! Got: ${updatedApp?.status}`);
    }
    console.log('\n=====================================');
    console.log('ALL INTEGRATION TEST LIFECYCLE PASSES!');
    console.log('=====================================');

    // Cleanup mock data to keep DB clean
    console.log('\nCleaning up mock data...');
    try {
      await manager.query(`DELETE FROM workflow_events WHERE application_id = $1`, [appEntity.id]);
      await manager.remove(FormAnswerEntity, recordedAnswers);
      await manager.remove(FormSessionEntity, updatedSession!);
      await manager.remove(ApplicationEntity, updatedApp!);
      await manager.remove(CandidateEntity, candidate);
      await manager.remove(JobPostingEntity, jp);
      await manager.remove(JobDescriptionVersionEntity, jdVersion);
      await manager.remove(JobDescriptionEntity, jd);
      console.log('Cleanup complete!');
    } catch (cleanupErr: any) {
      console.warn('Cleanup warning (non-fatal):', cleanupErr.message);
    }

  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap().catch((err) => {
  console.error('Unhandled bootstrap error:', err);
  process.exit(1);
});
