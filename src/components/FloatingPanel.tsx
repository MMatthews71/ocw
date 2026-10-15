import { useRef, useState, type ReactNode } from "react";
import { getPanelLayout, savePanelLayout, type PanelLayout } from "../lib/notes";

const MIN_W = 200;
const MIN_H = 120;
const HEADER_H = 38;

// A floating panel the student can drag anywhere, resize, and collapse; its
// on-screen layout is autosaved under `layoutKey`. Pointer events so it works
// with both touch (Android) and mouse (desktop). The body is a render prop that
// receives the current inner size, so content (a textarea, a PDF, …) can fill it.
export function FloatingPanel({
  title,
  layoutKey,
  makeDefault,
  children,
}: {
  title: ReactNode;
  layoutKey: string;
  makeDefault: () => PanelLayout;
  children: (size: { w: number; h: number }) => ReactNode;
}) {
  const [layout, setLayout] = useState<PanelLayout>(() => {
    const saved = getPanelLayout(layoutKey);
    return saved ? { ...makeDefault(), ...saved } : makeDefault();
  });

  // layoutRef is updated SYNCHRONOUSLY in the move handlers (not via render) so
  // that persisting on pointerup always saves the latest value.
  const layoutRef = useRef(layout);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const resize = useRef<{ sx: number; sy: number; ow: number; oh: number } | null>(null);

  const apply = (next: PanelLayout) => { layoutRef.current = next; setLayout(next); };
  const persist = () => savePanelLayout(layoutKey, layoutRef.current);

  const vw = () => (typeof window !== "undefined" ? window.innerWidth : 360);
  const vh = () => (typeof window !== "undefined" ? window.innerHeight : 640);
  const clampX = (x: number) => Math.max(4, Math.min(x, vw() - 56));
  const clampY = (y: number) => Math.max(4, Math.min(y, vh() - HEADER_H));

  function headerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("[data-fp-btn]")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, ox: layoutRef.current.x, oy: layoutRef.current.y };
  }
  function headerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const x = clampX(drag.current.ox + (e.clientX - drag.current.sx));
    const y = clampY(drag.current.oy + (e.clientY - drag.current.sy));
    apply({ ...layoutRef.current, x, y });
  }
  function headerUp() { if (drag.current) { drag.current = null; persist(); } }

  function resizeDown(e: React.PointerEvent) {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resize.current = { sx: e.clientX, sy: e.clientY, ow: layoutRef.current.w, oh: layoutRef.current.h };
  }
  function resizeMove(e: React.PointerEvent) {
    if (!resize.current) return;
    const maxW = vw() - layoutRef.current.x - 8;
    const maxH = vh() - layoutRef.current.y - HEADER_H - 8;
    const w = Math.max(MIN_W, Math.min(resize.current.ow + (e.clientX - resize.current.sx), maxW));
    const h = Math.max(MIN_H, Math.min(resize.current.oh + (e.clientY - resize.current.sy), maxH));
    apply({ ...layoutRef.current, w, h });
  }
  function resizeUp() { if (resize.current) { resize.current = null; persist(); } }

  function toggleCollapse() {
    apply({ ...layoutRef.current, collapsed: !layoutRef.current.collapsed });
    persist();
  }

  const { x, y, w, h, collapsed } = layout;

  return (
    <div
      style={{
        position: "fixed",
        left: x,
        top: y,
        width: collapsed ? "auto" : w,
        zIndex: 1000,
        background: "var(--bg-elev)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        boxShadow: "0 8px 28px rgba(0, 0, 0, 0.5)",
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      {/* Header = drag handle */}
      <div
        onPointerDown={headerDown}
        onPointerMove={headerMove}
        onPointerUp={headerUp}
        onPointerCancel={headerUp}
        style={{
          height: HEADER_H,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "0 6px 0 12px",
          cursor: "move",
          touchAction: "none",
          background: "var(--bg-elev-2)",
          borderBottom: collapsed ? "none" : "1px solid var(--border)",
        }}
      >
        <span style={{ fontWeight: 560, fontSize: 13, color: "var(--muted)" }}>{title}</span>
        <button
          data-fp-btn
          onClick={toggleCollapse}
          aria-label={collapsed ? "Expand" : "Collapse"}
          style={{ border: "none", background: "transparent", color: "var(--muted)", fontSize: 16, lineHeight: 1, padding: "6px 8px", cursor: "pointer" }}
        >
          {collapsed ? "▢" : "—"}
        </button>
      </div>

      {!collapsed && (
        <div style={{ position: "relative" }}>
          <div style={{ height: h, overflow: "hidden" }}>{children({ w, h })}</div>
          {/* Resize handle (bottom-right corner) */}
          <div
            onPointerDown={resizeDown}
            onPointerMove={resizeMove}
            onPointerUp={resizeUp}
            onPointerCancel={resizeUp}
            aria-label="Resize"
            style={{
              position: "absolute", right: 0, bottom: 0, width: 22, height: 22,
              cursor: "nwse-resize", touchAction: "none",
              display: "flex", alignItems: "flex-end", justifyContent: "flex-end",
              color: "var(--muted)", padding: 2,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M11 4L4 11M11 8L8 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
