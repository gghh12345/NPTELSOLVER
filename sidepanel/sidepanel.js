/**
 * NPTEL Pro Solver - Side Panel Controller
 * Coordinates scanning, Question Bank lookups, AI fallbacks, and DOM autofilling.
 */

// State
let activeTabId = null;
let currentScannedQuestions = [];
let solvedAnswersMap = {}; // qIndex -> { selectedIndex, selectedText, confidence, reasoning, source }

// Elements
const connectionStatus = document.getElementById('connectionStatus');
const detectedAssignmentTitle = document.getElementById('detectedAssignmentTitle');
const btnScanPage = document.getElementById('btnScanPage');
const btnSolveAll = document.getElementById('btnSolveAll');
const btnAutofillAll = document.getElementById('btnAutofillAll');
const toggleHighlightOnly = document.getElementById('toggleHighlightOnly');
const progressContainer = document.getElementById('progressContainer');
const progressStatusText = document.getElementById('progressStatusText');
const progressPercentage = document.getElementById('progressPercentage');
const progressBarFill = document.getElementById('progressBarFill');
const emptyState = document.getElementById('emptyState');
const questionList = document.getElementById('questionList');

// Question Bank Elements
const bankSearchInput = document.getElementById('bankSearchInput');
const bankList = document.getElementById('bankList');

// Settings Elements
const customApiKey = document.getElementById('customApiKey');
const btnToggleKeyVisibility = document.getElementById('btnToggleKeyVisibility');
const modelSelect = document.getElementById('modelSelect');
const btnSaveSettings = document.getElementById('btnSaveSettings');
const settingsSaveStatus = document.getElementById('settingsSaveStatus');

// ── Active Tab Resolution ───────────────────────────────────────────────────

async function getActiveWebTab() {
  // 1. Try active tab in last focused window
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs && tabs[0] && tabs[0].url && !tabs[0].url.startsWith('chrome-extension://')) {
      return tabs[0];
    }
  } catch (_) {}

  // 2. Try active tab in current window
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0] && tabs[0].url && !tabs[0].url.startsWith('chrome-extension://')) {
      return tabs[0];
    }
  } catch (_) {}

  // 3. Search all tabs for an active NPTEL or Swayam tab
  try {
    const allTabs = await chrome.tabs.query({});
    const nptelActiveTab = allTabs.find(t => t.active && t.url && (t.url.includes('nptel.ac.in') || t.url.includes('swayam.gov.in') || t.url.includes('mock_nptel')));
    if (nptelActiveTab) return nptelActiveTab;

    // 4. Any open NPTEL tab
    const anyNptelTab = allTabs.find(t => t.url && (t.url.includes('nptel.ac.in') || t.url.includes('swayam.gov.in') || t.url.includes('mock_nptel')));
    if (anyNptelTab) return anyNptelTab;

    return allTabs[0] || null;
  } catch (_) {}

  return null;
}

// ── Tab Management & Detection ───────────────────────────────────────────────

async function ensureContentScriptReady(tabId) {
  if (!tabId) return false;
  try {
    const res = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
    if (res && res.alive) return true;
  } catch (e) {
    // Content script not listening. Programmatically inject content script into tab!
    try {
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ['content/content.css']
      });
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content/content.js']
      });
      await new Promise(r => setTimeout(r, 250));
      const retry = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
      return Boolean(retry && retry.alive);
    } catch (injectErr) {
      console.warn('Programmatic script injection restricted on this page:', injectErr.message);
      return false;
    }
  }
  return true;
}

