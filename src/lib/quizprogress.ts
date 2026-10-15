// Persist a student's progress through a quiz: which options they picked, which
// answers they revealed, their typed short-answer text and code, and the
// question they were on. Keyed by a caller-supplied string (course + lesson).

export interface QuizProgress {
  picks?: Record<number, number>; // MCQ index -> chosen option
  revealed?: Record<number, boolean>; // short/code -> answer revealed
  texts?: Record<number, string>; // short-answer typed text
  codes?: Record<number, string>; // code-editor contents
  cur?: number; // current question index
}

const KEY = "opencourse.quizprogress.v1";

function readStore(): Record<string, QuizProgress> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {};
}

function writeStore(s: Record<string, QuizProgress>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function getQuizProgress(key: string): QuizProgress | null {
  return readStore()[key] || null;
}

export function saveQuizProgress(key: string, p: QuizProgress) {
  const s = readStore();
  s[key] = p;
  writeStore(s);
}

export function clearQuizProgress(key: string) {
  const s = readStore();
  if (s[key]) {
    delete s[key];
    writeStore(s);
  }
}
