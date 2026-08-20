import {
  getInactiveAmisRecruitmentRoundIds,
  normalizeAmisRecruitmentRounds,
} from './amis-recruitment-rounds.util';

declare const describe: (name: string, callback: () => void) => void;
declare const it: (name: string, callback: () => void) => void;
declare const expect: (value: unknown) => { toEqual(expected: unknown): void };

describe('AMIS recruitment round catalog utilities', () => {
  it('normalizes, trims, deduplicates, and orders rounds from AMIS', () => {
    const result = normalizeAmisRecruitmentRounds([
      {
        amisRoundId: ' round-2 ',
        name: '  Phỏng vấn  ',
        sortOrder: 2,
        roundType: 3,
        roundTypeId: 'type-2',
        color: '#123456',
      },
      {
        amisRoundId: 'round-1',
        name: 'Ứng tuyển',
        sortOrder: 1,
      },
      {
        amisRoundId: 'round-2',
        name: 'Phỏng vấn mới',
        sortOrder: 4,
      },
    ]);

    expect(result).toEqual([
      {
        amisRoundId: 'round-1',
        name: 'Ứng tuyển',
        sortOrder: 1,
        roundType: null,
        roundTypeId: null,
        color: null,
      },
      {
        amisRoundId: 'round-2',
        name: 'Phỏng vấn',
        sortOrder: 2,
        roundType: 3,
        roundTypeId: 'type-2',
        color: '#123456',
      },
    ]);
  });

  it('returns existing round ids missing from the latest AMIS process', () => {
    expect(getInactiveAmisRecruitmentRoundIds(
      ['round-1', 'round-2', 'round-3'],
      ['round-1', 'round-3'],
    )).toEqual(['round-2']);
  });
});
