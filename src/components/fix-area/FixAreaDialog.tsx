'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ModalPortal from '@/components/ui/ModalPortal';
import { Button } from '@/components/ui/Button';
import FixAreaBrushCanvas, {
  type FixAreaBrushHandle,
} from '@/components/fix-area/FixAreaBrushCanvas';
import {
  comfyImageViewUrl,
  locateFaceInStill,
  queueFixArea,
  type FixAreaTarget,
} from '@/lib/fix-area-client';
import {
  faceFixBox,
  FIX_AREA_DEFAULT_TEXT,
  FIX_AREA_TEXT_MAX,
  fixAreaZoomWindow,
  type FixAreaBox,
  type FixAreaMode,
} from '@/lib/fix-area';
import {
  fixAreaCandidateCaption,
  fixAreaSessionProgress,
  type FixAreaCandidate,
} from '@/lib/fix-area-session';
import { fixAreaSessionStore, useFixAreaSession } from '@/lib/fix-area-session-store';

/**
 * One picture in the results: the whole still, or — zoomed to the area — the same window of it
 * as every other picture, at one scale. The painted area can be lightened over it.
 */
function Picture({
  src,
  alt,
  window: zoom,
  maskUrl,
  showArea,
}: {
  src: string;
  alt: string;
  window: FixAreaBox | null;
  maskUrl: string | null;
  showArea: boolean;
}) {
  const layerStyle = zoom
    ? {
        left: `${(-zoom.x / zoom.width) * 100}%`,
        top: `${(-zoom.y / zoom.height) * 100}%`,
        width: `${100 / zoom.width}%`,
        height: `${100 / zoom.height}%`,
      }
    : { left: 0, top: 0, width: '100%', height: '100%' };
  return (
    <div className="absolute" style={layerStyle} data-testid="fix-area-picture">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-fill" />
      {showArea && maskUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={maskUrl}
          alt=""
          aria-hidden
          data-testid="fix-area-area-overlay"
          className="pointer-events-none absolute inset-0 h-full w-full object-fill opacity-40 mix-blend-screen"
        />
      ) : null}
    </div>
  );
}

