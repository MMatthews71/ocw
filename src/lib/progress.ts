// Lightweight per-course progress + "continue" tracking, stored in localStorage.
// Wrapped in try/catch so it degrades gracefully if storage is unavailable.

const KEY = "opencourse.progress.v1";

export interface VideoPos {
  t: number; // seconds watched to
  d: number; // total duration (seconds)
}

interface Store {
  // courseId -> set of completed resource slugs
  done: Record<string, string[]>;
  // courseId -> last visited route hash
  last: Record<string, string>;
  // courseId -> (resource slug -> playback position)
  pos: Record<string, Record<string, VideoPos>>;
}

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Store>;
      return {
        done: parsed.done || {},
        last: parsed.last || {},
        pos: parsed.pos || {},
      };
    }
  } catch {
    /* ignore */
  }
  return { done: {}, last: {}, pos: {} };
}

function write(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function getDone(courseId: string): Set<string> {
  return new Set(read().done[courseId] || []);
}

export function isDone(courseId: string, slug: string): boolean {
  return getDone(courseId).has(slug);
}

export function toggleDone(courseId: string, slug: string): boolean {
  const s = read();
  const set = new Set(s.done[courseId] || []);
  if (set.has(slug)) set.delete(slug);
  else set.add(slug);
  s.done[courseId] = [...set];
  write(s);
  return set.has(slug);
}

export function setDone(courseId: string, slug: string, value: boolean) {
  const s = read();
  const set = new Set(s.done[courseId] || []);
  if (value) set.add(slug);
  else set.delete(slug);
  s.done[courseId] = [...set];
  write(s);
}

export function getPos(courseId: string, slug: string): VideoPos | null {
  return read().pos[courseId]?.[slug] || null;
}

export function setPos(courseId: string, slug: string, t: number, d: number) {
  const s = read();
  if (!s.pos[courseId]) s.pos[courseId] = {};
  s.pos[courseId][slug] = { t, d };
  write(s);
}

export function setLast(courseId: string, routeHash: string) {
  const s = read();
  s.last[courseId] = routeHash;
  write(s);
}

export function getLast(courseId: string): string | null {
  return read().last[courseId] || null;
}
