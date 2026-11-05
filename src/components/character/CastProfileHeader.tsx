'use client';

import { useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import type { CastPlateTile } from '@/lib/character/plate-thumb';

/**
 * The top of a Cast's page (2026-11-05): their plate large, then who they are at a glance — the
 * line of facts, their looks to switch between, their voice — what's next and where to take them.
 * It was a stats line, a seven-card checklist, a button row and a More, stacked.
 */
export default function CastProfileHeader({
  name,
  plateUrl,
  facts,
  looks,
  activeLookId,
  onSelectLook,
  onNewLook,
  voice,
  onVoice,
  onAddPlate,
  busy = false,
  checklist,
  actions,
}: {
  name: string;
  plateUrl?: string | null;
  /** "no plate · 1 look · 0 films". */
  facts: string;
  looks: readonly CastPlateTile[];
  activeLookId?: string;
  onSelectLook: (lookId: string) => void;
  onNewLook?: () => void;
  /** "Voice set · Scottish accent", or null for none yet. */
  voice: string | null;
  onVoice: () => void;
  onAddPlate: (file: File) => void;
  busy?: boolean;
  checklist?: ReactNode;
  actions: ReactNode;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <section
      className="grid gap-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 sm:grid-cols-[10rem_minmax(0,1fr)]"
      data-testid="cast-profile"
    >
      <div className="mx-auto w-40 sm:mx-0">
        {plateUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- the Cast's plate
          <img
            src={plateUrl}
            alt={`${name}'s plate`}
            className="aspect-[3/4] w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-cover object-top"
            data-testid="cast-profile-plate"
          />
        ) : (
          // No plate: the frame is the way to add one (the Looks section below has the rest —
          // make one from the description, or pick from the Gallery).
          <Button
            variant="plain"
            disabled={busy}
            className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border-2 border-dashed border-[var(--border-default)] bg-[var(--bg-muted)] text-center hover:border-[var(--accent-border)]"
            data-testid="cast-profile-add-plate"
            onClick={() => fileRef.current?.click()}
          >
            <span aria-hidden className="text-2xl text-[var(--text-muted)]">
              +
            </span>
            <span className="type-label">Add a plate</span>
            <span className="type-caption px-2 text-[var(--text-muted)]">
              One clear photo, face visible
            </span>
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) onAddPlate(file);
          }}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <p className="type-caption text-[var(--text-secondary)]" data-testid="cast-status-line">
          {facts}
        </p>
        {looks.length ? (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Looks">
            {looks.map(look => {
              const on = look.id === activeLookId;
              return (
                <Button
                  key={look.id}
                  variant="plain"
                  aria-pressed={on}
                  disabled={busy}
                  data-testid={`cast-profile-look-${look.id}`}
                  title={look.outfit ? `${look.label} · ${look.outfit}` : look.label}
                  className={`flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs ${
                    on
                      ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
                      : 'border-[var(--border-default)] hover:bg-[var(--bg-hover)]'
                  }`}
                  onClick={() => onSelectLook(look.id)}
                >
                  {look.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element -- the look's plate
                    <img
                      src={look.thumb}
                      alt=""
                      className="h-6 w-6 rounded-full object-cover object-top"
                    />
                  ) : (
                    <span className="h-6 w-6 rounded-full border border-dashed border-[var(--border-default)]" />
                  )}
                  {look.label}
                </Button>
              );
            })}
            {onNewLook ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                data-testid="cast-profile-new-look"
                title="A copy of this look — its plate and outfit lock — to change from there"
                onClick={onNewLook}
              >
                + New look
              </Button>
            ) : null}
          </div>
        ) : null}
        <p
          className="type-caption flex flex-wrap items-center gap-x-2"
          data-testid="cast-profile-voice"
        >
          <span className="text-[var(--text-muted)]">Voice</span>
          <span>{voice ?? 'None yet'}</span>
          <Button size="sm" variant="underline" onClick={onVoice}>
            {voice ? 'Change' : 'Add a voice'}
          </Button>
        </p>
        {checklist}
        {actions}
      </div>
    </section>
  );
}
