import { useEffect, useState } from "react";
import type { CourseManifest } from "../types";
import { loadCourse } from "../lib/content";
import { Loading, Screen, TopBar } from "../components/ui";

export function Course({ id }: { id: string }) {
  const [course, setCourse] = useState<CourseManifest | null | undefined>(undefined);

  useEffect(() => {
    loadCourse(id).then(setCourse);
  }, [id]);

  if (course === undefined) return <Loading />;
  if (course === null)
    return (
      <Screen>
        <div className="empty">
          <p>Couldn't load this course.</p>
          <a className="btn" href="#/">Back to library</a>
        </div>
      </Screen>
    );

  const lessons = course.lessons || [];

  return (
    <Screen>
      <TopBar title={course.title} back="#/" />

      <div className="course-head">
        {course.image && <img src={course.image} alt="" />}
        {course.number && <div className="num" style={{ color: "var(--accent)", fontWeight: 600, fontSize: 12, marginTop: 14 }}>{course.number}</div>}
        <h1>{course.title}</h1>
        <div className="sub">
          {[course.term, course.year, course.level].filter(Boolean).join(" · ")}
        </div>
        <div className="sub" style={{ marginTop: 4 }}>{course.instructors.join(", ")}</div>
      </div>

      {lessons.length > 0 && (
        <>
          <div className="section-label">Learn</div>
          <div className="list">
            <a className="row" href={`#/c/${id}/lessons`}>
              <div className="ico" style={{ color: "var(--accent)" }}>▦</div>
              <div className="rtext">
                <div className="rtitle">Lessons</div>
                <div className="rsub">{lessons.length} lessons · written lessons + quizzes, in order</div>
              </div>
              <div className="chev">›</div>
            </a>
          </div>
        </>
      )}
    </Screen>
  );
}
