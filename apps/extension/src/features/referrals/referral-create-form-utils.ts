export const FREELANCER_NAME_MAX_LENGTH = 255;
export const FREELANCER_NAME_REQUIRED_ERROR = 'Họ và tên là bắt buộc, không được để trống';
export const FREELANCER_EMAIL_MAX_LENGTH = 255;
export const FREELANCER_EMAIL_REQUIRED_ERROR = 'Email là bắt buộc, không được để trống';
export const FREELANCER_EMAIL_INVALID_ERROR = 'Email không hợp lệ';
export const FREELANCER_PHONE_MAX_LENGTH = 64;
export const FREELANCER_PHONE_REQUIRED_ERROR = 'Số điện thoại là bắt buộc, không được để trống';

export function limitFreelancerNameInput(value: string) {
  return value.slice(0, FREELANCER_NAME_MAX_LENGTH);
}

export function normalizeFreelancerName(value: string) {
  return value.trim();
}

export function validateFreelancerName(value: string) {
  return normalizeFreelancerName(value) ? null : FREELANCER_NAME_REQUIRED_ERROR;
}

export function limitFreelancerEmailInput(value: string) {
  return value.slice(0, FREELANCER_EMAIL_MAX_LENGTH);
}

export function normalizeFreelancerEmail(value: string) {
  return value.trim().toLowerCase();
}

export function limitFreelancerPhoneInput(value: string) {
  return value.replace(/\D/g, '').slice(0, FREELANCER_PHONE_MAX_LENGTH);
}

export function validateFreelancerPhone(value: string) {
  return value.trim() ? null : FREELANCER_PHONE_REQUIRED_ERROR;
}
