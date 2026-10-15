import { useEffect, useState } from "react";
import type { CourseManifest } from "../types";
import { loadCourse } from "../lib/content";
import { practiceProgress } from "../lib/lessons";
import { Loading, Screen, TopBar } from "../components/ui";

export function Lessons({ id }: { id: string }) {
  const [course, setCourse] = useState<CourseManifest | null | undefined>(undefined);

  useEffect(() => {
    loadCourse(id).then(setCourse);
  }, [id]);

  if (course === undefined) return <Loading />;
  if (!course)
    return (
      <Screen>
        <TopBar title="Lessons" back={`#/c/${id}`} />
        <p className="note">Couldn't load this course.</p>
      </Screen>
    );

  const lessons = course.lessons || [];

  return (
    <Screen>
      <TopBar title={course.title} back={`#/c/${id}`} />
      <div className="list" style={{ marginTop: 12 }}>
        {lessons.map((l) => {
          const pct = Math.round(practiceProgress(id, l.n) * 100);
          return (
            <a className="row" key={l.n} href={`#/c/${id}/lesson/${l.n}`}>
              <div className="rtext">
                <div className="rtitle">Lesson {l.n}: {l.title}</div>
                <div className="lesson-prog" aria-label={`${pct}% complete`}>
                  <span style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="chev">›</div>
            </a>
          );
        })}
      </div>

    </Screen>
  );
}
