import { AmisRecruitmentRoundsService } from './amis-recruitment-rounds.service';

declare const describe: (name: string, callback: () => void) => void;
declare const it: (name: string, callback: () => void | Promise<void>) => void;
declare const expect: (value: unknown) => {
  toEqual(expected: unknown): void;
  toBe(expected: unknown): void;
};

describe('AmisRecruitmentRoundsService', () => {
  it('upserts the latest process and deactivates rounds removed from AMIS', async () => {
    const existing = [
      {
        id: 'old-record',
        sourceSystem: 'AMIS',
        amisRecruitmentId: 'jd-1',
        amisRoundId: 'round-old',
        roundName: 'Vòng cũ',
        sortOrder: 1,
        roundType: null,
        roundTypeId: null,
        color: null,
        isActive: true,
      },
    ];
    const saved: Array<Record<string, unknown>> = [];
    const repository = {
      find: async (options: { where?: { isActive?: boolean } }) => (
        options.where?.isActive === true ? existing.filter((item) => item.isActive) : existing
      ),
      create: (value: Record<string, unknown>) => ({ id: 'new-record', ...value }),
      save: async (value: Record<string, unknown> | Array<Record<string, unknown>>) => {
        const records = Array.isArray(value) ? value : [value];
        saved.push(...records);
        return value;
      },
    };
    const dataSource = {
      transaction: async (callback: (manager: { getRepository: () => typeof repository }) => Promise<unknown>) =>
        callback({ getRepository: () => repository }),
    };
    const service = new AmisRecruitmentRoundsService(dataSource as never);

    const result = await service.sync('jd-1', {
      sourceUrl: 'https://amis.example/jd-1',
      rounds: [{
        amisRoundId: 'round-new',
        name: 'Vòng mới',
        sortOrder: 2,
      }],
    });

    expect(saved.map((record) => ({
      id: record.id,
      amisRoundId: record.amisRoundId,
      roundName: record.roundName,
      sortOrder: record.sortOrder,
      isActive: record.isActive,
      sourceUrl: record.sourceUrl,
    }))).toEqual([
      {
        id: 'new-record',
        amisRoundId: 'round-new',
        roundName: 'Vòng mới',
        sortOrder: 2,
        isActive: true,
        sourceUrl: 'https://amis.example/jd-1',
      },
      {
        id: 'old-record',
        amisRoundId: 'round-old',
        roundName: 'Vòng cũ',
        sortOrder: 1,
        isActive: false,
        sourceUrl: 'https://amis.example/jd-1',
      },
    ]);
    expect(saved[0]?.lastSyncedAt instanceof Date).toBe(true);
    expect(result).toEqual([{
      id: 'round-new',
      name: 'Vòng mới',
      sortOrder: 2,
      roundType: null,
      roundTypeId: null,
      color: null,
    }]);
  });
});
