// Parse + persist the AI-generated problem set that the user pastes back into
// the app. The agreed interchange format is a single JSON object (see the
// schema emitted in enrich.ts). The parser is deliberately forgiving: it copes
// with markdown fences, surrounding prose, trailing commas and smart quotes.

export type QKind = "mcq" | "short" | "code";

export interface PSQuestion {
  type: QKind;
  question: string;
  lesson?: string; // the chunk of written lesson shown right before this question (interleaved sections)
  options?: string[];
  answer: string;
  points?: string[]; // for "short": key points a good answer should include
  starter?: string; // for "code": starter code to prefill the editor
  setup?: string; // for "code": helper definitions (classes/data) run before the student's code + tests
  expectedOutput?: string; // for "code": expected stdout (single-output mode)
  functionName?: string; // for "code": the function the student implements
  tests?: { call: string; expected: string }[]; // for "code": LeetCode-style cases
  explanation?: string;
}

export interface PSSection {
  title: string;
  start: number; // seconds into the video where this section begins (legacy; unused now that sections are read, not watched)
  body: string; // the written lesson for this section — clear, concise prose from the transcript
  ps: ProblemSet; // the small quiz for this section
}

export interface ProblemSet {
  title?: string;
  intro?: string; // short plain-language overview shown above the questions
  questions: PSQuestion[];
  sections?: PSSection[]; // when set, this lecture's practice is split into sections
}

export type ParseResult =
  | { ok: true; data: ProblemSet }
  | { ok: false; error: string };

function extractJson(input: string): string | null {
  const text = input.trim();
  // Primary: the outermost { ... }. The reply is a single JSON object (the
  // requested format), and this also works when the AI wraps it in a ```json
  // fence, because the fence markers sit outside the braces. We must NOT match a
  // ``` fence first: written-lesson "body" fields and "code" answers legitimately
  // contain ``` fenced code blocks, and a fence-first match would grab that code
  // instead of the JSON and fail to parse.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  // Fallback: a fenced block (e.g. the AI returned a bare array inside a fence).
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  return null;
}

