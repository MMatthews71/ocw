import type { CourseManifest, Lesson } from "../types";

const filesUrl = (id: string, name: string) => `content/${id}/files/${name}`;
const MAX_TRANSCRIPT_CHARS = 48000;

// Convert a WebVTT/SRT caption file into clean prose: drop the header, cue
// numbers and timestamp lines, join wrapped lines, and collapse repeats that
// "rolling" caption files sometimes produce.
export function captionsToText(vtt: string): string {
  const lines = vtt.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let prev = "";
  for (let raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^WEBVTT/i.test(line)) continue;
    if (/^NOTE\b/i.test(line)) continue;
    if (line.includes("-->")) continue;
    if (/^\d+$/.test(line)) continue; // cue identifier
    const clean = line.replace(/<[^>]+>/g, "").trim(); // strip <c>, <i>, etc.
    if (!clean || clean === prev) continue;
    out.push(clean);
    prev = clean;
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

// Load a lesson's transcript text. Prefers the bundled caption file (offline);
// falls back to extracting text from the transcript PDF with pdf.js.
export async function loadLessonTranscript(
  course: CourseManifest,
  lesson: Lesson
): Promise<string | null> {
  if (!lesson.video) return null;
  const res = course.resources[lesson.video];
  if (!res) return null;

  const captionFile = res.captions?.[0]?.file;
  if (captionFile) {
    try {
      const r = await fetch(filesUrl(course.id, captionFile));
      if (r.ok) {
        const text = captionsToText(await r.text());
        if (text.length > 40) return text;
      }
    } catch {
      /* fall through to PDF */
    }
  }

  if (res.transcript) {
    try {
      const pdfjs = await import("pdfjs-dist");
      const doc = await pdfjs.getDocument(filesUrl(course.id, res.transcript)).promise;
      let text = "";
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((it: any) => it.str).join(" ") + "\n";
      }
      const clean = text.replace(/\s+/g, " ").trim();
      if (clean.length > 40) return clean;
    } catch {
      /* ignore */
    }
  }

  return null;
}

// Like captionsToText, but keeps periodic time markers "[t=SECONDS]" (roughly
// every 25s) so an AI can assign section start times.
export function captionsToTimestamped(vtt: string): string {
  const lines = vtt.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let pendingStart: number | null = null;
  let lastMark = -999;
  let prev = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^WEBVTT/i.test(line) || /^NOTE\b/i.test(line) || /^\d+$/.test(line)) continue;
    const tm = line.match(/^(\d{2}):(\d{2}):(\d{2})[.,]\d+\s*-->/);
    if (tm) {
      pendingStart = +tm[1] * 3600 + +tm[2] * 60 + +tm[3];
      continue;
    }
    const clean = line.replace(/<[^>]+>/g, "").trim();
    if (!clean || clean === prev) continue;
    prev = clean;
    if (pendingStart !== null && pendingStart - lastMark >= 25) {
      out.push(`\n[t=${pendingStart}] ${clean}`);
      lastMark = pendingStart;
    } else {
      out.push(clean);
    }
    pendingStart = null;
  }
  return out.join(" ").replace(/\s+\n/g, "\n").replace(/\n\s+/g, "\n").trim();
}

// Load a lesson's transcript WITH time markers (captions only; null if none).
export async function loadTimestampedTranscript(
  course: CourseManifest,
  lesson: Lesson
): Promise<string | null> {
  if (!lesson.video) return null;
  const captionFile = course.resources[lesson.video]?.captions?.[0]?.file;
  if (!captionFile) return null;
  try {
    const r = await fetch(filesUrl(course.id, captionFile));
    if (r.ok) {
      const text = captionsToTimestamped(await r.text());
      if (text.length > 80) return text;
    }
  } catch {
    /* ignore */
  }
  return null;
}

