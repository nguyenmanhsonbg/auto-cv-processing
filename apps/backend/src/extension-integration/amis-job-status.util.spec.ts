import { JobPostingStatus } from '../recruitment-common';
import { mapAmisJobStatus } from './amis-job-status.util';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('mapAmisJobStatus', () => {
  it.each([
    [1, JobPostingStatus.PUBLISHED],
    [2, JobPostingStatus.INTERNAL],
    [5, JobPostingStatus.NOT_ACCEPTING_APPLICATIONS],
    [3, JobPostingStatus.CLOSED],
  ] as const)('maps AMIS status %s to %s', (amisStatus: number, expected: JobPostingStatus) => {
    expect(mapAmisJobStatus(amisStatus)).toBe(expected);
  });

  it('rejects unsupported AMIS statuses', () => {
    expect(() => mapAmisJobStatus(4)).toThrow('Unsupported AMIS job status: 4');
  });
});
