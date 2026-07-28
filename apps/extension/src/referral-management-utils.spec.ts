import { buildFreelancerIdentifierCopyText } from './referral-management-utils';

const actual = buildFreelancerIdentifierCopyText('FL000001');
if (actual !== 'FL000001') {
  throw new Error(`Expected the identifier copy text, received: ${actual}`);
}

console.log('referral-management-utils: copy text passed');
