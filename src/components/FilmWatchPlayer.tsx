'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import MotionMedia from '@/components/ui/MotionMedia';
import type { FilmPlaylistShot } from '@/lib/character-film';
import { looksLikeVideoUrl } from '@/lib/roleplay-film';

export default function FilmWatchPlayer({
  shots,
  emptyLabel = 'No playable shots yet.',
}: {
  shots: FilmPlaylistShot[];
  emptyLabel?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const holdTimer = useRef<number>(0);
  const playlistKey = shots.map(item => `${item.entryId ?? ''}:${item.url}:${item.kind}`).join('|');
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [seenKey, setSeenKey] = useState(playlistKey);
  if (seenKey !== playlistKey) {
    setSeenKey(playlistKey);
    setIndex(0);
    setPlaying(false);
  }
  const shot = shots[index];
  const htmlVideo = Boolean(shot?.kind === 'clip' && looksLikeVideoUrl(shot.url));

  useEffect(() => {
    window.clearTimeout(holdTimer.current);
    if (!playing || !shot) {
      return;
    }
    if (shot.kind === 'still' || !htmlVideo) {
      const holdMs = shot.kind === 'clip' ? 4000 : Math.round((shot.holdSec ?? 2.5) * 1000);
      holdTimer.current = window.setTimeout(() => {
        setIndex(current => {
          if (current + 1 >= shots.length) {
            setPlaying(false);
            return current;
          }
          return current + 1;
        });
      }, holdMs);
      return () => window.clearTimeout(holdTimer.current);
    }
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.currentTime = 0;
    void video.play().catch(() => setPlaying(false));
  }, [playing, shot, shots.length, htmlVideo]);

  const go = (next: number) => {
    window.clearTimeout(holdTimer.current);
    const clamped = Math.max(0, Math.min(shots.length - 1, next));
    setIndex(clamped);
    if (clamped === shots.length - 1 && next > index) {
      setPlaying(false);
    }
  };

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      videoRef.current?.pause();
      window.clearTimeout(holdTimer.current);
      return;
    }
    if (index >= shots.length - 1 && shot?.kind === 'clip') {
      const video = videoRef.current;
      if (video && video.ended) {
        setIndex(0);
      }
    }
    setPlaying(true);
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        go(index - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        go(index + 1);
      } else if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        togglePlay();
      }
    };
    root.addEventListener('keydown', onKeyDown);
    return () => root.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- index/playing via closures in handlers
  }, [index, playing, shots.length]);

  if (shots.length === 0) {
    return <p className="type-caption text-[var(--text-muted)]">{emptyLabel}</p>;
  }

  return (
    <div
      ref={rootRef}
      className="space-y-3"
      tabIndex={0}
      role="region"
      aria-label="Film reel player"
      data-testid="film-watch-player"
    >
      <div className="relative aspect-video overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-base)]">
        {htmlVideo && shot ? (
          <video
            key={shot.url}
            ref={videoRef}
            src={shot.url}
            className="h-full w-full object-contain"
            playsInline
            muted
            aria-label={shot.title}
            onEnded={() => {
              if (index + 1 >= shots.length) {
                setPlaying(false);
                return;
              }
              setIndex(index + 1);
            }}
          />
        ) : shot?.kind === 'clip' ? (
          <MotionMedia
            key={shot.url}
            src={shot.url}
            alt={shot.title}
            className="h-full w-full object-contain"
            autoPlay={playing}
            loop
            muted
            controls={false}
          />
        ) : shot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shot.url} alt={shot.title} className="h-full w-full object-contain" />
        ) : null}
        <p className="pointer-events-none absolute left-2 top-2 rounded-full bg-[var(--bg-base)]/75 px-2 py-0.5 type-caption text-[var(--text-secondary)] backdrop-blur-sm">
          {index + 1} / {shots.length}
          {shot ? ` · ${shot.kind === 'clip' ? 'Clip' : 'Still'}` : ''}
        </p>
      </div>
      {shot ? <p className="type-caption truncate text-[var(--text-muted)]">{shot.title}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={togglePlay} aria-pressed={playing}>
          {playing ? 'Pause' : 'Watch'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={index <= 0}
          onClick={() => go(index - 1)}
          aria-label="Previous shot"
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={index >= shots.length - 1}
          onClick={() => go(index + 1)}
          aria-label="Next shot"
        >
          Next
        </Button>
      </div>
      <p className="type-caption text-[var(--text-muted)]">
        Keyboard: ← → to scrub · Space to watch
      </p>
    </div>
  );
}
