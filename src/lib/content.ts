import type { CourseCard, CourseManifest } from "../types";

// Base href for bundled content. Vite is configured with base "./", so content
// lives next to index.html at runtime.
const BASE = "content";

const manifestCache = new Map<string, CourseManifest>();
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
