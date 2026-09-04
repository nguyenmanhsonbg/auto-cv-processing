import { ExtensionSourceSystem } from './enums';
import { ExtensionIntegrationService } from './extension-integration.service';
import { AmisRecruitmentRoundEntity } from './entities';
import { UserEntity } from '../auth/entities/user.entity';
import { JobDescriptionEntity } from '../job-descriptions/entities/job-description.entity';
import { JobDescriptionStatus } from '../recruitment-common';
import { JobPostingEntity } from '../job-postings/entities/job-posting.entity';
import { RecruitmentExternalReferenceEntity } from './entities/recruitment-external-reference.entity';
import { ExtensionIdempotencyDecision } from './extension-idempotency.service';
import { UserRole } from '@interview-assistant/shared';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

function createService(rounds: Record<string, unknown>[], user?: Record<string, unknown>) {
  const roundRepository = {
    find: jest.fn().mockResolvedValue(rounds),
  };
  const userRepository = {
    findOne: jest.fn().mockResolvedValue(user ?? null),
  };
  const service = Object.create(ExtensionIntegrationService.prototype) as any;
  service.dataSource = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === UserEntity) return userRepository;
      if (entity === AmisRecruitmentRoundEntity) return roundRepository;
      return roundRepository;
    }),
  };
  return { service, roundRepository, userRepository };
}

function source(roundId: string, receivedAt: string) {
  return {
    rawPayload: {
      sourceSystem: ExtensionSourceSystem.AMIS,
      recruitmentId: '46487',
      recruitmentRoundId: roundId,
      recruitmentRoundName: roundId === 'interview-1' ? 'Phỏng vấn 1' : 'Screening CV',
    },
    receivedAt: new Date(receivedAt),
  } as never;
}

describe('ExtensionIntegrationService committee application visibility', () => {
  const rounds = [
    {
      amisRoundId: 'screening',
      roundName: 'Screening CV',
      sortOrder: 1,
      roundType: 1,
      isActive: true,
    },
    {
      amisRoundId: 'interview-1',
      roundName: 'Phỏng vấn 1',
      sortOrder: 3,
      roundType: 3,
      isActive: true,
    },
  ];

  it('shows a candidate when the newest AMIS snapshot is an interview round', async () => {
    const { service } = createService(rounds);
    const application = {
      sources: [
        source('screening', '2026-08-28T08:00:00.000Z'),
        source('interview-1', '2026-08-28T08:01:00.000Z'),
      ],
    };

    await expect(
      (service as any).filterApplicationsForCommittee([application], '46487'),
    ).resolves.toHaveLength(1);
  });

  it('hides a candidate when the newest AMIS snapshot is still pre-interview', async () => {
    const { service } = createService(rounds);
    const application = {
      sources: [
        source('interview-1', '2026-08-28T08:00:00.000Z'),
        source('screening', '2026-08-28T08:01:00.000Z'),
      ],
    };

    await expect(
      (service as any).filterApplicationsForCommittee([application], '46487'),
    ).resolves.toHaveLength(0);
  });

  it('uses persisted role memberships when the JWT contains only the primary role', async () => {
    const { service, userRepository } = createService([], {
      id: 'user-1',
      role: 'INTERNAL',
      roleMemberships: [{ role: 'COMMITTEE' }],
    });
    const actor = await (service as any).resolveCurrentApplicationListActor({
      id: 'user-1',
      role: 'INTERNAL',
      roles: ['INTERNAL'],
    });

    expect(userRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      relations: ['roleMemberships'],
    });
    expect(actor.roles).toEqual(expect.arrayContaining(['INTERNAL', 'COMMITTEE']));
  });
});