function repair(json: string): string {
  return json
    .replace(/[“”]/g, '"') // smart double quotes
    .replace(/[‘’]/g, "'") // smart single quotes
    .replace(/,\s*([}\]])/g, "$1") // trailing commas
    // Un-escaped LaTeX backslashes: models emit "$O(n \log n)$" where \l is not a
    // valid JSON escape, so JSON.parse throws. Double any backslash that doesn't
    // start a valid escape (\" \\ \/ \b \f \n \r \t \uXXXX). Already-valid pairs
    // like \\ and \n (real newlines in code answers) are consumed whole and left
    // alone. Note: \times/\frac happen to collide with the valid \t/\f escapes, so
    // those still rely on the prompt asking for double backslashes.
    .replace(/\\([\s\S])/g, (m, next) => (/["\\/bfnrtu]/.test(next) ? m : "\\\\" + next));
}

function normalizeType(t: unknown, hasOptions: boolean): QKind {
  const s = String(t || "").toLowerCase();
  if (/mcq|multiple|choice/.test(s)) return "mcq";
  if (/code|coding|program/.test(s)) return "code";
  if (/short|open|answer/.test(s)) return "short";
  return hasOptions ? "mcq" : "short";
}

function normalizeQuestions(raw: any): PSQuestion[] {
  const list = Array.isArray(raw?.questions)
    ? raw.questions
    : Array.isArray(raw)
    ? raw
    : [];
  const out: PSQuestion[] = [];
  for (const q of list) {
    if (!q || typeof q !== "object") continue;
    const question = String(q.question ?? q.prompt ?? q.q ?? "").trim();
    if (!question) continue;
    const lessonRaw = q.lesson ?? q.info ?? q.content ?? q.before;
    const lesson = typeof lessonRaw === "string" && lessonRaw.trim() ? lessonRaw.trim() : undefined;
    const rawOpts = q.options ?? q.choices;
    const options = Array.isArray(rawOpts)
      ? rawOpts.map((o: any) => (typeof o === "string" ? o : String(o?.text ?? o?.label ?? o?.value ?? o))).filter(Boolean)
      : undefined;
    let answer = String(q.answer ?? q.correct ?? q.correctAnswer ?? q.solution ?? "").trim();
    const explanation = q.explanation ?? q.rationale ?? q.reason;
    const type = normalizeType(q.type, !!(options && options.length));

    // Key points for short-answer questions (a marking checklist).
    const rawPoints = q.points ?? q.keyPoints ?? q.key_points ?? q.rubric;
    let points: string[] | undefined = Array.isArray(rawPoints)
      ? rawPoints.map((p: any) => (typeof p === "string" ? p : String(p?.text ?? p?.point ?? p))).map((s) => s.trim()).filter(Boolean)
      : undefined;
    if (type === "short" && (!points || !points.length) && answer) {
      // Fall back to splitting a prose/bulleted answer into points.
      const parts = answer
        .split(/\r?\n+|•|(?:^|\s)[-*]\s+/)
        .map((s) => s.replace(/^\s*\d+[.)]\s*/, "").trim())
        .filter(Boolean);
      points = parts.length ? parts : [answer];
    }

    let finalOptions = options && options.length ? options : undefined;
    // LLMs are biased toward making the first option correct, so shuffle the
    // options (once, at parse time) and re-point the answer to the correct text.
    if (type === "mcq" && finalOptions) {
      const ci = correctOptionIndex({ type, question, options: finalOptions, answer });
      const correctText = ci >= 0 ? finalOptions[ci] : null;
      finalOptions = shuffle(finalOptions.slice());
      if (correctText !== null) answer = correctText; // matched by exact text after shuffle
    }

    const starter = type === "code" ? String(q.starter ?? q.starterCode ?? q.template ?? "").replace(/\r\n/g, "\n") : undefined;
    const setupRaw = type === "code" ? (q.setup ?? q.preamble ?? q.context ?? q.helpers ?? q.prelude) : undefined;
    const setup = typeof setupRaw === "string" && setupRaw.trim() ? setupRaw.replace(/\r\n/g, "\n") : undefined;
    const expectedOutput =
      type === "code" ? String(q.expectedOutput ?? q.expected_output ?? q.expected ?? q.output ?? "").replace(/\r\n/g, "\n") : undefined;
    const functionName = type === "code" && typeof q.functionName === "string" ? q.functionName : type === "code" && typeof q.function === "string" ? q.function : undefined;

    let tests: { call: string; expected: string }[] | undefined;
    if (type === "code" && Array.isArray(q.tests)) {
      tests = q.tests
        .map((t: any) => {
          if (!t || typeof t !== "object") return null;
          let call = t.call ?? t.expression ?? t.input;
          // If given args + a function name, build the call string.
          if (call != null && functionName && !/\(/.test(String(call))) call = `${functionName}(${call})`;
          const expected = t.expected ?? t.output ?? t.result;
          if (call == null || expected == null) return null;
          return { call: String(call).trim(), expected: String(expected).trim() };
        })
        .filter(Boolean) as { call: string; expected: string }[];
      if (!tests.length) tests = undefined;
    }

    out.push({
      type,
      question,
      lesson,
      options: finalOptions,
      answer,
      points: type === "short" ? points : undefined,
      starter: starter || undefined,
      setup,
      expectedOutput: expectedOutput || undefined,
      functionName,
      tests,
      explanation: explanation ? String(explanation).trim() : undefined,
    });
  }
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Build a ProblemSet from an already-parsed raw object ({questions:[...]} or a
// bare array). Returns null if it has no usable questions.
export function toProblemSet(raw: any): ProblemSet | null {
  const questions = normalizeQuestions(raw);
  if (!questions.length) return null;
  const title = typeof raw?.title === "string" ? raw.title : undefined;
  const introRaw = raw?.intro ?? raw?.overview ?? raw?.description ?? raw?.summary;
  const intro = typeof introRaw === "string" && introRaw.trim() ? introRaw.trim() : undefined;
  return { title, intro, questions };
}

export interface CombinedReply {
  ok: boolean;
  error?: string;
  lecture?: ProblemSet;
  problemSets?: { slug?: string; number?: number; title?: string; ps: ProblemSet }[];
}

// Parse one AI reply that contains BOTH the lecture questions and the problem
// set questions: { lecture: {...}, problemSets: [{slug, title, questions}] }.
export function parseCombined(input: string): CombinedReply {
  if (!input || !input.trim()) return { ok: false, error: "Paste the AI's response first." };
  const jsonText = extractJson(input);
  if (!jsonText) return { ok: false, error: "Couldn't find a JSON object in the pasted text." };
  let raw: any;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    try {
      raw = JSON.parse(repair(jsonText));
    } catch {
      return { ok: false, error: "That isn't valid JSON — make sure you copied the AI's whole reply, unedited." };
    }
  }

  // Lecture: an explicit "lecture" key, or a bare single set (just "questions").
  const lectureRaw = raw?.lecture ?? raw?.lectureProblemSet ?? (raw?.questions && !raw?.problemSets ? raw : null);
  const lecture = lectureRaw ? toProblemSet(lectureRaw) || undefined : undefined;

  const psArr = raw?.problemSets ?? raw?.problem_sets ?? raw?.assignments;
  const problemSets: NonNullable<CombinedReply["problemSets"]> = [];
  if (Array.isArray(psArr)) {
    for (const item of psArr) {
      const ps = toProblemSet(item);
      if (!ps) continue;
      problemSets.push({
        slug: typeof item?.slug === "string" ? item.slug : undefined,
        number: typeof item?.number === "number" ? item.number : undefined,
        title: typeof item?.title === "string" ? item.title : undefined,
        ps,
      });
    }
  }

  if (!lecture && !problemSets.length)
    return { ok: false, error: "No questions found. The reply didn't match the expected format." };
  return { ok: true, lecture, problemSets };
}

// Parse a reply that splits the lecture into timed sections, each with a small
// quiz: { lecture: { sections: [{title, start, questions}] } }.
export function parseSectioned(input: string): { ok: boolean; error?: string; sections?: PSSection[] } {
  if (!input || !input.trim()) return { ok: false, error: "Paste the AI's response first." };
  const jsonText = extractJson(input);
  if (!jsonText) return { ok: false, error: "Couldn't find a JSON object in the pasted text." };
  let raw: any;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    try {
      raw = JSON.parse(repair(jsonText));
    } catch {
      return { ok: false, error: "That isn't valid JSON — make sure you copied the AI's whole reply, unedited." };
    }
  }

  const arr = raw?.lecture?.sections ?? raw?.sections;
  if (!Array.isArray(arr) || !arr.length)
    return { ok: false, error: "No sections found. The reply didn't match the expected format." };

  const parseStart = (v: unknown): number => {
    if (typeof v === "number" && isFinite(v)) return Math.max(0, Math.floor(v));
    if (typeof v === "string") {
      const clk = v.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/); // h:mm:ss or mm:ss
      if (clk) return (+(clk[1] || 0)) * 3600 + +clk[2] * 60 + +clk[3];
      const n = parseInt(v, 10);
      if (!isNaN(n)) return Math.max(0, n);
    }
    return 0;
  };

  const sections: PSSection[] = [];
  for (const s of arr) {
    const ps = toProblemSet(s);
    if (!ps) continue;
    const bodyRaw = s?.body ?? s?.lesson ?? s?.content ?? s?.notes ?? s?.text;
    sections.push({
      title: typeof s?.title === "string" && s.title.trim() ? s.title.trim() : `Section ${sections.length + 1}`,
      start: parseStart(s?.start),
      body: typeof bodyRaw === "string" ? bodyRaw.trim() : "",
      ps,
    });
  }
  if (!sections.length) return { ok: false, error: "No sections with questions were found." };
  return { ok: true, sections };
}

export function parseProblemSet(input: string): ParseResult {
  if (!input || !input.trim()) return { ok: false, error: "Paste the AI's response first." };
  const jsonText = extractJson(input);
  if (!jsonText) return { ok: false, error: "Couldn't find a JSON object in the pasted text." };
  let raw: any;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    try {
      raw = JSON.parse(repair(jsonText));
    } catch {
      return { ok: false, error: "That isn't valid JSON — make sure you copied the AI's whole reply, unedited." };
    }
  }
  const data = toProblemSet(raw);
  if (!data) return { ok: false, error: "No questions found. The reply didn't match the expected format." };
  return { ok: true, data };
}

