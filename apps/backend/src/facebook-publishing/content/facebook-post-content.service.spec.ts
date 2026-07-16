import { ConfigService } from '@nestjs/config';
import { FacebookPostContentService } from './facebook-post-content.service';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('FacebookPostContentService', () => {
  it('hydrates the AI contact placeholder with the posting apply URL', () => {
    const service = new FacebookPostContentService({
      get: (key: string) => key === 'FACEBOOK_CANDIDATE_CTA_URL_BASE' ? '/jobs' : undefined,
    } as ConfigService);

    const content = service.build(
      { publicSlug: 'backend-engineer' } as any,
      'Quan tâm vui lòng [Inbox/Zalo/Email ứng tuyển] hoặc dùng {{APPLY_URL}}.',
    );

    expect(content).toBe('Quan tâm vui lòng /jobs/backend-engineer hoặc dùng /jobs/backend-engineer.');
  });

  it('uses the snapshot location when building a template preview', () => {
    const service = new FacebookPostContentService({ get: () => undefined } as unknown as ConfigService);

    const content = service.buildFromSnapshot({
      title: 'Backend Engineer',
      description: 'Build services',
      location: 'Da Nang',
    });

    expect(content).toContain('Dia diem lam viec: Da Nang');
  });
});
