import { useEffect, useState } from "react";
import type { CourseManifest, CourseResource } from "../types";
import { loadCourse } from "../lib/content";
import { getPos, isDone, setDone, setLast, setPos, toggleDone } from "../lib/progress";
import { Html, Loading, Screen, TopBar } from "../components/ui";
import { PdfViewer } from "../components/PdfViewer";
import { CodeViewer } from "../components/CodeViewer";
import { YouTube } from "../components/YouTube";

const filesUrl = (id: string, name: string) => `content/${id}/files/${name}`;

export function Resource({ id, slug }: { id: string; slug: string }) {
  const [course, setCourse] = useState<CourseManifest | null | undefined>(undefined);
  const [done, setDoneState] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [startAt, setStartAt] = useState(0);
  const [watched, setWatched] = useState<{ t: number; d: number } | null>(null);

  useEffect(() => {
    loadCourse(id).then(setCourse);
    setLast(id, `#/c/${id}/r/${slug}`);
    setDoneState(isDone(id, slug));
    setShowTranscript(false);
    const pos = getPos(id, slug);
    setStartAt(pos ? pos.t : 0);
    setWatched(pos);
  }, [id, slug]);

  if (course === undefined) return <Loading />;
  const r = course?.resources[slug];
  if (!course || !r)
    return (
      <Screen>
        <TopBar title="Not found" back={`#/c/${id}`} />
        <p className="note">This item isn't available.</p>
      </Screen>
    );

  function markToggle() {
    setDoneState(toggleDone(id, slug));
  }

  // Called periodically while a video plays: persist position and auto-complete.
  function onVideoProgress(t: number, d: number) {
    setPos(id, slug, t, d);
    setWatched({ t, d });
    if (d > 0 && t / d >= 0.9 && !isDone(id, slug)) {
      setDone(id, slug, true);
      setDoneState(true);
    }
  }

  return (
    <Screen>
      <TopBar title={r.title} back={`#/c/${id}`} />
      <div style={{ padding: "14px 16px 0" }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>{r.title}</h1>
      </div>

      <ResourceBody
        id={id}
        r={r}
        showTranscript={showTranscript}
        setShowTranscript={setShowTranscript}
        startAt={startAt}
        watched={watched}
        onVideoProgress={onVideoProgress}
      />

      {(r.kind === "video" || r.kind === "pdf" || r.kind === "code") && (
        <div className="btn-row" style={{ paddingTop: 12 }}>
          <button className={`btn ${done ? "secondary" : ""}`} onClick={markToggle}>
            {done ? "✓ Completed" : "Mark complete"}
          </button>
        </div>
      )}
    </Screen>
  );
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const h = Math.floor(m / 60);
  const mm = h > 0 ? String(m % 60).padStart(2, "0") : String(m % 60);
  return (h > 0 ? `${h}:` : "") + `${mm}:${String(r).padStart(2, "0")}`;
}

function ResourceBody({
  id,
  r,
  showTranscript,
  setShowTranscript,
  startAt,
  watched,
  onVideoProgress,
}: {
  id: string;
  r: CourseResource;
  showTranscript: boolean;
  setShowTranscript: (v: boolean) => void;
  startAt: number;
  watched: { t: number; d: number } | null;
  onVideoProgress: (t: number, d: number) => void;
}) {
  switch (r.kind) {
    case "video": {
      const pct = watched && watched.d > 0 ? Math.min(100, Math.round((watched.t / watched.d) * 100)) : 0;
      return (
        <>
          <div style={{ padding: "12px 16px 0" }}>
            {r.youtubeId ? (
              <YouTube videoId={r.youtubeId} startAt={startAt} onProgress={onVideoProgress} />
            ) : (
              <p className="note">No video available.</p>
            )}
          </div>
          {watched && watched.d > 0 && (
            <div style={{ padding: "10px 16px 0" }}>
              <div className="progress-bar"><span style={{ width: `${pct}%` }} /></div>
              <div className="progress-label">
                {pct >= 90 ? "Watched ✓" : `Resumes at ${fmt(watched.t)} · ${pct}% watched`}
              </div>
            </div>
          )}
          <div className="btn-row" style={{ paddingTop: 12 }}>
            {r.archiveUrl && (
              <a className="btn secondary" href={r.archiveUrl} target="_blank" rel="noreferrer">
                ⬇ Download MP4 (offline)
              </a>
            )}
            {r.transcript && (
              <button className="btn secondary" onClick={() => setShowTranscript(!showTranscript)}>
                {showTranscript ? "Hide transcript" : "Transcript"}
              </button>
            )}
          </div>
          {r.description && <Html html={r.description} />}
          {!r.youtubeId && (
            <p className="note">Videos stream over the internet. Use “Download MP4” to save for offline.</p>
          )}
          {showTranscript && r.transcript && (
            <div style={{ marginTop: 8 }}>
              <PdfViewer url={filesUrl(id, r.transcript)} />
            </div>
          )}
        </>
      );
    }

    case "pdf":
      return (
        <>
          {r.description && <Html html={r.description} />}
          <PdfViewer url={filesUrl(id, r.file!)} />
        </>
      );

    case "code":
      return (
        <>
          {r.description && <Html html={r.description} />}
          <CodeViewer url={filesUrl(id, r.file!)} title={r.file!} />
        </>
      );

    case "image":
      return (
        <div style={{ padding: 16 }}>
          {r.description && <Html html={r.description} />}
          <img src={filesUrl(id, r.file!)} alt={r.title} style={{ width: "100%", borderRadius: 10 }} />
        </div>
      );

    case "archive":
      return (
        <div style={{ padding: "4px 0" }}>
          {r.description && <Html html={r.description} />}
          <div className="btn-row">
            <a className="btn" href={filesUrl(id, r.file!)} target="_blank" rel="noreferrer" download>
              ⬇ Download {r.file}
            </a>
          </div>
          <p className="note">This is a ZIP of code/data files. Download it, then open with a file manager.</p>
        </div>
      );

    default:
      return (
        <>
          {r.description && <Html html={r.description} />}
          {r.file && (
            <div className="btn-row">
              <a className="btn secondary" href={filesUrl(id, r.file)} target="_blank" rel="noreferrer" download>
                Open file
              </a>
            </div>
          )}
        </>
      );
  }
}
