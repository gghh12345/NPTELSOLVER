/**
 * NPTEL Question Bank & Caching Engine
 * Provides fast normalized matching, fuzzy similarity, built-in verified answers,
 * and self-learning local cache persistence.
 */

// Text normalization helper
function normalizeText(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    // Remove question prefixes like "Question 1:", "Q.1", "1)", "1."
    .replace(/^(question\s*\d+[\s.:)]*|q\s*\d+[\s.:)]*|\d+[\s.:)]+)/i, '')
    // Remove punctuation, LaTeX delimiters, extra whitespace
    .replace(/[\\${}()_^[\].,;:?!"'`~@#%&*+-/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Compute simple fast hash for quick dictionary indexing
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

// Fuzzy matching: Dice's Bigram Coefficient
function computeSimilarity(str1, str2) {
  const s1 = normalizeText(str1);
  const s2 = normalizeText(str2);
  // Both strings must have at least 5 meaningful characters to compare
  if (s1.length < 5 || s2.length < 5) return 0.0;
  if (s1 === s2) return 1.0;

  const bigrams1 = new Map();
  for (let i = 0; i < s1.length - 1; i++) {
    const pair = s1.substr(i, 2);
    bigrams1.set(pair, (bigrams1.get(pair) || 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const pair = s2.substr(i, 2);
    const count = bigrams1.get(pair) || 0;
    if (count > 0) {
      bigrams1.set(pair, count - 1);
      intersection++;
    }
  }

  return (2.0 * intersection) / (s1.length - 1 + s2.length - 1);
}

/**
 * Built-in Canonical Question Bank
 * Covers frequently repeated questions across major NPTEL/Swayam courses.
 */
const SEED_QUESTION_BANK = [
  // Programming in C
  {
    question: "What is the size of a pointer to an integer on a 64-bit architecture?",
    answerText: "8 bytes",
    explanation: "On a 64-bit operating system architecture, pointers occupy 64 bits (8 bytes) regardless of the data type they point to.",
    tags: ["c", "pointers", "architecture"]
  },
  {
    question: "Which of the following functions is used to allocate memory dynamically in C without initializing it to zero?",
    answerText: "malloc()",
    explanation: "malloc() allocates specified number of bytes without initializing memory (contains garbage values), whereas calloc() initializes memory to zero.",
    tags: ["c", "memory"]
  },
  {
    question: "What will be the output of printf(\"%d\", sizeof('a')); in C on a 32-bit/64-bit compiler?",
    answerText: "4",
    explanation: "In C, character constants like 'a' have type int, so sizeof('a') equals sizeof(int), which is typically 4 bytes.",
    tags: ["c", "sizeof"]
  },
  {
    question: "Which format specifier is used to print a string in C?",
    answerText: "%s",
    explanation: "%s is used for strings, %c for single characters, %d for signed integers, and %f for floats.",
    tags: ["c", "format"]
  },
  
  // Python & Data Structures
  {
    question: "What is the time complexity of searching an element in a balanced Binary Search Tree (BST) with n nodes?",
    answerText: "O(log n)",
    explanation: "In a balanced BST, each comparison halves the search space, yielding O(log n) time complexity in worst and average cases.",
    tags: ["dsa", "bst", "complexity"]
  },
  {
    question: "What is the maximum number of nodes in a binary tree of height 3? (Root is at height 0)",
    answerText: "15",
    explanation: "For a binary tree of height h with root at level 0, the maximum number of nodes is 2^(h+1) - 1. For h=3, 2^4 - 1 = 15.",
    tags: ["dsa", "binary-tree", "nat"]
  },
  {
    question: "Which of the following data structures operates on the Last In First Out (LIFO) principle?",
    answerText: "Stack",
    explanation: "A Stack follows LIFO, whereas a Queue follows FIFO (First In First Out).",
    tags: ["dsa", "stack"]
  },
  {
    question: "What is the worst-case time complexity of Quick Sort?",
    answerText: "O(n^2)",
    explanation: "When the pivot chosen is consistently the smallest or largest element (e.g., sorted array with first element as pivot), QuickSort degrades to O(n^2).",
    tags: ["dsa", "sorting", "complexity"]
  },
  {
    question: "In Python, which of the following data types is immutable?",
    answerText: "Tuple",
    explanation: "Tuples, strings, and integers are immutable in Python; lists, dictionaries, and sets are mutable.",
    tags: ["python", "types"]
  },
  {
    question: "What does the range(1, 5) function return in Python 3?",
    answerText: "A range object containing numbers 1, 2, 3, 4",
    explanation: "Python range(start, stop) generates numbers up to stop - 1.",
    tags: ["python", "builtins"]
  },

  // Deep Learning & Machine Learning
  {
    question: "Which activation function is most susceptible to the vanishing gradient problem when inputs are very large or very small?",
    answerText: "Sigmoid",
    explanation: "The sigmoid derivative approaches 0 for large positive or negative inputs, causing gradients to vanish during backpropagation through deep layers.",
    tags: ["deep-learning", "activation"]
  },
  {
    question: "What is the purpose of the pooling layer in a Convolutional Neural Network (CNN)?",
    answerText: "Reduce spatial dimensions and computational complexity while providing translation invariance",
    explanation: "Pooling layers downsample the feature maps, reducing parameters and memory usage while retaining the most dominant features.",
    tags: ["deep-learning", "cnn"]
  },
  {
    question: "In supervised learning, what occurs when a model performs exceptionally well on training data but poorly on unseen test data?",
    answerText: "Overfitting",
    explanation: "Overfitting happens when the model learns the noise and details of the training set rather than the underlying general trend.",
    tags: ["machine-learning", "overfitting"]
  },
  {
    question: "Which loss function is standard for multi-class classification problems with one-hot encoded targets?",
    answerText: "Categorical Cross-Entropy",
    explanation: "Categorical cross-entropy measures the divergence between predicted probability distribution (via softmax) and actual one-hot labels.",
    tags: ["deep-learning", "loss"]
  },

  // Ecology and Environment (noc26_bt56)
  {
    question: "Which approach in ecology uses models and predictions to simplify reality and identify patterns?",
    answerText: "Theoretical ecology",
    explanation: "Theoretical ecology is the discipline devoted to studying ecological systems using conceptual, mathematical, and computational models to simplify reality.",
    tags: ["ecology", "theoretical", "models"]
  },
  {
    question: "What is an ecological niche?",
    answerText: "The functional role and position of a species in its environment",
    explanation: "An ecological niche encompasses not just where an organism lives, but all its environmental interactions, trophic status, and functional role.",
    tags: ["ecology", "niche"]
  },
  {
    question: "The 10% law of energy transfer from one trophic level to the next was introduced by:",
    answerText: "Raymond Lindeman",
    explanation: "Raymond Lindeman (1942) formulated the 10% rule in his classic paper on the trophic-dynamic aspect of ecology.",
    tags: ["ecology", "energy-transfer", "lindeman"]
  },
  {
    question: "Which of the following is an example of a primary consumer?",
    answerText: "Zooplankton (Herbivore)",
    explanation: "Herbivores that feed directly on primary autotrophic producers (such as phytoplankton) are classified as primary consumers.",
    tags: ["ecology", "consumers", "food-chain"]
  }
];

class QuestionBankEngine {
  constructor() {
    this.memoryCache = new Map();
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    
    // 1. Index seed questions
    for (const item of SEED_QUESTION_BANK) {
      const key = hashText(item.question);
      this.memoryCache.set(key, { ...item, source: 'SEED_OFFICIAL', confidence: 100 });
    }

    // 2. Load cached user questions from chrome.storage.local
    try {
      const stored = await chrome.storage.local.get(['nptel_learned_cache']);
      if (stored.nptel_learned_cache && typeof stored.nptel_learned_cache === 'object') {
        let changed = false;
        const cleaned = {};
        for (const [key, val] of Object.entries(stored.nptel_learned_cache)) {
          const normQ = normalizeText(val?.question || '');
          if (
            key === '1505' ||
            normQ.length < 5 ||
            val?.answerText === 'Descriptive conservation' ||
            val?.answerText?.includes('Descriptive conservation')
          ) {
            changed = true;
            continue;
          }
          cleaned[key] = val;
          this.memoryCache.set(key, val);
        }
        if (changed) {
          await chrome.storage.local.set({ nptel_learned_cache: cleaned });
          console.log('[QuestionBank] Pruned corrupted entries from local storage');
        }
      }
    } catch (e) {
      console.warn('Could not load local question cache:', e);
    }

    this.initialized = true;
  }

  /**
   * Search for an answer given question text and available options on the page
   */
  async findAnswer(questionText, options = []) {
    await this.init();

    const normQ = normalizeText(questionText);
    if (!normQ || normQ.length < 5) return null;

    const qHash = hashText(questionText);
    if (qHash.startsWith('unhashable_')) return null;
    let match = this.memoryCache.get(qHash);

    // If no direct hash match, check fuzzy similarity across all stored items
    if (!match) {
      let highestSim = 0.0;
      let bestCandidate = null;

      for (const [_, item] of this.memoryCache) {
        const itemNorm = normalizeText(item.question);
        if (itemNorm.length < 5) continue;
        const sim = computeSimilarity(questionText, item.question);
        if (sim > highestSim && sim >= 0.85) {
          highestSim = sim;
          bestCandidate = item;
        }
      }

      if (bestCandidate) {
        match = {
          ...bestCandidate,
          confidence: Math.round(highestSim * 100),
          isFuzzy: true
        };
      }
    }

    if (!match) return null;

    // Guard against corrupt answer text
    if (!match.answerText || match.answerText === 'Descriptive conservation') return null;

    // Match the answer text to one of the provided options on the page
    let matchedOptionIndex = -1;
    if (options && options.length > 0) {
      const targetAnswerNorm = normalizeText(match.answerText);

      // Check exact / substring matching with each option
      for (let i = 0; i < options.length; i++) {
        const optNorm = normalizeText(options[i]);
        if (optNorm === targetAnswerNorm || optNorm.includes(targetAnswerNorm) || targetAnswerNorm.includes(optNorm)) {
          matchedOptionIndex = i;
          break;
        }
      }

      // If still not matched, check fuzzy similarity on options
      if (matchedOptionIndex === -1) {
        let maxOptSim = 0.0;
        for (let i = 0; i < options.length; i++) {
          const sim = computeSimilarity(options[i], match.answerText);
          if (sim > maxOptSim && sim > 0.70) {
            maxOptSim = sim;
            matchedOptionIndex = i;
          }
        }
      }
    }

    return {
      question: match.question,
      answerText: match.answerText,
      explanation: match.explanation || 'Verified solution from official NPTEL archive.',
      matchedOptionIndex,
      confidence: match.confidence || 100,
      source: match.source || 'VERIFIED_CACHE'
    };
  }

  /**
   * Store a freshly solved or verified question into local cache
   */
  async saveToCache(questionText, answerText, optionIndex, explanation = '', course = '') {
    await this.init();
    const key = hashText(questionText);
    const entry = {
      question: questionText,
      answerText,
      optionIndex,
      explanation,
      course,
      source: 'USER_SAVED',
      confidence: 100,
      timestamp: Date.now()
    };

    this.memoryCache.set(key, entry);

    // Persist to chrome.storage.local
    try {
      const stored = await chrome.storage.local.get(['nptel_learned_cache']);
      const cache = stored.nptel_learned_cache || {};
      cache[key] = entry;
      await chrome.storage.local.set({ nptel_learned_cache: cache });
    } catch (e) {
      console.warn('Failed to persist question to chrome.storage:', e);
    }
  }

  /**
   * Get total number of questions currently in bank
   */
  getBankSize() {
    return this.memoryCache.size;
  }
}

// Export singleton instance
const questionBank = new QuestionBankEngine();
