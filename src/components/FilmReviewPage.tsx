'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextArea, TextInput } from '@/components/ui/Field';

type ReviewComment = { id: string; at: number; name: string; text: string; timeSec?: number };
type ReviewData = { title: string; expiresAt: number; videoUrl: string; comments: ReviewComment[] };

function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** /review/<token>: one film and its comments, for someone without an account (film-review-store.ts). */
export default function FilmReviewPage({ token }: { token: string }) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [pin, setPin] = useState(true);
  const [sending, setSending] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/review/${encodeURIComponent(token)}`, { credentials: 'same-origin' })
      .then(async response => {
        const json = (await response.json()) as ReviewData & { error?: string };
        if (!response.ok) throw new Error(json.error ?? 'This link does not work.');
        if (!cancelled) setData(json);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'This link does not work.');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const timeSec = pin ? videoRef.current?.currentTime : undefined;
      const response = await fetch(`/api/review/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ name, text, ...(typeof timeSec === 'number' ? { timeSec } : {}) }),
      });
      const json = (await response.json()) as { comment?: ReviewComment; error?: string };
      if (!response.ok || !json.comment) throw new Error(json.error ?? 'The comment did not send.');
      setData(previous =>
        previous ? { ...previous, comments: [...previous.comments, json.comment!] } : previous
      );
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The comment did not send.');
    } finally {
      setSending(false);
    }
  };

  if (!data) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="type-body text-[var(--text-secondary)]">{error ?? 'Loading the film…'}</p>
      </main>
    );
  }
  const comments = [...data.comments].sort(
    (a, b) => (a.timeSec ?? 1e9) - (b.timeSec ?? 1e9) || a.at - b.at
  );
  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-8" data-testid="film-review-page">
      <header className="space-y-1">
        <p className="type-overline">Film review</p>
        <h1 className="type-title text-[var(--text-primary)]">{data.title}</h1>
        <p className="type-caption text-[var(--text-muted)]">
          This link stops working on {new Date(data.expiresAt).toLocaleDateString()}.
        </p>
      </header>
      <video
        ref={videoRef}
        src={data.videoUrl}
        controls
        playsInline
        className="w-full rounded-[var(--radius-lg)] bg-black"
        data-testid="film-review-video"
      />
      <section className="space-y-2">
        <h2 className="type-heading">Comments</h2>
        {comments.length === 0 ? (
          <p className="type-caption text-[var(--text-muted)]">No comments yet.</p>
        ) : (
          <ul className="space-y-2" data-testid="film-review-comments">
            {comments.map(comment => (
              <li
                key={comment.id}
                className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2"
              >
                <p className="type-caption text-[var(--text-muted)]">
                  {comment.name}
                  {typeof comment.timeSec === 'number' ? (
                    <>
                      {' · '}
                      <button
                        type="button"
                        className="ui-text-link"
                        onClick={() => {
                          if (videoRef.current) videoRef.current.currentTime = comment.timeSec!;
                        }}
                      >
                        at {clock(comment.timeSec)}
                      </button>
                    </>
                  ) : null}
                </p>
                <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">
                  {comment.text}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-2">
        <TextInput
          placeholder="Your name"
          value={name}
          maxLength={60}
          onChange={event => setName(event.target.value)}
          aria-label="Your name"
        />
        <TextArea
          placeholder="What works, what doesn't…"
          value={text}
          maxLength={1000}
          rows={3}
          onChange={event => setText(event.target.value)}
          aria-label="Comment"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 type-caption text-[var(--text-secondary)]">
            <input type="checkbox" checked={pin} onChange={event => setPin(event.target.checked)} />
            Pin to where the film is now
          </label>
          <Button
            size="sm"
            variant="primary"
            disabled={!text.trim() || sending}
            onClick={() => void send()}
          >
            {sending ? 'Sending…' : 'Send comment'}
          </Button>
        </div>
        {error ? <p className="ui-alert-danger type-caption">{error}</p> : null}
      </section>
    </main>
  );
}
