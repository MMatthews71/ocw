import { useEffect } from "react";
import { useRoute } from "./lib/router";
import { Library } from "./screens/Library";
import { Course } from "./screens/Course";
import { Lessons } from "./screens/Lessons";
import { Lesson } from "./screens/Lesson";
import { Section } from "./screens/Section";
import { Resource } from "./screens/Resource";

export function App() {
  const route = useRoute();

  // Open external (http/https) links in the system browser instead of
  // navigating the app's WebView away from itself. In-app hash links (#/...)
  // are handled normally by the router.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href") || "";
      if (/^https?:\/\//i.test(href)) {
        e.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  switch (route.name) {
    case "library":
      return <Library />;
    case "course":
      return <Course id={route.id} />;
    case "lessons":
      return <Lessons id={route.id} />;
    case "lesson":
      return <Lesson id={route.id} n={route.n} />;
    case "section":
      return <Section id={route.id} slug={route.slug} />;
    case "resource":
      return <Resource id={route.id} slug={route.slug} />;
    default:
      return (
        <div className="screen pad">
          <p>Page not found.</p>
          <a className="btn" href="#/">Back to library</a>
        </div>
      );
  }
}
