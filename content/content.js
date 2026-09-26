/**
 * Content Script for NPTEL Pro Solver
 * Robust parser supporting legacy Google Course Builder, new Swayam/Moodle LMS,
 * LaTeX/MathJax mathematical formula extraction, and NAT (Numerical Answer Type) questions.
 */

let cachedQuestions = [];

/**
 * Clean text by stripping injected button or badge labels
 */
function cleanText(str) {
  if (!str) return '';
  return str
    .replace(/⚡\s*Solve\s*with\s*AI/gi, '')
    .replace(/✓\s*(100%\s*Verified\s*Key|AI\s*Choice\s*\(\d+%\))/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts text while preserving MathJax / KaTeX formulas in raw LaTeX format
 */
function extractTextWithMath(element) {
  if (!element) return '';
  const clone = element.cloneNode(true);

  // 1. MathJax script tags
  clone.querySelectorAll('script[type="math/tex"]').forEach(script => {
    const tex = script.textContent || '';
    const textNode = document.createTextNode(` $${tex.trim()}$ `);
    script.parentNode.replaceChild(textNode, script);
  });

  // 2. KaTeX LaTeX annotations
  clone.querySelectorAll('annotation[encoding="application/x-tex"]').forEach(ann => {
    const tex = ann.textContent || '';
    const textNode = document.createTextNode(` $${tex.trim()}$ `);
    ann.parentNode.replaceChild(textNode, ann);
  });

  // 3. Remove assistive hidden math text that duplicates equations
  clone.querySelectorAll('.MathJax_Preview, .MJX_Assistive_MathML, .sr-only').forEach(el => el.remove());

  return cleanText(clone.innerText || clone.textContent);
}

/**
 * Scan entire page and collect questions by grouping inputs
 */
function scanPage() {
  // Clear any existing injected elements first to avoid DOM contamination
  document.querySelectorAll('.nptel-pro-inline-solve-btn').forEach(el => el.remove());
  document.querySelectorAll('.nptel-pro-badge').forEach(el => el.remove());

  // 1. Find all radio, checkbox, and numerical inputs on the page
  const allInputs = Array.from(document.querySelectorAll(
    'input[type="radio"], input[type="checkbox"], input[type="number"], .qt-mc-question input[type="text"]'
  ));
  const groupsMap = new Map();

  allInputs.forEach(input => {
    // Radio buttons in the same question share the same 'name' attribute
    const groupKey = input.name || input.closest('fieldset, div[role="radiogroup"]')?.id || input.id || `nat_${Math.random()}`;
    if (!groupsMap.has(groupKey)) {
      groupsMap.set(groupKey, []);
    }
    groupsMap.get(groupKey).push(input);
  });

  cachedQuestions = [];
  let qIdx = 0;

  groupsMap.forEach((inputs, groupKey) => {
    const firstInput = inputs[0];

    // 1. Traverse upwards from first input to find the true outer question card
    // Note: Do NOT stop at fieldset or inner choice containers!
    let container = null;
    let curr = firstInput.parentElement;
    while (curr && curr !== document.body && curr !== document.documentElement) {
      const isCard = curr.matches(
        '.qt-mc-question, .gcb-question-row, .assessment-item, .que, div[class*="assessment-item"], div[class*="question-container"], div[class*="card"], li[class*="question"]'
      );
      const inputsInCurr = Array.from(curr.querySelectorAll('input[type="radio"], input[type="checkbox"], input[type="number"], input[type="text"]'));
      const onlyThisGroup = inputsInCurr.every(inp => inputs.includes(inp));

      if (onlyThisGroup) {
        container = curr;
        if (isCard) break;
      } else {
        break;
      }
      curr = curr.parentElement;
    }

    if (!container) {
      container = firstInput.closest('.qt-mc-question, .gcb-question-row, .assessment-item, .que, div[class*="assessment-item"], div[class*="card"]')
        || firstInput.parentElement?.parentElement?.parentElement
        || firstInput.parentElement;
    }

    // 2. Extract question prompt text with LaTeX math preservation
    let questionText = '';

    // Primary Detection: Look for element with question numbering pattern ("1. What...", "2. Which...")
    const potentialPromptEls = Array.from(container.querySelectorAll(
      'div, p, span, h1, h2, h3, h4, legend, [class*="question"], [class*="prompt"], [class*="title"], [class*="header"]'
    ));
    for (const el of potentialPromptEls) {
      if (inputs.some(inp => el.contains(inp) || inp.closest('label')?.contains(el))) {
        continue;
      }
      const raw = extractTextWithMath(el).replace(/\b\d+\s*Points?\b/gi, '').trim();
      if (/^\s*(\d+[\s.:)]+|q(uestion)?\s*\d+[\s.:)]+)\s*[A-Za-z]/i.test(raw) && raw.length > 8) {
        questionText = raw;
        break;
      }
    }

    if (!questionText && container.previousElementSibling) {
      const prevRaw = extractTextWithMath(container.previousElementSibling).replace(/\b\d+\s*Points?\b/gi, '').trim();
      if (/^\s*(\d+[\s.:)]+|q(uestion)?\s*\d+[\s.:)]+)\s*[A-Za-z]/i.test(prevRaw) && prevRaw.length > 8) {
        questionText = prevRaw;
      }
    }
    
    // Secondary Detection: Look for dedicated question text elements in container or its ancestors
    if (!questionText) {
      let searchEl = container;
      for (let depth = 0; depth < 3 && searchEl && searchEl !== document.body; depth++) {
        const candidates = Array.from(searchEl.querySelectorAll(
          'legend, .qt-question, .qtext, [class*="question-text"], [class*="prompt"], [class*="title"], [class*="header"], [role="heading"], h2, h3, h4, p'
        ));

        for (const cand of candidates) {
          if (inputs.some(inp => cand.contains(inp) || inp.closest('label')?.contains(cand))) {
            continue;
          }
          const txt = extractTextWithMath(cand);
          const cleaned = txt.replace(/\b\d+\s*Points?\b/gi, '').trim();
          if (cleaned.length > 5 && !/^(question\s*\d+|q\s*\d+)$/i.test(cleaned)) {
            questionText = cleaned;
            break;
          }
        }

        if (questionText) break;

        if (searchEl.previousElementSibling) {
          const prevTxt = extractTextWithMath(searchEl.previousElementSibling).replace(/\b\d+\s*Points?\b/gi, '').trim();
          if (prevTxt.length > 5 && !/^(question\s*\d+|q\s*\d+)$/i.test(prevTxt)) {
            questionText = prevTxt;
            break;
          }
        }

        searchEl = searchEl.parentElement;
      }
    }

    if (!questionText) {
      const fullText = extractTextWithMath(container);
      const lines = fullText
        .split('\n')
        .map(l => l.replace(/\b\d+\s*Points?\b/gi, '').trim())
        .filter(l => l.length > 0 && !/^(question\s*\d+|q\s*\d+)$/i.test(l));
      
      questionText = lines[0] || `Question ${qIdx + 1}`;
    }

    // Extract image/diagram if present
    let imageSrc = null;
    const imgEl = container.querySelector('img:not(.gcb-progress-icon)');
    if (imgEl && imgEl.src && !imgEl.src.includes('data:image/svg') && imgEl.naturalWidth > 30) {
      imageSrc = imgEl.src;
    }

    // Check if Numerical Answer Type (NAT)
    const isNumerical = inputs.length === 1 && (firstInput.type === 'text' || firstInput.type === 'number');

    // Extract clean options for each input
    const options = [];
    if (!isNumerical) {
      inputs.forEach(input => {
        const label = input.closest('label')
          || document.querySelector(`label[for="${input.id}"]`)
          || input.parentElement;

        let labelText = '';
        if (label) {
          const clone = label.cloneNode(true);
          clone.querySelectorAll('input').forEach(i => i.remove());
          labelText = extractTextWithMath(clone);
        } else {
          labelText = extractTextWithMath(input.parentElement);
        }

        options.push(labelText || `Option`);
      });
    }

    const isMulti = inputs.some(i => i.type === 'checkbox');
    const selectMode = isNumerical ? 'NUMERICAL_NAT' : (isMulti ? 'MULTI-SELECT' : 'SINGLE-SELECT');

    cachedQuestions.push({
      qIndex: qIdx,
      qNum: qIdx + 1,
      groupKey,
      questionText,
      imageSrc,
      selectMode,
      options,
      container,
      inputs
    });

    qIdx++;
  });

  // Extract page assignment title
  const headerEl = document.querySelector('h1, h2, .gcb-product-headers-large, .assessment-title, [class*="course-title"]');
  const assignmentTitle = headerEl ? cleanText(headerEl.innerText) : 'NPTEL Assignment';

  return {
    title: assignmentTitle,
    url: window.location.href,
    totalQuestions: cachedQuestions.length,
    questions: cachedQuestions.map(q => ({
      qIndex: q.qIndex,
      qNum: q.qNum,
      questionText: q.questionText,
      imageSrc: q.imageSrc,
      selectMode: q.selectMode,
      options: q.options
    }))
  };
}

