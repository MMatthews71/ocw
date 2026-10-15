import { useEffect, useState } from "react";
import type { CourseManifest, CourseResource, LessonItem } from "../types";
import { loadCourse } from "../lib/content";
import { countableSlugs, lessonProgress } from "../lib/lessons";
import { isDone, setDone, setLast, toggleDone } from "../lib/progress";
import { Html, Loading, Screen, TopBar, kindIcon } from "../components/ui";
import { PdfViewer } from "../components/PdfViewer";
import { CodeViewer } from "../components/CodeViewer";
import { PracticePanel } from "../components/PracticePanel";

const filesUrl = (id: string, name: string) => `content/${id}/files/${name}`;

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const h = Math.floor(m / 60);
  const mm = h > 0 ? String(m % 60).padStart(2, "0") : String(m % 60);
  return (h > 0 ? `${h}:` : "") + `${mm}:${String(r).padStart(2, "0")}`;
}

export function Lesson({ id, n }: { id: string; n: number }) {
  const [course, setCourse] = useState<CourseManifest | null | undefined>(undefined);
  const [, setTick] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const refresh = () => setTick((t) => t + 1);

  useEffect(() => {
    loadCourse(id).then(setCourse);
  }, [id]);

  const lesson = course?.lessons?.find((l) => l.n === n) || null;

  useEffect(() => {
    if (!lesson) return;
    setLast(id, `#/c/${id}/lesson/${n}`);
    setExpanded(null);
  }, [id, n, lesson?.video]);

  if (course === undefined) return <Loading />;
  if (!course || !lesson)
    return (
      <Screen>
        <TopBar title="Lesson" back={`#/c/${id}/lessons`} />
        <p className="note">This lesson isn't available.</p>
      </Screen>
    );

  const activeLesson = lesson; // non-null past the guard above
  const total = course.lessons.length;
  const prev = lesson.n > 1 ? lesson.n - 1 : null;
  const next = lesson.n < total ? lesson.n + 1 : null;
  const prog = lessonProgress(id, lesson);
  const pct = prog.total ? Math.round((prog.doneCount / prog.total) * 100) : 0;

  function markLessonComplete() {
    for (const s of countableSlugs(activeLesson)) setDone(id, s, true);
    refresh();
  }

  return (
    <Screen>
      <TopBar title={`Lesson ${lesson.n} of ${total}`} back={`#/c/${id}/lessons`} />

      <div className="course-head" style={{ paddingBottom: 0 }}>
        <div className="num" style={{ color: "var(--accent)", fontWeight: 600, fontSize: 12 }}>Lesson {lesson.n}</div>
        <h1 style={{ margin: "3px 0 0" }}>{lesson.title}</h1>
      </div>

      {/* Practice: per-section written lesson + quiz, or one lecture quiz */}
      <PracticePanel
        key={activeLesson.n}
        course={course}
        lesson={activeLesson}
      />
    </Screen>
  );
}

function ItemCard({
  id,
  item,
  res,
  open,
  onToggleOpen,
  onDoneChange,
}: {
  id: string;
  item: LessonItem;
  res: CourseResource | undefined;
  open: boolean;
  onToggleOpen: () => void;
  onDoneChange: () => void;
}) {
  const [done, setDoneState] = useState(isDone(id, item.slug));

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    setDoneState(toggleDone(id, item.slug));
    onDoneChange();
  }

  return (
    <div style={{ background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
      <div className="row" style={{ border: "none", borderRadius: 0, cursor: "pointer" }} onClick={onToggleOpen}>
        <div className="ico" style={done ? { borderColor: "var(--good)", color: "var(--good)" } : undefined}>
          {kindIcon(item.kind)}
        </div>
        <div className="rtext">
          <div className="rtitle">{item.label}</div>
          <div className="rsub">{labelForKind(item.kind)}{done ? " · done ✓" : ""}</div>
        </div>
        <div className="chev">{open ? "⌄" : "›"}</div>
      </div>
      {open && res && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 6 }}>
          <ItemBody id={id} res={res} />
          <div className="btn-row" style={{ paddingTop: 6 }}>
            <button className={`btn ${done ? "secondary" : ""}`} onClick={toggle}>
              {done ? "✓ Done" : "Mark done"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function labelForKind(kind: string): string {
  switch (kind) {
    case "pdf": return "Slides / notes (PDF)";
    case "code": return "Code file";
    case "archive": return "Code & data (ZIP)";
    case "image": return "Image";
    default: return "File";
  }
}

function ItemBody({ id, res }: { id: string; res: CourseResource }) {
  switch (res.kind) {
    case "pdf":
      return <PdfViewer url={filesUrl(id, res.file!)} />;
    case "code":
      return <CodeViewer url={filesUrl(id, res.file!)} title={res.file!} />;
    case "image":
      return (
        <div style={{ padding: 12 }}>
          <img src={filesUrl(id, res.file!)} alt={res.title} style={{ width: "100%", borderRadius: 8 }} />
        </div>
      );
    case "archive":
      return (
        <div style={{ padding: "4px 0" }}>
          {res.description && <Html html={res.description} />}
          <div className="btn-row">
            <a className="btn" href={filesUrl(id, res.file!)} target="_blank" rel="noreferrer" download>
              ⬇ Download {res.file}
            </a>
          </div>
          <p className="note">ZIP of code/data files — download, then open with a file manager.</p>
        </div>
      );
    default:
      return (
        <div>
          {res.description && <Html html={res.description} />}
          {res.file && (
            <div className="btn-row">
              <a className="btn secondary" href={filesUrl(id, res.file)} target="_blank" rel="noreferrer" download>
                Open file
              </a>
            </div>
          )}
        </div>
      );
  }
}
