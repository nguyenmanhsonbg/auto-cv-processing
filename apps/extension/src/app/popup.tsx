import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { isAllowedSidePanelUrl } from '@/lib/side-panel-scope';
import './styles.css';

const NATIVE_SIDE_PANEL_PATH = 'side-panel.html';

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

      const sidePanel = chrome.sidePanel;
      if (!sidePanel?.setOptions || !sidePanel.open) {
        throw new Error('Native Side Panel không khả dụng. Vui lòng cập nhật Chrome/Edge lên phiên bản 116 trở lên.');
      }

      await sidePanel.setOptions({
        tabId: activeTab.id,
        path: NATIVE_SIDE_PANEL_PATH,
        enabled: true,
      });
      // Keep sidePanel.open() in this click handler. Forwarding the request to
      // the service worker loses the transient user gesture required by Chrome.
      await sidePanel.open({ tabId: activeTab.id });
      window.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open the native side panel.');
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