/**
 * Injects [ ⚡ Solve with AI ] buttons on question headers
 */
function injectInlineAssistants() {
  cachedQuestions.forEach((q) => {
    if (!q.container) return;
    if (q.container.querySelector('.nptel-pro-inline-solve-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'nptel-pro-inline-solve-btn';
    btn.innerHTML = '<span>⚡</span> Solve with AI';
    btn.title = `Solve Question ${q.qNum} in Side Panel`;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      chrome.runtime.sendMessage({
        action: 'OPEN_SIDE_PANEL',
        qIndex: q.qIndex
      });
      showToast(`Solving Question ${q.qNum} in Side Panel...`);
    });

    const targetHeader = q.container.querySelector('.qt-question, [class*="prompt"], p, h3, h4');
    if (targetHeader) {
      targetHeader.parentNode.insertBefore(btn, targetHeader);
    } else {
      q.container.prepend(btn);
    }
  });
}

/**
 * Visually highlight the chosen option in emerald green
 */
function highlightOption(qIndex, optionIndex, isVerified = false, confidence = 95) {
  if (!cachedQuestions[qIndex]) {
    scanPage();
  }
  const q = cachedQuestions[qIndex];
  if (!q || !q.inputs || !q.inputs[optionIndex]) return;

  const targetInput = q.inputs[optionIndex];
  const choiceWrapper = targetInput.closest('.gcb-mcq-choice, label') || targetInput.parentElement;
  if (!choiceWrapper) return;

  // Clear existing highlights in this question only
  q.container.querySelectorAll('.nptel-pro-highlight-option').forEach(el => {
    el.classList.remove('nptel-pro-highlight-option');
  });
  q.container.querySelectorAll('.nptel-pro-badge').forEach(el => el.remove());

  // Apply new glow highlight
  choiceWrapper.classList.add('nptel-pro-highlight-option');

  // Attach verification pill
  const badge = document.createElement('span');
  badge.className = isVerified ? 'nptel-pro-badge' : 'nptel-pro-badge ai-badge';
  badge.innerText = isVerified ? '✓ 100% Verified Key' : `✓ AI Choice (${confidence}%)`;
  choiceWrapper.appendChild(badge);
}

