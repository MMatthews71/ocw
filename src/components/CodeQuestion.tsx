import { useState } from "react";
import type { PSQuestion } from "../lib/problemset";
import type { TestOutcome } from "../lib/python";
import { pyodideReady, runPython, runTests } from "../lib/python";

// LeetCode-style coding question: a code editor (coding space) prefilled with
// starter code, a Run button that executes the Python offline (bundled Pyodide),
// and either a set of test cases (pass/fail each) or a single expected output.
export function CodeQuestion({
  q,
  code: codeProp,
  onCodeChange,
}: {
  q: PSQuestion;
  code?: string; // controlled value (so the parent can persist it); falls back to internal state
  onCodeChange?: (c: string) => void;
}) {
  const [codeState, setCodeState] = useState(q.starter || "# Write your solution here\n");
  const code = codeProp !== undefined ? codeProp : codeState;
  const setCode = (c: string) => {
    if (onCodeChange) onCodeChange(c);
    else setCodeState(c);
  };
  const [busy, setBusy] = useState(false);
  const [firstLoad, setFirstLoad] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TestOutcome[] | null>(null);
  const [showSolution, setShowSolution] = useState(false);

  const testMode = !!(q.tests && q.tests.length);
  const expected = (q.expectedOutput || "").trim();
  const got = (output || "").trim();
  const matches = expected !== "" && output !== null && !error && got === expected;
  const passCount = results ? results.filter((r) => r.pass).length : 0;

  async function run() {
    setBusy(true);
    setFirstLoad(!pyodideReady());
    setError(null);
    try {
      if (testMode) {
        const res = await runTests(code, q.tests!, q.setup);
        setResults(res.error ? null : res.results);
        setError(res.error ?? null);
      } else {
        const res = await runPython(code, q.setup);
        setOutput(res.output);
        setError(res.ok ? null : res.error || "Error");
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setOutput(null);
      setResults(null);
    } finally {
      setBusy(false);
      setFirstLoad(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = code.slice(0, start) + "    " + code.slice(end);
      setCode(next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 4;
      });
    }
  }

  return (
    <div>
      <div className="q-kind" style={{ color: "var(--muted)", marginBottom: 8 }}>Your code</div>
      <textarea
        className="field mono"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        style={{ minHeight: 150, overflowWrap: "normal" }}
      />

      <div className="btn-row" style={{ paddingTop: 12 }}>
        <button className="btn" onClick={run} disabled={busy}>
          {busy ? (firstLoad ? "Loading Python…" : "Running…") : "Run"}
        </button>
        {q.answer && (
          <button className="btn secondary" onClick={() => setShowSolution(!showSolution)}>
            {showSolution ? "Hide solution" : "Show solution"}
          </button>
        )}
      </div>
      {busy && firstLoad && <p className="note" style={{ paddingTop: 8 }}>Starting the Python runtime…</p>}

      {/* Error defining/running the student's code */}
      {error && (
        <div style={{ marginTop: 14 }}>
          <div className="reveal-head bad">Error</div>
          <pre className="code" style={{ color: "var(--bad)" }}><code>{error}</code></pre>
        </div>
      )}

      {/* Test-case mode: pass/fail per case */}
      {testMode && results && !error && (
        <div style={{ marginTop: 14 }}>
          <div className={passCount === results.length ? "reveal-head" : "reveal-head bad"}>
            {passCount}/{results.length} test{results.length === 1 ? "" : "s"} passed
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {results.map((r, i) => (
              <div
                key={i}
                style={{
                  border: `1px solid ${r.pass ? "var(--good)" : "var(--bad)"}`,
                  borderRadius: 10,
                  padding: "9px 12px",
                  background: r.pass ? "var(--good-soft)" : "var(--bad-soft)",
                }}
              >
                <div className="mono" style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ overflowX: "auto" }}>{r.call}</span>
                  <span style={{ color: r.pass ? "var(--good)" : "var(--bad)", flex: "none", fontWeight: 700 }}>{r.pass ? "✓" : "✗"}</span>
                </div>
                {!r.pass && (
                  <div className="note mono" style={{ paddingTop: 6, fontSize: 12.5 }}>
                    got <b style={{ color: "var(--text)" }}>{r.got}</b> · expected <b style={{ color: "var(--good)" }}>{r.expected}</b>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Single-output mode: compare stdout */}
      {!testMode && output !== null && !error && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div className={matches || expected === "" ? "reveal-head" : "reveal-head bad"}>
              Your output{expected !== "" && (matches ? " · matches ✓" : " · doesn't match ✗")}
            </div>
            <pre className="code"><code>{output || "(no output)"}</code></pre>
          </div>
          {expected !== "" && (
            <div>
              <div className="reveal-head">Expected output</div>
              <pre className="code"><code>{q.expectedOutput}</code></pre>
            </div>
          )}
        </div>
      )}

      {showSolution && q.answer && (
        <div style={{ marginTop: 14 }}>
          <div className="reveal-head">Model solution</div>
          <pre className="code"><code>{q.answer}</code></pre>
          {q.explanation && <p className="note" style={{ marginTop: 8 }}>{q.explanation}</p>}
        </div>
      )}
    </div>
  );
}
