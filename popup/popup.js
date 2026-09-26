/**
 * NPTEL Pro Solver - Popup Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  const popupStatusBanner = document.getElementById('popupStatusBanner');
  const popupStatusText = document.getElementById('popupStatusText');
  const btnLaunchSidepanel = document.getElementById('btnLaunchSidepanel');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const isNptel = tab && tab.url && (
    tab.url.includes('nptel.ac.in') || 
    tab.url.includes('swayam.gov.in') || 
    tab.url.includes('mock_nptel')
  );

  if (isNptel) {
    popupStatusBanner.classList.add('nptel-active');
    popupStatusText.innerText = 'NPTEL Page Detected ✓';
  } else {
    popupStatusText.innerText = 'Not on an NPTEL assignment';
  }

  btnLaunchSidepanel.addEventListener('click', async () => {
    if (tab && tab.id) {
      try {
        await chrome.sidePanel.open({ tabId: tab.id });
        window.close(); // Close popup once side panel opens
      } catch (err) {
        console.error('Error opening side panel:', err);
      }
    }
  });
});
