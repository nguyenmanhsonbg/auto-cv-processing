import { sanitizeProfileForAi } from './ai-profile-sanitizer';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('sanitizeProfileForAi', () => {
  it('removes candidate identity fields while preserving professional evidence', () => {
    const result = sanitizeProfileForAi({
      name: 'Nguyen Van A',
      email: 'candidate@example.com',
      phone: '0900000000',
      birthYear: 1990,
      education: 'Computer Science',
      skills: ['TypeScript'],
      parsedProfile: {
        name: 'Nguyen Van A',
        email: 'candidate@example.com',
        phone: '0900000000',
        birthYear: 1990,
        projects: [{ name: 'Payment API', role: 'Backend Engineer' }],
      },
      rawText: 'Nguyen Van A candidate@example.com 0900000000',
      evaluation: { summary: { overallMatchScore: 82 } },
    });

    expect(result).toEqual({
      education: 'Computer Science',
      skills: ['TypeScript'],
      parsedProfile: {
        projects: [{ name: 'Payment API', role: 'Backend Engineer' }],
      },
      evaluation: { summary: { overallMatchScore: 82 } },
    });
  });
});
