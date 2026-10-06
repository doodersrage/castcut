'use client';

import { useEffect, useRef, useState } from 'react';

type Choice = { id: string; label: string; sizeGb: number; note: string };
type State = {
  jobId: string | null;
  status: string;
  downloadedBytes?: number;
  totalBytes?: number;
  error?: string;
};

/**
 * Download a vision model into LM Studio from the readiness card (still review, the shoe check,
 * the adult check). The server only accepts the curated choices (vision-model-download-server).
 */
export default function VisionModelDownload({ onDone }: { onDone: () => void }) {
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch('/api/llm/vision-model')
      .then(response => response.json())
      .then((data: { lmStudio?: boolean; choices?: Choice[] }) => {
        if (alive && data.lmStudio) setChoices(data.choices ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const poll = (jobId: string) => {
    timer.current = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/llm/vision-model?job=${encodeURIComponent(jobId)}`);
        const data = (await response.json()) as State & { error?: string };
        if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
        setState(data);
        if (data.status === 'completed') {
          setBusy(false);
          onDone();
        } else if (data.status === 'failed') {
          setBusy(false);
        } else {
          poll(jobId);
        }
      } catch (error) {
        setBusy(false);
        setState({
          jobId,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Lost track of the download.',
        });
      }
    }, 2000);
  };

  const start = async (choice: Choice) => {
    if (busy) return;
    if (!window.confirm(`Download ${choice.label} into LM Studio (about ${choice.sizeGb} GB)?`))
      return;
    setBusy(true);
    setState({ jobId: null, status: 'starting' });
    try {
      const response = await fetch('/api/llm/vision-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice: choice.id }),
      });
      const data = (await response.json()) as State & { error?: string };
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      setState(data);
      if (data.status === 'already_downloaded' || data.status === 'completed') {
        setBusy(false);
        onDone();
      } else if (data.jobId) {
        poll(data.jobId);
      } else {
        setBusy(false);
      }
    } catch (error) {
      setBusy(false);
      setState({
        jobId: null,
        status: 'failed',
        error: error instanceof Error ? error.message : 'The download did not start.',
      });
    }
  };

  if (!choices?.length) return null;
  const percent =
    state?.totalBytes && state.downloadedBytes !== undefined
      ? Math.floor((state.downloadedBytes / state.totalBytes) * 100)
      : null;
  return (
    <span className="mt-1 block space-y-1" data-testid="vision-model-download">
      {choices.map(choice => (
        <span key={choice.id} className="flex flex-wrap items-baseline gap-x-2">
          <button
            type="button"
            className="ui-text-link"
            disabled={busy}
            onClick={() => void start(choice)}
            data-testid={`vision-model-download-${choice.id}`}
          >
            Download {choice.label}
          </button>
          <span className="text-[var(--text-muted)]">
            ~{choice.sizeGb} GB · {choice.note}
          </span>
        </span>
      ))}
      {state ? (
        <span className="block text-[var(--text-muted)]" data-testid="vision-model-download-status">
          {state.status === 'starting'
            ? 'Starting the download in LM Studio…'
            : state.status === 'downloading' || state.status === 'paused'
              ? `LM Studio is downloading${percent !== null ? ` — ${percent}%` : '…'}${state.status === 'paused' ? ' (paused)' : ''}`
              : state.status === 'completed' || state.status === 'already_downloaded'
                ? 'Downloaded. LM Studio loads it on the first check.'
                : `The download failed${state.error ? `: ${state.error}` : '.'}`}
        </span>
      ) : null}
    </span>
  );
}