describe('ExtensionIntegrationService AMIS job posting sync', () => {
  it('accepts an automatic sync payload without selected questionnaire ids', async () => {
    const { service } = createService([]);
    service.idempotencyService = {
      assertKeyCanBeUsed: jest.fn().mockResolvedValue({
        decision: ExtensionIdempotencyDecision.REPLAY_SUCCEEDED,
        record: {
          responseData: {
            resultCode: 'CREATED',
            jobDescriptionId: 'job-description-1',
            jobDescriptionVersionId: 'job-description-version-1',
            jobPostingId: 'job-posting-1',
            amisRecruitmentId: '46656',
            snapshotHash: 'snapshot-hash',
            snapshotChanged: true,
            channelPostings: [],
          },
        },
      }),
    };

    const response = await service.syncAndPublishFromAmis({
      sourceSystem: ExtensionSourceSystem.AMIS,
      amisRecruitmentId: '46656',
      action: 'PUBLISH',
      snapshot: {
        title: 'Backend Engineer',
        description: 'Build backend services.',
        requirements: { rawText: 'Node.js' },
      },
      channels: [],
    } as never, {
      actorUserId: 'actor-1',
      actorRole: UserRole.HR,
      idempotencyKey: 'idempotency-key-1',
    });

    expect(response.resultCode).toBe('DUPLICATE_OR_IDEMPOTENT_REPLAY');
  });

  it('accepts an AMIS posting without a preselected internal job description', () => {
    const { service } = createService([]);
    const normalized = (service as any).normalizeRequest({
      sourceSystem: ExtensionSourceSystem.AMIS,
      amisRecruitmentId: '46656',
      action: 'PUBLISH',
      snapshot: {
        title: 'Backend Engineer',
        description: 'Build backend services.',
        requirements: { rawText: 'Node.js' },
      },
      channels: [],
      selectedQuestionIds: [],
    });

    expect(normalized.jobDescriptionId).toBeUndefined();
  });

  it('creates an AMIS-backed job description when no internal job description is selected', async () => {
    const { service } = createService([]);
    const jobDescriptionRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value: Record<string, unknown>) => value),
      save: jest.fn(async (value: Record<string, unknown>) => ({
        ...value,
        id: 'amis-job-description-1',
      })),
    };
    const manager = {
      query: jest.fn(),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === JobDescriptionEntity) return jobDescriptionRepository;
        throw new Error(`Unexpected repository: ${String(entity)}`);
      }),
    };

    const jobDescription = await (service as any).resolvePostingJobDescription(
      manager,
      undefined,
      {
        sourceSystem: ExtensionSourceSystem.AMIS,
        amisRecruitmentId: '46656',
        amisUrl: 'https://amis.example/recruitment/46656',
        snapshot: {
          title: 'Backend Engineer',
          description: 'Build backend services.',
          summary: 'Backend role',
          requirements: { rawText: 'Node.js' },
          benefits: 'Health insurance',
          deadline: '2026-12-31',
        },
      },
      'actor-1',
    );

    expect(jobDescription.id).toBe('amis-job-description-1');
    expect(jobDescriptionRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      createdById: 'actor-1',
      title: 'Backend Engineer',
      description: 'Build backend services.',
      requirements: 'Node.js',
      applicationDeadline: '2026-12-31',
      sourceSystem: ExtensionSourceSystem.AMIS,
      sourceJobId: '46656',
      sourceUrl: 'https://amis.example/recruitment/46656',
      status: JobDescriptionStatus.ACTIVE,
    }));
    expect(jobDescriptionRepository.save).toHaveBeenCalledTimes(1);
  });

  it('repairs a missing AMIS mapping from an existing AMIS job description posting', async () => {
    const service = Object.create(ExtensionIntegrationService.prototype) as any;
    const externalReferenceRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value: Record<string, unknown>) => value),
      save: jest.fn(async (value: Record<string, unknown>) => ({
        ...value,
        id: 'external-reference-1',
      })),
    };
    const jobDescriptionRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'job-description-1',
        sourceSystem: ExtensionSourceSystem.AMIS,
        sourceJobId: '46657',
        sourceUrl: 'https://amisapp.misa.vn/recruitment/46657',
        status: JobDescriptionStatus.ACTIVE,
      }),
    };
    const jobPostingRepository = {
      find: jest.fn().mockResolvedValue([{
        id: 'job-posting-1',
        jobDescriptionId: 'job-description-1',
        createdAt: new Date('2026-09-04T00:00:00.000Z'),
      }]),
    };
    service.dataSource = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === RecruitmentExternalReferenceEntity) return externalReferenceRepository;
        if (entity === JobDescriptionEntity) return jobDescriptionRepository;
        if (entity === JobPostingEntity) return jobPostingRepository;
        throw new Error(`Unexpected repository: ${String(entity)}`);
      }),
    };

    await expect(
      (service as any).resolveJobPostingIdByAmisRecruitmentId('46657'),
    ).resolves.toBe('job-posting-1');

    expect(externalReferenceRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      sourceSystem: ExtensionSourceSystem.AMIS,
      externalEntityType: 'JOB_POSTING',
      externalId: '46657',
      internalEntityType: 'JOB_POSTING',
      internalEntityId: 'job-posting-1',
    }));
    expect(externalReferenceRepository.save).toHaveBeenCalledTimes(1);
  });
});
