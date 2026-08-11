import { BadRequestException } from '@nestjs/common';
import { normalizeInternalEmail } from './internal-email.util';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('normalizeInternalEmail', () => {
  it('normalizes a valid viettel.com.vn address to lowercase', () => {
    expect(normalizeInternalEmail('  User.Name@VIETTEL.COM.VN '))
      .toBe('user.name@viettel.com.vn');
  });

  it('rejects an address outside the exact viettel.com.vn domain', () => {
    expect(() => normalizeInternalEmail('user@viettel.vn'))
      .toThrow(BadRequestException);
    expect(() => normalizeInternalEmail('user@sub.viettel.com.vn'))
      .toThrow(BadRequestException);
  });

  it('treats an empty optional value as no Internal source', () => {
    expect(normalizeInternalEmail('   ', { optional: true })).toBeNull();
  });

  it('rejects control characters that are not valid email input', () => {
    expect(() => normalizeInternalEmail('user\u0000@viettel.com.vn'))
      .toThrow(BadRequestException);
  });
});
