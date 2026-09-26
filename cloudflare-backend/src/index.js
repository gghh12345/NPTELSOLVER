/**
 * Cloudflare Edge Worker: NPTEL Pro Solver Central Answer Vault
 * Powered by Cloudflare D1 (SQLite) and a Multi-Provider LLM Key Pool
 * (Inspired by FreeLLMAPI with auto-rotation and failover across Gemini & Groq).
 */

// ── Helpers & CORS ──────────────────────────────────────────────────────────

function handleCors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...extraHeaders
    }
  });
}

// Text normalization & fast FNV hash
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

// ── Multi-Key Pool & Failover Manager ────────────────────────────────────────

let roundRobinGeminiIndex = 0;
let roundRobinGroqIndex = 0;

const GEMINI_MODELS = [
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-flash-lite-latest',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.6-flash'
];

function parseKeyPool(rawEnvVal) {
  if (!rawEnvVal) return [];
  return rawEnvVal
    .split(',')
    .map(k => k.trim())
    .filter(k => k.length > 5);
}

/**
 * Executes a question solve against the key pool with automatic failover
 */
async function solveWithFailoverPool(qData, env) {
  const geminiKeys = [
    ...parseKeyPool(env.GEMINI_API_KEYS),
    ...parseKeyPool(env.GEMINI_API_KEY)
  ];
  const uniqueGeminiKeys = [...new Set(geminiKeys)];

  const groqKeys = [
    ...parseKeyPool(env.GROQ_API_KEYS),
    ...parseKeyPool(env.GROQ_API_KEY)
  ];
  const uniqueGroqKeys = [...new Set(groqKeys)];

  const errors = [];

  // 1. Try Gemini Key Pool with candidate models
  if (uniqueGeminiKeys.length > 0) {
    const startIdx = roundRobinGeminiIndex % uniqueGeminiKeys.length;
    roundRobinGeminiIndex++;

    for (let i = 0; i < uniqueGeminiKeys.length; i++) {
      const keyIndex = (startIdx + i) % uniqueGeminiKeys.length;
      const key = uniqueGeminiKeys[keyIndex];

      for (const model of GEMINI_MODELS) {
        try {
          const sol = await callGemini(qData, key, model);
          sol.provider = `${model} [Pool #${keyIndex + 1}]`;
          return sol;
        } catch (err) {
          errors.push(`${model} (Key #${keyIndex + 1}): ${err.message}`);
        }
      }
    }
  }

  // 2. Failover: Groq Free API (Llama 3.3 70B Versatile)
  if (uniqueGroqKeys.length > 0) {
    const groqIdx = roundRobinGroqIndex % uniqueGroqKeys.length;
    roundRobinGroqIndex++;
    const groqKey = uniqueGroqKeys[groqIdx];

    try {
      const sol = await callGroq(qData, groqKey, 'llama-3.3-70b-versatile');
      sol.provider = `Groq Llama 3.3 70B [Pool #${groqIdx + 1}]`;
      return sol;
    } catch (groqErr) {
      errors.push(`Groq Llama 3.3 70B: ${groqErr.message}`);
    }
  }

  // 3. All providers exhausted
  throw new Error(`All LLM pool providers exhausted. Errors: ${errors.slice(-2).join(' | ')}`);
}

/**
 * Call Google Gemini API
 */
async function callGemini(qData, apiKey, model) {
  const isNumerical = qData.selectMode === 'NUMERICAL_NAT' || (!qData.options || qData.options.length === 0);

  const optionsText = !isNumerical && qData.options && qData.options.length > 0
    ? qData.options.map((opt, idx) => `[Option ${idx}]: ${opt}`).join('\n')
    : '(Numerical Answer Type - Calculate exact value)';

  const prompt = `You are a senior IIT professor solving an NPTEL assignment question.
Evaluate with high academic rigor.

QUESTION:
${qData.questionText}

${isNumerical ? 'TYPE: Numerical Answer Type' : `OPTIONS:\n${optionsText}`}

Return ONLY valid JSON matching this schema:
{
  "selectedIndex": ${isNumerical ? 0 : '<0-based integer index of correct option>'},
  "selectedText": "<exact text of option or calculated numerical value>",
  "numericalValue": ${isNumerical ? '<exact float number or null>' : 'null'},
  "confidence": <integer 85-100>,
  "reasoning": "<step-by-step academic explanation in 2-3 sentences>",
  "keyFormula": "<relevant law, theorem or LaTeX formula, e.g. \\\\int_0^\\\\infty e^{-x}dx, or empty string>"
}`;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const parts = [];
  if (qData.imageBase64) {
    const cleanB64 = qData.imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
    parts.push({
      inlineData: { mimeType: 'image/png', data: cleanB64 }
    });
  }
  parts.push({ text: prompt });

  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      })
    });

    if ((resp.status === 503 || resp.status === 429) && attempt === 0) {
      await new Promise(r => setTimeout(r, 1200));
      continue;
    }

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${txt.substring(0, 120)}`);
    }

    const json = await resp.json();
    const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const cleanJson = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleanJson);

    let selectedIndex = parseInt(parsed.selectedIndex, 10);
    if (isNaN(selectedIndex) || selectedIndex < 0 || (qData.options && selectedIndex >= qData.options.length)) {
      selectedIndex = 0;
    }

    return {
      selectedIndex,
      selectedText: (qData.options && qData.options[selectedIndex]) || parsed.selectedText || '',
      numericalValue: parsed.numericalValue ?? null,
      confidence: parsed.confidence || 95,
      reasoning: parsed.reasoning || 'Derived from core course syllabus principles.',
      keyFormula: parsed.keyFormula || '',
      source: 'AI_GEMINI'
    };
  }
}

/**
 * Call Groq API (OpenAI-compatible)
 */
async function callGroq(qData, apiKey, model) {
  const isNumerical = qData.selectMode === 'NUMERICAL_NAT' || (!qData.options || qData.options.length === 0);

  const optionsText = !isNumerical && qData.options && qData.options.length > 0
    ? qData.options.map((opt, idx) => `[Option ${idx}]: ${opt}`).join('\n')
    : '(Numerical Answer Type - Calculate exact value)';

  const systemPrompt = `You are a senior IIT professor solving an NPTEL assignment. Return ONLY a valid JSON object matching:
{"selectedIndex": <int>, "selectedText": "<string>", "numericalValue": <number|null>, "confidence": <int 85-100>, "reasoning": "<string>", "keyFormula": "<string>"}`;

  const userPrompt = `QUESTION:
