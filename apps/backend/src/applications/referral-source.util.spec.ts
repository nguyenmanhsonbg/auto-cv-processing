import { BadRequestException } from '@nestjs/common';
import {
  normalizeReferralSourceInput,
} from './referral-source.util';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('normalizeReferralSourceInput', () => {
  it('returns no source when both optional values are empty', () => {
    expect(normalizeReferralSourceInput({ freelancerCode: '  ', internalEmail: null }))
      .toEqual({ freelancerCode: null, internalEmail: null });
  });

  it('rejects a request containing both source values', () => {
    let error: unknown;
    try {
      normalizeReferralSourceInput({
        freelancerCode: 'FL000001',
        internalEmail: 'user@viettel.com.vn',
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'REFERRAL_SOURCE_CONFLICT',
    });
  });
});
