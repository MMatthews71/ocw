import { useEffect, useRef } from "react";

// Loads the YouTube IFrame Player API once and resolves when ready.
let apiPromise: Promise<any> | null = null;
function loadApi(): Promise<any> {
  const w = window as any;
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (w.YT && w.YT.Player) return resolve(w.YT);
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(w.YT);
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return apiPromise;
}

// YouTube player that resumes from `startAt` seconds and reports playback
// position via onProgress (called periodically while playing and on pause).
export function YouTube({
  videoId,
  startAt,
  endAt,
  onProgress,
  seekRef,
}: {
  videoId: string;
  startAt: number;
  endAt?: number; // stop playback at this second (for a section clip)
  onProgress?: (t: number, d: number) => void;
  // Parent sets seekRef.current and calls it to jump the video to a timestamp.
  seekRef?: React.MutableRefObject<((t: number) => void) | null>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;
  // Keep the latest resume position in a ref: the player is created inside an
  // async callback that runs after the parent has set `startAt` from storage, so
  // reading the prop directly would use the stale initial value (0).
  const startAtRef = useRef(startAt);
  startAtRef.current = startAt;

  useEffect(() => {
    let cancelled = false;
    let player: any = null;
    let timer: number | undefined;

    const report = () => {
      try {
        if (player?.getCurrentTime && player?.getDuration) {
          const t = player.getCurrentTime() || 0;
          const d = player.getDuration() || 0;
          if (d > 0) progressRef.current?.(t, d);
        }
      } catch {
        /* ignore */
      }
    };

    loadApi().then((YT) => {
      if (cancelled || !hostRef.current) return;
      const resume = startAtRef.current > 5 ? Math.floor(startAtRef.current) : 0;
      const playerVars: any = { rel: 0, modestbranding: 1, playsinline: 1, start: resume };
      if (endAt && endAt > resume) playerVars.end = Math.ceil(endAt);
      player = new YT.Player(hostRef.current, {
        videoId,
        host: "https://www.youtube-nocookie.com",
        playerVars,
        events: {
          onStateChange: (e: any) => {
            // 1 = PLAYING
            if (e.data === 1) {
              window.clearInterval(timer);
              timer = window.setInterval(report, 5000);
            } else {
              window.clearInterval(timer);
              report(); // capture position on pause / buffer / end
            }
          },
        },
      });
      if (seekRef) {
        seekRef.current = (t: number) => {
          try {
            player?.seekTo?.(Math.max(0, Math.floor(t)), true);
            player?.playVideo?.();
          } catch {
            /* ignore */
          }
        };
      }
    });

    return () => {
      cancelled = true;
      if (seekRef) seekRef.current = null;
      window.clearInterval(timer);
      report();
      try {
        player?.destroy?.();
      } catch {
        /* ignore */
      }
    };
    // Re-create only when the video changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  return (
    <div className="video-frame">
      <div ref={hostRef} />
    </div>
  );
}
