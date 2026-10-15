import katex from "katex";
import "katex/dist/katex.min.css";

// Rich reading text for the written lessons and quiz copy. Renders:
//   - real math:   $…$ inline and $$…$$ (also \(…\) / \[…\]) via KaTeX
//   - **bold**, `inline code`
//   - headings (#, ##, ###), "- "/"1." lists, ``` fenced code blocks
// Math and bold/code are shared with the quiz via <InlineRich>.

function katexHtml(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, { throwOnError: false, displayMode: display, output: "html" });
  } catch {
    return "";
  }
}

function Math({ tex, display }: { tex: string; display: boolean }) {
  const html = katexHtml(tex.trim(), display);
  if (!html) return <>{display ? `$$${tex}$$` : `$${tex}$`}</>;
  return (
    <span
      className={display ? "math-display" : "math-inline"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// A $…$ span is only math (not a "$100 … $5" currency run) when it is short and
// either has no spaces or contains a clear math character.
function isDollarMath(inner: string): boolean {
  return inner.length < 80 && (/[\\_^{}=<>+]/.test(inner) || !/\s/.test(inner));
}

const SEG =
  /(\$\$[\s\S]+?\$\$)|(\\\[[\s\S]+?\\\])|(\$[^$\n]+?\$)|(\\\([\s\S]+?\\\))|(\*\*[^*]+\*\*|__[^_]+__)|(`[^`]+`)/g;

// Render inline rich text (math, bold, code) within a single run of text.
export function InlineRich({ text }: { text: string }): React.ReactElement {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  SEG.lastIndex = 0;
  while ((m = SEG.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (m[1] || m[2]) nodes.push(<Math key={k++} tex={tok.slice(2, -2)} display />);
    else if (m[3]) {
      const inner = tok.slice(1, -1);
      if (isDollarMath(inner)) nodes.push(<Math key={k++} tex={inner} display={false} />);
      else nodes.push(tok);
    } else if (m[4]) nodes.push(<Math key={k++} tex={tok.slice(2, -2)} display={false} />);
    else if (m[5]) nodes.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    else if (m[6]) nodes.push(<code key={k++}>{tok.slice(1, -1)}</code>);
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}

export function LessonText({ text }: { text: string }) {
  return (
    <div className="lesson">
      {parseBlocks(text).map((b, i) => {
        if (b.type === "code") {
          return (
            <pre key={i} className="code">
              <code>{b.text}</code>
            </pre>
          );
        }
        if (b.type === "heading") {
          const H = (b.level <= 2 ? "h3" : "h4") as "h3" | "h4";
          return <H key={i}><InlineRich text={b.text} /></H>;
        }
        if (b.type === "list") {
          return (
            <ul key={i}>
              {b.items.map((it, j) => (
                <li key={j}><InlineRich text={it} /></li>
              ))}
            </ul>
          );
        }
        // A paragraph that is entirely one display equation → render it as a block.
        const disp = b.text.match(/^\$\$([\s\S]+)\$\$$/) || b.text.match(/^\\\[([\s\S]+)\\\]$/);
        if (disp) {
          return (
            <div key={i} className="math-block">
              <Math tex={disp[1]} display />
            </div>
          );
        }
        return <p key={i}><InlineRich text={b.text} /></p>;
      })}
    </div>
  );
}

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "p"; text: string }
  | { type: "list"; items: string[] }
  | { type: "code"; text: string };

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  let para: string[] = [];
  let list: string[] = [];
  let code: string[] | null = null;

  const flushPara = () => { if (para.length) { blocks.push({ type: "p", text: para.join("\n").trim() }); para = []; } };
  const flushList = () => { if (list.length) { blocks.push({ type: "list", items: list.slice() }); list = []; } };
  const flushText = () => { flushPara(); flushList(); };

  for (const raw of lines) {
    const line = raw;
    if (/^\s*```/.test(line)) {
      if (code === null) { flushText(); code = []; }
      else { blocks.push({ type: "code", text: code.join("\n").replace(/\n+$/, "") }); code = null; }
      continue;
    }
    if (code !== null) { code.push(line); continue; }

    const heading = line.match(/^\s*(#{1,4})\s+(.*)$/);
    if (heading) { flushText(); blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() }); continue; }

    const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) { flushPara(); list.push(bullet[1].trim()); continue; }

    if (!line.trim()) { flushText(); continue; }

    flushList();
    para.push(line.trim());
  }
  if (code !== null && code.length) blocks.push({ type: "code", text: code.join("\n").replace(/\n+$/, "") });
  flushText();
  return blocks;
}
