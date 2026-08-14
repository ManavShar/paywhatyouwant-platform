"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Preview player for music and podcasts.
 *
 * Written once and used in two places — the product page and the embeddable
 * widget — because they must behave identically. A blog visitor hearing the
 * track through an embed is having the same first experience as someone on
 * the site, and that experience is what a payment decision rests on.
 *
 * Plain <audio> under the hood, so the browser handles HTTP range requests
 * and seeking works without downloading the whole file first.
 */
export function AudioPlayer({
  src,
  title,
  compact = false,
  className,
}: {
  src: string;
  title?: string;
  /** Tighter layout for the embed, where vertical space is scarce. */
  compact?: boolean;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrent(audio.currentTime);
    const onMeta = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      setReady(true);
    };
    const onEnd = () => {
      setPlaying(false);
      setCurrent(0);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
    };
  }, []);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play();
      setPlaying(true);
    }
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(duration) || duration === 0) return;
    audio.currentTime = value;
    setCurrent(value);
  }

  const progress = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-card border border-hairline bg-surface",
        compact ? "p-2.5" : "p-3.5",
        className,
      )}
    >
      {/* preload="metadata" gets us a duration without pulling the audio down
          for every visitor who never presses play. */}
      <audio ref={audioRef} src={src} preload="metadata" />

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? `Pause ${title ?? "preview"}` : `Play ${title ?? "preview"}`}
        className={cn(
          "grid shrink-0 place-items-center rounded-full bg-brand text-ink-inverse transition-colors hover:bg-brand-hover",
          compact ? "h-9 w-9" : "h-11 w-11",
        )}
      >
        {playing ? (
          <Pause className={compact ? "h-4 w-4" : "h-5 w-5"} />
        ) : (
          <Play className={cn(compact ? "h-4 w-4" : "h-5 w-5", "translate-x-px")} />
        )}
      </button>

      <div className="min-w-0 flex-1">
        {title && !compact && (
          <p className="mb-1.5 truncate text-sm font-semibold text-ink">{title}</p>
        )}

        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={current}
            disabled={!ready}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Seek"
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-hairline-strong accent-[var(--color-brand)] disabled:opacity-50"
            style={{
              background: `linear-gradient(to right, var(--color-brand) ${progress}%, var(--color-hairline-strong) ${progress}%)`,
            }}
          />
          <span className="shrink-0 text-xs tabular-nums text-ink-subtle">
            {formatTime(current)} / {formatTime(duration)}
          </span>
        </div>
      </div>

      {!compact && (
        <button
          type="button"
          onClick={() => {
            const audio = audioRef.current;
            if (!audio) return;
            audio.muted = !muted;
            setMuted(!muted);
          }}
          aria-label={muted ? "Unmute" : "Mute"}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-control text-ink-muted hover:bg-surface-hover"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
