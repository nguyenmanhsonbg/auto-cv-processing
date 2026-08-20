import type {
  FacebookImageAttachDecisionPrompt,
  FacebookImageAttachFailureDecision,
} from '@/types/types';
import { formatFileSize } from '@/lib/utils';

export type FacebookImageAttachPromptModalProps = {
  prompt: FacebookImageAttachDecisionPrompt | null;
  onResolve: (decision: FacebookImageAttachFailureDecision) => void;
};

export function FacebookImageAttachPromptModal({
  prompt,
  onResolve,
}: FacebookImageAttachPromptModalProps) {
  if (!prompt) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="facebook-group-modal facebook-image-decision-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="facebook-image-attach-title"
      >
        <div className="modal-header">
          <div>
            <h2 id="facebook-image-attach-title">Không attach được ảnh</h2>
            <p>{prompt.target.targetName}</p>
          </div>
        </div>
        <div className="modal-body">
          <div className="facebook-image-preview is-modal">
            <img src={prompt.attachment.dataUrl} alt="" />
            <div>
              <strong>{prompt.attachment.fileName}</strong>
              <span>{formatFileSize(prompt.attachment.size)}</span>
            </div>
          </div>
          <p className="modal-status is-error">{prompt.message}</p>
          <div className="form-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => onResolve('SKIP')}
            >
              Không đăng bài này
            </button>
            <button
              type="button"
              className="primary-button compact-button"
              onClick={() => onResolve('POST_TEXT_ONLY')}
            >
              Vẫn đăng text-only
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