// Build a prompt that turns the lecture into a READABLE written lesson, split
// into topic SECTIONS. Each section carries a clear, concise write-up of that
// part of the lecture (using the lecturer's and slides' own wording wherever it
// can), the slide page range it covers, and a small quiz — the student reads
// the section, then does its quiz, in place of watching the video.
// Reply: { lecture: { sections: [{title, body, slides:{start,end}, questions}] } }.
export function buildSectionsPrompt(
  course: CourseManifest,
  lesson: Lesson,
  tsTranscript: string,
  slidesText?: string | null,
  slidePageCount?: number
): string {
  const courseName = [course.number, course.title].filter(Boolean).join(" ");
  let t = tsTranscript;
  if (t.length > MAX_TRANSCRIPT_CHARS) t = t.slice(0, MAX_TRANSCRIPT_CHARS) + "\n[Transcript truncated for length.]";

  const hasSlides = !!(slidesText && slidesText.trim());
  const slidesBody = hasSlides
    ? `\n\n--- LECTURE ${lesson.n} SLIDES (extracted text, one page marked [slide N]) ---\n` +
      (slidesText!.length > MAX_TRANSCRIPT_CHARS ? slidesText!.slice(0, MAX_TRANSCRIPT_CHARS) + "\n[Slides truncated for length.]" : slidesText!) +
      `\n--- END SLIDES ---`
    : "";

  // Line describing the per-section slide range (only when slides are present).
  const slideFieldDoc = hasSlides
    ? `- "slides": the slide page range this section covers, as { "start": N, "end": M } using the ` +
      `[slide N] page numbers from the slides below (1-based, inclusive). The deck has ${slidePageCount ?? "several"} ` +
      `slides. Assign each slide to exactly one section; ranges must be in order and together cover all ` +
      `slides from 1 to ${slidePageCount ?? "the last"} with no gaps or overlaps. A section with no matching ` +
      `slides may repeat the previous section's last page.\n`
    : "";
  const slideSchemaInExample = hasSlides ? `"slides": { "start": 1, "end": 3 }, ` : "";

  return (
    `You are an expert tutor for ${courseName}.\n\n` +
    `Below is the timestamped transcript of "Lecture ${lesson.n}: ${lesson.title}"` +
    `${hasSlides ? ", followed by the text of its lecture slides (each page marked [slide N])" : ""}. ` +
    `Time markers appear inline in the transcript as [t=SECONDS].\n\n` +
    `Rewrite this lecture as a clear, concise WRITTEN LESSON a student can read instead of watching ` +
    `the video. Split it into 5–8 coherent SECTIONS by topic, in the order the lecture covers them.\n\n` +
    `IMPORTANT — interleave the lesson with the quiz. Within a section, do NOT put the whole lesson ` +
    `first and the questions after. Instead break the section's teaching into chunks and attach each ` +
    `chunk to the question it sets up, so the student reads a bit, answers a question, reads the next ` +
    `bit, answers the next question, and so on: lesson chunk → question → lesson chunk → question.\n\n` +
    `For each section give:\n` +
    `- "title": a short topic title for that part of the lecture\n` +
    `- "body": a SHORT intro, 1–2 sentences, that sets up the section before its first question. The ` +
    `bulk of the teaching goes in each question's "lesson" field, not here. May be omitted if the first ` +
    `question's "lesson" already stands on its own.\n` +
    slideFieldDoc +
    `- "questions": 2–4 questions that, in order, build on this section — a mix of "mcq", "short", and ` +
    `"code" (use "code" when that part of the lecture is about writing code).\n` +
    `  These questions must make the student APPLY the idea, NOT recall it. Each one should put the ` +
    `concept to work in a NEW situation that is not stated in the lesson: a fresh example, different ` +
    `numbers or inputs, an edge case, a short scenario, a "what happens if…", a comparison of two ` +
    `cases, a prediction, or a small problem to solve or implement. Do NOT write a question that can be ` +
    `answered by restating the lesson, by picking the option that matches a sentence in the text, or by ` +
    `recognising a definition verbatim. A student who merely memorised the wording should get it wrong; ` +
    `a student who understood the idea should get it right. For "mcq", make the distractors plausible ` +
    `misapplications, not obviously wrong throwaways. For "code", have the student implement or extend ` +
    `the idea and test it on inputs/cases the lesson never showed.\n` +
    `  Each question object ALSO includes:\n` +
    `    - "lesson": the chunk of written lesson the student reads RIGHT BEFORE this question — the ` +
    `part of the lecture that teaches the idea the question then asks them to apply. Together, the sections' bodies and ` +
    `the questions' "lesson" chunks, in order, make up the whole written lesson. Rules for every ` +
    `"lesson" chunk (and "body"):\n` +
    `        • Rewrite the spoken lecture into clean, concise WRITTEN prose — the way a good textbook ` +
    `would put it. Keep exactly the same content: the same points in the same order, the same specific ` +
    `examples (the actual foods, names, numbers), the same technical terms and definitions, and any ` +
    `code verbatim. But do NOT keep his spoken, sentence-by-sentence phrasing: turn rambling, ` +
    `conversational or repetitive speech (e.g. "A tree is basically a kind of graph. Here you have a ` +
    `root and then children of the root…") into tight written sentences that say the same thing.\n` +
    `        • Cut what only works out loud: false starts, "um/so/okay/basically/you know", asides, ` +
    `self-corrections, and repetition. Do NOT lose any real content — every idea, step, example and ` +
    `result he states must still be there, just said more cleanly and compactly.\n` +
    `        • Do NOT add facts, claims, or examples that are not in the transcript or slides. No outside knowledge.\n` +
    `        • Format for easy reading: short paragraphs with a blank line between them; "- " bullet ` +
    `lines for lists and steps (mirror the slides' bullets); bold the key terms with **…**; and when a ` +
    `chunk covers two or three distinct ideas, you may separate them with a short "## Subheading". Put ` +
    `any code in a \`\`\` fenced block. Use \\n for line breaks and \\n\\n between paragraphs in the JSON string.\n` +
    `        • Math is rendered with LaTeX (KaTeX), so WRITE REAL LaTeX. Wrap inline math in $…$ and a ` +
    `standalone equation in $$…$$ — e.g. "$v_i \\\\in \\\\{0,1\\\\}$" or "$$\\\\max \\\\sum_i v_i \\\\cdot ` +
    `\\\\text{value}_i \\\\text{ s.t. } \\\\sum_i v_i \\\\cdot w_i \\\\le W$$". Use proper commands ` +
    `(\\\\times, \\\\leq, \\\\sum, \\\\frac, subscripts x_i, superscripts 2^n). IMPORTANT: the reply is ` +
    `JSON, so every LaTeX backslash must be written as a DOUBLE backslash (\\\\times, \\\\leq, \\\\sum) ` +
    `so it survives JSON parsing. Do NOT use "$" for money — write currency in words ("100 dollars", ` +
    `"15 dollars"), since $ starts math. This applies to every text field: "body", each "lesson", and ` +
    `question text, options and explanations.\n\n` +
    `All "code" questions run in a sandboxed Python (Pyodide): standard library only, no input(), ` +
    `no file or network access. Each must be SELF-CONTAINED and runnable: a test "call" may use only ` +
    `the student's function, builtins and literals — if it needs a helper class/data (e.g. a Food ` +
    `object), define that in a "setup" field; never reference an undefined name. Give 3-4 "tests".\n` +
    `Write each "question" so it is easy to read: lead with the task in one sentence, then put extra ` +
    `detail on its own line with \\n breaks.\n\n` +
    `OUTPUT FORMAT — this is important. Reply with ONLY a single JSON object and nothing else: no ` +
    `markdown code fences, no text before or after. Valid JSON (double quotes, no trailing commas):\n` +
    `{\n` +
    `  "lecture": {\n` +
    `    "sections": [\n` +
    `      { "title": "section topic", "body": "short intro", ${slideSchemaInExample}"questions": [ { "lesson": "lesson chunk before this question", /* ...question fields... */ } ] }\n` +
    `    ]\n` +
    `  }\n` +
    `}\n` +
    `Each question object in any "questions" array uses this schema (plus the "lesson" field above):\n` +
    questionSchemaDoc() +
    `\n\nSections MUST be in the lecture's order and based ONLY on the transcript and slides below.\n\n` +
    `--- LECTURE ${lesson.n} TIMESTAMPED TRANSCRIPT ---\n${t}\n--- END TRANSCRIPT ---` +
    slidesBody
  );
}

