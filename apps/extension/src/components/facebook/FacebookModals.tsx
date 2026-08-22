import { FacebookPreviewModal } from './FacebookPreviewModal';
import { FacebookGroupSettingsModal } from './FacebookGroupSettingsModal';
import { FacebookImageAttachPromptModal } from './FacebookImageAttachPromptModal';
import { FacebookGroupSyncDetailsModal } from './FacebookGroupSyncDetailsModal';
import { FacebookPostHistoryModal } from './FacebookPostHistoryModal';
import type { useFacebookManager } from '@/features/facebook/use-facebook-manager';

export type FacebookModalsProps = {
  manager: ReturnType<typeof useFacebookManager>;
};

export function FacebookModals({ manager }: FacebookModalsProps) {
  const { modals } = manager;

  return (
    <>
      <FacebookPreviewModal {...modals.previewModal} />
      <FacebookGroupSettingsModal {...modals.settingsModal} />
      <FacebookImageAttachPromptModal {...modals.imageAttachPromptModal} />
      <FacebookGroupSyncDetailsModal {...modals.syncDetailsModal} />
      <FacebookPostHistoryModal {...modals.postHistoryModal} />
    </>
  );
}
