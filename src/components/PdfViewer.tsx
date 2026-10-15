import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// Renders a bundled PDF with pdf.js. Pages render lazily as they scroll into
// view so large decks stay responsive on a phone. Fully offline.
//
// `boxed`: show the deck inside a fixed-height scroll area sized to one slide
// (scroll/snap through slides), with no toolbar.
export function PdfViewer({
  url,
  boxed = false,
  fill = false,
  snap = true,
  firstPage,
  lastPage,
  scrollToPage,
}: {
  url: string;
  boxed?: boolean;
  fill?: boolean; // with boxed: fill the parent's height instead of one slide
  snap?: boolean; // with boxed: snap each slide into view (false = free scroll)
  firstPage?: number; // 1-based; render only this page range when given
  lastPage?: number;
  scrollToPage?: number; // with boxed: scroll so this page is at the top (whole-deck view)
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [numPages, setNumPages] = useState(0);
  const [boxH, setBoxH] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let observer: IntersectionObserver | null = null;

    (async () => {
      try {
        const doc = await pdfjsLib.getDocument(url).promise;
        if (cancelled) return;

        // Page range to render (whole doc unless a range was given).
        const from = Math.max(1, Math.min(firstPage ?? 1, doc.numPages));
        const to = Math.max(from, Math.min(lastPage ?? doc.numPages, doc.numPages));
        setNumPages(to - from + 1);

        const container = containerRef.current;
        if (!container) return;
        const width = Math.min(container.clientWidth || window.innerWidth, 900);

        // Height of one slide (from the first rendered page's aspect ratio) for boxed mode.
        let slideH = Math.round(width * 1.294); // letter default
        if (boxed) {
          const p1 = await doc.getPage(from);
          const vp = p1.getViewport({ scale: 1 });
          slideH = Math.round(width * (vp.height / vp.width));
          if (!cancelled) setBoxH(slideH);
        }
        if (cancelled) return;
        setStatus("ready");

        container.innerHTML = "";
        const rendered = new Set<number>();

        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const canvas = entry.target as HTMLCanvasElement;
              const pageNum = Number(canvas.dataset.page);
              if (entry.isIntersecting && !rendered.has(pageNum)) {
                rendered.add(pageNum);
                renderPage(doc, pageNum, canvas, width);
              }
            }
          },
          { root: boxed ? container : null, rootMargin: boxed ? "300px 0px" : "600px 0px" }
        );

        for (let i = from; i <= to; i++) {
          const canvas = document.createElement("canvas");
          canvas.dataset.page = String(i);
          canvas.width = width;
          canvas.height = boxed ? slideH : Math.round(width * 1.294);
          canvas.style.minHeight = boxed ? "" : "120px";
          canvas.style.display = "block";
          if (boxed) {
            if (snap) canvas.style.scrollSnapAlign = "start";
            canvas.style.height = slideH + "px";
          }
          container.appendChild(canvas);
          observer.observe(canvas);
        }

        // Land on the current section's slide (heights are known from slideH,
        // so this is correct even before the pages lazily render).
        if (boxed && scrollToPage && scrollToPage > from) {
          const GAP = 10; // matches .pdf-pages gap
          container.scrollTop = (scrollToPage - from) * (slideH + GAP);
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [url, boxed, firstPage, lastPage]);

  // Re-scroll to the target page when the section changes (without rebuilding).
  useEffect(() => {
    const container = containerRef.current;
    if (!boxed || !scrollToPage || !container) return;
    const el = container.querySelector<HTMLElement>(`canvas[data-page="${scrollToPage}"]`);
    if (el) container.scrollTop += el.getBoundingClientRect().top - container.getBoundingClientRect().top;
  }, [scrollToPage, boxed]);

  async function renderPage(
    doc: pdfjsLib.PDFDocumentProxy,
    pageNum: number,
    canvas: HTMLCanvasElement,
    cssWidth: number
  ) {
    const page = await doc.getPage(pageNum);
    const unscaled = page.getViewport({ scale: 1 });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = (cssWidth / unscaled.width) * dpr;
    const viewport = page.getViewport({ scale });
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = cssWidth + "px";
    canvas.style.height = Math.floor(viewport.height / dpr) + "px";
    canvas.style.minHeight = "";
    await page.render({ canvasContext: ctx, viewport }).promise;
  }

  if (boxed) {
    return (
      <>
        {status === "loading" && <div className="center"><div className="spinner" /></div>}
        {status === "error" && <p className="note">Couldn't render these slides.</p>}
        <div
          className="pdf-pages"
          ref={containerRef}
          style={{
            height: fill ? "100%" : (boxH ?? 260),
            overflowY: "auto",
            scrollSnapType: snap ? "y mandatory" : "none",
            borderRadius: fill ? 0 : 10,
            border: fill ? "none" : "1px solid var(--border)",
            background: "var(--bg-elev-2)",
          }}
        />
      </>
    );
  }

  return (
    <>
      <div className="pdf-toolbar">
        <span>{status === "ready" ? `${numPages} page${numPages === 1 ? "" : "s"}` : ""}</span>
        <a className="btn secondary" href={url} target="_blank" rel="noreferrer">Open file</a>
      </div>
      {status === "loading" && <div className="center"><div className="spinner" /></div>}
      {status === "error" && (
        <p className="note">Couldn't render this PDF in-app. Use “Open file” above.</p>
      )}
      <div className="pdf-pages" ref={containerRef} />
    </>
  );
}
