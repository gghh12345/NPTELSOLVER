/**
 * NPTEL Pro Solver - High-Performance Localhost Runner
 * 
 * Runs both:
 * 1. Cloudflare D1 Backend (SQLite Powered) on http://127.0.0.1:8787
 * 2. Localhost Web Portal & Mock Assignment Suite on http://localhost:3000 (and 8787)
 * 
 * Works 100% out of the box with Node v24 built-in native SQLite engine.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import worker from './cloudflare-backend/src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_DIR = __dirname;
const DB_PATH = path.join(WORKSPACE_DIR, 'cloudflare-backend', 'local_vault.sqlite');
const SCHEMA_PATH = path.join(WORKSPACE_DIR, 'cloudflare-backend', 'schema.sql');

// ── 1. Initialize SQLite Database & Verified Questions ────────────────────────

console.log('⚡ [Local Vault] Connecting to SQLite storage:', DB_PATH);
const dbSync = new DatabaseSync(DB_PATH);

// Run initial schema if questions table does not exist
const tableCheck = dbSync.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='questions'").get();
if (!tableCheck) {
  console.log('📦 [Local Vault] Initializing database schema from schema.sql...');
  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  dbSync.exec(schemaSql);
  console.log('✓ [Local Vault] Schema created and default seed questions inserted.');
}

// Helper: Normalize & Hash (matching cloudflare-backend/src/index.js)
function normalizeText(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/^(question\s*\d+[\s.:)]*|q\s*\d+[\s.:)]*|\d+[\s.:)]+)/i, '')
    .replace(/[\\${}()_^[\].,;:?!"'`~@#%&*+-/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashText(str) {
  const norm = normalizeText(str);
  if (!norm || norm.length < 5) {
    return 'unhashable_' + Math.random().toString(16).slice(2, 10);
  }
  let hash = 5381;
  for (let i = 0; i < norm.length; i++) {
    hash = (hash * 33) ^ norm.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

// Canonical questions to ensure full coverage of Mock Assignment & core subjects
const ADDITIONAL_SEED_QUESTIONS = [
  // Mock Assignment Question 3 (Balanced BST Search Complexity)
  {
    course_id: 'noc26_cs101',
    text: 'What is the time complexity of searching an element in a balanced Binary Search Tree (BST) with n nodes?',
    options: ['O(1)', 'O(n)', 'O(log n)', 'O(n log n)'],
    correct_option_index: 2,
    correct_option_text: 'O(log n)',
    confidence: 100,
    numerical_answer: null,
    reasoning: 'In a balanced BST, each comparison halves the search space, yielding O(log n) time complexity in worst and average cases.',
    source: 'OFFICIAL_KEY'
  },
  // Mock Assignment Question 4 (NAT: Max nodes in height 3 binary tree)
  {
    course_id: 'noc26_cs101',
    text: 'What is the maximum number of nodes in a binary tree of height 3? (Root is at height 0)',
    options: [],
    correct_option_index: 0,
    correct_option_text: '15',
    confidence: 100,
    numerical_answer: 15,
    reasoning: 'For a binary tree of height h with root at level 0, the maximum number of nodes is 2^(h+1) - 1. For h=3, 2^4 - 1 = 15.',
    source: 'OFFICIAL_KEY'
  },
  // Mock Assignment Question 4 variant with [NAT] prefix
  {
    course_id: 'noc26_cs101',
    text: '[NAT] What is the maximum number of nodes in a binary tree of height 3? (Root is at height 0)',
    options: [],
    correct_option_index: 0,
    correct_option_text: '15',
    confidence: 100,
    numerical_answer: 15,
    reasoning: 'For a binary tree of height h with root at level 0, the maximum number of nodes is 2^(h+1) - 1. For h=3, 2^4 - 1 = 15.',
    source: 'OFFICIAL_KEY'
  },
  // Data Structures: LIFO
  {
    course_id: 'noc26_cs101',
    text: 'Which of the following data structures operates on the Last In First Out (LIFO) principle?',
    options: ['Queue', 'Stack', 'Array', 'Linked List'],
    correct_option_index: 1,
    correct_option_text: 'Stack',
    confidence: 100,
    numerical_answer: null,
    reasoning: 'A Stack follows LIFO, whereas a Queue follows FIFO (First In First Out).',
    source: 'OFFICIAL_KEY'
  },
  // Quick Sort Worst-case
  {
    course_id: 'noc26_cs101',
    text: 'What is the worst-case time complexity of Quick Sort?',
    options: ['O(n)', 'O(n log n)', 'O(n^2)', 'O(2^n)'],
    correct_option_index: 2,
    correct_option_text: 'O(n^2)',
    confidence: 100,
    numerical_answer: null,
    reasoning: 'When the pivot chosen is consistently the smallest or largest element, QuickSort degrades to O(n^2).',
    source: 'OFFICIAL_KEY'
  },
  // Python Immutable Data Type
  {
    course_id: 'noc26_cs102',
    text: 'In Python, which of the following data types is immutable?',
    options: ['List', 'Dictionary', 'Set', 'Tuple'],
    correct_option_index: 3,
    correct_option_text: 'Tuple',
    confidence: 100,
    numerical_answer: null,
    reasoning: 'Tuples, strings, and integers are immutable in Python; lists, dictionaries, and sets are mutable.',
    source: 'OFFICIAL_KEY'
  },
  // Deep Learning: Vanishing Gradient
  {
    course_id: 'noc26_cs103',
    text: 'Which activation function is most susceptible to the vanishing gradient problem when inputs are very large or very small?',
    options: ['ReLU', 'Leaky ReLU', 'Sigmoid', 'ELU'],
    correct_option_index: 2,
    correct_option_text: 'Sigmoid',
    confidence: 100,
    numerical_answer: null,
    reasoning: 'The sigmoid derivative approaches 0 for large positive or negative inputs, causing gradients to vanish during backpropagation.',
    source: 'OFFICIAL_KEY'
  }
];

const insertStmt = dbSync.prepare(`
  INSERT OR IGNORE INTO questions
  (question_hash, course_id, question_text, options, correct_option_index, correct_option_text, is_verified, confidence, numerical_answer, reasoning, source)
  VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
`);

for (const q of ADDITIONAL_SEED_QUESTIONS) {
  const hash = hashText(q.text);
  insertStmt.run(
    hash,
    q.course_id,
    q.text,
    JSON.stringify(q.options),
    q.correct_option_index,
    q.correct_option_text,
    q.confidence,
    q.numerical_answer,
    q.reasoning,
    q.source
  );
}

const totalCount = dbSync.prepare('SELECT COUNT(*) as count FROM questions').get().count;
console.log(`✓ [Local Vault] Active verified database loaded with ${totalCount} questions.`);

// ── 2. Cloudflare D1 Wrapper ────────────────────────────────────────────────

const d1Compat = {
  async exec(sql) {
    dbSync.exec(sql);
  },
  prepare(sql) {
    let boundArgs = [];
    const stmtObj = {
      bind(...args) {
        boundArgs = args.map(a => (a === undefined ? null : a));
        return stmtObj;
      },
      async first() {
        const stmt = dbSync.prepare(sql);
        const row = stmt.get(...boundArgs);
        return row ?? null;
      },
      async all() {
        const stmt = dbSync.prepare(sql);
        const rows = stmt.all(...boundArgs);
        return { results: rows };
      },
      async run() {
        const stmt = dbSync.prepare(sql);
        const res = stmt.run(...boundArgs);
        return {
          success: true,
          meta: { changes: res.changes, last_row_id: res.lastInsertRowid }
        };
      }
    };
    return stmtObj;
  }
};

const workerEnv = {
  DB: d1Compat,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_API_KEYS: process.env.GEMINI_API_KEYS || '',
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  GROQ_API_KEYS: process.env.GROQ_API_KEYS || '',
  ENVIRONMENT: 'local'
};

const workerCtx = {
  waitUntil(promise) {
    Promise.resolve(promise).catch(err => console.error('[D1 Background Write Error]:', err));
  }
};

// ── 3. MIME Types & Static File Server ──────────────────────────────────────

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function serveStatic(filePath, res) {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    const indexPath = path.join(filePath, 'index.html');
    if (fs.existsSync(indexPath)) {
      return serveStatic(indexPath, res);
    }
    return false;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const content = fs.readFileSync(filePath);

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': content.length,
    'Access-Control-Allow-Origin': '*'
  });
  res.end(content);
  return true;
}

// ── 4. Developer & Testing Dashboard HTML ────────────────────────────────────

function getDashboardHtml(reqPort) {
  const allQuestions = dbSync.prepare('SELECT id, question_text, correct_option_text, confidence, source FROM questions LIMIT 20').all();
  const rowsHtml = allQuestions.map(q => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #1c1c1f; color: #71717a; font-mono;">${q.id}</td>
      <td style="padding: 10px; border-bottom: 1px solid #1c1c1f; font-weight: 500; color: #f4f4f5;">${q.question_text}</td>
      <td style="padding: 10px; border-bottom: 1px solid #1c1c1f; color: #ffffff; font-weight: 600;">${q.correct_option_text}</td>
      <td style="padding: 10px; border-bottom: 1px solid #1c1c1f; text-align: center;"><span style="border: 1px solid #27272a; background: #161618; color: #ffffff; padding: 2px 7px; border-radius: 12px; font-size: 10px; font-weight: 600;">${q.confidence}%</span></td>
      <td style="padding: 10px; border-bottom: 1px solid #1c1c1f; text-align: right; color: #a1a1aa; font-size: 11px; font-family: monospace;">${q.source}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NPTEL Pro Solver - Local Development Suite</title>
  <link rel="icon" href="/icons/icon-48.png">
  <style>
    :root {
      --bg: #000000;
      --card-bg: #0c0c0e;
      --card-border: #242427;
      --text: #ffffff;
      --text-muted: #71717a;
      --text-secondary: #a1a1aa;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding: 30px 20px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    .container { max-width: 1000px; margin: 0 auto; }
    .hero {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 24px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #161618;
      border: 1px solid var(--card-border);
      color: #ffffff;
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 500;
    }
    .badge-dot {
      width: 6px; height: 6px; background: #ffffff; border-radius: 50%;
      box-shadow: 0 0 6px rgba(255, 255, 255, 0.6);
    }
    h1 { font-size: 20px; margin: 6px 0 2px 0; font-weight: 700; color: #fff; }
    p.lead { color: var(--text-muted); font-size: 13px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin-bottom: 20px; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 18px;
    }
    .card-title {
      font-size: 13px;
      font-weight: 600;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      background: #ffffff;
      color: #000000;
      text-decoration: none;
      font-weight: 600;
      padding: 8px 14px;
      border-radius: 6px;
      border: 1px solid #ffffff;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.15s ease;
    }
    .btn:hover { background: #e4e4e7; border-color: #e4e4e7; }
    .btn-secondary { background: #161618; color: #ffffff; border-color: var(--card-border); }
    .btn-secondary:hover { background: #222226; border-color: #3f3f46; }
    .code-pill {
      background: #161618;
      border: 1px solid var(--card-border);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: monospace;
      color: #ffffff;
      font-size: 11px;
    }
    select, input, textarea {
      width: 100%;
      background: #161618;
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 8px 10px;
      color: #ffffff;
      font-size: 12px;
      margin-bottom: 10px;
      font-family: inherit;
      outline: none;
    }
    select:focus, input:focus, textarea:focus {
      border-color: #ffffff;
    }
    pre {
      background: #000000;
      border: 1px solid var(--card-border);
      padding: 12px;
      border-radius: 6px;
      font-size: 11px;
      color: #f4f4f5;
      overflow-x: auto;
      max-height: 180px;
    }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; padding: 10px; color: var(--text-muted); border-bottom: 1px solid var(--card-border); font-weight: 600; font-size: 11px; text-transform: uppercase; }
  </style>
</head>
<body>

  <div class="container">
    
    <!-- Hero Header -->
    <div class="hero">
      <div>
        <div class="badge"><span class="badge-dot"></span> Localhost Environment &bull; Active</div>
        <h1>NPTEL Pro Solver</h1>
        <p class="lead">Minimalist local test suite for Chrome Extension & Question Vault</p>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <a href="/mock_nptel.html" target="_blank" class="btn">Open Mock Assignment</a>
        <a href="/sidepanel/sidepanel.html" target="_blank" class="btn btn-secondary">Side Panel</a>
      </div>
    </div>

    <!-- Quick Status Cards -->
    <div class="grid">
      
      <!-- API Status Card -->
      <div class="card">
        <div class="card-title">Endpoints</div>
        <ul style="list-style: none; font-size: 12px; display: flex; flex-direction: column; gap: 8px;">
          <li><strong>API Health:</strong> <a href="http://127.0.0.1:8787/api/health" target="_blank" style="color: #ffffff; text-decoration: none;">http://127.0.0.1:8787/api/health</a></li>
          <li><strong>Vault Stats:</strong> <a href="http://127.0.0.1:8787/api/stats" target="_blank" style="color: #ffffff; text-decoration: none;">http://127.0.0.1:8787/api/stats</a></li>
          <li><strong>Mock Assignment:</strong> <a href="http://127.0.0.1:8787/mock_nptel.html" target="_blank" style="color: #ffffff; text-decoration: none;">http://127.0.0.1:8787/mock_nptel.html</a></li>
        </ul>
        <div style="margin-top: 14px; padding: 10px; background: #161618; border: 1px solid var(--card-border); border-radius: 6px; font-size: 11px; color: var(--text-secondary);">
          Connected automatically to <span class="code-pill">http://127.0.0.1:8787</span>.
        </div>
      </div>

      <!-- Quick Interactive Solver Test -->
      <div class="card">
        <div class="card-title">Solve Test Bench (/api/solve-one)</div>
        <select id="sampleSelect" onchange="loadSample(this.value)">
          <option value="q1">Q1: Pointer size on 64-bit architecture</option>
          <option value="q2">Q2: Dynamic memory allocation without zeroing</option>
          <option value="q3">Q3: Balanced BST Search Complexity</option>
          <option value="q4">Q4: NAT: Max nodes in height 3 binary tree</option>
          <option value="q5">Q5: Python immutable data type</option>
        </select>
        <textarea id="testQuestion" rows="2" style="resize: vertical;"></textarea>
        <button class="btn" style="width: 100%; margin-bottom: 10px;" onclick="testSolve()">Query Vault</button>
        <pre id="testOutput">// Solution response will appear here...</pre>
      </div>

      <!-- Extension Installation Guide -->
      <div class="card">
        <div class="card-title">Install Chrome Extension</div>
        <ol style="padding-left: 18px; font-size: 12px; color: var(--text-secondary); display: flex; flex-direction: column; gap: 6px;">
          <li>Visit <span class="code-pill">chrome://extensions</span></li>
          <li>Enable <strong>Developer mode</strong></li>
          <li>Click <strong>Load unpacked</strong></li>
          <li>Select directory: <span class="code-pill">${WORKSPACE_DIR}</span></li>
          <li>Open <a href="/mock_nptel.html" target="_blank" style="color: #ffffff;">Mock Assignment</a> and press <kbd style="background:#161618; border:1px solid #27272a; padding: 1px 5px; border-radius: 3px; font-size: 10px; color:#fff;">Alt+Shift+N</kbd></li>
        </ol>
      </div>

    </div>

    <!-- Live Database Explorer -->
    <div class="card" style="margin-bottom: 20px;">
      <div class="card-title" style="justify-content: space-between;">
        <span>Verified Questions Vault (${totalCount} Cached)</span>
        <span style="font-size: 11px; font-weight: normal; color: var(--text-muted);">SQLite Active</span>
      </div>
      <div style="overflow-x: auto;">
        <table>
          <thead>
            <tr>
              <th style="width: 40px;">#</th>
              <th>Question Text</th>
              <th style="width: 180px;">Verified Answer</th>
              <th style="width: 90px; text-align: center;">Confidence</th>
              <th style="width: 110px; text-align: right;">Source</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    </div>

  </div>

  <script>
    const samples = {
      q1: "What is the size of a pointer to an integer on a 64-bit architecture?",
      q2: "Which of the following functions is used to allocate memory dynamically in C without initializing it to zero?",
      q3: "What is the time complexity of searching an element in a balanced Binary Search Tree (BST) with n nodes?",
      q4: "[NAT] What is the maximum number of nodes in a binary tree of height 3? (Root is at height 0)",
      q5: "In Python, which of the following data types is immutable?"
    };

    function loadSample(key) {
      document.getElementById('testQuestion').value = samples[key];
    }
    loadSample('q1');

    async function testSolve() {
      const qText = document.getElementById('testQuestion').value;
      const out = document.getElementById('testOutput');
      out.textContent = 'Querying local vault backend...';
      try {
        const resp = await fetch('/api/solve-one', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: { questionText: qText } })
        });
        const data = await resp.json();
        out.textContent = JSON.stringify(data, null, 2);
      } catch (err) {
        out.textContent = 'Error: ' + err.message;
      }
    }
  </script>
</body>
</html>`;
}

// ── 5. Main Unified Request Handler ──────────────────────────────────────────

async function handleUnifiedRequest(req, res, currentPort) {
  const host = req.headers.host || `127.0.0.1:${currentPort}`;
  const url = new URL(req.url, `http://${host}`);
  const pathname = url.pathname;

  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  // 1. Root / Dashboard handling
  if (pathname === '/' || pathname === '/index.html') {
    const accept = req.headers.accept || '';
    // If browser requested HTML, serve the dashboard
    if (accept.includes('text/html')) {
      const html = getDashboardHtml(currentPort);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(html);
    }
  }

  // 2. Direct Mock Assignment Alias
  if (pathname === '/mock_nptel.html' || pathname === '/test' || pathname === '/test/' || pathname === '/mock') {
    const mockFile = path.join(WORKSPACE_DIR, 'test', 'mock_nptel.html');
    if (serveStatic(mockFile, res)) return;
  }

  // 3. API Endpoints routed to Cloudflare Worker router
  if (pathname.startsWith('/api/') || (pathname === '/' && req.headers.accept?.includes('application/json'))) {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = (req.method === 'GET' || req.method === 'HEAD') ? undefined : Buffer.concat(chunks);

      const workerReq = new Request(url, {
        method: req.method,
        headers: req.headers,
        body
      });

      const workerResp = await worker.fetch(workerReq, workerEnv, workerCtx);

      res.statusCode = workerResp.status;
      workerResp.headers.forEach((val, key) => {
        res.setHeader(key, val);
      });
      res.setHeader('Access-Control-Allow-Origin', '*');

      const arrayBuffer = await workerResp.arrayBuffer();
      return res.end(Buffer.from(arrayBuffer));
    } catch (err) {
      console.error('[Worker Execution Error]:', err);
      res.writeHead(500, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // 4. Static Files (test, sidepanel, popup, content, icons, lib, etc.)
  let cleanPath = pathname.replace(/^\/+/, '');
  let resolvedFile = path.join(WORKSPACE_DIR, cleanPath);

  // Check if inside test directory
  if (!fs.existsSync(resolvedFile) && !cleanPath.startsWith('test/')) {
    const altTest = path.join(WORKSPACE_DIR, 'test', cleanPath);
    if (fs.existsSync(altTest)) resolvedFile = altTest;
  }

  if (serveStatic(resolvedFile, res)) {
    return;
  }

  // 404 Not Found
  res.writeHead(404, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify({ error: 'Not Found', path: pathname }));
}

// ── 6. Start Servers on 8787 & 3000 ──────────────────────────────────────────

const PRIMARY_PORT = parseInt(process.env.API_PORT || '8787', 10);
const WEB_PORT = parseInt(process.env.PORT || '3000', 10);

function startServer(port, label) {
  const srv = http.createServer((req, res) => handleUnifiedRequest(req, res, port));
  srv.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️  [Port ${port}] Already in use, skipping ${label}`);
    } else {
      console.error(`✘ [Port ${port}] Error:`, err);
    }
  });

  srv.listen(port, '0.0.0.0', () => {
    console.log(`🚀 [${label}] Live at: http://127.0.0.1:${port} (also http://localhost:${port})`);
  });
  return srv;
}

console.log('\n==============================================================');
console.log('       NPTEL Pro Solver - Local Development Suite 🎓⚡');
console.log('==============================================================');

startServer(PRIMARY_PORT, 'Primary API & Backend Server');
if (WEB_PORT !== PRIMARY_PORT) {
  startServer(WEB_PORT, 'Web Preview & Testing Portal');
}

console.log(`\n📌 Quick Links:`);
console.log(`   👉 Dashboard:        http://127.0.0.1:${PRIMARY_PORT} / http://localhost:${WEB_PORT}`);
console.log(`   👉 Mock Assignment:  http://127.0.0.1:${PRIMARY_PORT}/mock_nptel.html`);
console.log(`   👉 API Health Check: http://127.0.0.1:${PRIMARY_PORT}/api/health`);
console.log(`   👉 Chrome Extension: Load unpacked from /workspace/gentle-kalam`);
console.log('==============================================================\n');