${qData.questionText}

${isNumerical ? 'TYPE: Numerical Answer Type' : `OPTIONS:\n${optionsText}`}`;

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1
    })
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Groq HTTP ${resp.status}: ${err.substring(0, 120)}`);
  }

  const resJson = await resp.json();
  const content = resJson.choices?.[0]?.message?.content || '{}';
  const parsed = JSON.parse(content);

  let selectedIndex = parseInt(parsed.selectedIndex, 10);
  if (isNaN(selectedIndex) || selectedIndex < 0 || (qData.options && selectedIndex >= qData.options.length)) {
    selectedIndex = 0;
  }

  return {
    selectedIndex,
    selectedText: (qData.options && qData.options[selectedIndex]) || parsed.selectedText || '',
    numericalValue: parsed.numericalValue ?? null,
    confidence: parsed.confidence || 95,
    reasoning: parsed.reasoning || 'Derived from standard academic references.',
    keyFormula: parsed.keyFormula || '',
    source: 'AI_GROQ'
  };
}

// ── Worker Router ───────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    // Preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: handleCors() });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 1. Health & Status
      if (path === '/api/health' || path === '/') {
        const geminiKeyCount = parseKeyPool(env.GEMINI_API_KEYS).length || (env.GEMINI_API_KEY ? 1 : 0);
        const groqKeyCount = parseKeyPool(env.GROQ_API_KEYS).length || (env.GROQ_API_KEY ? 1 : 0);

        return jsonResponse({
          status: 'ok',
          service: 'nptel-pro-solver-vault',
          version: '2.0.0',
          edgeRegion: request.cf?.colo || 'local',
          keyPool: {
            geminiKeysConfigured: geminiKeyCount,
            groqKeysConfigured: groqKeyCount,
            totalPoolCapacity: geminiKeyCount + groqKeyCount
          },
          features: ['D1_CACHE_FIRST', 'MULTI_KEY_ROTATION', 'GROQ_FAILOVER', 'NAT_NUMERICAL']
        });
      }

      // 1.5 List available Gemini models
      if (path === '/api/models' && request.method === 'GET') {
        const apiKey = env.GEMINI_API_KEY || parseKeyPool(env.GEMINI_API_KEYS)[0];
        if (!apiKey) return jsonResponse({ error: 'No GEMINI_API_KEY' }, 400);
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await resp.json();
        const models = (data.models || []).map(m => m.name.replace('models/', ''));
        return jsonResponse({ models });
      }

      // 2. Database Stats
      if (path === '/api/stats' && request.method === 'GET') {
        let count = 0;
        try {
          const row = await env.DB.prepare('SELECT COUNT(*) as count FROM questions').first();
          count = row ? row.count : 0;
        } catch (dbErr) {
          console.warn('D1 Stats query err:', dbErr);
        }
        return jsonResponse({ totalQuestionsCached: count });
      }

      // 3. Solve Single Question
      if (path === '/api/solve-one' && request.method === 'POST') {
        const body = await request.json();
        const { question, courseId } = body;
        if (!question) {
          return jsonResponse({ error: 'Missing question payload' }, 400);
        }

        const qHash = hashText(question.questionText);

        // Check D1
        let cached = null;
        try {
          cached = await env.DB.prepare(
            'SELECT * FROM questions WHERE question_hash = ? LIMIT 1'
          ).bind(qHash).first();
        } catch (dbErr) {
          console.warn('D1 Query error:', dbErr);
        }

        if (cached) {
          return jsonResponse({
            success: true,
            solution: {
              selectedIndex: cached.correct_option_index,
              selectedText: cached.correct_option_text,
              numericalValue: cached.numerical_answer ?? null,
              confidence: cached.confidence || 100,
              reasoning: cached.reasoning,
              keyFormula: cached.key_formula || '',
              source: cached.is_verified ? 'OFFICIAL_VAULT' : 'COMMUNITY_CACHE',
              isVerified: Boolean(cached.is_verified)
            }
          });
        }

        // Solve via LLM Pool
        const sol = await solveWithFailoverPool(question, env);

        // Asynchronously save to D1
        ctx.waitUntil(
          env.DB.prepare(`
            INSERT OR IGNORE INTO questions 
            (question_hash, course_id, question_text, options, correct_option_index, correct_option_text, is_verified, confidence, reasoning, key_formula, source)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
          `).bind(
            qHash,
            courseId || '',
            question.questionText,
            JSON.stringify(question.options || []),
            sol.selectedIndex,
            sol.selectedText,
            sol.confidence,
            sol.reasoning,
            sol.keyFormula,
            sol.source
          ).run().catch(e => console.warn('D1 write error:', e))
        );

        return jsonResponse({ success: true, solution: sol });
      }

      // 4. Batch Solve All Questions
      if (path === '/api/solve' && request.method === 'POST') {
        const body = await request.json();
        const { courseId, assignmentTitle, questions = [] } = body;

        const results = {};

        for (const q of questions) {
          const qHash = hashText(q.questionText);

          // 1. Check D1 first
          let cached = null;
          if (!qHash.startsWith('unhashable_')) {
            try {
              cached = await env.DB.prepare(
                'SELECT * FROM questions WHERE question_hash = ? LIMIT 1'
              ).bind(qHash).first();
            } catch (dbErr) {
              console.warn('D1 query err:', dbErr);
            }
          }

          if (cached) {
            results[q.qIndex] = {
              selectedIndex: cached.correct_option_index,
              selectedText: cached.correct_option_text,
              numericalValue: cached.numerical_answer ?? null,
              confidence: cached.confidence || 100,
              reasoning: cached.reasoning,
              keyFormula: cached.key_formula || '',
              source: cached.is_verified ? 'OFFICIAL_VAULT' : 'COMMUNITY_CACHE',
              isVerified: Boolean(cached.is_verified)
            };
            continue;
          }

          // 2. Solve with LLM Pool (Multi-Key Gemini + Groq)
          try {
            const aiSol = await solveWithFailoverPool(q, env);
            results[q.qIndex] = aiSol;

            // Save to D1 cache asynchronously
            ctx.waitUntil(
              env.DB.prepare(`
                INSERT OR IGNORE INTO questions 
                (question_hash, course_id, question_text, options, correct_option_index, correct_option_text, is_verified, confidence, reasoning, key_formula, source)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
              `).bind(
                qHash,
                courseId || '',
                q.questionText,
                JSON.stringify(q.options || []),
                aiSol.selectedIndex,
                aiSol.selectedText,
                aiSol.confidence,
                aiSol.reasoning,
                aiSol.keyFormula,
                aiSol.source
              ).run().catch(e => console.warn('D1 write error:', e))
            );

            // Small delay between AI requests to prevent burst 503 rate limits
            await new Promise(r => setTimeout(r, 600));

          } catch (err) {
            console.error(`Error solving Q${q.qNum || q.qIndex}:`, err);
            results[q.qIndex] = {
              error: err.message,
              selectedIndex: 0,
              selectedText: q.options?.[0] || '',
              confidence: 50,
              source: 'ERROR'
            };
          }
        }

        return jsonResponse({
          success: true,
          courseId,
          assignmentTitle,
          solutions: results
        });
      }

      // 5. Contribute Official Answers (after assignment deadline)
      if (path === '/api/contribute' && request.method === 'POST') {
        const { courseId, assignmentTitle, questions = [] } = await request.json();
        let inserted = 0;

        for (const q of questions) {
          if (q.verifiedIndex !== undefined) {
            const qHash = hashText(q.questionText);
            await env.DB.prepare(`
              INSERT INTO questions (question_hash, course_id, question_text, options, correct_option_index, correct_option_text, is_verified, confidence, source)
              VALUES (?, ?, ?, ?, ?, ?, 1, 100, 'OFFICIAL_KEY')
              ON CONFLICT(question_hash) DO UPDATE SET
                correct_option_index = excluded.correct_option_index,
                correct_option_text = excluded.correct_option_text,
                is_verified = 1,
                confidence = 100,
                source = 'OFFICIAL_KEY'
            `).bind(
              qHash,
              courseId || '',
              q.questionText,
              JSON.stringify(q.options || []),
              q.verifiedIndex,
              q.options?.[q.verifiedIndex] || '',
            ).run();
            inserted++;
          }
        }

        return jsonResponse({ success: true, contributedCount: inserted });
      }

      return jsonResponse({ error: 'Endpoint Not Found' }, 404);

    } catch (fatalErr) {
      console.error('Fatal Worker Error:', fatalErr);
      return jsonResponse({ error: fatalErr.message }, 500);
    }
  }
};
