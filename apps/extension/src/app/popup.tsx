import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { isAllowedSidePanelUrl } from '@/lib/side-panel-scope';
import {
  AMIS_OVERLAY_OPEN_REQUEST_MESSAGE_TYPE,
  isAmisOverlayOpenResponse,
} from '@/integrations/amis/amis-overlay-contract';
import './styles.css';

function Popup() {
  const [error, setError] = useState<string | null>(null);

  async function openOverlay() {
    setError(null);
    try {
      const [activeTab] = await chrome.tabs?.query({ active: true, currentWindow: true }) ?? [];
      if (activeTab?.id === undefined) throw new Error('No active browser tab.');
      if (!isAllowedSidePanelUrl(activeTab.url)) {
        throw new Error('Extension chỉ hoạt động trên tab AMIS hoặc form đánh giá sau phỏng vấn.');
      }
      const response = await chrome.runtime?.sendMessage?.({
        type: AMIS_OVERLAY_OPEN_REQUEST_MESSAGE_TYPE,
        tabId: activeTab.id,
      });
      const openResponse = isAmisOverlayOpenResponse(response) ? response : null;
      if (!openResponse?.ok) {
        throw new Error(openResponse?.error ?? 'Unable to open the extension overlay.');
      }
      window.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open the extension overlay.');
    }
  }

  return (
    <main className="popup-shell">
      <div>
        <p className="eyebrow">VCS Posting</p>
        <h1>AMIS Sync</h1>
      </div>
      <button type="button" className="primary-button" onClick={openOverlay}>
        Open extension
      </button>
      {error ? <p className="error-text">{error}</p> : null}
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>,
);
