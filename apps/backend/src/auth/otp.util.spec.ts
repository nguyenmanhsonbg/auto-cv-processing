import { generatePasswordResetOtp } from './otp.util';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('generatePasswordResetOtp', () => {
  it('always returns a six-digit OTP accepted by the password-reset flow', () => {
    for (let index = 0; index < 100; index += 1) {
      expect(generatePasswordResetOtp()).toMatch(/^[0-9]{6}$/);
    }
  });
});
