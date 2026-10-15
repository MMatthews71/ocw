#!/usr/bin/env node
// Save AI-generated lessons permanently into the app's bundled content.
//
// Usage:
//   node tools/save-lessons.mjs <exported-lesson.json> [more.json ...]
//   node tools/save-lessons.mjs --course <id> --lesson <n> <problemset.json>
//
// The app's practice panel has a "Save permanently" button that downloads the
// lesson as JSON ({ courseId, n, problemSet }). Feed those files to this tool
// and it merges them into public/content/<courseId>/lessons.json — a map of
// lesson number -> ProblemSet. That file is bundled by Vite (and into the APK by
// Capacitor), so the lesson then ships with the app and reaches every device,
// unlike the per-browser copy in localStorage. Commit the result to keep it.
//
// A file can also be a bare ProblemSet (no wrapper) if you pass --course/--lesson.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const CONTENT_ROOT = path.join(PROJECT_ROOT, "public", "content");

// ---------- args ----------
const args = process.argv.slice(2);
if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
  console.log(
    "Usage: node tools/save-lessons.mjs <exported-lesson.json> [more.json ...]\n" +
      "       node tools/save-lessons.mjs --course <id> --lesson <n> <problemset.json>"
  );
  process.exit(args.includes("-h") || args.includes("--help") ? 0 : 1);
}

const take = (flag) => {
  const i = args.indexOf(flag);
  if (i === -1) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const courseFlag = take("--course");
const lessonFlag = take("--lesson");
const files = args.filter((a) => !a.startsWith("--"));
if (files.length === 0) {
  console.error("Error: no lesson JSON files given.");
  process.exit(1);
}

const isProblemSet = (o) =>
  o && typeof o === "object" && (Array.isArray(o.questions) || Array.isArray(o.sections));

// Normalize one input file into { courseId, n, problemSet }.
function resolveEntry(file) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`${file}: not readable JSON (${e.message})`);
  }

  // Wrapped export from the app: { courseId, n, problemSet }.
  if (raw && typeof raw === "object" && raw.problemSet) {
    const courseId = courseFlag || raw.courseId;
    const n = lessonFlag != null ? Number(lessonFlag) : Number(raw.n);
    if (!courseId) throw new Error(`${file}: missing courseId (pass --course <id>)`);
    if (!Number.isFinite(n)) throw new Error(`${file}: missing lesson number (pass --lesson <n>)`);
    if (!isProblemSet(raw.problemSet)) throw new Error(`${file}: problemSet has no questions or sections`);
    return { courseId, n, problemSet: raw.problemSet };
  }

  // Bare ProblemSet: needs --course and --lesson.
  if (isProblemSet(raw)) {
    if (!courseFlag) throw new Error(`${file}: bare problem set needs --course <id>`);
    if (lessonFlag == null) throw new Error(`${file}: bare problem set needs --lesson <n>`);
    const n = Number(lessonFlag);
    if (!Number.isFinite(n)) throw new Error(`${file}: --lesson must be a number`);
    return { courseId: courseFlag, n, problemSet: raw };
  }

  throw new Error(`${file}: doesn't look like an exported lesson or a problem set`);
}

// Group entries by course, so each course's lessons.json is read/written once.
const byCourse = new Map();
for (const file of files) {
  let entry;
  try {
    entry = resolveEntry(file);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
  if (!byCourse.has(entry.courseId)) byCourse.set(entry.courseId, []);
  byCourse.get(entry.courseId).push(entry);
}

for (const [courseId, entries] of byCourse) {
  const courseDir = path.join(CONTENT_ROOT, courseId);
  if (!fs.existsSync(path.join(courseDir, "manifest.json"))) {
    console.error(
      `Error: no course "${courseId}" under public/content (import it first with tools/import-course.mjs).`
    );
    process.exit(1);
  }

  const outPath = path.join(courseDir, "lessons.json");
  let map = {};
  if (fs.existsSync(outPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(outPath, "utf8"));
      if (parsed && typeof parsed === "object") map = parsed;
    } catch {
      console.error(`Error: existing ${outPath} is not valid JSON; fix or remove it first.`);
      process.exit(1);
    }
  }

  for (const { n, problemSet } of entries) {
    const existed = map[String(n)] != null;
    map[String(n)] = problemSet;
    console.log(`${courseId}: lesson ${n} ${existed ? "updated" : "added"}`);
  }

  // Write with numerically-sorted keys for stable, readable diffs.
  const sorted = {};
  for (const k of Object.keys(map).sort((a, b) => Number(a) - Number(b))) sorted[k] = map[k];
  fs.writeFileSync(outPath, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`Wrote ${path.relative(PROJECT_ROOT, outPath)} (${Object.keys(sorted).length} lesson(s)). Commit it to ship.`);
}