async function refreshActiveTab() {
  try {
    const tab = await getActiveWebTab();
    if (!tab) {
      if (connectionStatus) {
        connectionStatus.className = 'status-indicator';
        connectionStatus.querySelector('.status-text').innerText = 'No tab found';
      }
      return;
    }
    activeTabId = tab.id;

    const isNptel = tab.url && (tab.url.includes('nptel.ac.in') || tab.url.includes('swayam.gov.in') || tab.url.includes('mock_nptel'));

    if (isNptel) {
      if (connectionStatus) {
        connectionStatus.className = 'status-indicator connected';
        connectionStatus.querySelector('.status-text').innerText = 'NPTEL Connected';
      }
      if (btnScanPage) btnScanPage.disabled = false;
      if (tab.title && detectedAssignmentTitle && detectedAssignmentTitle.innerText === 'Open an NPTEL Assignment') {
        detectedAssignmentTitle.innerText = tab.title.replace(/^Course:\s*/i, '');
      }

      // Auto-scan if no questions currently loaded
      if (currentScannedQuestions.length === 0) {
        handleScanPage();
      }
    } else {
      if (connectionStatus) {
        connectionStatus.className = 'status-indicator';
        connectionStatus.querySelector('.status-text').innerText = 'Not an NPTEL page';
      }
      if (detectedAssignmentTitle) {
        detectedAssignmentTitle.innerText = 'Navigate to onlinecourses.nptel.ac.in';
      }
    }
  } catch (err) {
    console.warn('Error refreshing active tab:', err);
  }
}

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetTab = document.getElementById(btn.dataset.tab);
      if (targetTab) targetTab.classList.add('active');
    });
  });
}

// ── Scanning & Answering Logic ───────────────────────────────────────────────

