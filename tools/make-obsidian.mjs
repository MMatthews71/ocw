#!/usr/bin/env node
// Turn an MIT OpenCourseWare course folder into an Obsidian vault: one note per
// lesson. Each note has the lecture video (if any), the lecture notes embedded
// as a PDF, and a "My notes" section for you to write in. (Quizzes come later.)
//
// Usage:
//   node tools/make-obsidian.mjs <path-to-ocw-course-folder> <vault-root> [--id custom-id]
//
// It reuses import-course.mjs (into a temp dir, so the app's own library is
// untouched) to parse the course into lessons, then writes Markdown notes +
// copies the referenced PDFs into <vault-root>/<Course>/.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMPORT = path.join(__dirname, "import-course.mjs");

// ---------- args ----------
const args = process.argv.slice(2);
if (args.length < 2 || args.includes("-h") || args.includes("--help")) {
  console.log("Usage: node tools/make-obsidian.mjs <ocw-course-folder> <vault-root> [--id custom-id]");
  process.exit(args.filter((a) => !a.startsWith("-")).length < 2 ? 1 : 0);
}
const srcDir = path.resolve(args[0]);
const vaultRoot = path.resolve(args[1]);
const idIdx = args.indexOf("--id");
const idOverride = idIdx !== -1 ? args[idIdx + 1] : null;

// ---------- helpers ----------
const read = (p) => fs.readFileSync(p, "utf8");
const readJson = (p) => JSON.parse(read(p));

// Make a string safe for a filename / wikilink (no path or illegal chars).
function safeName(s) {
  return String(s)
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}
const pad2 = (n) => String(n).padStart(2, "0");

// ---------- 1. import into a temp content dir (don't touch public/content) ----------
const tmpContent = fs.mkdtempSync(path.join(os.tmpdir(), "ocw-obsidian-"));
try {
  const importArgs = [IMPORT, srcDir, "--out", tmpContent];
  if (idOverride) importArgs.push("--id", idOverride);
  const res = spawnSync(process.execPath, importArgs, { encoding: "utf8" });
  if (res.status !== 0) {
    console.error(res.stdout || "");
    console.error(res.stderr || "");
    console.error("Import failed.");
    process.exit(1);
  }

  const index = readJson(path.join(tmpContent, "index.json"));
  const courseId = (index[0] && index[0].id) || idOverride;
  if (!courseId) {
    console.error("Could not determine course id after import.");
    process.exit(1);
  }
  const contentDir = path.join(tmpContent, courseId);
  const filesDir = path.join(contentDir, "files");
  const manifest = readJson(path.join(contentDir, "manifest.json"));

  // ---------- 2. set up the vault folder ----------
  const courseFolderName = safeName(manifest.title || courseId);
  const courseDir = path.join(vaultRoot, courseFolderName);
  const attachDir = path.join(courseDir, "attachments");
  fs.mkdirSync(attachDir, { recursive: true });

  const resources = manifest.resources || {};
  // The lecture-notes/slides PDF for a lesson: the first "pdf" item, else the
  // notes-based course's notesPdf.
  const notesPdfFor = (lesson) => {
    const pdfItem = (lesson.items || []).find((it) => it.kind === "pdf");
    if (pdfItem && resources[pdfItem.slug]?.file) return resources[pdfItem.slug].file;
    return lesson.notesPdf || null;
  };
  const youtubeUrlFor = (lesson) => {
    const yt = lesson.video ? resources[lesson.video]?.youtubeId : null;
    return yt ? `https://www.youtube.com/watch?v=${yt}` : null;
  };

  // ---------- 3. write one note per lesson ----------
  const lessons = manifest.lessons || [];
  const indexLinks = [];
  let notesCopied = 0;

  for (const lesson of lessons) {
    const title = lesson.title || `Lesson ${lesson.n}`;
    const base = `${pad2(lesson.n)} ${safeName(title)}`;
    indexLinks.push(`${lesson.n}. [[${base}]]`);

    const ytUrl = youtubeUrlFor(lesson);

    // Copy the lecture-notes PDF into the vault and embed it by filename.
    let notesEmbed = "_No lecture notes PDF for this lecture._";
    const pdf = notesPdfFor(lesson);
    if (pdf) {
      const src = path.join(filesDir, pdf);
      if (fs.existsSync(src)) {
        const attachName = `${pad2(lesson.n)} ${safeName(title)} (notes).pdf`;
        fs.copyFileSync(src, path.join(attachDir, attachName));
        notesCopied++;
        notesEmbed = `![[${attachName}]]`;
      }
    }

    const fm = [
      "---",
      `course: "${(manifest.title || courseId).replace(/"/g, "'")}"`,
      `course_id: ${courseId}`,
      `lesson: ${lesson.n}`,
      `title: "${title.replace(/"/g, "'")}"`,
      `video: ${ytUrl || "none"}`,
      `tags: [course/${courseId}, lesson]`,
      "---",
    ].join("\n");

    const videoSection = ytUrl
      ? `## Lecture video\n\n![](${ytUrl})\n\n[Watch on YouTube](${ytUrl})`
      : `## Lecture video\n\n_No video for this lecture._`;

    const readingLine = lesson.reading ? `\n> [!info] Reading\n> ${lesson.reading}\n` : "";

    const body = [
      fm,
      "",
      `# Lesson ${lesson.n}: ${title}`,
      readingLine,
      videoSection,
      "",
      "## Lecture notes",
      "",
      notesEmbed,
      "",
      "## My notes",
      "",
      "<!-- Write your own notes about this lecture here. -->",
      "",
      "",
    ].join("\n");

    fs.writeFileSync(path.join(courseDir, `${base}.md`), body);
  }

  // ---------- 4. index / map-of-content note ----------
  const indexNote = [
    "---",
    `course_id: ${courseId}`,
    `tags: [course/${courseId}, index]`,
    "---",
    "",
    `# ${manifest.title || courseId}`,
    manifest.number ? `\n*${manifest.number}*` : "",
    "",
    "## Lessons",
    "",
    ...indexLinks,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(courseDir, `_${safeName(manifest.title || courseId)}.md`), indexNote);

  console.log(`Created Obsidian notes for "${manifest.title}" in:`);
  console.log(`  ${courseDir}`);
  console.log(`  ${lessons.length} lesson notes, ${notesCopied} lecture-note PDFs, 1 index note.`);
} finally {
  // clean up the temp import
  try { fs.rmSync(tmpContent, { recursive: true, force: true }); } catch { /* ignore */ }
}
