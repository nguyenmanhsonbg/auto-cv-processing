import { BadRequestException } from '@nestjs/common';

export interface ReferralSourceInput {
  freelancerCode?: string | null;
  internalEmail?: string | null;
}

export function normalizeReferralSourceInput(input: ReferralSourceInput) {
  const freelancerCode = normalizeOptionalText(input.freelancerCode);
  const internalEmail = normalizeOptionalText(input.internalEmail);

  if (freelancerCode && internalEmail) {
    throw new BadRequestException({
      code: 'REFERRAL_SOURCE_CONFLICT',
      message: 'Freelancer code and Internal email cannot be used together.',
    });
  }

  return { freelancerCode, internalEmail };
}

function normalizeOptionalText(value?: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}