/** The frame a Picture sits in: the still's shape, or the zoom window's. */
function Frame({
  window: zoom,
  aspect,
  className = '',
  children,
}: {
  window: FixAreaBox | null;
  aspect: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ratio = zoom ? (zoom.width * aspect) / zoom.height : aspect;
  return (
    <div
      className={`relative w-full overflow-hidden rounded-md border border-[var(--border-subtle)] bg-black/40 ${className}`}
      style={{ aspectRatio: `${ratio}` }}
    >
      {children}
    </div>
  );
}

/** Before / after wipe of the original and one take: drag the handle across. */
function Wipe({
  before,
  after,
  window: zoom,
  aspect,
  maskUrl,
  showArea,
  label,
}: {
  before: string;
  after: string;
  window: FixAreaBox | null;
  aspect: number;
  maskUrl: string | null;
  showArea: boolean;
  label: string;
}) {
  const [position, setPosition] = useState(50);
  return (
    <div className="flex flex-col gap-1" data-testid="fix-area-wipe">
      <Frame window={zoom} aspect={aspect}>
        <Picture src={before} alt="Original" window={zoom} maskUrl={maskUrl} showArea={showArea} />
        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
          data-testid="fix-area-wipe-after"
        >
          <Picture src={after} alt={label} window={zoom} maskUrl={maskUrl} showArea={showArea} />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
          style={{ left: `calc(${position}% - 1px)` }}
        />
        <span className="type-overline pointer-events-none absolute left-1.5 top-1.5 rounded-[var(--radius-sm)] bg-black/60 px-1.5 py-0.5 text-white">
          Before
        </span>
        <span className="type-overline pointer-events-none absolute right-1.5 top-1.5 rounded-[var(--radius-sm)] bg-black/60 px-1.5 py-0.5 text-white">
          After · {label}
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={position}
          onChange={event => setPosition(Number(event.target.value))}
          aria-label={`Before / after wipe, ${label}`}
          aria-valuetext={`${position}% after`}
          className="absolute inset-x-2 bottom-2 h-6 w-[calc(100%-1rem)] cursor-ew-resize appearance-none bg-transparent"
          data-testid="fix-area-wipe-slider"
        />
      </Frame>
    </div>
  );
}

/**
 * "Fix an area": paint over what's wrong in a finished still, say what should be there (or
 * not), and get two candidates rendered on the still's own engine — only the painted area
 * changes. Pick one ("Use this") or keep the original. The takes are tracked by the session
 * store (fix-area-session.ts): closing the dialog while they render keeps them, a chip on the
 * source card says so, and "Fix ready — compare" reopens the results here (`sessionId`).
 */
export default function FixAreaDialog({
  target,
  onClose,
  sessionId: resumeId = null,
}: {
  target: FixAreaTarget;
  onClose: () => void;
  /** A tracked Fix to show the results of (the tray's "Compare"). */
  sessionId?: string | null;
}) {
  const brushRef = useRef<FixAreaBrushHandle>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const [hasMask, setHasMask] = useState(false);
  const [text, setText] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(resumeId);
  const [phase, setPhase] = useState<'paint' | 'results'>(resumeId ? 'results' : 'paint');
  const [submitting, setSubmitting] = useState<FixAreaMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [using, setUsing] = useState<string | null>(null);
  const [showArea, setShowArea] = useState(true);
  const [zoom, setZoom] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [identityNote, setIdentityNote] = useState<string | null>(null);
  const session = useFixAreaSession(sessionId);
  const candidates = session?.candidates ?? [];
  const maskUrl = session?.maskUrl ?? null;
  const aspect = session?.aspect ?? 3 / 4;
  const zoomWindow = useMemo(
    () => (zoom ? fixAreaZoomWindow(session?.maskBox, aspect) : null),
    [aspect, session?.maskBox, zoom]
  );
  const progress = session ? fixAreaSessionProgress(session) : null;
  // A seconds counter on unfinished takes, so a long wait reads as waiting, not stuck.
  const [now, setNow] = useState(() => Date.now());
  const counting = Boolean(progress && !progress.settled);
  useEffect(() => {
    if (!counting) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [counting]);
  const seconds = session ? Math.max(0, Math.round((now - session.createdAt) / 1000)) : 0;

  // Mounted for this instance. React's dev double mount runs the cleanup once before the
  // effect again: every flag here ends in its mounted value, and nothing below cancels a take
  // on cleanup — a take queued by a dialog that went away is tracked by the session store and
  // offered back ("Fix ready — compare"), never dropped (user report 2026-10-05).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // The session knows a dialog shows it (the chip and the tray stay quiet meanwhile).
  useEffect(() => {
    if (!sessionId) return;
    const store = fixAreaSessionStore();
    store.setOpen(sessionId, true);
    return () => store.setOpen(sessionId, false);
  }, [sessionId]);

  // The wipe shows the take the player picked, else the first that has landed.
  const compared =
    candidates.find(c => c.promptId === compareId && c.state.status === 'ready') ??
    candidates.find(c => c.state.status === 'ready');
  const comparedImage = compared?.state.status === 'ready' ? compared.state.image : null;
  const comparedIndex = compared ? candidates.indexOf(compared) : -1;

  const close = useCallback(() => {
    // Seen to the end: nothing to keep tracking. Still rendering: the store keeps the takes.
    if (sessionId && progress?.settled) fixAreaSessionStore().discard(sessionId);
    onClose();
  }, [onClose, progress?.settled, sessionId]);

  const discardAndClose = useCallback(() => {
    if (sessionId) fixAreaSessionStore().discard(sessionId);
    onClose();
  }, [onClose, sessionId]);

  // Focus: into the dialog on open, back where it was on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]');
    first?.focus();
    return () => {
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

  const submit = useCallback(
    async (mode: FixAreaMode) => {
      const exported = brushRef.current?.exportMask();
      if (!exported) {
        setError('Paint over the area to fix first.');
        return;
      }
      setSubmitting(mode);
      setError(null);
      try {
        const queued = await queueFixArea({ target, mask: exported.dataUrl, text, mode });
        // Tracked from here on, whether or not this dialog is still on screen.
        const started = fixAreaSessionStore().start({
          target,
          maskUrl: exported.dataUrl,
          maskBox: exported.box,
          aspect: exported.aspect,
          text,
          mode,
          identity: queued.identity,
          jobs: queued.jobs,
          open: mountedRef.current,
        });
        if (!mountedRef.current) return;
        setIdentityNote(queued.identityNote ?? null);
        setSessionId(started.id);
        setCompareId(null);
        setPhase('results');
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Fix an area failed.');
        }
      } finally {
        if (mountedRef.current) setSubmitting(null);
      }
    },
    [target, text]
  );

  // Fix the face: paint the detected face box and run the fix with the Cast face as reference.
  const fixFace = useCallback(async () => {
    setSubmitting('face');
    setError(null);
    try {
      const located = await locateFaceInStill(target.displayUrl);
      if (!located.face) {
        setError(located.reason ?? 'No face was found in this picture.');
        setSubmitting(null);
        return;
      }
      brushRef.current?.clear();
      brushRef.current?.paintBox(faceFixBox(located.face, { width: 1, height: 1 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Finding the face failed.');
      setSubmitting(null);
      return;
    }
    await submit('face');
  }, [submit, target.displayUrl]);

  const pickCandidate = useCallback(
    async (candidate: FixAreaCandidate) => {
      if (candidate.state.status !== 'ready') return;
      setUsing(candidate.promptId);
      try {
        await target.onUse({
          imageUrl: comfyImageViewUrl(candidate.state.image),
          image: candidate.state.image,
          promptId: candidate.promptId,
          seed: candidate.seed,
          originalUrl: target.comfyUrl ?? target.displayUrl,
          text: (session ? session.text : text).trim(),
          ...(candidate.state.adultCheck ? { adultCheck: candidate.state.adultCheck } : {}),
        });
        discardAndClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not use that candidate.');
        setUsing(null);
      }
    },
    [discardAndClose, session, target, text]
  );

  const paintAgain = useCallback(() => {
    const strokes = session?.maskUrl ?? null;
    if (sessionId) fixAreaSessionStore().discard(sessionId);
    setSessionId(null);
    setCompareId(null);
    setPhase('paint');
    // A resumed Fix has no strokes on the canvas yet: start from the ones it was made with.
    if (strokes && !hasMask) void brushRef.current?.importMask(strokes);
  }, [hasMask, session?.maskUrl, sessionId]);

  const unavailable = !target.comfyUrl;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[140] flex items-center justify-center p-2 sm:p-4"
        data-testid="fix-area-dialog"
        data-phase={phase}
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
                {session?.mode === 'face' ? 'Fix the face' : 'Fix an area'}
              </h2>
              <p className="type-caption text-[var(--text-muted)]">
                {phase === 'paint'
                  ? 'Paint over what looks wrong — only that area is redrawn, on the same engine.'
                  : progress && !progress.settled
                    ? 'Two takes of the painted area are rendering. Close this and keep working — the card says when they land.'
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
                    Paint over the area to fix, or fix the face in one click.
                  </span>
                ) : null}
                <Button variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button
                  variant="secondary"
                  disabled={submitting !== null || unavailable}
                  loading={submitting === 'face'}
                  loadingLabel="Finding the face"
                  title="Finds the face, paints over it and redraws it with the Cast's face as the reference."
                  onClick={() => void fixFace()}
                  data-testid="fix-area-fix-face"
                >
                  Fix the face
                </Button>
                <Button
                  variant="primary"
                  disabled={!hasMask || submitting !== null || unavailable}
                  loading={submitting === 'area'}
                  loadingLabel="Queueing"
                  onClick={() => void submit('area')}
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
                  <Frame window={zoomWindow} aspect={aspect}>
                    <Picture
                      src={target.displayUrl}
                      alt="Original"
                      window={zoomWindow}
                      maskUrl={maskUrl}
                      showArea={showArea}
                    />
                  </Frame>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={discardAndClose}
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
                    <span className="type-label text-sm font-medium">
                      Take {index + 1}
                      {compared?.promptId === candidate.promptId ? (
                        <span className="type-caption ml-2 text-[var(--accent-text)]">
                          in the wipe
                        </span>
                      ) : null}
                    </span>
                    {candidate.state.status === 'ready' ? (
                      <>
                        <button
                          type="button"
                          className={`block w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                            compared?.promptId === candidate.promptId
                              ? 'ring-2 ring-[var(--accent-ring)]'
                              : ''
                          }`}
                          aria-pressed={compared?.promptId === candidate.promptId}
                          aria-label={`Compare take ${index + 1} in the before / after wipe`}
                          onClick={() => setCompareId(candidate.promptId)}
                          data-testid={`fix-area-compare-${index}`}
                        >
                          <Frame window={zoomWindow} aspect={aspect}>
                            <Picture
                              src={comfyImageViewUrl(candidate.state.image)}
                              alt={`Fixed take ${index + 1}`}
                              window={zoomWindow}
                              maskUrl={maskUrl}
                              showArea={showArea}
                            />
                          </Frame>
                        </button>
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
                          {fixAreaCandidateCaption(candidate.state, seconds)}
                        </span>
                        {candidate.state.status === 'withheld' &&
                        candidate.state.image &&
                        sessionId ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              void fixAreaSessionStore().recheck(sessionId, candidate.promptId)
                            }
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
              {comparedImage && comparedIndex >= 0 ? (
                <Wipe
                  before={target.displayUrl}
                  after={comfyImageViewUrl(comparedImage)}
                  window={zoomWindow}
                  aspect={aspect}
                  maskUrl={maskUrl}
                  showArea={showArea}
                  label={`Take ${comparedIndex + 1}`}
                />
              ) : null}
              {session?.mode === 'face' ? (
                <p
                  className="type-caption text-[var(--text-muted)]"
                  data-testid="fix-area-identity-note"
                >
                  {session.identity
                    ? "Drawn with the Cast's face as the reference (the face picture this still was made with)."
                    : `No face reference: ${identityNote ?? 'the face is redrawn from the prompt alone.'}`}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="mr-auto flex flex-wrap items-center gap-3">
                  <label className="type-caption flex items-center gap-2 text-[var(--text-muted)]">
                    <input
                      type="checkbox"
                      checked={showArea}
                      onChange={event => setShowArea(event.target.checked)}
                      data-testid="fix-area-show-area"
                    />
                    Show the painted area
                  </label>
                  <label className="type-caption flex items-center gap-2 text-[var(--text-muted)]">
                    <input
                      type="checkbox"
                      checked={zoom}
                      disabled={!session?.maskBox}
                      onChange={event => setZoom(event.target.checked)}
                      data-testid="fix-area-zoom"
                    />
                    Zoom to the area
                  </label>
                </div>
                <Button
                  variant="ghost"
                  onClick={paintAgain}
                  disabled={using !== null}
                  data-testid="fix-area-paint-again"
                >
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
