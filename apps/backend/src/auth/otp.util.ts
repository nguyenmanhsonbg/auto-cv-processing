import { randomInt } from 'crypto';

const OTP_MIN = 100000;
const OTP_MAX_EXCLUSIVE = 1000000;

export function generatePasswordResetOtp() {
  return String(randomInt(OTP_MIN, OTP_MAX_EXCLUSIVE));
}