async function handleScanPage() {
  if (btnScanPage) {
    btnScanPage.disabled = true;
    btnScanPage.innerHTML = '<span>⏳</span> Connecting...';
  }

  try {
    const tab = await getActiveWebTab();
    if (!tab || !tab.id) {
      alert('⚠️ Please switch to your NPTEL assignment tab in Chrome and try again.');
      return;
    }

    if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:'))) {
      alert('⚠️ You are currently viewing Chrome internal pages. Please switch to your NPTEL assignment tab (onlinecourses.nptel.ac.in) and click Scan Page.');
      return;
    }

    activeTabId = tab.id;
    const isReady = await ensureContentScriptReady(activeTabId);
    if (!isReady) {
      alert('⚠️ Could not connect to the assignment page. Please refresh (F5) your NPTEL assignment tab and click Scan Page again.');
      return;
    }

    if (btnScanPage) btnScanPage.innerHTML = '<span>⏳</span> Scanning...';

    // Send SCAN_PAGE message to content script
    const response = await chrome.tabs.sendMessage(activeTabId, { action: 'SCAN_PAGE' });

    if (!response || !response.questions || response.questions.length === 0) {
      alert('No questions detected. Please ensure you are on an active NPTEL assignment or quiz page.');
      return;
    }

    if (detectedAssignmentTitle) {
      detectedAssignmentTitle.innerText = response.title || 'NPTEL Assignment';
    }
    currentScannedQuestions = response.questions;
    solvedAnswersMap = {};

    if (emptyState) emptyState.style.display = 'none';
    if (questionList) questionList.innerHTML = '';

    // Check Question Bank for instant matching
    await questionBank.init();
    let instantMatchCount = 0;

    for (const q of currentScannedQuestions) {
      const bankMatch = await questionBank.findAnswer(q.questionText, q.options);
      if (bankMatch && bankMatch.matchedOptionIndex !== -1) {
        solvedAnswersMap[q.qIndex] = {
          selectedIndex: bankMatch.matchedOptionIndex,
          selectedText: q.options[bankMatch.matchedOptionIndex] || bankMatch.answerText,
          confidence: bankMatch.confidence,
          reasoning: bankMatch.explanation,
          keyFormula: '',
          source: 'VERIFIED_CACHE'
        };
        instantMatchCount++;

        // Pre-highlight on page safely
        try {
          chrome.tabs.sendMessage(activeTabId, {
            action: 'HIGHLIGHT_ANSWER',
            qIndex: q.qIndex,
            optionIndex: bankMatch.matchedOptionIndex,
            isVerified: true,
            confidence: bankMatch.confidence
          });
        } catch (e) {
          console.warn('Pre-highlight error:', e);
        }
      }
    }

    // Render cards
    currentScannedQuestions.forEach(q => renderQuestionCard(q));

    if (btnSolveAll) btnSolveAll.disabled = false;
    if (btnAutofillAll) btnAutofillAll.disabled = Object.keys(solvedAnswersMap).length === 0;

    if (instantMatchCount > 0) {
      updateProgressText(`✓ Found ${instantMatchCount}/${currentScannedQuestions.length} verified solutions in Question Bank!`);
    }

  } catch (err) {
    console.warn('Scan notice:', err);
    alert(`Notice: Please ensure you are viewing your active NPTEL assignment tab. If you recently reloaded the extension, refresh (F5) the assignment tab.`);
  } finally {
    if (btnScanPage) {
      btnScanPage.disabled = false;
      btnScanPage.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        Scan Page (${currentScannedQuestions.length})
      `;
    }
  }
}

// ── App Initialization Entry Point ──────────────────────────────────────────

async function initSidePanel() {
  setupTabs();
  setupSettingsHandlers();
  setupExtractorHandlers();
  await loadSavedSettings();
  await refreshActiveTab();
  await renderQuestionBank();

  if (btnScanPage) btnScanPage.onclick = () => handleScanPage();
  if (btnSolveAll) btnSolveAll.onclick = () => handleSolveAll();
  if (btnAutofillAll) btnAutofillAll.onclick = () => handleAutofillAll();

  const btnSetupKey = document.getElementById('btnSetupKey');
  if (btnSetupKey) btnSetupKey.onclick = () => switchToSettingsTab();

  // Event delegation on questionList for CSP compliance (no inline onclicks)
  if (questionList) {
    questionList.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      const qIndex = parseInt(target.dataset.qindex, 10);

      if (action === 'quick-solve' && !isNaN(qIndex)) solveSingleQuestion(qIndex);
      else if (action === 'vision-solve' && !isNaN(qIndex)) solveWithVision(qIndex);
      else if (action === 'fill-single' && !isNaN(qIndex)) autofillSingleQuestion(qIndex);
      else if (action === 'toggle-reasoning' && !isNaN(qIndex)) toggleReasoning(qIndex);
      else if (action === 'switch-settings') switchToSettingsTab();
    });
  }

  // Listen for tab URL updates
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
      refreshActiveTab();
    }
  });

  // Listen for tab switches
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    activeTabId = activeInfo.tabId;
    await refreshActiveTab();
  });
}

// Guarantee execution regardless of document readyState
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSidePanel);
} else {
  initSidePanel();
}
async function getEffectiveBackendUrl() {
  try {
    const storedConfig = await chrome.storage.local.get(['backend_url']);
    if (storedConfig.backend_url && storedConfig.backend_url.trim().length > 0) {
      return storedConfig.backend_url.trim();
    }
  } catch (_) {}
  return 'https://nptel-pro-solver-api.unknowniphone724.workers.dev';
}

/**
 * Solve all unsolved questions sequentially with progress tracking
 */
async function handleSolveAll() {
  if (currentScannedQuestions.length === 0) return;

  btnSolveAll.disabled = true;
  progressContainer.classList.remove('hidden');

  const effectiveBackend = await getEffectiveBackendUrl();
  const total = currentScannedQuestions.length;
  let completed = 0;

  for (let i = 0; i < total; i++) {
    const q = currentScannedQuestions[i];

    // If already solved with valid answer from Question Bank or D1, skip
    if (solvedAnswersMap[q.qIndex] && solvedAnswersMap[q.qIndex].confidence >= 95 && !solvedAnswersMap[q.qIndex].error) {
      completed++;
      updateProgress(completed, total, `Question ${i + 1} already resolved`);
      continue;
    }

    updateProgress(completed, total, `Solving Question ${i + 1} of ${total}...`);

    let solution = null;

    // 1. Try Cloudflare Vault Backend first (/api/solve-one)
    if (effectiveBackend && effectiveBackend.startsWith('http')) {
      try {
        const resp = await fetch(`${effectiveBackend}/api/solve-one`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            courseId: detectedAssignmentTitle.innerText,
            question: q
          })
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data && data.solution && !data.solution.error) {
            solution = data.solution;
          }
        }
      } catch (backendErr) {
        console.warn('Backend solve-one error, trying client Gemini fallback:', backendErr);
      }
    }

    // 2. Client Gemini Fallback if backend failed or offline
    if (!solution) {
      try {
        const { key } = await geminiClient.getEffectiveApiKey();
        if (key) {
          solution = await geminiClient.solveQuestion(q);
        }
      } catch (localAiErr) {
        console.warn(`Local AI fallback failed for Q${i + 1}:`, localAiErr);
      }
    }

    if (solution) {
      solvedAnswersMap[q.qIndex] = solution;

      // Save to Question Bank cache
      await questionBank.saveToCache(
        q.questionText,
        solution.selectedText,
        solution.selectedIndex,
        solution.reasoning,
        detectedAssignmentTitle.innerText
      );

      // Highlight or Autofill on page based on user toggle
      const isHighlightOnly = toggleHighlightOnly.checked;
      chrome.tabs.sendMessage(activeTabId, {
        action: isHighlightOnly ? 'HIGHLIGHT_ANSWER' : 'AUTOFILL_ANSWER',
        qIndex: q.qIndex,
        optionIndex: solution.selectedIndex,
        numericalValue: solution.numericalValue,
        isVerified: solution.source === 'VERIFIED_CACHE' || solution.source === 'OFFICIAL_VAULT',
        confidence: solution.confidence
      });

      // Update Card UI
      updateCardWithSolution(q.qIndex, solution);
    } else {
      updateCardWithError(q.qIndex, 'Could not retrieve answer. Click Quick Solve to retry.');
    }

    completed++;
    updateProgress(completed, total);
  }

  btnSolveAll.disabled = false;
  btnAutofillAll.disabled = false;
  progressStatusText.innerText = `✓ Processed ${completed}/${total} questions!`;
  setTimeout(() => progressContainer.classList.add('hidden'), 4000);
}

/**
 * Autofill all answers directly on the live NPTEL page
 */
async function handleAutofillAll() {
  if (Object.keys(solvedAnswersMap).length === 0) return;

  try {
    await chrome.tabs.sendMessage(activeTabId, {
      action: 'AUTOFILL_ALL',
      answers: solvedAnswersMap
    });
  } catch (err) {
    console.error('Autofill error:', err);
    alert('Failed to send autofill command to page.');
  }
}

// ── UI Card Rendering ────────────────────────────────────────────────────────

function renderQuestionCard(q) {
  const existingCard = document.getElementById(`qCard_${q.qIndex}`);
  if (existingCard) existingCard.remove();

  const card = document.createElement('div');
  card.className = 'q-card';
  card.id = `qCard_${q.qIndex}`;

  const isSolved = Boolean(solvedAnswersMap[q.qIndex]);
  if (isSolved) card.classList.add('solved');

  let diagramHtml = '';
  if (q.imageSrc) {
    diagramHtml = `<img src="${q.imageSrc}" class="q-diagram-preview" alt="Diagram for Question ${q.qNum}">`;
  }

  let optionsHtml = '';
  if (q.options && q.options.length > 0) {
    optionsHtml = `
      <div class="q-options-list">
        ${q.options.map((opt, idx) => {
          const letter = String.fromCharCode(65 + idx); // A, B, C, D
          const isSelected = isSolved && solvedAnswersMap[q.qIndex].selectedIndex === idx;
          return `
            <div class="q-option-row ${isSelected ? 'selected' : ''}" id="optRow_${q.qIndex}_${idx}">
              <span class="q-option-letter">${letter})</span>
              <span>${opt}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  card.innerHTML = `
    <div class="q-card-header">
      <span class="q-num-badge">Question ${q.qNum}</span>
      <span id="badgeStatus_${q.qIndex}">
        ${isSolved ? renderBadgeForSolution(solvedAnswersMap[q.qIndex]) : '<span class="badge">Unsolved</span>'}
      </span>
    </div>
    <div class="q-text">${escapeHtml(q.questionText)}</div>
    ${diagramHtml}
    ${optionsHtml}
    <div id="solutionBox_${q.qIndex}">
      ${isSolved ? renderSolutionBoxHtml(q.qIndex, solvedAnswersMap[q.qIndex]) : ''}
    </div>
    <div class="q-card-actions">
      <button class="btn btn-secondary btn-sm" data-action="quick-solve" data-qindex="${q.qIndex}">⚡ Quick Solve</button>
      <button class="btn btn-secondary btn-sm" id="btnVision_${q.qIndex}" data-action="vision-solve" data-qindex="${q.qIndex}" title="Capture screenshot of page & solve using Gemini 3.6 Flash Multimodal Vision">📸 Vision Solve</button>
      <button class="btn btn-emerald btn-sm" id="btnFillSingle_${q.qIndex}" data-action="fill-single" data-qindex="${q.qIndex}" ${!isSolved ? 'disabled' : ''}>Fill on Page</button>
    </div>
  `;

  questionList.appendChild(card);
}

function renderBadgeForSolution(sol) {
  if (sol.source === 'VERIFIED_CACHE' || sol.source === 'OFFICIAL_VAULT') {
    return `<span class="badge badge-verified">✓ 100% Official Key</span>`;
  }
  if (sol.provider) {
    return `<span class="badge badge-ai">⚡ ${escapeHtml(sol.provider)} (${sol.confidence}%)</span>`;
  }
  if (sol.source === 'AI_VISION') {
    return `<span class="badge badge-ai" style="background: rgba(168, 85, 247, 0.2); border-color: #a855f7; color: #d8b4fe;">📸 Vision AI (${sol.confidence}%)</span>`;
  }
  return `<span class="badge badge-ai">⚡ AI (${sol.confidence}%)</span>`;
}

function renderSolutionBoxHtml(qIndex, sol) {
  const isNum = sol.numericalValue !== null && sol.numericalValue !== undefined;
  const label = isNum
    ? `Calculated Value: ${escapeHtml(String(sol.numericalValue))}`
    : `Option ${String.fromCharCode(65 + sol.selectedIndex)}: ${escapeHtml(sol.selectedText)}`;

  return `
    <div class="q-solution-box">
      <div class="q-solution-summary">
        <span class="solution-answer-text">${label}</span>
        <span class="confidence-meter">${sol.confidence}% Confidence</span>
      </div>
      <span class="q-reasoning-toggle" data-action="toggle-reasoning" data-qindex="${qIndex}">View Step-by-Step Derivation ▼</span>
      <div class="q-reasoning-details" id="reasoning_${qIndex}">
        ${sol.keyFormula ? `<p style="margin-bottom: 4px;"><strong>Formula / Law:</strong> ${escapeHtml(sol.keyFormula)}</p>` : ''}
        <p>${escapeHtml(sol.reasoning)}</p>
      </div>
    </div>
  `;
}

function updateCardWithSolution(qIndex, solution) {
  const card = document.getElementById(`qCard_${qIndex}`);
  if (!card) return;

  card.classList.add('solved');
  const badgeStatus = document.getElementById(`badgeStatus_${qIndex}`);
  if (badgeStatus) badgeStatus.innerHTML = renderBadgeForSolution(solution);

  const solutionBox = document.getElementById(`solutionBox_${qIndex}`);
  if (solutionBox) solutionBox.innerHTML = renderSolutionBoxHtml(qIndex, solution);

  // Highlight selected option row in side panel
  card.querySelectorAll('.q-option-row').forEach(el => el.classList.remove('selected'));
  const targetRow = document.getElementById(`optRow_${qIndex}_${solution.selectedIndex}`);
  if (targetRow) targetRow.classList.add('selected');

  const btnFill = document.getElementById(`btnFillSingle_${qIndex}`);
  if (btnFill) btnFill.disabled = false;
}

function updateCardWithError(qIndex, errorMsg) {
  const solutionBox = document.getElementById(`solutionBox_${qIndex}`);
  if (!solutionBox) return;

  if (errorMsg === 'API_KEY_REQUIRED' || errorMsg.includes('API_KEY_REQUIRED') || errorMsg.includes('400') || errorMsg.includes('403')) {
    solutionBox.innerHTML = `
      <div class="q-solution-box" style="border-color: #f59e0b; background: rgba(245, 158, 11, 0.12); padding: 10px;">
        <div style="color: #fbbf24; font-weight: 700; font-size: 11px; margin-bottom: 4px;">🔑 Free Gemini API Key Required</div>
        <p style="font-size: 10px; color: #cbd5e1; margin-bottom: 8px;">This question is new and needs Gemini to solve. Get a 100% free key from Google AI Studio (takes 10s).</p>
        <button class="btn btn-primary btn-sm" data-action="switch-settings">Open Settings & Enter Key</button>
      </div>
    `;
    return;
  }

  solutionBox.innerHTML = `
    <div class="q-solution-box" style="border-color: #ef4444; background: rgba(239, 68, 68, 0.1);">
      <span style="color: #fca5a5; font-size: 11px;">Error: ${escapeHtml(errorMsg)}</span>
    </div>
  `;
}

window.switchToSettingsTab = function() {
  const settingsTabBtn = document.querySelector('.tab-btn[data-tab="tab-settings"]');
  if (settingsTabBtn) settingsTabBtn.click();
};


// Global functions for inline button calls
window.solveSingleQuestion = async function(qIndex) {
  const q = currentScannedQuestions[qIndex];
  if (!q) return;

  const btnFill = document.getElementById(`btnFillSingle_${qIndex}`);
  if (btnFill) btnFill.innerText = 'Solving...';

  try {
    const backendUrl = await getEffectiveBackendUrl();
    let solution = null;

    // 1. Try Central Vault Backend (Zero API Key needed for students!)
    if (backendUrl) {
      try {
        const resp = await fetch(`${backendUrl}/api/solve-one`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            courseId: detectedAssignmentTitle.innerText,
            question: q
          })
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data && data.solution && !data.solution.error) {
            solution = data.solution;
          }
        }
      } catch (backendErr) {
        console.warn('Backend solve-one error, trying client Gemini:', backendErr);
      }
    }

    // 2. Fallback to client-side API key if backend is not available
    if (!solution) {
      const { key } = await geminiClient.getEffectiveApiKey();
      if (!key) {
        switchToSettingsTab();
        alert('🔑 To solve questions offline without the Cloud Vault, please enter your free Google Gemini API key in Settings.');
        return;
      }
      solution = await geminiClient.solveQuestion(q);
    }

    solvedAnswersMap[qIndex] = solution;

    await questionBank.saveToCache(
      q.questionText,
      solution.selectedText,
      solution.selectedIndex,
      solution.reasoning,
      detectedAssignmentTitle.innerText
    );

    updateCardWithSolution(qIndex, solution);

    chrome.tabs.sendMessage(activeTabId, {
      action: toggleHighlightOnly.checked ? 'HIGHLIGHT_ANSWER' : 'AUTOFILL_ANSWER',
      qIndex,
      optionIndex: solution.selectedIndex,
      numericalValue: solution.numericalValue,
      isVerified: solution.source === 'VERIFIED_CACHE' || solution.source === 'OFFICIAL_VAULT',
      confidence: solution.confidence
    });

  } catch (err) {
    updateCardWithError(qIndex, err.message);
  } finally {
    if (btnFill) btnFill.innerText = 'Fill on Page';
  }
};

window.solveWithVision = async function(qIndex) {
  const q = currentScannedQuestions[qIndex];
  if (!q) return;

  const btnVision = document.getElementById(`btnVision_${qIndex}`);
  if (btnVision) btnVision.innerText = '📸 Snapping...';

  try {
    // 1. Capture current tab screenshot
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.windowId) throw new Error('No active window found to capture.');

    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    if (!dataUrl) throw new Error('Could not capture screenshot.');

    if (btnVision) btnVision.innerText = '🧠 Vision AI...';

    // 2. Solve with Gemini Vision
    const solution = await geminiClient.solveQuestion({
      ...q,
      imageBase64: dataUrl
    });

    solution.source = 'AI_VISION';
    solvedAnswersMap[qIndex] = solution;

    await questionBank.saveToCache(
      q.questionText,
      solution.selectedText,
      solution.selectedIndex,
      solution.reasoning,
      detectedAssignmentTitle.innerText
    );

    updateCardWithSolution(qIndex, solution);

    chrome.tabs.sendMessage(activeTabId, {
      action: toggleHighlightOnly.checked ? 'HIGHLIGHT_ANSWER' : 'AUTOFILL_ANSWER',
      qIndex,
      optionIndex: solution.selectedIndex,
      isVerified: false,
      confidence: solution.confidence
    });

  } catch (err) {
    console.warn('Vision solve error:', err);
    updateCardWithError(qIndex, `Vision Error: ${err.message}`);
  } finally {
    if (btnVision) btnVision.innerText = '📸 Vision Solve';
  }
};

window.autofillSingleQuestion = function(qIndex) {
  const sol = solvedAnswersMap[qIndex];
  if (!sol) return;

  chrome.tabs.sendMessage(activeTabId, {
    action: 'AUTOFILL_ANSWER',
    qIndex,
    optionIndex: sol.selectedIndex,
    isVerified: sol.source === 'VERIFIED_CACHE',
    confidence: sol.confidence
  });
};

window.toggleReasoning = function(qIndex) {
  const details = document.getElementById(`reasoning_${qIndex}`);
  if (details) {
    details.classList.toggle('open');
  }
};

// ── Progress Helpers ────────────────────────────────────────────────────────

function updateProgress(current, total, statusText = '') {
  const pct = Math.round((current / total) * 100);
  progressBarFill.style.width = `${pct}%`;
  progressPercentage.innerText = `${pct}%`;
  if (statusText) progressStatusText.innerText = statusText;
}

function updateProgressText(txt) {
  progressContainer.classList.remove('hidden');
  progressStatusText.innerText = txt;
  progressBarFill.style.width = '100%';
  progressPercentage.innerText = '100%';
}

// ── Question Bank Tab ───────────────────────────────────────────────────────

async function renderQuestionBank(filter = '') {
  await questionBank.init();
  bankList.innerHTML = '';

  const query = filter.toLowerCase().trim();
  let count = 0;

  for (const [_, item] of questionBank.memoryCache) {
    if (query && !item.question.toLowerCase().includes(query) && !item.answerText.toLowerCase().includes(query)) {
      continue;
    }

    const itemEl = document.createElement('div');
    itemEl.className = 'bank-item';
    itemEl.innerHTML = `
      <div class="bank-item-q">${escapeHtml(item.question)}</div>
      <div class="bank-item-a">✓ Answer: <strong>${escapeHtml(item.answerText)}</strong></div>
      <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">${escapeHtml(item.explanation || '')}</div>
    `;
    bankList.appendChild(itemEl);
    count++;
  }

  if (count === 0) {
    bankList.innerHTML = `<p style="color: var(--text-muted); font-size: 11px; padding: 12px; text-align: center;">No questions found matching "${escapeHtml(filter)}".</p>`;
  }
}

// ── Settings ────────────────────────────────────────────────────────────────

async function loadSavedSettings() {
  try {
    const keyNoticeBanner = document.getElementById('keyNoticeBanner');
    const backendUrlInput = document.getElementById('backendUrl');
    const stored = await chrome.storage.local.get(['custom_api_key', 'preferred_model', 'backend_url']);
    
    const DEFAULT_BACKEND_URL = 'https://nptel-pro-solver-api.unknowniphone724.workers.dev';
    const effectiveBackend = (stored.backend_url !== undefined && stored.backend_url !== '')
      ? stored.backend_url
      : DEFAULT_BACKEND_URL;

    if (stored.custom_api_key) customApiKey.value = stored.custom_api_key;
    if (backendUrlInput) backendUrlInput.value = effectiveBackend;

    if (stored.custom_api_key && stored.custom_api_key.trim().length > 10) {
      if (keyNoticeBanner) keyNoticeBanner.classList.add('hidden');
    } else if (effectiveBackend && effectiveBackend.startsWith('http')) {
      if (keyNoticeBanner) keyNoticeBanner.classList.add('hidden');
    } else {
      if (keyNoticeBanner) keyNoticeBanner.classList.remove('hidden');
    }

    if (stored.preferred_model) {
      modelSelect.value = stored.preferred_model;
    } else {
      modelSelect.value = 'gemini-2.5-flash';
    }
  } catch (e) {
    console.warn('Error loading settings:', e);
  }
}

function setupSettingsHandlers() {
  btnToggleKeyVisibility.addEventListener('click', () => {
    customApiKey.type = customApiKey.type === 'password' ? 'text' : 'password';
  });

  btnSaveSettings.addEventListener('click', async () => {
    const key = customApiKey.value.trim();
    const model = modelSelect.value;
    const backendUrlInput = document.getElementById('backendUrl');
    const backendUrl = backendUrlInput ? backendUrlInput.value.trim().replace(/\/+$/, '') : '';

    await chrome.storage.local.set({
      custom_api_key: key,
      preferred_model: model,
      backend_url: backendUrl
    });

    const keyNoticeBanner = document.getElementById('keyNoticeBanner');
    if ((key.length > 10 || backendUrl.startsWith('http')) && keyNoticeBanner) {
      keyNoticeBanner.classList.add('hidden');
    }

    settingsSaveStatus.innerText = '✓ Saved successfully!';
    setTimeout(() => { settingsSaveStatus.innerText = ''; }, 3000);
  });

  bankSearchInput.addEventListener('input', (e) => {
    renderQuestionBank(e.target.value);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Assignment Extractor & Cloudflare Vault Sync ──────────────────────────────

function setupExtractorHandlers() {
  const btnExportJson = document.getElementById('btnExportJson');
  const btnExportMd = document.getElementById('btnExportMd');
  const btnSyncToCloud = document.getElementById('btnSyncToCloud');
  const syncStatus = document.getElementById('syncStatus');

  if (btnExportJson) {
    btnExportJson.addEventListener('click', async () => {
      const data = await getAssignmentData();
      if (!data || !data.questions || data.questions.length === 0) {
        alert('Please open an NPTEL assignment page and scan questions first.');
        return;
      }
      downloadFile(
        `${sanitizeFilename(data.title)}.json`,
        JSON.stringify(data, null, 2),
        'application/json'
      );
    });
  }

  if (btnExportMd) {
    btnExportMd.addEventListener('click', async () => {
      const data = await getAssignmentData();
      if (!data || !data.questions || data.questions.length === 0) {
        alert('Please open an NPTEL assignment page and scan questions first.');
        return;
      }
      let md = `# ${data.title}\n\n`;
      md += `*Extracted from: ${data.url || 'NPTEL'}*\n`;
      md += `*Total Questions: ${data.questions.length}*\n\n---\n\n`;

      data.questions.forEach((q, i) => {
        md += `### Question ${q.qNum || i + 1}\n\n`;
        md += `${q.questionText}\n\n`;
        if (q.options && q.options.length > 0) {
          q.options.forEach((opt, oIdx) => {
            const isSolved = solvedAnswersMap[q.qIndex]?.selectedIndex === oIdx;
            const marker = isSolved ? '✓ [CORRECT]' : ' ';
            md += `- [${marker}] ${opt}\n`;
          });
          md += '\n';
        }
        if (solvedAnswersMap[q.qIndex]) {
          const sol = solvedAnswersMap[q.qIndex];
          md += `> **Confidence**: ${sol.confidence}%\n`;
          if (sol.reasoning) md += `> **Explanation**: ${sol.reasoning}\n`;
          if (sol.keyFormula) md += `> **Key Formula**: \`${sol.keyFormula}\`\n`;
          md += '\n';
        }
        md += '---\n\n';
      });

      downloadFile(
        `${sanitizeFilename(data.title)}.md`,
        md,
        'text/markdown'
      );
    });
  }

  if (btnSyncToCloud) {
    btnSyncToCloud.addEventListener('click', async () => {
      if (!syncStatus) return;
      syncStatus.innerText = 'Extracting and uploading questions to Cloudflare D1 Vault...';
      const data = await getAssignmentData();
      if (!data || !data.questions || data.questions.length === 0) {
        syncStatus.innerText = '⚠️ No questions detected. Please scan the assignment first.';
        return;
      }

      const payloadQuestions = data.questions.map(q => {
        const sol = solvedAnswersMap[q.qIndex];
        return {
          questionText: q.questionText,
          options: q.options,
          verifiedIndex: sol ? sol.selectedIndex : (q.verifiedIndex !== undefined ? q.verifiedIndex : undefined)
        };
      });

      try {
        const stored = await chrome.storage.local.get(['backend_url']);
        const backendUrl = stored.backend_url || 'https://nptel-pro-solver-api.unknowniphone724.workers.dev';
        const resp = await fetch(`${backendUrl}/api/contribute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            courseId: data.title,
            assignmentTitle: data.title,
            questions: payloadQuestions
          })
        });

        if (resp.ok) {
          const resJson = await resp.json();
          syncStatus.innerText = `✓ Successfully synced ${resJson.contributedCount || payloadQuestions.length} questions to Cloudflare D1 Vault!`;
          syncStatus.style.color = '#10b981';
        } else {
          syncStatus.innerText = `Server response: ${resp.status}`;
        }
      } catch (err) {
        syncStatus.innerText = `Sync error: ${err.message}`;
        console.warn('Sync error:', err);
      }
    });
  }
}

async function getAssignmentData() {
  if (currentScannedQuestions.length > 0) {
    return {
      title: detectedAssignmentTitle.innerText || 'NPTEL Assignment',
      url: window.location.href,
      questions: currentScannedQuestions
    };
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return null;
  await ensureContentScriptReady(tab.id);
  const resp = await chrome.tabs.sendMessage(tab.id, { action: 'EXPORT_ASSIGNMENT_DATA' });
  return resp;
}

function sanitizeFilename(name) {
  return (name || 'nptel_assignment').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
