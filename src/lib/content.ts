import type { CourseCard, CourseManifest } from "../types";
import type { ProblemSet } from "./problemset";

// Base href for bundled content. Vite is configured with base "./", so content
// lives next to index.html at runtime.
const BASE = "content";

const manifestCache = new Map<string, CourseManifest>();
const bundledLessonsCache = new Map<string, Record<string, ProblemSet>>();
let libraryCache: CourseCard[] | null = null;

export async function loadLibrary(): Promise<CourseCard[]> {
  if (libraryCache) return libraryCache;
  try {
    const res = await fetch(`${BASE}/index.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    libraryCache = (await res.json()) as CourseCard[];
  } catch {
    libraryCache = [];
  }
  return libraryCache;
}

export async function loadCourse(id: string): Promise<CourseManifest | null> {
  if (manifestCache.has(id)) return manifestCache.get(id)!;
  try {
    const res = await fetch(`${BASE}/${id}/manifest.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const manifest = (await res.json()) as CourseManifest;
    manifestCache.set(id, manifest);
    return manifest;
  } catch {
    return null;
  }
}

// Resolve a bundled file (already stored as "content/<id>/files/<name>").
export function fileUrl(pathFromManifest: string): string {
  return pathFromManifest;
}

// Lessons (the AI-generated written lessons + quizzes) that have been committed
// into the app's bundled content at content/<id>/lessons.json — a map of lesson
// number -> ProblemSet. Unlike the per-browser copies in localStorage, these
// ship with the app, so they survive a cleared browser and reach every device.
// Fetched once per course and cached; returns {} when a course has none yet.
export async function loadBundledLessons(id: string): Promise<Record<string, ProblemSet>> {
  if (bundledLessonsCache.has(id)) return bundledLessonsCache.get(id)!;
  let map: Record<string, ProblemSet> = {};
  try {
    const res = await fetch(`${BASE}/${id}/lessons.json`, { cache: "no-store" });
    if (res.ok) {
      const parsed = await res.json();
      if (parsed && typeof parsed === "object") map = parsed as Record<string, ProblemSet>;
    }
  } catch {
    /* no bundled lessons for this course */
  }
  bundledLessonsCache.set(id, map);
  return map;
}

// The permanently-saved lesson for one lesson number, or null if none is bundled.
export async function loadBundledLesson(id: string, n: number): Promise<ProblemSet | null> {
  const map = await loadBundledLessons(id);
  return map[String(n)] || null;
}
