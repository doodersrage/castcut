'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ModalPortal from '@/components/ui/ModalPortal';
import { Button } from '@/components/ui/Button';
import FixAreaBrushCanvas, {
  type FixAreaBrushHandle,
} from '@/components/fix-area/FixAreaBrushCanvas';
import {
  cancelFixAreaJobs,
  comfyImageViewUrl,
  pollFixAreaJob,
  queueFixArea,
  type FixAreaJob,
  type FixAreaTarget,
} from '@/lib/fix-area-client';
import { FIX_AREA_DEFAULT_TEXT, FIX_AREA_TEXT_MAX } from '@/lib/fix-area';
import type { ComfyOutputImage } from '@/lib/comfyui-outputs';

type CandidateState =
  | { status: 'queued' | 'running' }
  | { status: 'checking'; image: ComfyOutputImage }
  | { status: 'ready'; image: ComfyOutputImage; adultCheck?: 'passed' | 'unchecked' }
  | { status: 'withheld'; reason: string; image?: ComfyOutputImage }
  | { status: 'failed'; message: string };

type Candidate = FixAreaJob & { state: CandidateState };

const POLL_MS = 1500;
/** The adult check asks the vision model; a busy LM Studio left takes on "Checking…" forever. */
const GATE_TIMEOUT_MS = 60_000;

function candidateCaption(state: CandidateState, seconds: number): string {
  const elapsed = seconds >= 5 ? ` (${seconds}s)` : '';
  switch (state.status) {
    case 'queued':
      return `Waiting in the ComfyUI queue…${elapsed}`;
    case 'running':
      return `Rendering…${elapsed}`;
    case 'checking':
      return `Checking it reads as adult…${elapsed}`;
    case 'withheld':
      return `Withheld: it did not read as clearly adult (${state.reason}).`;
    case 'failed':
      return state.message;
    default:
      return '';
  }
}

async function gateCandidate(
  imageUrl: string,
  adult: NonNullable<FixAreaTarget['adult']>
): Promise<{ pass: boolean; reason: string; verdict?: 'passed' | 'unchecked' }> {
  const [{ checkStillAdultAppearance }, { loadSettingsCache }] = await Promise.all([
    import('@/lib/adult-appearance-gate-client'),
    import('@/lib/settings-cache'),
  ]);
  let timer: number | undefined;
  const timedOut = new Promise<null>(resolve => {
    timer = window.setTimeout(() => resolve(null), GATE_TIMEOUT_MS);
  });
  const decision = await Promise.race([
    checkStillAdultAppearance({
      imageUrl,
      // A fix is not requeued: anything but a pass is withheld.
      strongTake: true,
      clothed: adult.clothed === true,
      coveredTake: true,
      shared: loadSettingsCache().shared,
    }),
    timedOut,
  ]).finally(() => window.clearTimeout(timer));
  if (!decision) {
    return { pass: false, reason: 'the check took too long — is LM Studio busy?' };
  }
  const pass = decision.verdict === 'pass' || decision.verdict === 'unchecked';
  return {
    pass,
    reason: decision.reason,
    ...(pass ? { verdict: decision.verdict === 'pass' ? 'passed' : 'unchecked' } : {}),
  } as { pass: boolean; reason: string; verdict?: 'passed' | 'unchecked' };
}

/** A picture with the painted area lightened over it (the mask's white strokes, screen-blended). */
function WithArea({
  maskUrl,
  show,
  children,
}: {
  maskUrl: string | null;
  show: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      {children}
      {show && maskUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={maskUrl}
          alt=""
          aria-hidden
          data-testid="fix-area-area-overlay"
          className="pointer-events-none absolute inset-0 h-full w-full rounded-md object-contain opacity-40 mix-blend-screen"
        />
      ) : null}
    </div>
  );
}

/**
 * "Fix an area": paint over what's wrong in a finished still, say what should be there (or
 * not), and get two candidates rendered on the still's own engine — only the painted area
 * changes. Pick one ("Use this") or keep the original.
 */