export interface PromptProblemSet {
  slug: string;
  title: string;
  text: string; // extracted handout text
}

// Build ONE prompt that generates BOTH the lecture practice questions and the
// interactive version of each attached OCW problem set, so a single paste-back
// fills in everything. The AI replies with one JSON object:
//   { "lecture": {title, questions:[...]},
//     "problemSets": [ {slug, title, questions:[...]} ] }
export function buildCombinedPrompt(
  course: CourseManifest,
  lesson: Lesson,
  transcript: string | null,
  problemSets: PromptProblemSet[]
): string {
  const courseName = [course.number, course.title].filter(Boolean).join(" ");
  const readingLine = lesson.reading
    ? ` Suggested readings for this lecture: ${lesson.reading}.`
    : "";
  const hasPS = problemSets.length > 0;

  const clip = (s: string, label: string) => {
    if (s.length > MAX_TRANSCRIPT_CHARS) return s.slice(0, MAX_TRANSCRIPT_CHARS) + `\n[${label} truncated for length.]`;
    return s;
  };

  const transcriptBody = transcript
    ? `--- LECTURE ${lesson.n} MATERIAL (transcript or notes) ---\n${clip(transcript, "Material")}\n--- END MATERIAL ---`
    : "(No lecture material was available — base the lecture questions on the topic and the suggested readings.)";

  const psBodies = problemSets
    .map((ps) => `--- PROBLEM SET slug="${ps.slug}" (${ps.title}) HANDOUT ---\n${clip(ps.text, "Handout")}\n--- END PROBLEM SET ${ps.slug} ---`)
    .join("\n\n");

  // What the reply must contain.
  const psSchemaLine = hasPS
    ? `  "problemSets": [        // one object per problem set below, same "intro"+"questions" schema\n` +
      `    { "slug": "<the slug given above>", "title": "<problem set title>", "intro": "<overview>", "questions": [ /* questions */ ] }\n` +
      `  ]\n`
    : "";
  const psListLine = hasPS
    ? `  There ${problemSets.length === 1 ? "is 1 problem set" : `are ${problemSets.length} problem sets`} to convert: ` +
      problemSets.map((p) => `"${p.slug}"`).join(", ") +
      `. Include one entry in "problemSets" for EACH, using its exact slug.\n`
    : "";

  return (
    `You are an expert tutor for ${courseName}.\n\n` +
    `Create interactive practice for a student working through "Lecture ${lesson.n}: ${lesson.title}". ` +
    `This has two parts:\n` +
    `1. LECTURE QUESTIONS: using the lecture material below (a transcript or the lecture notes), ` +
    `make about 16 questions (a good mix of "mcq", "short", and several "code") focused only on ` +
    `what the lecture actually covered. Vary the difficulty: include some straightforward ` +
    `recall/understanding questions, but make a solid share of them genuinely challenging — ` +
    `questions that require applying the ideas, reasoning about edge cases or trade-offs, ` +
    `multi-step problems, or harder code exercises — so a strong student is still pushed.` +
    `${readingLine}\n` +
    (hasPS
      ? `2. PROBLEM SET QUESTIONS: for each problem set handout below, convert its REAL tasks into ` +
        `answerable questions — keep the same scenario and intent (the specific functions, algorithms ` +
        `and examples). Use "code" for every part that asks the student to implement a function ` +
        `(reuse the handout's real function name and signature), "short" for conceptual/write-up ` +
        `questions, and a few "mcq" for the key ideas. Cover the handout's parts in order.\n`
      : "") +
    `\n` +
    `All "code" questions run in a sandboxed Python (Pyodide): standard library only, no input(), ` +
    `and NO file or network access. If a task reads a provided data file (e.g. a .txt/.csv), adapt it ` +
    `so the needed data is passed as a literal argument or defined inline in the test calls — never ` +
    `require reading an external file. Make each "code" question self-contained with 3-4 "tests".\n\n` +
    `Write each "question" so it is easy to read: lead with the task or question in one sentence, ` +
    `then put each additional detail, constraint or example on its OWN line using \\n line breaks — ` +
    `never one long run-on paragraph.\n\n` +
    `Every set (the lecture, and each problem set) MUST include an "intro": a short plain-language ` +
    `overview, 2–4 sentences, that orients the student before the questions — what the topic or ` +
    `scenario is and what they'll be doing. For a problem set, summarize its real setup/story from ` +
    `the handout (e.g. the premise, the data involved, and the goal) so the student understands the ` +
    `context without opening the original.\n\n` +
    `OUTPUT FORMAT — this is important. Reply with ONLY a single JSON object and nothing else: no ` +
    `markdown code fences, no text before or after. Valid JSON (double quotes, no trailing commas), ` +
    `matching exactly:\n` +
    `{\n` +
    `  "lecture": { "title": "Practice — Lecture ${lesson.n}: ${lesson.title}", "intro": "<overview>", "questions": [ /* questions */ ] },\n` +
    psSchemaLine +
    `}\n` +
    psListLine +
    `Each question object in any "questions" array uses this schema:\n` +
    questionSchemaDoc() +
    `\n\n` +
    `SOURCE MATERIAL:\n\n` +
    transcriptBody +
    (hasPS ? `\n\n${psBodies}` : "")
  );
}

