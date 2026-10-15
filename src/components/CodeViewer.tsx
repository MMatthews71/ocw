import { useEffect, useState } from "react";

// Displays a bundled text/code file (e.g. .py) with line numbers and a copy
// button. No syntax-highlighting dependency — keeps the bundle small and the
// rendering robust for any text file.
export function CodeViewer({ url, title }: { url: string; title: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(false);
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
      .then((t) => !cancelled && setText(t))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [url]);

  async function copy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  if (error) return <p className="note">Couldn't load this file. <a href={url} target="_blank" rel="noreferrer">Open it directly</a>.</p>;
  if (text === null) return <div className="center"><div className="spinner" /></div>;

  const lines = text.replace(/\n$/, "").split("\n");
  return (
    <>
      <div className="code-toolbar">
        <span className="note" style={{ padding: 0 }}>{title}</span>
        <button className="btn secondary" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
      </div>
      <div className="code-wrap">
        <pre>
          <code>
            {lines.map((line, i) => (
              <span className="code-line" key={i}>
                <span className="code-ln">{i + 1}</span>
                {line || " "}
                {"\n"}
              </span>
            ))}
          </code>
        </pre>
      </div>
    </>
  );
}
