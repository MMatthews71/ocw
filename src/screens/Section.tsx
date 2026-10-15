import { useEffect, useState } from "react";
import type { CourseManifest } from "../types";
import { loadCourse } from "../lib/content";
import { setLast } from "../lib/progress";
import { Html, Loading, Screen, TopBar } from "../components/ui";

export function Section({ id, slug }: { id: string; slug: string }) {
  const [course, setCourse] = useState<CourseManifest | null | undefined>(undefined);

  useEffect(() => {
    loadCourse(id).then(setCourse);
    setLast(id, `#/c/${id}/s/${slug}`);
  }, [id, slug]);

  if (course === undefined) return <Loading />;
  const section = course?.sections.find((s) => s.slug === slug);

  if (!course || !section)
    return (
      <Screen>
        <TopBar title="Not found" back={`#/c/${id}`} />
        <p className="note">This page isn't available.</p>
      </Screen>
    );

  return (
    <Screen>
      <TopBar title={section.title} back={`#/c/${id}`} />
      <div style={{ padding: "16px 16px 0" }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>{section.title}</h1>
      </div>
      {section.contentHtml ? (
        <Html html={section.contentHtml} />
      ) : (
        <p className="note">No content.</p>
      )}
    </Screen>
  );
}
