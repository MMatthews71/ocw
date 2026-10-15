import { useEffect, useState } from "react";

// Minimal hash router. Routes used by the app:
//   #/                     -> Library
//   #/c/:id                -> Course home
//   #/c/:id/s/:slug        -> Section (page or gallery)
//   #/c/:id/r/:slug        -> Resource (video / pdf / code / ...)

export type Route =
  | { name: "library" }
  | { name: "course"; id: string }
  | { name: "lessons"; id: string }
  | { name: "lesson"; id: string; n: number }
  | { name: "section"; id: string; slug: string }
  | { name: "resource"; id: string; slug: string }
  | { name: "notfound" };

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#/, "").replace(/^\/+/, "");
  const parts = clean.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { name: "library" };
  if (parts[0] === "c" && parts[1]) {
    const id = parts[1];
    if (parts.length === 2) return { name: "course", id };
    if (parts[2] === "lessons") return { name: "lessons", id };
    if (parts[2] === "lesson" && parts[3]) return { name: "lesson", id, n: parseInt(parts[3], 10) || 1 };
    if (parts[2] === "s" && parts[3]) return { name: "section", id, slug: parts[3] };
    if (parts[2] === "r" && parts[3]) return { name: "resource", id, slug: parts[3] };
  }
  return { name: "notfound" };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function navigate(to: string) {
  window.location.hash = to;
}
