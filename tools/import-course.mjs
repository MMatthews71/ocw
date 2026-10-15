#!/usr/bin/env node
// Import an MIT OpenCourseWare "download course materials" folder into OpenCourse.
//
// Usage:
//   node tools/import-course.mjs <path-to-ocw-course-folder> [--id custom-id]
//
// It reads the OCW static-site folder (data.json / content_map.json / pages /
// video_galleries / resources / static_resources), normalizes it into a single
// manifest.json, copies the referenced files, and registers the course in the
// library index. Everything is written under public/content/ so Vite bundles it
// into the app (fully offline, except streaming video).

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

// ---------- args ----------
const args = process.argv.slice(2);
if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
  console.log(
    "Usage: node tools/import-course.mjs <path-to-ocw-course-folder> [--id custom-id] [--out dir]"
  );
  process.exit(args.length === 0 ? 1 : 0);
}
const srcDir = path.resolve(args[0]);
const idFlagIdx = args.indexOf("--id");
const idOverride = idFlagIdx !== -1 ? args[idFlagIdx + 1] : null;
// --out overrides where content is written (default: public/content). Lets the
// Obsidian generator import into a temp dir without touching the app library.
const outFlagIdx = args.indexOf("--out");
const CONTENT_ROOT = outFlagIdx !== -1 ? path.resolve(args[outFlagIdx + 1]) : path.join(PROJECT_ROOT, "public", "content");

if (!fs.existsSync(path.join(srcDir, "data.json"))) {
  console.error(
    `Error: ${srcDir} does not look like an OCW course folder (no data.json found).`
  );
  process.exit(1);
}

// ---------- helpers ----------
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const readText = (p) => fs.readFileSync(p, "utf8");
const exists = (p) => fs.existsSync(p);

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Basename of an OCW "file" path, e.g.
//   /courses/<course>/<hash>_MIT6_0002F16_lec1.pdf  ->  <hash>_MIT6_0002F16_lec1.pdf
function fileBasename(filePath) {
  if (!filePath) return null;
  return filePath.split("/").filter(Boolean).pop();
}

// Extract a .zip into destDir using only Node built-ins (zlib). Reads the
// central directory so compressed/uncompressed sizes are reliable, then inflates
// each entry (method 0 = stored, 8 = deflate). Returns the list of written file
// paths relative to destDir. Guards against zip-slip.
function extractZip(zipPath, destDir) {
  const buf = fs.readFileSync(zipPath);
  const EOCD_SIG = 0x06054b50, CEN_SIG = 0x02014b50, LOC_SIG = 0x04034b50;

  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error("not a zip (no end-of-central-directory record)");

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < count && buf.readUInt32LE(p) === CEN_SIG; n++) {
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    entries.push({ method, compSize, localOffset, name });
    p += 46 + nameLen + extraLen + commentLen;
  }

  const written = [];
  for (const e of entries) {
    if (e.name.endsWith("/")) continue; // directory
    let lp = e.localOffset;
    if (buf.readUInt32LE(lp) !== LOC_SIG) throw new Error("bad local header");
    const nameLen = buf.readUInt16LE(lp + 26);
    const extraLen = buf.readUInt16LE(lp + 28);
    const start = lp + 30 + nameLen + extraLen;
    const comp = buf.subarray(start, start + e.compSize);
    let data;
    if (e.method === 0) data = comp;
    else if (e.method === 8) data = zlib.inflateRawSync(comp);
    else throw new Error(`unsupported compression method ${e.method} in ${e.name}`);

    const safe = e.name.replace(/\\/g, "/").split("/").filter((s) => s && s !== "..").join("/");
    if (!safe || safe.startsWith("__MACOSX/") || path.basename(safe) === ".DS_Store") continue;
    const outPath = path.join(destDir, safe);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, data);
    written.push(safe);
  }
  return written;
}

function psFileKind(name) {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".py") return "code";
  if ([".txt", ".csv", ".json", ".md", ".dat"].includes(ext)) return "data";
  return "other"; // .pyc and anything binary: download-only
}