// The per-question schema + the rules for each question type (shared text).
function questionSchemaDoc(): string {
  return (
    `{\n` +
    `  "type": "mcq",            // one of: "mcq", "short", "code"\n` +
    `  "question": "the question text",\n` +
    `  "options": ["option A", "option B", "option C", "option D"],  // "mcq" only\n` +
    `  "answer": "for \\"mcq\\": the exact text of the correct option; for \\"code\\": the full model solution (runnable Python as plain text)",\n` +
    `  "points": ["key point a good answer should mention", "another key point"],  // "short" only\n` +
    `  "functionName": "the function the student implements",  // "code" only\n` +
    `  "starter": "a Python function stub for functionName the student completes",  // "code" only\n` +
    `  "setup": "Python that DEFINES any class/function/data the tests need (e.g. a Food class)",  // "code" only, when needed\n` +
    `  "tests": [{ "call": "functionName(5)", "expected": "120" }],  // "code" only: 3-4 cases\n` +
    `  "explanation": "1-2 sentence explanation"\n` +
    `}\n` +
    `For "mcq" give "options" + "answer" (and omit "points"). ` +
    `For "short" give "points" — a list of 2–5 key points a good answer should include — ` +
    `and omit "options" and "answer" (the student types their own answer and checks it ` +
    `against these points). For "code" make it a LeetCode-style exercise where the student ` +
    `implements one function: give "functionName", "starter" (a stub like ` +
    `"def name(args):\\n    # your code here\\n    pass"), 3-4 "tests" (each a "call" string ` +
    `that invokes functionName with literal arguments, and "expected" as the str() of the ` +
    `return value — e.g. "120", "True", "[1, 2, 3]"), and "answer" (the complete working ` +
    `function). ` +
    `CRITICAL — every code question MUST be self-contained and RUNNABLE: a "call" may use ONLY the ` +
    `student's function, Python builtins, and literal values. It must NEVER reference a name that is ` +
    `not defined — e.g. do not call "functionName(Food('x',20,10))" unless you ALSO provide a "setup" ` +
    `field whose Python defines that class (class Food: … with the methods used). If the task needs a ` +
    `lecture object like Food, Item or a dataset, put its full definition in "setup"; otherwise pass ` +
    `plain literals instead. Run the tests in your head: if any would raise NameError, fix it. ` +
    `Keep code questions pure-Python (standard library only, no input(), no file or network access). ` +
    `For "mcq", vary which option is correct — do not always make the first option the ` +
    `answer. Do not include comments in your actual JSON output.`
  );
}
