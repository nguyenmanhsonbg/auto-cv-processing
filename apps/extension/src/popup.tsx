import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function Popup() {
  const [error, setError] = useState<string | null>(null);

  async function openPanel() {
    setError(null);
    try {
      const [activeTab] = await chrome.tabs?.query({ active: true, currentWindow: true }) ?? [];
      if (!activeTab?.windowId) throw new Error('No active browser window.');
      await chrome.sidePanel?.open({ windowId: activeTab.windowId });
      window.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open panel.');
    }
  }

  return (
    <main className="popup-shell">
      <div>
        <p className="eyebrow">VCS Posting</p>
        <h1>AMIS Sync</h1>
      </div>
      <button type="button" className="primary-button" onClick={openPanel}>
        Open panel
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
