-- D1 Database Schema for NPTEL Answer Vault
-- Compatible with Cloudflare D1 (SQLite)

CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,               -- e.g. 'noc26_bt56'
    name TEXT NOT NULL,                -- e.g. 'Ecology and Environment'
    instructor TEXT,
    semester TEXT                      -- e.g. 'Jul-Oct 2026'
);

CREATE TABLE IF NOT EXISTS assignments (
    id TEXT PRIMARY KEY,               -- e.g. 'noc26_bt56_unit18_ass19'
    course_id TEXT REFERENCES courses(id),
    unit_id INTEGER,
    assessment_id INTEGER,
    week_number INTEGER,
    title TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_hash TEXT UNIQUE NOT NULL, -- Fast 32-bit normalized hash
    course_id TEXT,
    assignment_id TEXT,
    question_text TEXT NOT NULL,
    options JSON NOT NULL,              -- Array of option strings: ["A", "B", "C", "D"]
    correct_option_index INTEGER,       -- 0-based index
    correct_option_text TEXT,
    is_verified INTEGER DEFAULT 0,      -- 1 if verified from official NPTEL answer key, 0 if AI
    confidence INTEGER DEFAULT 95,
    numerical_answer REAL,              -- Value for numerical / fill-in-the-blank questions
    reasoning TEXT,
    key_formula TEXT,
    source TEXT DEFAULT 'AI_GEMINI',    -- 'OFFICIAL_KEY' | 'AI_GEMINI' | 'AI_GROQ'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_question_hash ON questions(question_hash);
CREATE INDEX IF NOT EXISTS idx_course_assignment ON questions(course_id, assignment_id);

-- Seed verified initial questions into D1 with matching hashes
INSERT OR IGNORE INTO questions (question_hash, question_text, options, correct_option_index, correct_option_text, is_verified, confidence, reasoning, source)
VALUES 
(
  '264c97b0',
  'Which approach in ecology uses models and predictions to simplify reality and identify patterns?',
  '["Theoretical ecology", "Field ecology", "Laboratory ecology", "Descriptive conservation"]',
  0,
  'Theoretical ecology',
  1,
  100,
  'Theoretical ecology is the discipline devoted to studying ecological systems using mathematical, conceptual, and computational models to simplify reality.',
  'OFFICIAL_KEY'
),
(
  '8fadfd39',
  'What is an ecological niche?',
  '["The physical place where an organism lives", "The functional role and position of a species in its environment", "The total number of individuals in a population", "The geographical distribution of a community"]',
  1,
  'The functional role and position of a species in its environment',
  1,
  100,
  'An ecological niche encompasses not just where an organism lives (habitat), but all its interactions, resource utilization, and functional role within the community.',
  'OFFICIAL_KEY'
),
(
  'cc20fede',
  'The 10% law of energy transfer from one trophic level to the next was introduced by:',
  '["Raymond Lindeman", "Arthur Tansley", "Eugene Odum", "Charles Elton"]',
  0,
  'Raymond Lindeman',
  1,
  100,
  'Raymond Lindeman (1942) formulated the 10% rule in his foundational paper on trophic-dynamic aspect of ecology.',
  'OFFICIAL_KEY'
),
(
  '24399a7e',
  'Which of the following is an example of a primary consumer?',
  '["Phytoplankton", "Zooplankton (Herbivore)", "Lion", "Fungi (Decomposer)"]',
  1,
  'Zooplankton (Herbivore)',
  1,
  100,
  'Herbivores that feed directly on primary producers (like phytoplankton) are classified as primary consumers.',
  'OFFICIAL_KEY'
),
(
  '381fc800',
  'What is the size of a pointer to an integer on a 64-bit architecture?',
  '["2 bytes", "4 bytes", "8 bytes", "Depends on integer value"]',
  2,
  '8 bytes',
  1,
  100,
  'On a 64-bit operating system architecture, memory addresses are 64 bits wide, meaning pointers occupy 8 bytes regardless of the underlying data type.',
  'OFFICIAL_KEY'
),
(
  '79aa593e',
  'Which of the following functions is used to allocate memory dynamically in C without initializing it to zero?',
  '["calloc()", "malloc()", "realloc()", "free()"]',
  1,
  'malloc()',
  1,
  100,
  'malloc() allocates uninitialized memory containing indeterminate (garbage) values, whereas calloc() zeroes out memory during allocation.',
  'OFFICIAL_KEY'
);