export default function FixAreaDialog({
  target,
  onClose,
}: {
  target: FixAreaTarget;
  onClose: () => void;
}) {
  const brushRef = useRef<FixAreaBrushHandle>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [hasMask, setHasMask] = useState(false);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<'paint' | 'results'>('paint');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [using, setUsing] = useState<string | null>(null);
  // The painted area, shown over the original and each take so a small fix can be found.
  const [maskUrl, setMaskUrl] = useState<string | null>(null);
  const [showArea, setShowArea] = useState(true);
  const candidatesRef = useRef<Candidate[]>([]);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const closedRef = useRef(false);

  useEffect(() => {
    candidatesRef.current = candidates;
  }, [candidates]);

  const unfinishedIds = useCallback(
    () =>
      candidatesRef.current
        .filter(entry => entry.state.status === 'queued' || entry.state.status === 'running')
        .map(entry => entry.promptId),
    []
  );

  const close = useCallback(() => {
    closedRef.current = true;
    cancelFixAreaJobs(unfinishedIds());
    onClose();
  }, [onClose, unfinishedIds]);

  // Focus: into the dialog on open, back where it was on close.
  useEffect(() => {
    // Open again: React's dev double-mount runs the cleanup below once before this, and a
    // closed flag left set cancelled both takes the moment Fix queued them (user report
    // 2026-10-05: the button spun, then nothing — one take rendered unseen on ComfyUI).
    closedRef.current = false;
    const previous = document.activeElement as HTMLElement | null;
    const first = dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]');
    first?.focus();
    return () => {
      closedRef.current = true;
      previous?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close]);

  const setCandidateState = useCallback((promptId: string, state: CandidateState) => {
    setCandidates(previous =>
      previous.map(entry =>
        entry.promptId !== promptId ||
        // A landed take never goes back (a late poll can't undo it).
        (entry.state.status !== 'queued' && entry.state.status !== 'running')
          ? entry
          : { ...entry, state }
      )
    );
  }, []);
  /** Jobs with a status request in flight: one at a time per job (the server drops a landed
   * job's history once read, so a second overlapping poll would find it gone). */
  const inFlightRef = useRef<Set<string>>(new Set());
  const missesRef = useRef<Map<string, number>>(new Map());

  // A seconds counter on unfinished takes, so a long wait reads as waiting, not stuck.
  useEffect(() => {
    if (phase !== 'results') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);
  const seconds = startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;

  const recheck = useCallback(
    async (candidate: Candidate) => {
      if (candidate.state.status !== 'withheld' || !candidate.state.image || !target.adult) return;
      const image = candidate.state.image;
      setCandidates(previous =>
        previous.map(entry =>
          entry.promptId === candidate.promptId
            ? { ...entry, state: { status: 'checking', image } }
            : entry
        )
      );
      const verdict = await gateCandidate(comfyImageViewUrl(image), target.adult).catch(() => ({
        pass: false,
        reason: 'the check failed',
        verdict: undefined,
      }));
      if (closedRef.current) return;
      setCandidates(previous =>
        previous.map(entry =>
          entry.promptId === candidate.promptId
            ? {
                ...entry,
                state: verdict.pass
                  ? { status: 'ready', image, adultCheck: verdict.verdict ?? 'passed' }
                  : { status: 'withheld', reason: verdict.reason, image },
              }
            : entry
        )
      );
    },
    [target.adult]
  );

  // Poll each candidate until it lands (then the adult gate, when the still is adult).
  useEffect(() => {
    if (phase !== 'results') return;
    const timer = window.setInterval(() => {
      for (const candidate of candidatesRef.current) {
        if (candidate.state.status !== 'queued' && candidate.state.status !== 'running') continue;
        if (inFlightRef.current.has(candidate.promptId)) continue;
        inFlightRef.current.add(candidate.promptId);
        void pollFixAreaJob(candidate.promptId)
          .finally(() => inFlightRef.current.delete(candidate.promptId))
          .then(async poll => {
            if (closedRef.current) return;
            if (poll.status === 'pending' || poll.status === 'running') {
              if (poll.status === 'running') {
                setCandidateState(candidate.promptId, { status: 'running' });
              }
              return;
            }
            if (poll.status === 'error') {
              setCandidateState(candidate.promptId, { status: 'failed', message: poll.message });
              return;
            }
            if (poll.status === 'missing') {
              // Three reads in a row, so a job between the queue and its history isn't lost.
              const misses = (missesRef.current.get(candidate.promptId) ?? 0) + 1;
              missesRef.current.set(candidate.promptId, misses);
              if (misses < 3) return;
              setCandidateState(candidate.promptId, {
                status: 'failed',
                message: 'The job left the ComfyUI queue without a picture.',
              });
              return;
            }
            if (!target.adult) {
              setCandidateState(candidate.promptId, { status: 'ready', image: poll.image });
              return;
            }
            setCandidateState(candidate.promptId, { status: 'checking', image: poll.image });
            const verdict = await gateCandidate(comfyImageViewUrl(poll.image), target.adult).catch(
              (): { pass: boolean; reason: string; verdict?: 'passed' | 'unchecked' } => ({
                pass: false,
                reason: 'the check failed',
              })
            );
            if (closedRef.current) return;
            setCandidateState(
              candidate.promptId,
              verdict.pass
                ? { status: 'ready', image: poll.image, adultCheck: verdict.verdict ?? 'passed' }
                : { status: 'withheld', reason: verdict.reason, image: poll.image }
            );
          });
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [phase, setCandidateState, target.adult]);

  const submit = useCallback(async () => {
    const mask = brushRef.current?.exportMask();
    if (!mask) {
      setError('Paint over the area to fix first.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const jobs = await queueFixArea({ target, mask, text });
      if (closedRef.current) {
        cancelFixAreaJobs(jobs.map(job => job.promptId));
        return;
      }
      setMaskUrl(mask);
      setStartedAt(Date.now());
      setNow(Date.now());
      const next = jobs.map(job => ({ ...job, state: { status: 'queued' } as CandidateState }));
      candidatesRef.current = next;
      setCandidates(next);
      setPhase('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fix an area failed.');
    } finally {
      setSubmitting(false);
    }
  }, [target, text]);

  const pickCandidate = useCallback(
    async (candidate: Candidate) => {
      if (candidate.state.status !== 'ready') return;
      setUsing(candidate.promptId);
      try {
        await target.onUse({
          imageUrl: comfyImageViewUrl(candidate.state.image),
          image: candidate.state.image,
          promptId: candidate.promptId,
          seed: candidate.seed,
          originalUrl: target.comfyUrl ?? target.displayUrl,
          text: text.trim(),
          ...(candidate.state.adultCheck ? { adultCheck: candidate.state.adultCheck } : {}),
        });
        close();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not use that candidate.');
        setUsing(null);
      }
    },
    [close, target, text]
  );

  const paintAgain = useCallback(() => {
    cancelFixAreaJobs(unfinishedIds());
    setCandidates([]);
    setPhase('paint');
  }, [unfinishedIds]);

  const unavailable = !target.comfyUrl;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[140] flex items-center justify-center p-2 sm:p-4"
        data-testid="fix-area-dialog"
      >
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className="absolute inset-0 bg-black/80"
          onClick={close}
        />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="fix-area-title"
          className="relative z-10 flex max-h-[96vh] w-full max-w-5xl flex-col gap-3 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 text-[var(--text-primary)] shadow-xl sm:p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="fix-area-title" className="type-title text-base font-semibold">
                Fix an area
              </h2>
              <p className="type-caption text-[var(--text-muted)]">
                {phase === 'paint'
                  ? 'Paint over what looks wrong — only that area is redrawn, on the same engine.'
                  : 'Two takes of the painted area. Everything outside it is unchanged.'}
                {target.title ? ` · ${target.title}` : ''}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={close} data-testid="fix-area-close">
              Close
            </Button>
          </div>

          {/* Kept mounted through the results, so "Paint again" starts from the same strokes. */}
          <div className={phase === 'paint' ? '' : 'hidden'}>
            <FixAreaBrushCanvas
              ref={brushRef}
              imageUrl={target.displayUrl}
              onMaskChange={setHasMask}
            />
          </div>
          {phase === 'paint' ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="type-label text-sm font-medium">
                  What should be there? <span className="text-[var(--text-muted)]">(optional)</span>
                </span>
                <textarea
                  className="ui-input min-h-[3.5rem] w-full resize-y"
                  value={text}
                  maxLength={FIX_AREA_TEXT_MAX}
                  placeholder={`e.g. her left hand resting on the table — empty: ${FIX_AREA_DEFAULT_TEXT}`}
                  onChange={event => setText(event.target.value)}
                  data-testid="fix-area-text"
                />
              </label>
              {unavailable ? (
                <p className="type-caption text-[var(--tint-warning-text)]" role="status">
                  This picture&apos;s ComfyUI output isn&apos;t available, so it can&apos;t be fixed
                  here.
                </p>
              ) : null}
              <div className="flex flex-wrap items-center justify-end gap-2">
                {!hasMask ? (
                  <span className="type-caption mr-auto text-[var(--text-muted)]">
                    Paint over the area to fix.
                  </span>
                ) : null}
                <Button variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  disabled={!hasMask || submitting || unavailable}
                  loading={submitting}
                  loadingLabel="Queueing"
                  onClick={() => void submit()}
                  data-testid="fix-area-submit"
                >
                  Fix
                </Button>
              </div>
            </>
          ) : (
            <>
              <ul
                className="grid grid-cols-3 gap-2 sm:gap-3"
                data-testid="fix-area-results"
                aria-label="Original and candidates"
              >
                <li className="flex flex-col gap-2" data-testid="fix-area-original">
                  <span className="type-label text-sm font-medium">Original</span>
                  <WithArea maskUrl={maskUrl} show={showArea}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={target.displayUrl}
                      alt="Original"
                      className="w-full rounded-md border border-[var(--border-subtle)] object-contain"
                    />
                  </WithArea>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={close}
                    disabled={using !== null}
                    data-testid="fix-area-keep-original"
                  >
                    Keep original
                  </Button>
                </li>
                {candidates.map((candidate, index) => (
                  <li
                    key={candidate.promptId}
                    className="flex flex-col gap-2"
                    data-testid={`fix-area-candidate-${index}`}
                    data-status={candidate.state.status}
                  >
                    <span className="type-label text-sm font-medium">Take {index + 1}</span>
                    {candidate.state.status === 'ready' ? (
                      <>
                        <WithArea maskUrl={maskUrl} show={showArea}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={comfyImageViewUrl(candidate.state.image)}
                            alt={`Fixed take ${index + 1}`}
                            className="w-full rounded-md border border-[var(--border-subtle)] object-contain"
                          />
                        </WithArea>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => void pickCandidate(candidate)}
                          disabled={using !== null}
                          loading={using === candidate.promptId}
                          data-testid={`fix-area-use-${index}`}
                        >
                          Use this
                        </Button>
                      </>
                    ) : (
                      <div
                        className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-[var(--border-subtle)] p-3 text-center"
                        role="status"
                      >
                        {candidate.state.status === 'queued' ||
                        candidate.state.status === 'running' ||
                        candidate.state.status === 'checking' ? (
                          <span className="ui-spinner" aria-hidden />
                        ) : null}
                        <span className="type-caption text-[var(--text-muted)]">
                          {candidateCaption(candidate.state, seconds)}
                        </span>
                        {candidate.state.status === 'withheld' && candidate.state.image ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void recheck(candidate)}
                            data-testid={`fix-area-recheck-${index}`}
                          >
                            Check again
                          </Button>
                        ) : null}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <label className="type-caption mr-auto flex items-center gap-2 text-[var(--text-muted)]">
                  <input
                    type="checkbox"
                    checked={showArea}
                    onChange={event => setShowArea(event.target.checked)}
                    data-testid="fix-area-show-area"
                  />
                  Show the painted area (open a take full size to look closely)
                </label>
                <Button variant="ghost" onClick={paintAgain} disabled={using !== null}>
                  Paint again
                </Button>
              </div>
            </>
          )}
          {error ? (
            <p className="type-caption text-[var(--tint-danger-text,#f87171)]" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </ModalPortal>
  );
}