/**
 * Automatically select an answer choice or fill numerical answer
 */
function autofillOption(qIndex, optionIndex, numericalValue = null) {
  if (!cachedQuestions[qIndex]) {
    scanPage();
  }
  const q = cachedQuestions[qIndex];
  if (!q || !q.inputs) return false;

  // Handle Numerical Answer Type (NAT)
  if (q.selectMode === 'NUMERICAL_NAT' || (q.inputs[0] && (q.inputs[0].type === 'text' || q.inputs[0].type === 'number'))) {
    const textInput = q.inputs[0];
    if (textInput) {
      try {
        textInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        textInput.value = numericalValue !== null && numericalValue !== undefined ? String(numericalValue) : (q.options[optionIndex] || '');
        textInput.dispatchEvent(new Event('input', { bubbles: true }));
        textInput.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      } catch (e) {
        console.error('Failed to autofill NAT:', e);
      }
    }
  }

  // Handle MCQ Radio/Checkbox
  const input = q.inputs[optionIndex];
  if (!input) return false;

  try {
    input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    input.checked = true;
    input.click();

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  } catch (err) {
    console.error(`Failed to autofill option ${optionIndex} for Q${qIndex + 1}:`, err);
    return false;
  }
}

/**
 * Display toast banner on NPTEL page
 */
