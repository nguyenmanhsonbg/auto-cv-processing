import { InterviewEvaluationsService } from './interview-evaluations.service';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('InterviewEvaluationsService AMIS stage authorization', () => {
  it('uses the newest AMIS source when an application has stale earlier stages', async () => {
    const service = Object.create(InterviewEvaluationsService.prototype) as any;
    service.dataSource = {
      getRepository: () => ({
        find: async () => [
          {
            amisRoundId: '264374',
            roundName: 'Screening CV',
            sortOrder: 1,
            roundType: 1,
          },
          {
            amisRoundId: '264376',
            roundName: 'Phỏng vấn 1',
            sortOrder: 3,
            roundType: 3,
          },
        ],
      }),
    };

    const application = {
      sources: [
        {
          receivedAt: new Date('2026-08-28T08:00:00.000Z'),
          rawPayload: {
            sourceSystem: 'AMIS',
            recruitmentId: '46487',
            recruitmentRoundId: '264374',
            recruitmentRoundName: 'Screening CV',
          },
        },
        {
          receivedAt: new Date('2026-08-28T08:01:00.000Z'),
          rawPayload: {
            sourceSystem: 'AMIS',
            recruitmentId: '46487',
            recruitmentRoundId: '264376',
            recruitmentRoundName: 'Phỏng vấn 1',
          },
        },
      ],
    };

    await expect(service.isInterviewOrLater(application, '46487')).resolves.toBe(true);
  });
});
