import { BadRequestException } from '@nestjs/common';
import { AiScreeningResultEntity } from '../ai-screening/entities/ai-screening-result.entity';
import { FormAnswerEntity } from '../form-sessions/entities/form-answer.entity';
import { FormSessionEntity } from '../form-sessions/entities/form-session.entity';
import { JobDescriptionVersionEntity } from '../job-descriptions/entities/job-description-version.entity';
import { MappingResultEntity } from '../mapping/entities/mapping-result.entity';
import {
  AiScreeningRecommendation,
  ApplicationStatus,
  CvDocumentType,
  FormSessionStatus,
  MappingRecommendation,
  MappingStatus,
} from '../recruitment-common';
import { ApplicationEntity } from './entities/application.entity';
import { ApplicationsService } from './applications.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('ApplicationsService AI screening', () => {
  function createRepo<T>(entity: unknown, overrides: Record<string, unknown> = {}) {
    return {
      target: entity,
      create: jest.fn((value: Partial<T>) => value),
      save: jest.fn(async (value: Partial<T>) => ({ id: `${String((entity as any).name)}-id`, ...value })),
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      findOneBy: jest.fn(async () => null),
      exist: jest.fn(async () => true),
      ...overrides,
    };
  }

  function createService(options: {
    submittedForm?: Partial<FormSessionEntity> | null;
    answers?: Partial<FormAnswerEntity>[];
    parsedData?: Record<string, unknown>;
    jobDescriptionSnapshot?: Record<string, unknown>;
    enrichedJobDescription?: Record<string, unknown>;
  } = {}) {
    const jobDescriptionSnapshot = options.jobDescriptionSnapshot ?? {
      jobDescription: {
        title: 'Backend Engineer',
        requirements: {
          mustHave: ['Java', 'Spring Boot'],
        },
      },
    };
    const application = {
      id: 'app-1',
      candidateId: 'candidate-1',
      jobPostingId: 'posting-1',
      jobDescriptionVersionId: 'jdv-1',
      status: ApplicationStatus.FORM_SUBMITTED,
      currentCvDocumentId: 'cv-clean-1',
      currentCvDocument: {
        id: 'cv-clean-1',
        documentType: CvDocumentType.CLEAN,
      },
      jobDescriptionVersion: {
        id: 'jdv-1',
        snapshot: jobDescriptionSnapshot,
      },
    } as unknown as Partial<ApplicationEntity>;

    const parsedProfile = {
      id: 'profile-1',
      applicationId: 'app-1',
      cvDocumentId: 'cv-clean-1',
      parsedData: options.parsedData ?? {
        parsedProfile: { name: 'Tin Le', skills: ['Java'] },
        evaluation: {
          summary: {
            overallMatchScore: 78,
            recommendation: 'PASS',
          },
          roleSpecificCriteria: {
            mustHaveSkills: { matched: ['Java'], missing: ['Spring Boot'] },
          },
        },
      },
    };

    const submittedForm = options.submittedForm === undefined
      ? {
        id: 'form-1',
        applicationId: 'app-1',
        status: FormSessionStatus.SUBMITTED,
        submittedAt: new Date('2026-07-14T01:00:00.000Z'),
      }
      : options.submittedForm;

    const answers = options.answers ?? [
      {
        id: 'answer-1',
        formSessionId: 'form-1',
        applicationId: 'app-1',
        questionSetItemId: 'question-1',
        answer: { text: 'Co kinh nghiem xu ly Spring Boot API.' },
        answeredAt: new Date('2026-07-14T01:01:00.000Z'),
      },
    ];

    const appRepo = createRepo<ApplicationEntity>(ApplicationEntity, {
      findOne: jest.fn(async () => application),
      save: jest.fn(async (value: Partial<ApplicationEntity>) => value),
    });
    const parsedRepo = createRepo(ApplicationEntity, {
      findOne: jest.fn(async () => parsedProfile),
    });
    const formSessionRepo = createRepo<FormSessionEntity>(FormSessionEntity, {
      findOne: jest.fn(async () => submittedForm),
    });
    const formAnswerRepo = createRepo<FormAnswerEntity>(FormAnswerEntity, {
      find: jest.fn(async () => answers),
    });
    const mappingRepo = createRepo<MappingResultEntity>(MappingResultEntity);
    const aiResultRepo = createRepo<AiScreeningResultEntity>(AiScreeningResultEntity);
    const jdVersionRepo = createRepo<JobDescriptionVersionEntity>(JobDescriptionVersionEntity, {
      findOne: jest.fn(async () => application.jobDescriptionVersion),
      save: jest.fn(async (value: Partial<JobDescriptionVersionEntity>) => value),
    });
    const auditRepo = createRepo(ApplicationEntity);

    const repositories = new Map<unknown, any>([
      [ApplicationEntity, appRepo],
      [FormSessionEntity, formSessionRepo],
      [FormAnswerEntity, formAnswerRepo],
      [MappingResultEntity, mappingRepo],
      [AiScreeningResultEntity, aiResultRepo],
      [JobDescriptionVersionEntity, jdVersionRepo],
    ]);

    const manager = {
      getRepository: jest.fn((entity: unknown) => repositories.get(entity) ?? createRepo(entity)),
    };
    const dataSource = {
      transaction: jest.fn(async (callback: (manager: unknown) => unknown) => callback(manager)),
    };
    const aiService = {
      enrichJobDescription: jest.fn(async () => options.enrichedJobDescription ?? ({
        jobInfo: {
          title: 'Backend Engineer',
          roleCategory: 'BACKEND',
          department: null,
        },
        generalCriteria: {
          minYearsExperience: 2,
          educationRequirement: null,
          softSkills: [],
        },
        roleSpecificCriteria: {
          coreMustHaveSkills: ['Java', 'Spring Boot'],
          advancedNiceToHaveSkills: [],
          expectedTechnicalChallenges: ['Build APIs'],
        },
        redFlags: ['No experience in Java'],
      })),
      runRecruitmentPhase1AiScreening: jest.fn(async () => ({
        finalScore: 82,
        recommendation: AiScreeningRecommendation.MATCH,
        summary: 'Ung vien phu hop, can HR review them Spring Boot.',
        strengths: [{ title: 'Java', evidence: 'CV co Java', confidence: 'HIGH' }],
        gaps: [{ title: 'Spring Boot', evidence: 'Bang chung con mong', severity: 'MEDIUM' }],
        risks: [],
        status: 'DONE',
      })),
      detectProfileAnomalies: jest.fn(async () => null),
    };

    const service = new ApplicationsService(
      dataSource as any,
      appRepo as any,
      parsedRepo as any,
      auditRepo as any,
      {} as any,
      { recordEvent: jest.fn(async () => ({ id: 'event-1' })) } as any,
    );
    (service as any).aiService = aiService;
    jest.spyOn(service, 'findDetail').mockResolvedValue({ id: 'app-1' } as any);

    return {
      service: service as any,
      aiService,
      appRepo,
      formSessionRepo,
      formAnswerRepo,
      mappingRepo,
      aiResultRepo,
      jdVersionRepo,
    };
  }

  it('runs AI screening from current JD, parsed profile, and submitted form answers, then persists mapping and AI results', async () => {
    const { service, aiService, mappingRepo, aiResultRepo, appRepo } = createService();

    const result = await service.runAiScreening('app-1', { actorId: 'admin-1' });

    expect(aiService.runRecruitmentPhase1AiScreening).toHaveBeenCalledWith(
      expect.objectContaining({
        enrichedJobDescription: expect.objectContaining({
          jobInfo: expect.objectContaining({ title: 'Backend Engineer' }),
        }),
        enrichedProfile: expect.objectContaining({ parsedProfile: expect.objectContaining({ name: 'Tin Le' }) }),
        formAnswers: [
          expect.objectContaining({
            questionSetItemId: 'question-1',
            answer: { text: 'Co kinh nghiem xu ly Spring Boot API.' },
          }),
        ],
        applicationMetadata: expect.objectContaining({
          applicationId: 'app-1',
          candidateId: 'candidate-1',
        }),
      }),
    );
    expect(mappingRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: 'app-1',
        score: '78',
        status: MappingStatus.DONE,
        recommendation: MappingRecommendation.PASS,
      }),
    );
    expect(aiResultRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: 'app-1',
        finalScore: '82',
        recommendation: AiScreeningRecommendation.MATCH,
        formSessionId: 'form-1',
      }),
    );
    expect(appRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ApplicationStatus.AI_SCREENING_DONE,
      }),
    );
    expect(result).toEqual({ id: 'app-1' });
  });

  it('refreshes a previously stored anomaly result when AI screening runs again', async () => {
    const refreshedAnomaly = {
      overallRiskScore: 0,
      riskLevel: 'minimal',
      anomalies: [],
      summary: 'Hồ sơ không có dấu hiệu bất thường rõ ràng.',
    };
    const { service, aiService } = createService({
      parsedData: {
        parsedProfile: { name: 'Tin Le', skills: ['Java'] },
        evaluation: { summary: { overallMatchScore: 78, recommendation: 'PASS' } },
        anomalyDetection: {
          overallRiskScore: 15,
          riskLevel: 'low',
          anomalies: [{
            type: 'timeline_inconsistency',
            severity: 'medium',
            description: 'Old English anomaly result',
            affectedFields: ['projects[0].startYear'],
            evidence: 'Old English evidence',
          }],
          summary: 'Old English summary',
        },
      },
    });
    aiService.detectProfileAnomalies.mockResolvedValue(refreshedAnomaly);

    await service.runAiScreening('app-1', { actorId: 'admin-1' });

    expect(aiService.detectProfileAnomalies).toHaveBeenCalledTimes(1);
    expect(aiService.runRecruitmentPhase1AiScreening).toHaveBeenCalledWith(
      expect.objectContaining({ anomalyResult: refreshedAnomaly }),
    );
  });

  it('persists enriched JD into the job description version snapshot on first AI screening run', async () => {
    const { service, aiService, jdVersionRepo } = createService();

    await service.runAiScreening('app-1', { actorId: 'admin-1' });

    expect(aiService.enrichJobDescription).toHaveBeenCalledWith(
      expect.objectContaining({
        jobDescription: expect.objectContaining({ title: 'Backend Engineer' }),
      }),
    );
    expect(jdVersionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'jdv-1',
        snapshot: expect.objectContaining({
          aiEnrichment: expect.objectContaining({
            promptKey: 'enrich_job_description',
            result: expect.objectContaining({
              jobInfo: expect.objectContaining({ title: 'Backend Engineer' }),
            }),
          }),
        }),
      }),
    );
  });

  it('reuses cached enriched JD from the snapshot without calling AI again', async () => {
    const cachedEnrichment = {
      jobInfo: {
        title: 'Cached Backend Engineer',
        roleCategory: 'BACKEND',
        department: null,
      },
      roleSpecificCriteria: {
        coreMustHaveSkills: ['Java'],
      },
    };
    const { service, aiService, jdVersionRepo } = createService({
      jobDescriptionSnapshot: {
        jobDescription: { title: 'Backend Engineer' },
        aiEnrichment: {
          promptKey: 'enrich_job_description',
          result: cachedEnrichment,
          generatedAt: '2026-07-14T00:00:00.000Z',
        },
      },
    });

    await service.runAiScreening('app-1', { actorId: 'admin-1' });

    expect(aiService.enrichJobDescription).not.toHaveBeenCalled();
    expect(jdVersionRepo.save).not.toHaveBeenCalled();
    expect(aiService.runRecruitmentPhase1AiScreening).toHaveBeenCalledWith(
      expect.objectContaining({
        enrichedJobDescription: cachedEnrichment,
      }),
    );
  });

  it('rejects AI screening when the application has no submitted questionnaire form', async () => {
    const { service, aiService } = createService({ submittedForm: null });

    await expect(service.runAiScreening('app-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(aiService.runRecruitmentPhase1AiScreening).not.toHaveBeenCalled();
  });
});

describe('ApplicationsService AMIS source metadata', () => {
  it('persists the AMIS candidate ID on the source record', async () => {
    const applicationSourcesService = {
      create: jest.fn(async (value: unknown) => value),
    };
    const service = new ApplicationsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      applicationSourcesService as any,
      {} as any,
    ) as any;
    const manager = {} as any;

    await service.createApplicationSource(
      manager,
      'application-1',
      {
        source: 'CHANNEL',
        jobPostingId: 'posting-1',
        externalApplicationId: 'AMIS:recruitment:round:candidate',
        amisCandidateId: 'amis-candidate-123',
      },
      'OTHER',
      'AMIS:recruitment:round:candidate',
    );

    expect(applicationSourcesService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: 'application-1',
        amisCandidateId: 'amis-candidate-123',
      }),
      manager,
    );
  });
});
