import type { Lesson } from "../types";
import { getDone } from "./progress";
import { getSavedProblemSet, type PSQuestion } from "./problemset";
import { getQuizProgress, type QuizProgress } from "./quizprogress";

// The slugs that count toward a lesson's completion. Materials were removed
// from the lesson UI, so completion now tracks the lecture video only.
export function countableSlugs(lesson: Lesson): string[] {
  return lesson.video ? [lesson.video] : [];
}

export function lessonProgress(courseId: string, lesson: Lesson) {
  const slugs = countableSlugs(lesson);
  const done = getDone(courseId);
  const doneCount = slugs.filter((s) => done.has(s)).length;
  return { doneCount, total: slugs.length, complete: slugs.length > 0 && doneCount === slugs.length };
}

// Has this question been attempted? (picked an MCQ option, revealed/typed a
// short answer, or edited the code away from its starter.)
function isAnswered(q: PSQuestion, st: QuizProgress | null, i: number): boolean {
  if (!st) return false;
  if (q.type === "mcq") return st.picks?.[i] !== undefined;
  if (q.type === "short") return !!st.revealed?.[i] || !!st.texts?.[i]?.trim();
  const code = st.codes?.[i]?.trim();
  return !!code && code !== (q.starter || "").trim();
}

// Fraction (0..1) of a lesson's practice the student has attempted. 0 when no
// practice has been generated yet. Mirrors how the pager stores progress:
// sectioned lessons keep one question per "<base>:q<gi>" key, flat ones share
// "<base>".
export function practiceProgress(courseId: string, n: number): number {
  const saved = getSavedProblemSet(courseId, n);
  if (!saved) return 0;
  const base = `${courseId}:${n}`;
  let total = 0;
  let done = 0;
  if (saved.sections?.length) {
    let gi = 0;
    for (const sec of saved.sections) {
      for (const q of sec.ps.questions) {
        total++;
        if (isAnswered(q, getQuizProgress(`${base}:q${gi}`), 0)) done++;
        gi++;
      }
    }
  } else {
    const st = getQuizProgress(base);
    saved.questions.forEach((q, i) => {
      total++;
      if (isAnswered(q, st, i)) done++;
    });
  }
  return total ? done / total : 0;
}
