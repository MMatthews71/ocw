import { useState } from "react";
import { getNote, saveNote, type PanelLayout } from "../lib/notes";
import { FloatingPanel } from "./FloatingPanel";

const LAYOUT_KEY = "opencourse.noteslayout.v1";

function defaultLayout(): PanelLayout {
  const vw = typeof window !== "undefined" ? window.innerWidth : 360;
  const vh = typeof window !== "undefined" ? window.innerHeight : 640;
  const w = Math.min(300, vw - 24);
  return { x: Math.max(12, vw - w - 12), y: Math.max(12, vh - 300), w, h: 220, collapsed: true };
}

// A floating notepad: autosaves the student's text (per course + lesson) and its
// on-screen layout. Drag / resize / collapse handled by FloatingPanel.
export function FloatingNotes({ courseId, n }: { courseId: string; n: number }) {
  const [text, setText] = useState(() => getNote(courseId, n));

  function onText(v: string) {
    setText(v);
    saveNote(courseId, n, v);
  }

  return (
    <FloatingPanel title="📝 Notes" layoutKey={LAYOUT_KEY} makeDefault={defaultLayout}>
      {({ h }) => (
        <textarea
          value={text}
          onChange={(e) => onText(e.target.value)}
          placeholder="Write your notes for this lecture…"
          spellCheck
          style={{
            width: "100%", height: h, boxSizing: "border-box", padding: 10,
            border: "none", outline: "none", resize: "none",
            background: "transparent", color: "var(--text)", font: "14px/1.5 inherit",
          }}
        />
      )}
    </FloatingPanel>
  );
}