// Which lesson(s) each problem set belongs to ("by topic"). Keyed by course id,
// with a sequential fallback (PS n -> lesson n) for other courses.
const PS_LESSON_RANGES = {
  "6-0002-fall-2016": { 1: [1, 2], 2: [3], 3: [4, 5, 6], 4: [6, 7, 8], 5: [9, 10] },
};

function kindForResource(data) {
  const rt = (data.resourcetype || "").toLowerCase();
  const ocw = (data.ocw_type || "").toLowerCase();
  if (data.video_metadata?.youtube_id || rt === "video") return "video";
  const base = fileBasename(data.file);
  const ext = base ? path.extname(base).toLowerCase() : "";
  if (ext === ".pdf") return "pdf";
  if ([".py", ".txt", ".c", ".h", ".java", ".js", ".m", ".r", ".csv"].includes(ext))
    return "code";
  if ([".zip", ".tar", ".gz", ".tgz"].includes(ext)) return "archive";
  if ([".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp"].includes(ext))
    return "image";
  if (ext) return "file";
  if (ocw === "ocwfile" && base) return "file";
  return "html";
}

// ---------- read course metadata ----------
const meta = readJson(path.join(srcDir, "data.json"));
const courseId = slugify(idOverride || meta.site_short_id || meta.primary_course_number || path.basename(srcDir));
const destDir = path.join(CONTENT_ROOT, courseId);
const filesDir = path.join(destDir, "files");
fs.mkdirSync(filesDir, { recursive: true });

console.log(`Importing "${meta.course_title}" as id "${courseId}"`);

// ---------- copy static resources ----------
const staticDir = path.join(srcDir, "static_resources");
let copied = 0;
if (exists(staticDir)) {
  for (const name of fs.readdirSync(staticDir)) {
    const from = path.join(staticDir, name);
    if (fs.statSync(from).isFile()) {
      fs.copyFileSync(from, path.join(filesDir, name));
      copied++;
    }
  }
}
console.log(`  copied ${copied} files`);

// ---------- course image ----------
let imageFile = null;
if (meta.image_src) {
  const base = fileBasename(meta.image_src);
  if (base && exists(path.join(filesDir, base))) imageFile = base;
}

// ---------- link rewriting ----------
// Rewrite the OCW relative/absolute links inside stored HTML so they resolve
// against the app's hash router and bundled files.
const coursePathFragment = (meta.site_url_path || "").replace(/^\/+|\/+$/g, "");

