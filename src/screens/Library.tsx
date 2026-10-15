import { useEffect, useState } from "react";
import type { CourseCard } from "../types";
import { loadLibrary } from "../lib/content";
import { Loading, Screen } from "../components/ui";

export function Library() {
  const [courses, setCourses] = useState<CourseCard[] | null>(null);

  useEffect(() => {
    loadLibrary().then(setCourses);
  }, []);

  if (courses === null) return <Loading />;

  return (
    <Screen>
      <div className="hero">
        <h1>OpenCourse</h1>
        <p>{courses.length} course{courses.length === 1 ? "" : "s"} · offline library</p>
      </div>

      {courses.length === 0 ? (
        <div className="empty">
          <p>No courses yet.</p>
          <p>
            Download a course folder from MIT OpenCourseWare, then run<br />
            <code>npm run import -- &lt;path-to-folder&gt;</code><br />
            and rebuild.
          </p>
        </div>
      ) : (
        <div className="course-grid">
          {courses.map((c) => (
            <a className="card" key={c.id} href={`#/c/${c.id}`}>
              {c.image ? (
                <img className="thumb" src={c.image} alt="" loading="lazy" />
              ) : (
                <div className="thumb" />
              )}
              <div className="body">
                {c.number && <div className="num">{c.number}</div>}
                <div className="ctitle">{c.title}</div>
                <div className="meta">
                  {[c.term, c.year].filter(Boolean).join(" ")}
                  {c.instructors[0] ? ` · ${c.instructors[0]}` : ""}
                </div>
                {c.topics.length > 0 && (
                  <div className="chips">
                    {c.topics.slice(0, 2).map((t) => (
                      <span className="chip" key={t}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
    </Screen>
  );
}
