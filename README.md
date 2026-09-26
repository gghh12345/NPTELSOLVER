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

## 🧪 Local Testing & Development

You can test the entire system (Backend API + Mock Assignment) locally out-of-the-box:

### 1. Start the Local Server
```bash
# On Linux / macOS:
./run_local.sh
# Or via npm:
npm start

# On Windows:
run_local.bat
```

### 2. Available Local Endpoints
- **Developer & Testing Dashboard**: [http://127.0.0.1:8787](http://127.0.0.1:8787) or [http://localhost:3000](http://localhost:3000)
- **Local Mock Assignment**: [http://127.0.0.1:8787/mock_nptel.html](http://127.0.0.1:8787/mock_nptel.html)
- **Backend Health Check**: [http://127.0.0.1:8787/api/health](http://127.0.0.1:8787/api/health)
- **Database Stats**: [http://127.0.0.1:8787/api/stats](http://127.0.0.1:8787/api/stats)

### 3. Test with the Chrome Extension
1. Open Chrome and go to `chrome://extensions/`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this project directory.
4. Visit [http://127.0.0.1:8787/mock_nptel.html](http://127.0.0.1:8787/mock_nptel.html).
5. Open the Side Panel (<kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>N</kbd>), click **Scan Page**, and click **Solve All**!

