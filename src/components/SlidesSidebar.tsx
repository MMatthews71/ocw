import { useEffect, useState } from "react";
import { PdfViewer } from "./PdfViewer";

const KEY = "opencourse.slidessidebar.collapsed";

function readCollapsed(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
function writeCollapsed(v: boolean) {
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* ignore */ }
}

// A collapsible, scrollable left sidebar showing the WHOLE lecture deck, scrolled
// to the current section's first slide (`scrollTo`). Collapse state persists;
// collapsed, it tucks into a small tab on the left edge. Shown only while reading
// a lesson (content) page.
export function SlidesSidebar({ url, scrollTo }: { url: string; scrollTo?: number }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = (v: boolean) => { setCollapsed(v); writeCollapsed(v); };

  // While the sidebar is open, mark the body so the app shifts over to leave the
  // main content the remaining width. Always clear it when hidden/unmounted.
  useEffect(() => {
    document.body.classList.toggle("slides-open", !collapsed);
    return () => document.body.classList.remove("slides-open");
  }, [collapsed]);

  if (collapsed) {
    return (
      <button className="slides-tab" onClick={() => toggle(false)} aria-label="Show slides">
        <span>📑</span><span>›</span>
      </button>
    );
  }

  return (
    <aside className="slides-sidebar">
      <div className="slides-sidebar-head">
        <span>📑 Slides</span>
        <button onClick={() => toggle(true)} aria-label="Hide slides">‹</button>
      </div>
      <div className="slides-sidebar-body">
        <PdfViewer url={url} boxed fill snap={false} scrollToPage={scrollTo} />
      </div>
    </aside>
  );
}
