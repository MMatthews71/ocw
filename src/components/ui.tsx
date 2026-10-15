import type { ReactNode } from "react";
import type { ResourceKind } from "../types";

export function TopBar({ title, back }: { title: string; back: string }) {
  return (
    <div className="topbar">
      <a className="back" href={back} aria-label="Back">‹</a>
      <div className="title">{title}</div>
    </div>
  );
}

export function Loading() {
  return (
    <div className="center">
      <div className="spinner" />
    </div>
  );
}

export function kindIcon(kind: ResourceKind): string {
  switch (kind) {
    case "video": return "▶";
    case "pdf": return "📄";
    case "code": return "{ }";
    case "archive": return "🗜";
    case "image": return "🖼";
    default: return "📎";
  }
}

export function sectionIcon(slug: string, kind: string): string {
  if (kind === "gallery") return "▶";
  if (/syllab/i.test(slug)) return "📋";
  if (/assign|problem|pset/i.test(slug)) return "✎";
  if (/read/i.test(slug)) return "📚";
  if (/slide|file|lecture/i.test(slug)) return "📄";
  if (/software/i.test(slug)) return "⚙";
  if (/insight|instructor/i.test(slug)) return "💡";
  return "•";
}

// Render pre-sanitized OCW HTML (already produced by OCW + rewritten by the
// importer). Anchor links use the app's hash routes or external https URLs,
// both handled globally in App.
export function Html({ html }: { html: string }) {
  return <div className="article" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Screen({ children }: { children: ReactNode }) {
  return <div className="screen">{children}</div>;
}
