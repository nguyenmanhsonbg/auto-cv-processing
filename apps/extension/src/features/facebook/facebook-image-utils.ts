import type { FacebookPublishAttachment, FacebookPublishPlan } from '@/types/types';
import { formatFileSize } from '@/lib/utils';

export const FACEBOOK_IMAGE_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const FACEBOOK_IMAGE_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export function getFacebookImageFileValidationError(file: File): string | null {
  if (!FACEBOOK_IMAGE_ALLOWED_TYPES.has(file.type)) {
    return 'Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.';
  }

  if (file.size > FACEBOOK_IMAGE_MAX_SIZE_BYTES) {
    return `Ảnh phải nhỏ hơn ${formatFileSize(FACEBOOK_IMAGE_MAX_SIZE_BYTES)}.`;
  }

  return null;
}

export function getFacebookImageContentKey(dataUrl: string): string {
  const separatorIndex = dataUrl.indexOf(',');
  return (separatorIndex >= 0 ? dataUrl.slice(separatorIndex + 1) : dataUrl).trim();
}

export function deduplicateFacebookImageAttachments(attachments: FacebookPublishAttachment[]): FacebookPublishAttachment[] {
  const seen = new Set<string>();
  return attachments.filter((attachment) => {
    const contentKey = getFacebookImageContentKey(attachment.dataUrl);
    if (!contentKey || seen.has(contentKey)) return false;
    seen.add(contentKey);
    return true;
  });
}

export function withFacebookImageAttachments(
  plan: FacebookPublishPlan,
  attachments: FacebookPublishAttachment[],
): FacebookPublishPlan {
  if (plan.attachments?.length || attachments.length === 0) return plan;

  return {
    ...plan,
    attachments,
  };
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Could not read image file.'));
    };
    reader.onerror = () => reject(new Error(reader.error?.message ?? 'Could not read image file.'));
    reader.readAsDataURL(file);
  });
}
