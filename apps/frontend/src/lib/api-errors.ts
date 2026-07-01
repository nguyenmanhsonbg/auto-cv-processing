export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'UPLOAD_RATE_LIMIT_EXCEEDED'
  | 'MALWARE_DETECTED'
  | 'CV_SCAN_FAILED'
  | 'CV_SANITIZE_FAILED'
  | 'CV_PARSE_FAILED'
  | 'DUPLICATE_APPLICATION'
  | 'DUPLICATE_CV_FILE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_STATE_TRANSITION'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | string;

export interface ApiErrorLike {
  status?: number;
  code?: string;
  message?: string;
  details?: unknown;
}

export const API_ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UPLOAD_RATE_LIMIT_EXCEEDED: 'UPLOAD_RATE_LIMIT_EXCEEDED',
  MALWARE_DETECTED: 'MALWARE_DETECTED',
  CV_SCAN_FAILED: 'CV_SCAN_FAILED',
  CV_SANITIZE_FAILED: 'CV_SANITIZE_FAILED',
  CV_PARSE_FAILED: 'CV_PARSE_FAILED',
  DUPLICATE_APPLICATION: 'DUPLICATE_APPLICATION',
  DUPLICATE_CV_FILE: 'DUPLICATE_CV_FILE',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const satisfies Record<string, ApiErrorCode>;

const PUBLIC_SAFE_MESSAGES: Record<string, string> = {
  [API_ERROR_CODES.VALIDATION_ERROR]: 'Thông tin gửi lên chưa hợp lệ. Vui lòng kiểm tra lại.',
  [API_ERROR_CODES.UNSUPPORTED_FILE_TYPE]:
    'Định dạng CV chưa được hỗ trợ. Vui lòng tải lên PDF, DOCX hoặc XLSX.',
  [API_ERROR_CODES.FILE_TOO_LARGE]: 'File vượt dung lượng cho phép. Vui lòng chọn file nhỏ hơn.',
  [API_ERROR_CODES.UPLOAD_RATE_LIMIT_EXCEEDED]:
    'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.',
  [API_ERROR_CODES.MALWARE_DETECTED]:
    'CV không được chấp nhận do không đáp ứng chính sách bảo mật.',
  [API_ERROR_CODES.CV_SCAN_FAILED]:
    'Hệ thống chưa thể kiểm tra CV. Vui lòng thử lại sau.',
  [API_ERROR_CODES.CV_SANITIZE_FAILED]: 'Hồ sơ đang cần được xử lý thêm.',
  [API_ERROR_CODES.CV_PARSE_FAILED]: 'Hồ sơ đang cần được xử lý thêm.',
  [API_ERROR_CODES.DUPLICATE_APPLICATION]: 'Hồ sơ ứng tuyển cho vị trí này đã tồn tại.',
  [API_ERROR_CODES.DUPLICATE_CV_FILE]: 'CV này đã được tải lên cho hồ sơ ứng tuyển.',
  [API_ERROR_CODES.IDEMPOTENCY_CONFLICT]:
    'Yêu cầu gửi lại không khớp với lần gửi trước. Vui lòng thử lại.',
  [API_ERROR_CODES.INVALID_STATE_TRANSITION]: 'Thao tác hiện chưa thể thực hiện.',
  [API_ERROR_CODES.FORBIDDEN]: 'Bạn không có quyền truy cập nội dung này.',
  [API_ERROR_CODES.NOT_FOUND]: 'Không tìm thấy nội dung yêu cầu.',
  [API_ERROR_CODES.UNAUTHORIZED]: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
};

const INTERNAL_SAFE_MESSAGES: Record<string, string> = {
  [API_ERROR_CODES.VALIDATION_ERROR]: 'Dữ liệu không hợp lệ.',
  [API_ERROR_CODES.UNSUPPORTED_FILE_TYPE]: 'File type hoặc MIME không được hỗ trợ.',
  [API_ERROR_CODES.FILE_TOO_LARGE]: 'File vượt giới hạn dung lượng cấu hình.',
  [API_ERROR_CODES.UPLOAD_RATE_LIMIT_EXCEEDED]: 'Yêu cầu bị giới hạn tần suất.',
  [API_ERROR_CODES.MALWARE_DETECTED]: 'CV bị scanner đánh dấu rủi ro bảo mật.',
  [API_ERROR_CODES.CV_SCAN_FAILED]: 'Scanner failed hoặc timeout kỹ thuật.',
  [API_ERROR_CODES.CV_SANITIZE_FAILED]: 'Sanitize clean CV thất bại.',
  [API_ERROR_CODES.CV_PARSE_FAILED]: 'Parse clean CV thất bại hoặc text rỗng.',
  [API_ERROR_CODES.DUPLICATE_APPLICATION]: 'Application đã tồn tại cho candidate/job posting.',
  [API_ERROR_CODES.DUPLICATE_CV_FILE]: 'CV file hash đã tồn tại cho application.',
  [API_ERROR_CODES.IDEMPOTENCY_CONFLICT]:
    'Idempotency key bị dùng lại với payload hoặc file khác.',
  [API_ERROR_CODES.INVALID_STATE_TRANSITION]: 'State transition không hợp lệ.',
  [API_ERROR_CODES.FORBIDDEN]: 'Không có quyền truy cập resource này.',
  [API_ERROR_CODES.NOT_FOUND]: 'Không tìm thấy resource.',
  [API_ERROR_CODES.UNAUTHORIZED]: 'Chưa xác thực hoặc token không hợp lệ.',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function getApiErrorCode(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;

  if (typeof error.code === 'string') return error.code;

  const nestedError = error.error;
  if (isRecord(nestedError) && typeof nestedError.code === 'string') {
    return nestedError.code;
  }

  return undefined;
}

export function getPublicSafeErrorMessage(error: unknown): string {
  const code = getApiErrorCode(error);
  if (code && PUBLIC_SAFE_MESSAGES[code]) return PUBLIC_SAFE_MESSAGES[code];

  return 'Không thể xử lý yêu cầu lúc này. Vui lòng thử lại sau.';
}

export function getInternalSafeErrorMessage(error: unknown): string {
  const code = getApiErrorCode(error);
  if (code && INTERNAL_SAFE_MESSAGES[code]) return INTERNAL_SAFE_MESSAGES[code];

  if (isRecord(error) && typeof error.message === 'string') {
    return error.message;
  }

  return 'Không thể xử lý yêu cầu lúc này.';
}

