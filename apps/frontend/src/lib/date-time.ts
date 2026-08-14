const RECRUITMENT_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const recruitmentDateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: RECRUITMENT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatRecruitmentDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return recruitmentDateTimeFormatter.format(date);
}

const recruitmentLocalDateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatRecruitmentLocalDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return recruitmentLocalDateTimeFormatter.format(date);
}
