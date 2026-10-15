import { useState } from "react";
import type { PSSection } from "../lib/problemset";
import { getQuizProgress, saveQuizProgress } from "../lib/quizprogress";
import { ProblemSetView } from "./ProblemSetView";
import { LessonText } from "./LessonText";
import { SlidesSidebar } from "./SlidesSidebar";

// One step of the lesson — its own page you flip between. Content pages (the
// written lesson, with the section's slides + intro on the section's first one)
// alternate with quiz pages (a single question): content → quiz → content → quiz.
type Page =
  | { kind: "content"; si: number; qi: number; first: boolean }
  | { kind: "quiz"; si: number; qi: number; gi: number };

// Flatten the sections into an ordered list of content/quiz pages.
function buildPages(sections: PSSection[], hasSlides: boolean): Page[] {
  const pages: Page[] = [];
  let gi = 0; // global question index, for stable per-question storage keys
  sections.forEach((s, si) => {
    const qs = s.ps.questions;
    if (!qs.length) {
      if (s.body || (hasSlides && s.slideStart)) pages.push({ kind: "content", si, qi: -1, first: true });
      return;
    }
    qs.forEach((q, qi) => {
      const first = qi === 0;
      const hasContent = (first && (!!s.body || (hasSlides && !!s.slideStart))) || !!q.lesson;
      if (hasContent) pages.push({ kind: "content", si, qi, first });
      pages.push({ kind: "quiz", si, qi, gi });
      gi++;
    });
  });
  return pages;
}

// The lecture as a sequence of pages the student flips through: a content page
// (written lesson, with the section's slides on its first page), then a quiz
// page (one question), alternating. No video. Progress persists per question.
export function SectionsView({
  sections,
  storageKeyBase,
  slidesUrl,
}: {
  sections: PSSection[];
  storageKeyBase: string; // e.g. "<courseId>:<lessonN>"
  slidesUrl?: string | null; // the lecture slides PDF, for per-section page ranges
}) {
  const hasSlides = !!slidesUrl;
  const pages = buildPages(sections, hasSlides);
  const total = pages.length;

  const navKey = `${storageKeyBase}:nav`;
  const [cur, setCur] = useState<number>(() => {
    const c = getQuizProgress(navKey)?.cur;
    return typeof c === "number" && c >= 0 && c < total ? c : 0;
  });
  const pi = Math.min(Math.max(cur, 0), Math.max(0, total - 1));

  function go(i: number) {
    const next = Math.max(0, Math.min(total - 1, i));
    setCur(next);
    saveQuizProgress(navKey, { cur: next });
  }

  // First page of each section, so the dots can jump between sections.
  if (!total) return null;
  const page = pages[pi];
  const s = sections[page.si];

  return (
    <div>
      {/* Minimal header: section title, step kind, and a thin progress bar. */}
      <div className="pager-head">
        <div className="sec">{s.title}</div>
        <div className="kind">{page.kind === "content" ? "Lesson" : "Quiz"} · {pi + 1} of {total}</div>
      </div>
      <div className="progress"><span style={{ width: `${((pi + 1) / total) * 100}%` }} /></div>

      {/* The current page: a content page, or a single-question quiz page. */}
      {page.kind === "content" ? (
        <div key={`c-${pi}`}>
          {page.first && s.body && <LessonText text={s.body} />}
          {page.qi >= 0 && s.ps.questions[page.qi]?.lesson && (
            <LessonText text={s.ps.questions[page.qi].lesson!} />
          )}
        </div>
      ) : (
        <ProblemSetView
          key={`q-${page.gi}`}
          ps={{ questions: [s.ps.questions[page.qi]] }}
          storageKey={`${storageKeyBase}:q${page.gi}`}
          numberOffset={page.qi}
        />
      )}

      {/* Back / Next */}
      <div className="pager-nav">
        <button className="btn ghost" onClick={() => go(pi - 1)} disabled={pi === 0}>‹ Back</button>
        <button className="btn" onClick={() => go(pi + 1)} disabled={pi === total - 1}>
          {page.kind === "content" ? "Start quiz" : "Continue"}
        </button>
      </div>

      {/* The section's slides live in a collapsible left sidebar — only while
          reading a lesson (content) page, not during the quiz. Keyed per section
          so it re-fits to that section's page range. */}
      {page.kind === "content" && slidesUrl && s.slideStart && (
        <SlidesSidebar key={`slides-${storageKeyBase}`} url={slidesUrl} scrollTo={s.slideStart} />
      )}
    </div>
  );
}