// Which option is correct, for rendering MCQs. Matches by exact text, then by
// letter (A/B/C…), then by 1-based or 0-based index.
export function correctOptionIndex(q: PSQuestion): number {
  if (!q.options || !q.options.length) return -1;
  const a = q.answer.trim();
  const exact = q.options.findIndex((o) => o.trim().toLowerCase() === a.toLowerCase());
  if (exact !== -1) return exact;
  const letter = a.match(/^[(\s]*([A-Za-z])[)\s.:-]*$/);
  if (letter) {
    const idx = letter[1].toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < q.options.length) return idx;
  }
  const num = a.match(/^\d+$/);
  if (num) {
    const n = parseInt(a, 10);
    if (n >= 1 && n <= q.options.length) return n - 1; // 1-based
    if (n >= 0 && n < q.options.length) return n; // 0-based
  }
  // Answer may start with the option text (e.g. "B) foo").
  const starts = q.options.findIndex((o) => a.toLowerCase().includes(o.trim().toLowerCase()) && o.trim().length > 2);
  return starts;
}

// ---------- persistence (per course + lesson) ----------
const KEY = "opencourse.problemsets.v1";

function readStore(): Record<string, Record<string, ProblemSet>> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {};
}

function writeStore(s: Record<string, Record<string, ProblemSet>>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function getSavedProblemSet(courseId: string, n: number): ProblemSet | null {
  return readStore()[courseId]?.[String(n)] || null;
}

export function saveProblemSet(courseId: string, n: number, ps: ProblemSet) {
  const s = readStore();
  if (!s[courseId]) s[courseId] = {};
  s[courseId][String(n)] = ps;
  writeStore(s);
}

export function clearProblemSet(courseId: string, n: number) {
  const s = readStore();
  if (s[courseId]) {
    delete s[courseId][String(n)];
    writeStore(s);
  }
}

// ---------- persistence for interactive versions of the real OCW problem sets
// (keyed by course + PS slug, since a PS can be attached to several lessons) ---
const ASSIGN_KEY = "opencourse.assignmentsets.v1";

function readAssignStore(): Record<string, Record<string, ProblemSet>> {
  try {
    const raw = localStorage.getItem(ASSIGN_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {};
}

function writeAssignStore(s: Record<string, Record<string, ProblemSet>>) {
  try {
    localStorage.setItem(ASSIGN_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function getSavedAssignmentSet(courseId: string, slug: string): ProblemSet | null {
  return readAssignStore()[courseId]?.[slug] || null;
}

export function saveAssignmentSet(courseId: string, slug: string, ps: ProblemSet) {
  const s = readAssignStore();
  if (!s[courseId]) s[courseId] = {};
  s[courseId][slug] = ps;
  writeAssignStore(s);
}

export function clearAssignmentSet(courseId: string, slug: string) {
  const s = readAssignStore();
  if (s[courseId]) {
    delete s[courseId][slug];
    writeAssignStore(s);
  }
}
