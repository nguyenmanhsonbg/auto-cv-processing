export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'UPLOAD_RATE_LIMIT_EXCEEDED'
  | 'MALWARE_DETECTED'
  | 'CV_SCAN_FAILED'
  | 'CV_NOT_RESUME'
  | 'CV_SANITIZE_FAILED'
  | 'CV_PARSE_FAILED'
  | 'DUPLICATE_APPLICATION'
  | 'DUPLICATE_CV_CONTENT'
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

export interface PublicCvSimilarityDetails {
  score: number;
  scorePercent: number;
  threshold: number;
  thresholdPercent: number;
  decision: string;
  methodVersion: string;
  oldTextPreview: string;
  newTextPreview: string;
  oldNormalizedTextHash?: string;
  newNormalizedTextHash?: string;
}

export const API_ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UPLOAD_RATE_LIMIT_EXCEEDED: 'UPLOAD_RATE_LIMIT_EXCEEDED',
  MALWARE_DETECTED: 'MALWARE_DETECTED',
  CV_SCAN_FAILED: 'CV_SCAN_FAILED',
  CV_NOT_RESUME: 'CV_NOT_RESUME',
  CV_SANITIZE_FAILED: 'CV_SANITIZE_FAILED',
  CV_PARSE_FAILED: 'CV_PARSE_FAILED',
  DUPLICATE_APPLICATION: 'DUPLICATE_APPLICATION',
  DUPLICATE_CV_CONTENT: 'DUPLICATE_CV_CONTENT',
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
  [API_ERROR_CODES.CV_NOT_RESUME]:
    'File tải lên chưa được xác nhận là CV. CV cần có nội dung văn bản, email và kỹ năng.',
  [API_ERROR_CODES.CV_SANITIZE_FAILED]: 'Hồ sơ đang cần được xử lý thêm.',
  [API_ERROR_CODES.CV_PARSE_FAILED]: 'Hồ sơ đang cần được xử lý thêm.',
  [API_ERROR_CODES.DUPLICATE_APPLICATION]: 'Hồ sơ ứng tuyển cho vị trí này đã tồn tại.',
  [API_ERROR_CODES.DUPLICATE_CV_CONTENT]: 'CV quá tương đồng với CV đã nộp trước đó cho vị trí này.',
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
  [API_ERROR_CODES.CV_NOT_RESUME]: 'File không đủ tín hiệu CV bắt buộc: rawText, email, skills.',
  [API_ERROR_CODES.CV_SANITIZE_FAILED]: 'Sanitize clean CV thất bại.',
  [API_ERROR_CODES.CV_PARSE_FAILED]: 'Parse clean CV thất bại hoặc text rỗng.',
  [API_ERROR_CODES.DUPLICATE_APPLICATION]: 'Application đã tồn tại cho candidate/job posting.',
  [API_ERROR_CODES.DUPLICATE_CV_CONTENT]: 'CV content similarity vượt ngưỡng cho phép.',
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

export function getPublicCvSimilarityDetails(
  error: unknown,
): PublicCvSimilarityDetails | null {
  if (!isRecord(error) || !Array.isArray(error.details)) return null;

  const firstDetail = error.details[0];
  if (!isRecord(firstDetail) || !isRecord(firstDetail.similarity)) return null;

  const similarity = firstDetail.similarity;
  const score = toFiniteNumber(similarity.score);
  const threshold = toFiniteNumber(similarity.threshold);
  const oldTextPreview = typeof similarity.oldTextPreview === 'string'
    ? similarity.oldTextPreview
    : null;
  const newTextPreview = typeof similarity.newTextPreview === 'string'
    ? similarity.newTextPreview
    : null;
  const methodVersion = typeof similarity.methodVersion === 'string'
    ? similarity.methodVersion
    : null;

  if (
    score === null
    || threshold === null
    || oldTextPreview === null
    || newTextPreview === null
    || methodVersion === null
  ) {
    return null;
  }

  const scorePercent = toFiniteNumber(similarity.scorePercent) ?? score * 100;
  const thresholdPercent = toFiniteNumber(similarity.thresholdPercent) ?? threshold * 100;

  return {
    score,
    scorePercent,
    threshold,
    thresholdPercent,
    decision: typeof similarity.decision === 'string' ? similarity.decision : 'DUPLICATE_FOUND',
    methodVersion,
    oldTextPreview,
    newTextPreview,
    ...(typeof similarity.oldNormalizedTextHash === 'string'
      ? { oldNormalizedTextHash: similarity.oldNormalizedTextHash }
      : {}),
    ...(typeof similarity.newNormalizedTextHash === 'string'
      ? { newNormalizedTextHash: similarity.newNormalizedTextHash }
      : {}),
  };
}

function toFiniteNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

export function getPublicSafeErrorMessage(error: unknown): string {
  const code = getApiErrorCode(error);
  if (code === API_ERROR_CODES.UNSUPPORTED_FILE_TYPE) {
    return 'Hien tai he thong chi ho tro CV dang PDF de dam bao quet va tao CV sach.';
  }
  if (code === API_ERROR_CODES.CV_SANITIZE_FAILED) {
    return 'CV chua the xu ly an toan. Vui long upload file PDF hop le hoac thu lai sau.';
  }
  if (code === API_ERROR_CODES.CV_PARSE_FAILED) {
    return 'CV chua the xu ly an toan. Vui long upload file PDF hop le hoac thu lai sau.';
  }
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