function rewriteHtml(html) {
  if (!html) return "";
  let out = html;

  // Links to resource pages -> in-app resource route
  out = out.replace(
    /(?:\.\.\/)+resources\/([^/"'#?]+)\/index\.html/g,
    (_m, slug) => `#/c/${courseId}/r/${slug}`
  );
  // Links to section/content pages -> in-app section route
  out = out.replace(
    /(?:\.\.\/)+pages\/([^/"'#?]+)\/index\.html/g,
    (_m, slug) => `#/c/${courseId}/s/${slug}`
  );
  // Links to video galleries -> in-app section route
  out = out.replace(
    /(?:\.\.\/)+video_galleries\/([^/"'#?]+)\/index\.html/g,
    (_m, slug) => `#/c/${courseId}/s/${slug}`
  );
  // References into static_resources/<name> -> bundled files
  out = out.replace(
    /(?:\.{1,2}\/)*static_resources\/([^"'?)#\s]+)/g,
    (_m, name) => `content/${courseId}/files/${name}`
  );
  // Absolute OCW file links: /courses/<thiscourse>/<basename> -> bundled files
  if (coursePathFragment) {
    const re = new RegExp(
      `/?${coursePathFragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/([^"'?)#\\s]+)`,
      "g"
    );
    out = out.replace(re, (_m, name) => `content/${courseId}/files/${fileBasename(name)}`);
  }
  return out;
}

// ---------- sections (nav order from the course index.html) ----------
function parseNavOrder() {
  const indexPath = path.join(srcDir, "index.html");
  const order = []; // { kind: 'page'|'gallery', slug }
  if (!exists(indexPath)) return order;
  const html = readText(indexPath);
  const navStart = html.indexOf('class="course-nav"');
  const scope = navStart !== -1 ? html.slice(navStart) : html;
  const linkRe = /href="\.?\/?(pages|video_galleries)\/([^/"]+)\/index\.html"/g;
  let m;
  const seen = new Set();
  while ((m = linkRe.exec(scope)) !== null) {
    const key = `${m[1]}/${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    order.push({ kind: m[1] === "pages" ? "page" : "gallery", slug: m[2] });
  }
  return order;
}

const sections = [];
for (const entry of parseNavOrder()) {
  const base = entry.kind === "page" ? "pages" : "video_galleries";
  const dataPath = path.join(srcDir, base, entry.slug, "data.json");
  if (!exists(dataPath)) continue;
  const d = readJson(dataPath);
  sections.push({
    slug: entry.slug,
    title: d.title || entry.slug,
    kind: entry.kind,
    contentHtml: rewriteHtml(d.content || d.content_html || ""),
  });
}

// ---------- resources (from content_map) ----------
const resources = {};
const mapPath = path.join(srcDir, "content_map.json");
if (exists(mapPath)) {
  const map = readJson(mapPath);
  for (const relPath of Object.values(map)) {
    if (!relPath || !relPath.includes("/resources/")) continue;
    const slug = relPath.split("/resources/")[1].replace(/\/data\.json$/, "");
    if (resources[slug]) continue;
    const dataPath = path.join(srcDir, "resources", slug, "data.json");
    if (!exists(dataPath)) continue;
    let d;
    try {
      d = readJson(dataPath);
    } catch {
      continue;
    }
    const kind = kindForResource(d);
    const base = fileBasename(d.file);
    const vf = d.video_files || {};
    const transcript = fileBasename(vf.video_transcript_resources?.[0]?.file);
    const captions = (vf.video_captions_resources || [])
      .map((c) => ({ lang: c.language || "en", file: fileBasename(c.file) }))
      .filter((c) => c.file);
    resources[slug] = {
      slug,
      title: d.title || slug,
      kind,
      description: rewriteHtml(d.content || ""),
      youtubeId: d.video_metadata?.youtube_id || null,
      archiveUrl: vf.archive_url || null,
      transcript: transcript || null,
      captions,
      file: base || null,
      fileType: d.file_type || null,
      size: d.file_size || null,
    };
  }
}

// ---------- lessons (linear progression) ----------
// Group materials into Lesson 1..N using the ordered lecture videos as the
// spine and the course's "SES #" tables to attach each session's slides, code
// and readings. Generic enough to work across OCW courses that use such tables.

const stripTags = (s) =>
  String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Ordered video slugs: prefer the gallery section's link order.
function orderedVideoSlugs() {
  const gallery = sections.find((s) => s.kind === "gallery");
  const slugs = [];
  const seen = new Set();
  const scan = (html) => {
    const re = new RegExp(`#/c/${courseId}/r/([^"'#?]+)`, "g");
    let m;
    while ((m = re.exec(html)) !== null) {
      const slug = m[1];
      if (!seen.has(slug) && resources[slug]?.kind === "video") {
        seen.add(slug);
        slugs.push(slug);
      }
    }
  };
  if (gallery) scan(gallery.contentHtml);
  // Fallback: any video resources, numbered by title.
  if (slugs.length === 0) {
    Object.values(resources)
      .filter((r) => r.kind === "video")
      .sort((a, b) => (parseInt((a.title.match(/\d+/) || [0])[0]) - parseInt((b.title.match(/\d+/) || [0])[0])))
      .forEach((r) => slugs.push(r.slug));
  }
  return slugs;
}

// Scan every section table for session-numbered rows, mapping session number
// -> { links:[{slug,label}], reading:text }.
function buildSessionIndex() {
  const links = new Map(); // n -> [{slug,label}]
  const reading = new Map(); // n -> text
  const linkRe = new RegExp(`#/c/${courseId}/r/([^"'#?]+)"[^>]*>([^<]*)<`, "g");
  for (const s of sections) {
    const isReading = /read/i.test(s.slug) || /read/i.test(s.title);
    const rows = s.contentHtml.split(/<tr[>\s]/i).slice(1);
    for (const row of rows) {
      const numMatch = row.match(/>\s*(\d+)\s*</);
      if (!numMatch) continue;
      const n = parseInt(numMatch[1], 10);
      if (!n || n > 60) continue;
      let m;
      const rowLinks = [];
      linkRe.lastIndex = 0;
      while ((m = linkRe.exec(row)) !== null) {
        rowLinks.push({ slug: m[1], label: stripTags(m[2]) });
      }
      if (rowLinks.length) {
        const arr = links.get(n) || [];
        for (const l of rowLinks) if (!arr.some((x) => x.slug === l.slug)) arr.push(l);
        links.set(n, arr);
      }
      if (isReading && !reading.has(n)) {
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => stripTags(c[1]));
        if (cells.length >= 2) reading.set(n, cells[cells.length - 1]);
      }
    }
  }
  return { links, reading };
}

// When a course has no lecture videos (notes-based courses), build the lesson
// spine from the ordered "Session N" lecture-notes PDFs instead; Practice then
// uses each lesson's notes PDF as its source material.
function orderedNoteSlugs() {
  const notesSec = sections.find((s) => /lecture[-\s]?notes|^notes$/i.test(s.slug) || /lecture notes/i.test(s.title));
  const slugs = [];
  const seen = new Set();
  if (notesSec) {
    const re = new RegExp(`#/c/${courseId}/r/([^"'#?]+)`, "g");
    let m;
    while ((m = re.exec(notesSec.contentHtml)) !== null) {
      const slug = m[1];
      const r = resources[slug];
      // Session notes only (e.g. "ses1", "ses2_4"); skips combined compilations.
      if (r && r.kind === "pdf" && !seen.has(slug) && /ses\d/i.test(slug)) {
        seen.add(slug);
        slugs.push(slug);
      }
    }
  }
  return slugs;
}

const videoSlugs = orderedVideoSlugs();
const noteSlugs = videoSlugs.length ? [] : orderedNoteSlugs();
const { links: sessionLinks, reading: sessionReading } = buildSessionIndex();
const usedInLessons = new Set();

const stripNoise = (s) => String(s || "").replace(/\s*\(pdf\)\s*$/i, "").replace(/^session[\s\d:–—.-]*/i, "").trim();

const lessons = videoSlugs.length
  ? videoSlugs.map((vslug, i) => {
      const n = i + 1;
      const vres = resources[vslug];
      usedInLessons.add(vslug);
      const items = [];
      for (const l of sessionLinks.get(n) || []) {
        const r = resources[l.slug];
        if (!r || r.kind === "video") continue;
        usedInLessons.add(l.slug);
        items.push({ slug: l.slug, kind: r.kind, label: l.label || r.title });
      }
      // Title: strip a leading "Lecture N:" to avoid "Lesson 1: Lecture 1: ..."
      const topic = (vres?.title || `Lecture ${n}`).replace(/^lecture\s*\d+\s*[:\-.]?\s*/i, "").trim();
      return {
        n,
        title: topic || vres?.title || `Lesson ${n}`,
        video: vslug,
        notesPdf: null,
        reading: sessionReading.get(n) || null,
        items,
      };
    })
  : noteSlugs.map((nslug, i) => {
      const n = i + 1;
      const r = resources[nslug];
      usedInLessons.add(nslug);
      const topic = stripNoise(r?.title) || `Lecture ${n}`;
      return {
        n,
        title: topic,
        video: null,
        notesPdf: r?.file || null, // basename under files/, used by Practice
        reading: sessionReading.get(n) || null,
        items: [],
      };
    });

// Problem sets: archive/pdf resources linked from the assignments section that
// weren't already pulled into a lesson. Kept as a separate track.
const problemSets = [];
{
  const assign = sections.find((s) => /assign|problem/i.test(s.slug) || /assign|problem/i.test(s.title));
  if (assign) {
    const re = new RegExp(`#/c/${courseId}/r/([^"'#?]+)`, "g");
    let m;
    const seen = new Set();
    while ((m = re.exec(assign.contentHtml)) !== null) {
      const slug = m[1];
      const r = resources[slug];
      if (!r || seen.has(slug)) continue;
      seen.add(slug);
      const looksLikePS = r.kind === "archive" || /problem\s*set|^ps\s*\d/i.test(r.title);
      if (looksLikePS && !usedInLessons.has(slug)) {
        const ps = { slug, title: r.title, kind: r.kind, archive: r.file || null };

        // Number parsed from "Problem Set N" / slug "psN".
        const numMatch = /(\d+)/.exec(slug) || /problem\s*set\s*(\d+)/i.exec(r.title);
        const number = numMatch ? parseInt(numMatch[1], 10) : null;
        ps.number = number ?? undefined;
        const ranges = PS_LESSON_RANGES[courseId];
        ps.lessons = (ranges && number != null && ranges[number]) || (number != null ? [number] : []);

        // Unzip the archive so the handout + starter code are viewable offline.
        if (r.kind === "archive" && r.file) {
          const zipPath = path.join(filesDir, r.file);
          const outDir = path.join(filesDir, "assignments", slug);
          try {
            fs.rmSync(outDir, { recursive: true, force: true });
            const names = extractZip(zipPath, outDir);
            const rel = (nm) => `assignments/${slug}/${nm}`;
            const pdfName = names.find((nm) => path.extname(nm).toLowerCase() === ".pdf");
            ps.pdf = pdfName ? rel(pdfName) : null;
            ps.files = names
              .filter((nm) => nm !== pdfName)
              .map((nm) => ({ name: rel(nm), label: path.basename(nm), kind: psFileKind(nm) }))
              .sort((a, b) => {
                const order = { code: 0, data: 1, other: 2 };
                return order[a.kind] - order[b.kind] || a.label.localeCompare(b.label);
              });
          } catch (err) {
            console.warn(`  ! could not extract ${r.file}: ${err.message}`);
            ps.pdf = null;
            ps.files = [];
          }
        }

        problemSets.push(ps);
      }
    }
  }
}

// ---------- write manifest ----------
const manifest = {
  id: courseId,
  title: meta.course_title || courseId,
  number: meta.primary_course_number || "",
  term: meta.term || "",
  year: meta.year || "",
  level: (meta.level || []).join(", "),
  descriptionHtml: rewriteHtml(meta.course_description_html || meta.course_description || ""),
  image: imageFile ? `content/${courseId}/files/${imageFile}` : null,
  instructors: (meta.instructors || []).map((i) => i.title || `${i.first_name} ${i.last_name}`),
  topics: (meta.topics || []).map((t) => (Array.isArray(t) ? t[t.length - 1] : t)),
  learningResourceTypes: meta.learning_resource_types || [],
  lessons,
  problemSets,
  sections,
  resources,
};

fs.writeFileSync(path.join(destDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`  wrote manifest with ${lessons.length} lessons, ${problemSets.length} problem sets, ${sections.length} sections, ${Object.keys(resources).length} resources`);

// ---------- update library index ----------
fs.mkdirSync(CONTENT_ROOT, { recursive: true });
const indexPath = path.join(CONTENT_ROOT, "index.json");
let index = [];
if (exists(indexPath)) {
  try {
    index = readJson(indexPath);
  } catch {
    index = [];
  }
}
const card = {
  id: courseId,
  title: manifest.title,
  number: manifest.number,
  term: manifest.term,
  year: manifest.year,
  image: manifest.image,
  instructors: manifest.instructors,
  topics: manifest.topics,
};
index = index.filter((c) => c.id !== courseId);
index.push(card);
index.sort((a, b) => (a.number || a.title).localeCompare(b.number || b.title));
fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

console.log(`Done. Library now has ${index.length} course(s).`);
console.log(`Next: npm run build && npx cap sync android`);
