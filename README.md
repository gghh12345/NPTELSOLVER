# NPTEL Pro Solver 🎓⚡

A state-of-the-art Chrome Extension (Manifest V3) for NPTEL & Swayam courses. It combines an **Official Question Bank** (with 100% verified answers for repeat questions) with **Multimodal Gemini AI Reasoning** for brand-new or complex questions.

---

## ✨ Features

- **Hybrid Intelligence**: Checks the verified past assignment answer bank first (0 ms latency, 100% accuracy); falls back to Gemini 2.5 Flash if needed.
- **Dual API Key Support**: Works immediately out-of-the-box in **Auto Default Mode**, or lets you paste your own free Gemini API key in Settings for unlimited private requests.
- **Chrome Side Panel**: Unobtrusively docks alongside your assignment without covering questions or formulas.
- **Safe Review Mode**: Choose between "Highlight Only" (glows the correct answer in emerald green with a confidence pill) or "Auto-Fill" (safely selects the radio/checkbox).
- **Inline Assistant**: Attaches sleek `[ ⚡ Solve with AI ]` buttons right next to each question on the NPTEL portal.
- **Step-by-Step Derivations**: Inspect explanations, formulas used, and confidence ratings before submitting.
- **Never Auto-Submits**: You remain in 100% control of final submission.

---

## 🚀 How to Install in Chrome

1. Open **Google Chrome**.
2. Go to `chrome://extensions/` in the URL bar.
3. Enable **"Developer mode"** via the toggle switch in the top right corner.
4. Click the **"Load unpacked"** button in the top left.
5. Select this folder (`c:\Users\Richard Konsam\Desktop\DEVANANDA\NPTELSOLVER`).
6. Pin the extension to your Chrome toolbar.

---

## 📖 How to Use

1. Navigate to any NPTEL assignment page (`https://onlinecourses.nptel.ac.in/...`).
2. Click the extension icon or press **<kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>N</kbd>** to open the Side Panel.
3. Click **"Scan Page"** — the extension will detect all questions and check the verified question bank.
4. Click **"Solve All"** to solve remaining questions with AI.
5. Click **"Fill All on Page"** to apply answers or review the green highlights!

---

## 🧪 Local Testing

You can test the extension offline immediately without an active NPTEL session:
1. Double-click or open `test/mock_nptel.html` in Chrome.
2. Open the Side Panel and click **"Scan Page"**.
3. Watch questions match against the verified question bank instantly!
