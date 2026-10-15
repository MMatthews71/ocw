import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// Extract the text layer of a PDF and reconstruct it into readable blocks:
// headings, paragraphs and code. Lines are rebuilt from item positions, then
// grouped using font size (headings), monospace fonts (code) and vertical gaps
// (paragraphs). Shared by the in-page handout renderer (PdfText) and the
// "make interactive" prompt builder.

export type PdfBlock = { type: "h" | "p" | "code"; text: string };

interface TItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  mono: boolean;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export async function extractPdfBlocks(url: string): Promise<PdfBlock[]> {
  const doc = await pdfjsLib.getDocument(url).promise;
  const blocks: PdfBlock[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const styles: Record<string, any> = (content as any).styles || {};

    const items: TItem[] = [];
    for (const it of content.items as any[]) {
      if (typeof it.str !== "string") continue;
      const tr = it.transform as number[];
      const h = Math.hypot(tr[1], tr[3]) || it.height || 0;
      const fam = String(styles[it.fontName]?.fontFamily || it.fontName || "");
      const mono = /mono|courier|consol|menlo|typewriter/i.test(fam);
      items.push({ str: it.str, x: tr[4], y: tr[5], w: it.width || 0, h, mono });
    }
    if (!items.length) continue;

    // Group items into lines by vertical position.
    const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
    type Line = { y: number; h: number; items: TItem[] };
    const lines: Line[] = [];
    let line: Line | null = null;
    for (const it of sorted) {
      if (line && Math.abs(it.y - line.y) <= Math.max(2, line.h * 0.6)) {
        line.items.push(it);
        line.h = Math.max(line.h, it.h);
      } else {
        if (line) lines.push(line);
        line = { y: it.y, h: it.h, items: [it] };
      }
    }
    if (line) lines.push(line);

    const bodyH = median(lines.map((l) => l.h).filter(Boolean)) || 10;
    const pageMinX = Math.min(...items.map((i) => i.x));

    const lineText = (l: Line, indent: boolean): string => {
      const its = l.items.slice().sort((a, b) => a.x - b.x);
      let out = "";
      let prevEnd = its.length ? its[0].x : 0;
      for (let i = 0; i < its.length; i++) {
        const it = its[i];
        if (i > 0 && it.x - prevEnd > bodyH * 0.25 && !/\s$/.test(out) && !/^\s/.test(it.str)) out += " ";
        out += it.str;
        prevEnd = it.x + it.w;
      }
      out = out.replace(/\s+$/g, "");
      if (indent) {
        const pad = Math.max(0, Math.round((its[0].x - pageMinX) / (bodyH * 0.55)));
        out = " ".repeat(Math.min(pad, 40)) + out.replace(/^\s+/, "");
      }
      return out;
    };

    const monoRatio = (l: Line): number => {
      let mono = 0, total = 0;
      for (const it of l.items) { const n = it.str.length || 1; total += n; if (it.mono) mono += n; }
      return total ? mono / total : 0;
    };

    let para = "";
    let code: string[] = [];
    const flushPara = () => { const t = para.trim(); if (t) blocks.push({ type: "p", text: t }); para = ""; };
    const flushCode = () => { if (code.length) blocks.push({ type: "code", text: code.join("\n").replace(/\n+$/, "") }); code = []; };

    let prevY: number | null = null;
    for (const l of lines) {
      const isCode = monoRatio(l) > 0.6;
      const raw = lineText(l, isCode);
      if (!raw.trim()) { flushPara(); flushCode(); prevY = l.y; continue; }

      const gap = prevY != null ? prevY - l.y : 0;
      const bigGap = prevY != null && gap > bodyH * 1.8;
      const isHeading = !isCode && l.h > bodyH * 1.22 && raw.length < 90;

      if (isCode) {
        flushPara();
        if (bigGap) flushCode();
        code.push(raw);
      } else {
        flushCode();
        if (isHeading) {
          flushPara();
          blocks.push({ type: "h", text: raw.trim() });
        } else {
          if (bigGap) flushPara();
          para = para ? `${para} ${raw.trim()}` : raw.trim();
        }
      }
      prevY = l.y;
    }
    flushPara();
    flushCode();
  }

  // Drop lone page numbers left over from PDF page breaks.
  return blocks.filter((b) => !(b.type === "p" && /^\d{1,3}$/.test(b.text.trim())));
}

// Extract each page's text separately (one string per slide/page), so callers
// can keep page boundaries — e.g. to let an AI map lecture sections to slide
// page ranges. Lighter than extractPdfBlocks: just the page's text, collapsed.
export async function extractPdfPageTexts(url: string): Promise<string[]> {
  const doc = await pdfjsLib.getDocument(url).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const text = (content.items as any[])
      .map((it) => (typeof it.str === "string" ? it.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push(text);
  }
  return pages;
}

// Flatten blocks into plain text (headings underlined-ish, code fenced) for
// feeding to an AI prompt.
export function blocksToText(blocks: PdfBlock[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === "h") out.push(`\n## ${b.text}`);
    else if (b.type === "code") out.push("```\n" + b.text + "\n```");
    else out.push(b.text);
  }
  return out.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}
