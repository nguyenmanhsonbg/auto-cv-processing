import { ExtensionSourceSystem } from './enums';
import { ExtensionIntegrationService } from './extension-integration.service';
import { AmisRecruitmentRoundEntity } from './entities';
import { UserEntity } from '../auth/entities/user.entity';

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
