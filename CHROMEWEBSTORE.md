# Chrome Web Store Listing: NPTEL Pro Solver

## 1. Store Metadata

- **Name**: NPTEL Pro Solver - Assignment & Quiz AI
- **Short Description** (132 chars max):
  Smart assignment companion for NPTEL & Swayam courses featuring official question bank matching and multimodal AI reasoning.
- **Detailed Description**:
  Master your NPTEL & Swayam coursework with NPTEL Pro Solver — the ultimate academic companion designed to streamline your weekly assignment reviews.

  Powered by a Hybrid Architecture, NPTEL Pro Solver combines an offline Question Bank of verified official answer keys with multimodal Google Gemini AI reasoning.

  🌟 KEY FEATURES:
  • 100% Verified Answer Bank: Instantly recognizes repeated questions from past semesters and matches official solutions.
  • Multimodal AI Solving: Solves complex questions including text, mathematical formulas, and circuit/diagram screenshots using Gemini 2.5 Flash.
  • Review & Highlight Mode: Prefer safety? Enable Highlight Mode to glow the recommended option in emerald green without auto-clicking.
  • One-Click Auto-Fill: Easily applies answers directly into the assignment form with full native DOM validation events.
  • Step-by-Step Derivations: View clear, logical explanations, formulas, and confidence ratings for every question.
  • Unobtrusive Side Panel: Docks neatly to the right of your assignment page, leaving your study area completely open.
  • Dual API Key Support: Works out-of-the-box in Auto Mode or lets you bring your own free Gemini API key for private, unlimited quota.
  • Complete Privacy: All data and keys remain 100% on your local device. No tracking, no external servers.

- **Category**: Education / Productivity
- **Language**: English
- **Pricing**: Free

---

## 2. Permissions Justification

| Permission | Justification for Chrome Web Store Reviewers |
| :--- | :--- |
| `sidePanel` | Required to provide an unobtrusive side-docked workspace where students can view explanations, confidence scores, and question lists side-by-side with their assignment. |
| `storage` | Required to persist user preferences (custom API key, preferred model, highlight mode) and store locally verified question cache. |
| `tabs` / `activeTab` | Required to detect when the user is viewing an NPTEL assignment tab (`onlinecourses.nptel.ac.in`) and communicate between the side panel and the page content script. |
| `scripting` | Required to safely inject content scripts and interact with the active assignment form. |
| `host_permissions: https://*.nptel.ac.in/*` | Required to read assignment questions and highlight answer choices exclusively on the official NPTEL/Swayam course portal. |
| `host_permissions: https://generativelanguage.googleapis.com/*` | Required to communicate directly with Google's Gemini API for multimodal question solving when using a personal or default API key. |

---

## 3. Privacy & Data Use Disclosures

- **Single Purpose**: Assists students enrolled in NPTEL/Swayam courses in reviewing, studying, and verifying weekly assignment questions.
- **Data Collection**:
  - The extension does NOT collect, sell, or transmit any personal information, browsing history, or user credentials.
  - API keys are stored solely in local extension storage (`chrome.storage.local`) on the user's computer.
  - Question prompts sent to the Gemini API are strictly limited to the content of the assignment currently being viewed by the user.

---

## 4. Pre-Publish Checklist

- [x] Manifest V3 compliant.
- [x] PNG icons created at exact dimensions (16x16, 48x48, 128x128).
- [x] No `eval()` or remote script loading in extension context.
- [x] Explicit open trigger provided for Side Panel (`chrome.sidePanel.open`).
- [x] All chrome API calls use `async`/`await`.
- [x] Background service worker is stateless and relies on `chrome.storage`.
- [x] Plain-English justifications documented for all permissions.
