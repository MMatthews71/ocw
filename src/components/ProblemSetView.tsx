import { useEffect, useRef, useState } from "react";
import type { ProblemSet, PSQuestion } from "../lib/problemset";
import { correctOptionIndex } from "../lib/problemset";
import { getQuizProgress, saveQuizProgress } from "../lib/quizprogress";
import { CodeQuestion } from "./CodeQuestion";
import { InlineRich } from "./LessonText";

// Renders a parsed problem set as an interactive quiz: MCQs are answerable with
// instant right/wrong feedback; short/code questions reveal a model answer on
// demand. When `storageKey` is given, the student's progress (picks, reveals,
// typed answers, code and current question) is saved and restored.
//
// `numberOffset`: added to each question's displayed number (its "Q#" label).
// Used when a single-question set is really question N of a larger lesson.
export function ProblemSetView({
  ps,
  storageKey,
  numberOffset = 0,
}: {
  ps: ProblemSet;
  storageKey?: string;
  numberOffset?: number;
}) {
  const n = ps.questions.length;

  // Load any saved progress once (per mount / storageKey).
  const saved = useRef(storageKey ? getQuizProgress(storageKey) : null).current;

  const [picks, setPicks] = useState<Record<number, number>>(() => saved?.picks ?? {});
  const [revealed, setRevealed] = useState<Record<number, boolean>>(() => saved?.revealed ?? {});
  const [texts, setTexts] = useState<Record<number, string>>(() => saved?.texts ?? {});
  const [codes, setCodes] = useState<Record<number, string>>(() => {
    const base: Record<number, string> = {};
    ps.questions.forEach((q, i) => {
      if (q.type === "code") base[i] = saved?.codes?.[i] ?? q.starter ?? "# Write your solution here\n";
    });
    return base;
  });
  const [cur, setCur] = useState(() => saved?.cur ?? 0);
  const idx = Math.min(cur, Math.max(0, n - 1));

  // Persist progress whenever it changes.
  useEffect(() => {
    if (!storageKey) return;
    saveQuizProgress(storageKey, { picks, revealed, texts, codes, cur });
  }, [storageKey, picks, revealed, texts, codes, cur]);

  // Colour a dot by its state: green/red for answered MCQs, a dot for a
  // revealed short/code question, otherwise neutral.
  const dotStatus = (i: number): string | null => {
    const q = ps.questions[i];
    if (q.type === "mcq" && picks[i] !== undefined) {
      return picks[i] === correctOptionIndex(q) ? "var(--good)" : "var(--bad)";
    }
    if ((q.type === "short" || q.type === "code") && revealed[i]) return "var(--muted)";
    return null;
  };

  const card = (i: number) => {
    const q = ps.questions[i];
    return (
      <QuestionCard
        index={i + numberOffset}
        q={q}
        pick={picks[i]}
        onPick={(opt) => setPicks((p) => (p[i] !== undefined ? p : { ...p, [i]: opt }))}
        revealed={!!revealed[i]}
        onReveal={() => setRevealed((r) => ({ ...r, [i]: true }))}
        text={texts[i] ?? ""}
        onText={(v) => setTexts((t) => ({ ...t, [i]: v }))}
        code={codes[i]}
        onCode={(v) => setCodes((c) => ({ ...c, [i]: v }))}
      />
    );
  };

  return (
    <div>
      {/* Only the current question is shown; all stay mounted so their answers,
          code and run results persist while navigating. */}
      <div>
        {ps.questions.map((_, i) => (
          <div key={i} style={{ display: i === idx ? "block" : "none" }}>
            {card(i)}
          </div>
        ))}
      </div>

      {/* Question navigator dots */}
      {n > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "16px 0 0" }}>
          {ps.questions.map((_, i) => {
            const active = i === idx;
            const sc = dotStatus(i);
            return (
              <button
                key={i}
                onClick={() => setCur(i)}
                aria-label={`Go to question ${i + 1}`}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  border: `1px solid ${active ? "var(--accent)" : sc || "var(--border)"}`,
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "var(--accent-ink)" : sc || "var(--muted)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      )}

      {/* Prev / Next */}
      {n > 1 && (
        <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "center", paddingTop: 12 }}>
          <button className="btn secondary" onClick={() => setCur((c) => Math.max(0, Math.min(c, n - 1) - 1))} disabled={idx === 0}>
            ‹ Prev
          </button>
          <button className="btn" onClick={() => setCur((c) => Math.min(n - 1, c + 1))} disabled={idx === n - 1}>
            Next ›
          </button>
        </div>
      )}
    </div>
  );
}

const typeBadge: Record<string, string> = { mcq: "Multiple choice", short: "Short answer", code: "Coding" };

// Break a question into readable lines: honour any explicit line breaks, and
// split a long run-on paragraph into sentences so it doesn't read as one blob.
// The first line acts as the headline; the rest are supporting detail.
const ABBR = /\b(?:e\.g|i\.e|etc|vs|cf|Dr|Mr|Mrs|Ms|Fig|No|Eq|approx|Prof|St|al)\.$/i;
function splitQuestion(text: string): string[] {
  const lines = String(text || "").split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const line of lines) {
    if (line.length <= 140) { out.push(line); continue; }
    // Split on sentence boundaries, then re-merge fragments that split on an
    // abbreviation (e.g. "e.g.") or that are too short to stand alone.
    const parts = line.split(/(?<=[.?!:])\s+(?=[A-Z0-9"'(])/);
    const merged: string[] = [];
    for (const p of parts) {
      const prev = merged[merged.length - 1];
      if (prev && (ABBR.test(prev) || prev.length < 24)) merged[merged.length - 1] = `${prev} ${p}`;
      else merged.push(p);
    }
    out.push(...merged);
  }
  return out.length ? out : [String(text || "")];
}

function QuestionCard({
  index,
  q,
  pick,
  onPick,
  revealed,
  onReveal,
  text,
  onText,
  code,
  onCode,
}: {
  index: number;
  q: PSQuestion;
  pick: number | undefined;
  onPick: (opt: number) => void;
  revealed: boolean;
  onReveal: () => void;
  text: string;
  onText: (v: string) => void;
  code: string | undefined;
  onCode: (v: string) => void;
}) {
  const correct = correctOptionIndex(q);
  const answered = pick !== undefined;

  return (
    <div>
      <div className="q-kind">Q{index + 1} · {typeBadge[q.type] || "Question"}</div>
      <div className="q-text">
        {splitQuestion(q.question).map((line, i) => (
          <p key={i}><InlineRich text={line} /></p>
        ))}
      </div>

      {q.type === "mcq" && q.options ? (
        <div className="opts">
          {q.options.map((opt, oi) => {
            const isCorrect = oi === correct;
            const isPicked = oi === pick;
            const cls = answered && isCorrect ? "opt correct" : answered && isPicked ? "opt wrong" : "opt";
            return (
              <button key={oi} className={cls} onClick={() => onPick(oi)} disabled={answered}>
                <span className="k">{String.fromCharCode(65 + oi)}</span>
                <span><InlineRich text={opt} /></span>
                {answered && isCorrect && <span className="mark">✓</span>}
                {answered && isPicked && !isCorrect && <span className="mark">✗</span>}
              </button>
            );
          })}
          {answered && q.explanation && <p className="note" style={{ marginTop: 10 }}><InlineRich text={q.explanation} /></p>}
        </div>
      ) : q.type === "code" ? (
        <CodeQuestion q={q} code={code} onCodeChange={onCode} />
      ) : q.type === "short" ? (
        <div>
          <textarea
            className="field"
            value={text}
            onChange={(e) => onText(e.target.value)}
            placeholder="Type your answer…"
            style={{ minHeight: 96 }}
          />
          {!revealed ? (
            <div className="btn-row" style={{ paddingTop: 10 }}>
              <button className="btn secondary" onClick={onReveal}>Check my answer</button>
            </div>
          ) : (
            <div style={{ marginTop: 14 }}>
              <div className="reveal-head">Your answer should include</div>
              <ul className="reveal-list">
                {(q.points && q.points.length ? q.points : [q.answer]).map((p, pi) => (
                  <li key={pi}><InlineRich text={p} /></li>
                ))}
              </ul>
              {q.explanation && <p className="note" style={{ marginTop: 10 }}><InlineRich text={q.explanation} /></p>}
            </div>
          )}
        </div>
      ) : (
        <div>
          {!revealed ? (
            <button className="btn secondary" onClick={onReveal}>Show answer</button>
          ) : (
            <div>
              <div className="reveal-head">Model solution</div>
              <pre className="code"><code>{q.answer}</code></pre>
              {q.explanation && <p className="note" style={{ marginTop: 8 }}>{q.explanation}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
