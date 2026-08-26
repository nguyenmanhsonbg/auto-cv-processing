import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FREELANCER_NAME_MAX_LENGTH,
  FREELANCER_NAME_REQUIRED_ERROR,
  FREELANCER_PHONE_MAX_LENGTH,
  FREELANCER_PHONE_REQUIRED_ERROR,
  limitFreelancerNameInput,
  limitFreelancerPhoneInput,
  normalizeFreelancerName,
  validateFreelancerPhone,
  validateFreelancerName,
} from './referral-create-form-utils';

test('rejects a Freelancer name that contains only spaces', () => {
  assert.equal(validateFreelancerName('   \t  '), FREELANCER_NAME_REQUIRED_ERROR);
});

test('limits Freelancer name input to 255 characters', () => {
  assert.equal(limitFreelancerNameInput('a'.repeat(300)).length, FREELANCER_NAME_MAX_LENGTH);
});

test('trims leading and trailing spaces from a valid Freelancer name', () => {
  assert.equal(normalizeFreelancerName('  Nguyễn Văn A  '), 'Nguyễn Văn A');
  assert.equal(validateFreelancerName('  Nguyễn Văn A  '), null);
});

test('rejects a Freelancer phone that contains only spaces', () => {
  assert.equal(validateFreelancerPhone('   \t  '), FREELANCER_PHONE_REQUIRED_ERROR);
  assert.equal(validateFreelancerPhone(''), FREELANCER_PHONE_REQUIRED_ERROR);
});

test('limits Freelancer phone input to 64 digits', () => {
  const phone = limitFreelancerPhoneInput('1'.repeat(65));

  assert.equal(phone.length, FREELANCER_PHONE_MAX_LENGTH);
  assert.equal(phone, '1'.repeat(FREELANCER_PHONE_MAX_LENGTH));
});

test('keeps Freelancer phone input numeric when pasted', () => {
  assert.equal(limitFreelancerPhoneInput('+84 (912) 345-678'), '84912345678');
});
