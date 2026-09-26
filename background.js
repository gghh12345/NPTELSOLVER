/**
 * Background Service Worker for NPTEL Pro Solver
 * Handles side panel activation, screenshot capturing, and cross-context routing.
 */

// Automatically open side panel when extension action is clicked
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});

// Command listener for keyboard shortcuts (e.g., Alt+Shift+N)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open-side-panel') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
  }
});

// Runtime message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 1. Request to open side panel
  if (message.action === 'OPEN_SIDE_PANEL') {
    (async () => {
      try {
        const tabId = message.tabId || sender.tab?.id;
        const windowId = message.windowId || sender.tab?.windowId;
        if (tabId) {
          await chrome.sidePanel.open({ tabId });
          sendResponse({ success: true });
        } else if (windowId) {
          await chrome.sidePanel.open({ windowId });
          sendResponse({ success: true });
        } else {
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (activeTab?.id) {
            await chrome.sidePanel.open({ tabId: activeTab.id });
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'No active tab found' });
          }
        }
      } catch (err) {
        console.error('Failed to open side panel:', err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  }

  // 2. Request to capture visible tab for multimodal questions
  if (message.action === 'CAPTURE_TAB') {
    (async () => {
      try {
        const windowId = sender.tab?.windowId;
        const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
        sendResponse({ success: true, dataUrl });
      } catch (err) {
        console.error('Failed to capture tab screenshot:', err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // 3. Status Ping
  if (message.action === 'PING') {
    sendResponse({ status: 'PONG', timestamp: Date.now() });
    return false;
  }
});
