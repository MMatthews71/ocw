import { useEffect, useState } from "react";
import type { CourseManifest, Lesson } from "../types";
import { buildCombinedPrompt, buildSectionsPrompt, loadLessonTranscript, loadTimestampedTranscript } from "../lib/enrich";
import { extractPdfBlocks, blocksToText, extractPdfPageTexts } from "../lib/pdftext";
import type { ProblemSet } from "../lib/problemset";
import { clearProblemSet, getSavedProblemSet, parseCombined, parseSectioned, saveProblemSet } from "../lib/problemset";
import { clearQuizProgress } from "../lib/quizprogress";
import { ProblemSetView } from "./ProblemSetView";
import { SectionsView } from "./SectionsView";

const filesUrl = (id: string, name: string) => `content/${id}/files/${name}`;

// The lesson's lecture-slides file (the first PDF item, or a notes PDF), as a
// basename under files/ — or null if the lesson has none.
function slidesFileName(course: CourseManifest, lesson: Lesson): string | null {
  const slideSlug = lesson.items.find((it) => it.kind === "pdf")?.slug;
  return (slideSlug ? course.resources[slideSlug]?.file : lesson.notesPdf) || null;
}

// Pull the slides' text one page at a time, each marked "[slide N]", so the AI
// can both reuse the slides' wording and map each section to a slide page range.
// Returns the marked text + the page count, or null if there are no slides.
async function loadSlidePages(
  course: CourseManifest,
  lesson: Lesson
): Promise<{ text: string; pages: number } | null> {
  const file = slidesFileName(course, lesson);
  if (!file) return null;
  try {
    const pageTexts = await extractPdfPageTexts(filesUrl(course.id, file));
    if (!pageTexts.some((t) => t.trim())) return null;
    const text = pageTexts.map((t, i) => `[slide ${i + 1}] ${t}`.trim()).join("\n\n");
    return { text, pages: pageTexts.length };
  } catch {
    return null;
  }
}

// Lecture practice. For lectures with a timestamped transcript (video + captions)
// the AI splits the lecture into topic SECTIONS, each with a small quiz you do as
// you watch; tapping a section seeks the video. Otherwise it falls back to one
// quiz for the whole lecture. One "Copy prompt" → paste reply. No API key needed.
export function PracticePanel({
  course,
  lesson,
  onHasSections,
}: {
  course: CourseManifest;
  lesson: Lesson;
  onHasSections?: (b: boolean) => void;
}) {
  const [saved, setSaved] = useState<ProblemSet | null>(() => getSavedProblemSet(course.id, lesson.n));

  // Tell the lesson whether this is a sectioned practice (so it can hide the
  // single top video — each section is a written lesson + quiz instead).
  useEffect(() => {
    onHasSections?.(!!saved?.sections?.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [prompt, setPrompt] = useState("");
  const [sectionsMode, setSectionsMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [response, setResponse] = useState("");
  const [error, setError] = useState<string | null>(null);

  const baseKey = `${course.id}:${lesson.n}`;

  // Build the prompt until a quiz is generated. Prefer the sectioned prompt when
  // a timestamped transcript is available.
  useEffect(() => {
    if (saved) return;
    let cancelled = false;
    setStatus("loading");
    (async () => {
      try {
        const ts = await loadTimestampedTranscript(course, lesson);
        if (cancelled) return;
        if (ts) {
          setSectionsMode(true);
          // Feed the lecture slides' text in too (page by page), so the written
          // lesson can reuse the slides' wording and map sections to slide pages.
          const slides = await loadSlidePages(course, lesson);
          if (cancelled) return;
          setPrompt(buildSectionsPrompt(course, lesson, ts, slides?.text ?? null, slides?.pages));
          setStatus("ready");
          return;
        }
        // Fallback: one quiz from the plain transcript (or notes PDF).
        setSectionsMode(false);
        let material = await loadLessonTranscript(course, lesson);
        if (!material && lesson.notesPdf) {
          try {
            material = blocksToText(await extractPdfBlocks(filesUrl(course.id, lesson.notesPdf)));
          } catch {
            /* leave null */
          }
        }
        if (cancelled) return;
        setPrompt(buildCombinedPrompt(course, lesson, material, []));
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id, lesson.n, saved]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  function loadResponse() {
    if (sectionsMode) {
      const res = parseSectioned(response);
      if (!res.ok || !res.sections) {
        setError(res.error || "No sections found. Make sure you pasted the AI's whole reply.");
        return;
      }
      const data: ProblemSet = { questions: [], sections: res.sections };
      saveProblemSet(course.id, lesson.n, data);
      setSaved(data);
      setError(null);
      return;
    }
    const res = parseCombined(response);
    if (!res.ok || !res.lecture) {
      setError(res.error || "No questions found. Make sure you pasted the AI's whole reply.");
      return;
    }
    saveProblemSet(course.id, lesson.n, res.lecture);
    setSaved(res.lecture);
    setError(null);
  }

  function regenerate() {
    clearProblemSet(course.id, lesson.n);
    clearQuizProgress(baseKey);
    clearQuizProgress(`${baseKey}:nav`);
    (saved?.sections || []).forEach((_, i) => clearQuizProgress(`${baseKey}:sec${i}`));
    setSaved(null);
    setResponse("");
    setError(null);
    setPrompt("");
    setStatus("idle");
  }

  const hasSections = !!saved?.sections?.length;
  const slidesFile = slidesFileName(course, lesson);
  const slidesUrl = slidesFile ? filesUrl(course.id, slidesFile) : null;

  return (
    <div style={{ padding: "20px var(--gutter) 0" }}>
      {saved ? (
        <>
          {hasSections ? (
            <SectionsView sections={saved.sections!} storageKeyBase={baseKey} slidesUrl={slidesUrl} />
          ) : (
            <ProblemSetView ps={saved} storageKey={baseKey} />
          )}
          <div className="btn-row" style={{ justifyContent: "center", paddingTop: 28 }}>
            <button className="btn ghost" onClick={regenerate}>Regenerate practice</button>
          </div>
        </>
      ) : (
        <>
          <div className="section-label" style={{ padding: "0 0 8px" }}>Step 1 — Get the prompt</div>
          <div className="btn-row">
            <button className="btn" onClick={copy} disabled={status !== "ready"}>
              {status === "error"
                ? "Couldn't build prompt"
                : status !== "ready"
                ? "Building prompt…"
                : copied
                ? "Copied ✓"
                : "Copy prompt"}
            </button>
          </div>

          <div className="section-label" style={{ padding: "22px 0 8px" }}>Step 2 — Paste the AI's reply</div>
          <textarea
            className="field mono"
            value={response}
            onChange={(e) => { setResponse(e.target.value); setError(null); }}
            placeholder="Paste the AI's JSON reply here…"
            style={{ minHeight: 120 }}
          />
          {error && <p className="note" style={{ color: "var(--bad)", paddingTop: 8 }}>{error}</p>}
          <div className="btn-row" style={{ paddingTop: 12 }}>
            <button className="btn" onClick={loadResponse} disabled={!response.trim()}>Load practice</button>
          </div>
        </>
      )}
    </div>
  );
}
