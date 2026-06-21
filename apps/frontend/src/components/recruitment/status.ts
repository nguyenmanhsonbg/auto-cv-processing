import { ApplicationStatus } from '@/types/recruitment';

export type RecruitmentStatusVariant =
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'success'
  | 'warning'
  | 'info';

const STATUS_LABELS: Record<string, string> = {
  [ApplicationStatus.APPLICATION_CREATED]: 'Hồ sơ đã tạo',
  [ApplicationStatus.APPLICATION_VALIDATING]: 'Đang kiểm tra hồ sơ',
  [ApplicationStatus.APPLICATION_REJECTED_INVALID]: 'Hồ sơ không hợp lệ',
  [ApplicationStatus.APPLICATION_DUPLICATE_CHECKING]: 'Đang kiểm tra trùng',
  [ApplicationStatus.APPLICATION_DUPLICATE_FOUND]: 'Hồ sơ có thể bị trùng',
  [ApplicationStatus.APPLICATION_OVERWRITTEN]: 'Hồ sơ đã được cập nhật',
  [ApplicationStatus.APPLICATION_REJECTED_RATE_LIMIT]: 'Tạm thời chưa thể tiếp nhận',
  [ApplicationStatus.CV_UPLOADED]: 'CV đã tải lên',
  [ApplicationStatus.CV_STORED_QUARANTINE]: 'CV đã được lưu để kiểm tra',
  [ApplicationStatus.CV_SCAN_REQUESTED]: 'Đang kiểm tra bảo mật CV',
  [ApplicationStatus.CV_SCAN_PASSED]: 'CV đã qua kiểm tra bảo mật',
  [ApplicationStatus.CV_SCAN_FAILED]: 'Kiểm tra bảo mật CV gặp lỗi kỹ thuật',
  [ApplicationStatus.CV_REJECTED_MALWARE]: 'CV không đáp ứng chính sách bảo mật',
  [ApplicationStatus.CV_SANITIZING]: 'Đang tạo bản CV sạch',
  [ApplicationStatus.CV_SANITIZED]: 'Đã có clean CV',
  [ApplicationStatus.CV_SANITIZE_FAILED]: 'Không tạo được clean CV',
  [ApplicationStatus.CV_PARSE_FAILED]: 'Không parse được clean CV',
  [ApplicationStatus.CV_PARSED]: 'Đã parse CV',
};

const STATUS_VARIANTS: Record<string, RecruitmentStatusVariant> = {
  [ApplicationStatus.APPLICATION_CREATED]: 'info',
  [ApplicationStatus.APPLICATION_VALIDATING]: 'info',
  [ApplicationStatus.APPLICATION_REJECTED_INVALID]: 'destructive',
  [ApplicationStatus.APPLICATION_DUPLICATE_CHECKING]: 'warning',
  [ApplicationStatus.APPLICATION_DUPLICATE_FOUND]: 'warning',
  [ApplicationStatus.APPLICATION_OVERWRITTEN]: 'info',
  [ApplicationStatus.APPLICATION_REJECTED_RATE_LIMIT]: 'destructive',
  [ApplicationStatus.CV_UPLOADED]: 'info',
  [ApplicationStatus.CV_STORED_QUARANTINE]: 'info',
  [ApplicationStatus.CV_SCAN_REQUESTED]: 'warning',
  [ApplicationStatus.CV_SCAN_PASSED]: 'success',
  [ApplicationStatus.CV_SCAN_FAILED]: 'destructive',
  [ApplicationStatus.CV_REJECTED_MALWARE]: 'destructive',
  [ApplicationStatus.CV_SANITIZING]: 'warning',
  [ApplicationStatus.CV_SANITIZED]: 'success',
  [ApplicationStatus.CV_SANITIZE_FAILED]: 'destructive',
  [ApplicationStatus.CV_PARSE_FAILED]: 'destructive',
  [ApplicationStatus.CV_PARSED]: 'success',
};

const CANDIDATE_VISIBLE_STATUSES = new Set<string>([
  ApplicationStatus.APPLICATION_CREATED,
  ApplicationStatus.APPLICATION_VALIDATING,
  ApplicationStatus.APPLICATION_REJECTED_INVALID,
  ApplicationStatus.APPLICATION_OVERWRITTEN,
  ApplicationStatus.APPLICATION_REJECTED_RATE_LIMIT,
  ApplicationStatus.CV_UPLOADED,
  ApplicationStatus.CV_SCAN_REQUESTED,
  ApplicationStatus.CV_SCAN_PASSED,
  ApplicationStatus.CV_SCAN_FAILED,
  ApplicationStatus.CV_REJECTED_MALWARE,
]);

const HR_VISIBLE_STATUSES = new Set<string>(Object.values(ApplicationStatus));

export function getRecruitmentStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function getRecruitmentStatusVariant(status: string): RecruitmentStatusVariant {
  return STATUS_VARIANTS[status] ?? 'secondary';
}

export function isCandidateVisibleStatus(status: string): boolean {
  return CANDIDATE_VISIBLE_STATUSES.has(status);
}

export function isHrVisibleStatus(status: string): boolean {
  return HR_VISIBLE_STATUSES.has(status);
}

export function getRecruitmentStatusClassName(status: string): string {
  switch (getRecruitmentStatusVariant(status)) {
    case 'success':
      return 'bg-green-100 text-green-800';
    case 'warning':
      return 'bg-amber-100 text-amber-800';
    case 'info':
      return 'bg-blue-100 text-blue-800';
    case 'destructive':
      return 'bg-red-100 text-red-800';
    case 'outline':
      return 'border-border text-foreground';
    case 'default':
      return 'bg-primary text-primary-foreground';
    case 'secondary':
    default:
      return 'bg-secondary text-secondary-foreground';
  }
}

