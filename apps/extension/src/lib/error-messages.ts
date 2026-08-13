type ErrorDetails = {
  code?: unknown;
  message?: unknown;
  status?: unknown;
};

const ERROR_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: 'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.',
  HTTP_401: 'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.',
  HTTP_403: 'Bạn không có quyền thực hiện thao tác này.',
  HTTP_404: 'Không tìm thấy dữ liệu yêu cầu.',
  HTTP_500: 'Máy chủ đang gặp lỗi. Vui lòng thử lại sau.',
  FACEBOOK_ACCOUNT_NOT_FOUND: 'Không tìm thấy tài khoản Facebook đang sử dụng.',
  FACEBOOK_ACCOUNT_STORAGE_UNAVAILABLE: 'Không thể lưu thông tin tài khoản Facebook.',
  FACEBOOK_DAILY_QUOTA_EXCEEDED: 'Nhóm Facebook đã đạt giới hạn đăng bài trong ngày.',
  FACEBOOK_GROUP_ALREADY_EXISTS: 'Nhóm Facebook này đã tồn tại.',
  FACEBOOK_GROUP_NOT_FOUND: 'Nhóm không tồn tại trong hệ thống',
  FACEBOOK_GROUP_URL_INVALID: 'URL nhóm Facebook không hợp lệ.',
  FACEBOOK_PUBLISH_HISTORY_NOT_FOUND: 'Không tìm thấy lịch sử đăng bài Facebook.',
  FACEBOOK_TARGETS_INVALID: 'Một hoặc nhiều nhóm Facebook không còn khả dụng.',
  FACEBOOK_TARGETS_NOT_ELIGIBLE: 'Một hoặc nhiều nhóm Facebook chưa đủ điều kiện đăng bài hoặc đã hết quota.',
  FACEBOOK_TARGETS_REQUIRED: 'Vui lòng chọn ít nhất một nhóm Facebook trước khi đăng bài.',
  EXTENSION_INSTANCE_DISABLED: 'Extension hiện đang bị vô hiệu hóa.',
  EXTENSION_INSTANCE_NOT_FOUND: 'Không tìm thấy phiên extension hiện tại. Vui lòng tải lại extension.',
  IDEMPOTENCY_KEY_CONFLICT: 'Yêu cầu đăng bài bị trùng. Vui lòng thử lại thao tác.',
  IDEMPOTENCY_REQUEST_IN_PROGRESS: 'Yêu cầu trước đó vẫn đang được xử lý.',
  INVALID_STATE_TRANSITION: 'Thao tác này không thể thực hiện ở trạng thái hiện tại.',
  JOB_DESCRIPTION_REQUIRED: 'Vui lòng chọn một Job Description trước khi đăng bài.',
  JOB_DESCRIPTION_NOT_FOUND: 'Không tìm thấy Job Description đã chọn.',
  JOB_DESCRIPTION_ARCHIVED: 'Job Description đã được lưu trữ và không thể sử dụng.',
  JOB_POSTING_NOT_FOUND: 'Không tìm thấy tin tuyển dụng.',
  QUESTION_SET_NOT_FOUND: 'Không tìm thấy bộ câu hỏi của Job Description.',
  VALIDATION_ERROR: 'Thông tin gửi lên không hợp lệ.',
};

const MESSAGE_PATTERNS: Array<[RegExp, string]> = [
  [/daily publish limit|quota.*(reached|exceeded)|đạt tối đa .* bài/i, 'Nhóm Facebook đã đạt giới hạn đăng bài trong ngày.'],
  [/facebook.*(login|logged in)|login.*facebook|facebook session.*(expired|required)/i, 'Vui lòng đăng nhập Facebook trước khi thực hiện thao tác này.'],
  [/active facebook browser account does not match|account.*does not match.*selected facebook/i, 'Tài khoản Facebook trên trình duyệt không khớp với các nhóm đã chọn.'],
  [/could not identify.*facebook account|facebook account.*not.*identif/i, 'Không xác định được tài khoản Facebook đang đăng nhập.'],
  [/could not find facebook group post composer|could not open facebook group post composer|post composer/i, 'Không mở được khung đăng bài của nhóm Facebook.'],
  [/cannot access or post|cannot post to this group|current facebook account cannot post/i, 'Tài khoản Facebook hiện tại không thể đăng bài vào nhóm này.'],
  [/facebook group not found|group not found/i, 'Không tìm thấy nhóm Facebook hoặc nhóm không thuộc tài khoản hiện tại.'],
  [/timeout|timed out/i, 'Facebook phản hồi quá lâu. Vui lòng thử lại.'],
  [/network|networkerror|Failed to fetch|err_failed|load failed|fetch failed|failed to fetch|fail to fetch/i, 'Có lỗi kết nối mạng, vui lòng kiểm tra lại.'],
];

export function toVietnameseErrorMessage(error: unknown, fallback = 'Không thể hoàn tất thao tác. Vui lòng thử lại.') {
  const details = isErrorDetails(error) ? error : null;
  const code = typeof details?.code === 'string' ? details.code : '';
  const rawMessage = typeof details?.message === 'string'
    ? details.message.trim()
    : error instanceof Error
      ? error.message.trim()
      : '';

  if (code === 'FACEBOOK_DAILY_QUOTA_EXCEEDED' && /\d+/.test(rawMessage)) {
    return rawMessage;
  }

  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];

  const matchedPattern = MESSAGE_PATTERNS.find(([pattern]) => pattern.test(rawMessage));
  if (matchedPattern) return matchedPattern[1];

  if (containsVietnamese(rawMessage)) return rawMessage;
  return fallback;
}

function isErrorDetails(value: unknown): value is ErrorDetails {
  return typeof value === 'object' && value !== null;
}

function containsVietnamese(value: string) {
  return /[À-ỹ]/u.test(value);
}
