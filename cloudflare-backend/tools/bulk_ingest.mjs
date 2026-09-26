/**
 * NPTEL Bulk Assignment Ingestion & Extraction Engine
 * Professional CLI tool to ingest entire courses, HTML assignment dumps, or JSON question banks.
 */

import fs from 'fs';
import path from 'path';

// Text normalization & hash
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
  let hash = 5381;
  for (let i = 0; i < norm.length; i++) {
    hash = (hash * 33) ^ norm.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

const BACKEND_URL = 'https://nptel-pro-solver-api.unknowniphone724.workers.dev';

/**
 * Bulk upload an array of questions to Cloudflare D1
 */
export async function bulkUploadToD1(courseId, assignmentTitle, questions) {
  console.log(`\n🚀 Uploading ${questions.length} questions for "${assignmentTitle}" (${courseId}) to Cloudflare D1...`);
  
  try {
    const resp = await fetch(`${BACKEND_URL}/api/contribute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId,
        assignmentTitle,
        questions
      })
    });

    if (resp.ok) {
      const data = await resp.json();
      console.log(`✓ Success! Contributed ${data.contributedCount || questions.length} questions into Cloudflare D1.`);
    } else {
      console.error(`Upload failed with status: ${resp.status}`, await resp.text());
    }
  } catch (err) {
    console.error('Network error during upload:', err.message);
  }
}

/**
 * Ingest from a JSON file
 */
export async function ingestJsonFile(filePath, courseId = 'general') {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);
  const questions = Array.isArray(data) ? data : (data.questions || []);

  const cleanQuestions = questions.map(q => ({
    questionText: q.questionText || q.question,
    options: q.options || [],
    verifiedIndex: q.verifiedIndex !== undefined ? q.verifiedIndex : q.correct_option_index
  }));

  await bulkUploadToD1(courseId, data.title || path.basename(filePath), cleanQuestions);
}

// CLI usage
if (process.argv[1].endsWith('bulk_ingest.mjs') || process.argv[1].endsWith('bulk_ingest.js')) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(`
NPTEL Bulk Assignment Ingester
Usage:
  node tools/bulk_ingest.mjs <path-to-json> [course-id]

Example:
  node tools/bulk_ingest.mjs ./assignments/week1.json noc26_bt56
`);
  } else {
    ingestJsonFile(args[0], args[1] || 'general');
  }
}
