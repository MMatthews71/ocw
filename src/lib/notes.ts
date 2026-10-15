// Per-lesson personal notes the student writes in the floating notepad, plus
// the notepad's on-screen layout (position / size / collapsed), all persisted
// to localStorage.

const KEY = "opencourse.notes.v1";

function readNotes(): Record<string, Record<string, string>> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {};
}

function writeNotes(s: Record<string, Record<string, string>>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function getNote(courseId: string, n: number): string {
  return readNotes()[courseId]?.[String(n)] || "";
}

export function saveNote(courseId: string, n: number, text: string) {
  const s = readNotes();
  if (!s[courseId]) s[courseId] = {};
  if (text) s[courseId][String(n)] = text;
  else delete s[courseId][String(n)];
  writeNotes(s);
}

// On-screen layout (position / size / collapsed) for a floating panel, stored
// per panel under its own localStorage key.
export interface PanelLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  collapsed: boolean;
}

export function getPanelLayout(key: string): PanelLayout | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return null;
}

export function savePanelLayout(key: string, l: PanelLayout) {
  try {
    localStorage.setItem(key, JSON.stringify(l));
  } catch {
    /* ignore */
  }
}
