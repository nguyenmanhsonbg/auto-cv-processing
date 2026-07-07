import type { SyncAmisJobPostingRequest } from './types';

export function createMockAmisSyncRequest(): SyncAmisJobPostingRequest {
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

  return {
    sourceSystem: 'AMIS',
    amisRecruitmentId: `AMIS-MOCK-${suffix}`,
    amisUrl: 'https://amis.example.invalid/recruitment/mock',
    action: 'PUBLISH',
    snapshot: {
      title: `Backend Developer ${suffix}`,
      summary: 'Build and operate recruitment services for VCS.',
      description: 'Build and operate recruitment services for VCS.',
      requirements: {
        rawText: 'NestJS, PostgreSQL, API design, and production troubleshooting.',
        sections: [
          {
            title: 'Core',
            items: ['NestJS', 'PostgreSQL', 'REST API'],
          },
        ],
        mustHaveSkills: ['NestJS', 'PostgreSQL'],
      },
      benefits: {
        rawText: 'Competitive compensation and engineering ownership.',
      },
      location: 'Ho Chi Minh City',
    },
    channels: ['TOPCV'],
    metadata: {
      extensionVersion: '0.1.0',
      capturedAt: new Date().toISOString(),
    },
  };
}