function showToast(message) {
  let toast = document.getElementById('nptel-pro-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'nptel-pro-toast';
    document.body.appendChild(toast);
  }
  toast.innerText = message;
  toast.style.display = 'flex';
  setTimeout(() => {
    if (toast) toast.style.display = 'none';
  }, 3000);
}

// ── Message Listener ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'PING') {
    sendResponse({ alive: true, timestamp: Date.now() });
    return false;
  }

  if (message.action === 'SCAN_PAGE') {
    const data = scanPage();
    injectInlineAssistants();
    sendResponse(data);
    return false;
  }

  if (message.action === 'EXPORT_ASSIGNMENT_DATA') {
    const data = scanPage();
    data.questions.forEach((q, idx) => {
      const qObj = cachedQuestions[idx];
      if (qObj && qObj.container) {
        const acceptedEl = qObj.container.querySelector('.gcb-accepted-answer, [class*="accepted"], [class*="solution"], .correct-answer');
        if (acceptedEl) {
          const acceptedText = extractTextWithMath(acceptedEl);
          const matchedOptIdx = q.options.findIndex(opt => acceptedText.toLowerCase().includes(opt.toLowerCase()) || opt.toLowerCase().includes(acceptedText.toLowerCase()));
          if (matchedOptIdx !== -1) {
            q.verifiedIndex = matchedOptIdx;
            q.verifiedText = q.options[matchedOptIdx];
            q.isVerified = true;
          }
        }
      }
    });
    sendResponse(data);
    return false;
  }

  if (message.action === 'HIGHLIGHT_ANSWER') {
    highlightOption(message.qIndex, message.optionIndex, message.isVerified, message.confidence);
    sendResponse({ success: true });
    return false;
  }

  if (message.action === 'AUTOFILL_ANSWER') {
    const ok = autofillOption(message.qIndex, message.optionIndex, message.numericalValue);
    highlightOption(message.qIndex, message.optionIndex, message.isVerified, message.confidence);
    sendResponse({ success: ok });
    return false;
  }

  if (message.action === 'AUTOFILL_ALL') {
    const answers = message.answers || {};
    let count = 0;
    for (const [qIdxStr, ansData] of Object.entries(answers)) {
      const qIdx = parseInt(qIdxStr, 10);
      if (ansData && ansData.selectedIndex !== undefined) {
        autofillOption(qIdx, ansData.selectedIndex, ansData.numericalValue);
        highlightOption(qIdx, ansData.selectedIndex, ansData.source === 'VERIFIED_CACHE' || ansData.source === 'OFFICIAL_VAULT', ansData.confidence);
        count++;
      }
    }
    showToast(`✓ Filled ${count} answers on NPTEL form.`);
    sendResponse({ success: true, count });
    return false;
  }

  if (message.action === 'CLEAR_HIGHLIGHTS') {
    document.querySelectorAll('.nptel-pro-highlight-option').forEach(el => el.classList.remove('nptel-pro-highlight-option'));
    document.querySelectorAll('.nptel-pro-badge').forEach(el => el.remove());
    sendResponse({ success: true });
    return false;
  }
});
