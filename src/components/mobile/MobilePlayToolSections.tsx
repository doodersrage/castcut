'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import PlaySoftAdvanceBanner, {
  type PlaySoftAdvanceTarget,
} from '@/components/PlaySoftAdvanceBanner';
import RoleplayBibleEditor from '@/components/RoleplayBibleEditor';
import RoleplayLibraryPanel from '@/components/RoleplayLibraryPanel';
import RoleplayStoryReel from '@/components/RoleplayStoryReel';
import { Button, ButtonLink, PrimaryButton } from '@/components/ui/Button';
import { ChipButton, FieldError, TextInput } from '@/components/ui/Field';
import type { useMobilePlayToolOrchestration } from '@/hooks/useMobilePlayToolOrchestration';
import {
  applyRoleplayCharacterName,
  formatRoleplayBio,
  MAX_ROLEPLAY_CHARACTER_NAME,
} from '@/lib/roleplay';
import { roleplayPatchFromPlate, toMobileStudioHref } from '@/lib/mobile-studio';
import { remixDayFilmHref } from '@/lib/play-starter';
import { resolveQueueFailureGuideLabel } from '@/lib/queue-failure-playbook';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  DEFAULT_MOBILE_STUDIO_TOOL_CACHE,
  loadToolSettings,
  saveToolSettings,
} from '@/lib/settings-cache';

type ViewModel = ReturnType<typeof useMobilePlayToolOrchestration>;
type Props = ViewModel & { description: string };

export default function MobilePlayToolSections({ description: _description, ...vm }: Props) {
  const {
    toolSettings,
    updateToolSettings,
    plates,
    activePlate,
    scenes,
    setScenes,
    error,
    bioLoading,
    playingId,
    isolating,
    ownBibleOpen,
    setOwnBibleOpen,
    playAs,
    isolateSubject,
    bio,
    story,
    storyProgress,
    beatOutput,
    assemblingFilm,
    filmStatus,
    filmNeedsCast,
    filmCharacterId,
    firstCutCelebrate,
    clearFirstCutCelebrate,
    cutRoleplayFilm,
    saveFilmToCast,
    shareLastCut,
    filmError,
    filmGuideHref,
    hasReferenceImage,
    writeBio,
    applyOwnBible,
    playScene,
    queueBeat,
    selectStillTake,
    selectClipTake,
    animateBeat,
    retryClip,
    extendBeat,
    continueLibrarySession,
    startLibrarySession,
    plateUrl,
    autoIsolateAttemptedRef,
    setActivePlate,
  } = vm;

  const [softAdvance, setSoftAdvance] = useState<PlaySoftAdvanceTarget | null>(null);

  useEffect(() => {
    if (!firstCutCelebrate || !filmCharacterId) {
      return;
    }
    let cancelled = false;
    scheduleAfterCommit(() => {
      if (cancelled) {
        return;
      }
      setSoftAdvance({
        href: toMobileStudioHref(`/characters/${encodeURIComponent(filmCharacterId)}?media=films`),
        label: 'Watch on Cast',
        nonce: Date.now(),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [firstCutCelebrate, filmCharacterId]);

  return (
    <div className="space-y-4" data-testid="mobile-play">
      <div className="space-y-1">
        <h1 className="type-display text-2xl tracking-tight">Story</h1>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          Optional beats after Day — stills and clips, then Cut film.
        </p>
      </div>

      <PlaySoftAdvanceBanner
        key={softAdvance?.nonce ?? 'idle'}
        target={softAdvance}
        onCancel={() => setSoftAdvance(null)}
      />

      {plateUrl ? (
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 p-2">
          <div className="h-16 w-16 overflow-hidden rounded-xl bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={plateUrl} alt="" className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {activePlate?.name || bio?.name || 'Plate'}
            </p>
            <p className="type-caption text-[var(--text-muted)]">
              {playAs === 'photo' ? 'From photo' : 'Switching to From photo'}
              {toolSettings.referenceIsolated === true
                ? ' · isolated'
                : isolating
                  ? ' · isolating…'
                  : isolateSubject
                    ? ' · isolate on'
                    : ''}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] px-4 py-8 text-center">
          <p className="text-sm text-[var(--text-muted)]">No plate yet.</p>
          <Link href="/m" className="ui-btn-primary mt-3 inline-flex justify-center">
            Capture one
          </Link>
        </div>
      )}

      {plates.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {plates.map(plate => (
            <button
              key={plate.id}
              type="button"
              onClick={() => {
                autoIsolateAttemptedRef.current = false;
                updateToolSettings(roleplayPatchFromPlate(plate));
                setActivePlate(plate);
                const mobile = loadToolSettings('mobileStudio', DEFAULT_MOBILE_STUDIO_TOOL_CACHE);
                saveToolSettings('mobileStudio', {
                  ...mobile,
                  activePlateId: plate.id,
                });
              }}
              className={[
                'h-12 w-12 shrink-0 overflow-hidden rounded-lg border bg-white',
                plate.id === activePlate?.id
                  ? 'border-[var(--accent-border)] ring-2 ring-[var(--accent-ring)]'
                  : 'border-[var(--border-subtle)]',
              ].join(' ')}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={plate.isolated ? plate.isolatedUrl : plate.originalUrl}
                alt={plate.name}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}

      <label className="block space-y-1.5 text-sm">
        <span className="type-caption text-[var(--text-muted)]">Character name</span>
        <TextInput
          name="roleplay-character-lock"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={toolSettings.characterName ?? ''}
          disabled={bioLoading}
          maxLength={MAX_ROLEPLAY_CHARACTER_NAME}
          placeholder="Optional — leave blank to invent one"
          onChange={event => {
            const characterName = event.target.value;
            updateToolSettings({
              characterName,
              bio: bio ? applyRoleplayCharacterName(bio, characterName) : bio,
            });
          }}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <ChipButton
          active={beatOutput === 'still'}
          disabled={bioLoading}
          onClick={() => updateToolSettings({ beatOutput: 'still' })}
        >
          Stills
        </ChipButton>
        <ChipButton
          active={beatOutput === 'clip'}
          disabled={bioLoading}
          onClick={() => updateToolSettings({ beatOutput: 'clip' })}
          data-testid="mobile-play-beat-clip"
        >
          Clips (auto)
        </ChipButton>
      </div>

      <PrimaryButton
        disabled={!hasReferenceImage || bioLoading || isolating}
        loading={bioLoading}
        onClick={() => void writeBio()}
        className="w-full justify-center"
      >
        {bio ? 'Rewrite bio + first look' : 'Write my bio'}
      </PrimaryButton>
      <Button
        variant="secondary"
        disabled={bioLoading || isolating}
        onClick={() => setOwnBibleOpen(open => !open)}
        className="w-full justify-center"
      >
        {bio ? 'Edit bible' : 'Use my own bible'}
      </Button>

      {ownBibleOpen ? (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/30 p-3">
          <RoleplayBibleEditor
            key={bio ? `${bio.name}-${bio.look}` : 'new-bible'}
            initial={bio}
            characterName={toolSettings.characterName}
            disabled={bioLoading || isolating}
            applyLabel={bio ? 'Update bible' : 'Use this bible'}
            onApply={nextBio => void applyOwnBible(nextBio)}
          />
        </div>
      ) : null}

      {bio && !ownBibleOpen ? (
        <pre className="whitespace-pre-wrap rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/30 p-3 text-xs leading-relaxed text-[var(--text-secondary)]">
          {formatRoleplayBio(bio)}
        </pre>
      ) : null}

      <div className="space-y-2">
        <p className="type-caption text-[var(--text-muted)]">Library</p>
        <RoleplayLibraryPanel
          activeSessionId={toolSettings.activeSessionId}
          busy={bioLoading || playingId !== null}
          onContinue={continueLibrarySession}
          onNew={startLibrarySession}
          onDeleted={id => {
            if (id === toolSettings.activeSessionId) {
              updateToolSettings({ activeSessionId: undefined });
            }
          }}
        />
      </div>

      {scenes.length > 0 ? (
        <div className="space-y-2">
          <p className="type-caption text-[var(--text-muted)]">{storyProgress.heading}</p>
          <p className="text-xs text-[var(--text-muted)]">{storyProgress.hint}</p>
          <div className="grid gap-2">
            {scenes.map(scene => (
              <button
                key={scene.id}
                type="button"
                disabled={playingId !== null}
                onClick={() => void playScene(scene)}
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 px-3 py-3 text-left transition hover:border-[var(--accent-border)] disabled:opacity-50"
              >
                <p className="text-sm font-medium">{scene.title}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{scene.blurb}</p>
                {playingId === scene.id ? (
                  <p className="mt-1 type-caption text-[var(--accent-text)]">Writing still…</p>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {storyProgress.phase === 'complete' ? (
        <div className="space-y-2">
          <p className="text-sm text-[var(--text-secondary)]">{storyProgress.hint}</p>
          <Button
            variant="secondary"
            disabled={bioLoading || playingId !== null}
            onClick={() => {
              updateToolSettings({ story: [], rejectedScenes: [] });
              setScenes([]);
            }}
            className="w-full justify-center"
          >
            Restart story
          </Button>
        </div>
      ) : null}

      <RoleplayStoryReel
        story={story}
        busy={bioLoading || playingId !== null || assemblingFilm}
        onQueue={beat => void queueBeat(beat)}
        onRetry={beat => void queueBeat(beat, { retry: true })}
        onRetryClip={retryClip}
        onAnimate={animateBeat}
        onExtend={extendBeat}
        onSelectTake={selectStillTake}
        onSelectClipTake={selectClipTake}
      />

      <div className="space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/30 p-3">
        <p className="type-caption text-[var(--text-muted)]">Film</p>
        {firstCutCelebrate ? (
          <div
            className="rounded-2xl border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] px-3 py-3"
            data-testid="story-first-cut-celebrate"
          >
            <p className="type-overline text-[var(--tint-success-text)]">First film</p>
            <p className="type-heading mt-1 text-[var(--text-primary)]">You cut your first reel</p>
            <p className="type-caption mt-1 text-[var(--text-muted)]">
              Watch on Cast is next — share or queue another Day with the same look.
            </p>
            <div className="mt-3 grid gap-2">
              {filmCharacterId ? (
                <Link
                  href={toMobileStudioHref(
                    `/characters/${encodeURIComponent(filmCharacterId)}?media=films`
                  )}
                  className="ui-btn-primary w-full justify-center text-center text-sm"
                  data-testid="story-first-cut-watch"
                  onClick={() => {
                    setSoftAdvance(null);
                    clearFirstCutCelebrate();
                    void import('@/lib/onboarding-hooks').then(
                      ({ markOnboardingWatchFirstFilm }) => {
                        markOnboardingWatchFirstFilm();
                      }
                    );
                  }}
                >
                  Watch on Cast
                </Link>
              ) : null}
              <Button
                variant="secondary"
                className="w-full justify-center"
                data-testid="story-first-cut-share"
                onClick={() => void shareLastCut()}
              >
                Share cut
              </Button>
              {filmCharacterId ? (
                <Link
                  href={toMobileStudioHref(remixDayFilmHref(filmCharacterId))}
                  className="ui-btn-secondary w-full justify-center text-center text-sm"
                  data-testid="story-first-cut-remix"
                  onClick={() => {
                    setSoftAdvance(null);
                    clearFirstCutCelebrate();
                  }}
                >
                  Same look, new Day
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
        {!firstCutCelebrate ? (
          <PrimaryButton
            loading={assemblingFilm}
            loadingLabel="Cutting film"
            disabled={story.length === 0 || assemblingFilm || bioLoading}
            onClick={() => void cutRoleplayFilm()}
            className="w-full justify-center"
            data-testid="mobile-play-cut"
          >
            Cut film
          </PrimaryButton>
        ) : null}
        {filmStatus && !assemblingFilm && !firstCutCelebrate ? (
          <Button
            variant="secondary"
            disabled={bioLoading}
            onClick={() => void shareLastCut()}
            className="w-full justify-center"
            data-testid="roleplay-share-cut"
          >
            Share cut
          </Button>
        ) : null}
        {!firstCutCelebrate ? (
          <Button
            variant="secondary"
            disabled={bioLoading || assemblingFilm || (!filmNeedsCast && !filmStatus)}
            onClick={saveFilmToCast}
            className="w-full justify-center"
            data-testid="roleplay-save-film-cast"
          >
            Save to Cast
          </Button>
        ) : null}
        {filmCharacterId && filmStatus && !assemblingFilm && !firstCutCelebrate ? (
          <Link
            href={toMobileStudioHref(
              `/characters/${encodeURIComponent(filmCharacterId)}?media=films`
            )}
            className="ui-btn-ghost w-full justify-center text-center text-sm"
            data-testid="roleplay-open-cast-film"
            onClick={() => {
              void import('@/lib/onboarding-hooks').then(({ markOnboardingWatchFirstFilm }) => {
                markOnboardingWatchFirstFilm();
              });
            }}
          >
            Open on Cast
          </Link>
        ) : null}
        {filmCharacterId && filmStatus && !assemblingFilm && !firstCutCelebrate ? (
          <Link
            href={toMobileStudioHref(
              `/gallery?character=${encodeURIComponent(filmCharacterId)}&derivedKind=film`
            )}
            className="ui-btn-ghost w-full justify-center text-center text-sm"
            data-testid="roleplay-open-gallery"
          >
            Open in Gallery
          </Link>
        ) : null}
        {filmCharacterId && filmStatus && !assemblingFilm && !firstCutCelebrate ? (
          <Link
            href={toMobileStudioHref(remixDayFilmHref(filmCharacterId))}
            className="ui-btn-secondary w-full justify-center text-center text-sm"
            data-testid="roleplay-remix-day"
          >
            Same look, new Day
          </Link>
        ) : null}
        {filmStatus ? <p className="type-caption text-[var(--text-muted)]">{filmStatus}</p> : null}
      </div>

      <div className="space-y-2">
        <p className="type-caption text-[var(--text-muted)]">Film loop on phone</p>
        <Link
          href="/m/day"
          className="ui-btn-secondary w-full justify-center text-center text-sm"
          data-testid="mobile-continue-day"
        >
          Open Day
        </Link>
        <Link
          href="/m/fitting"
          className="ui-btn-ghost w-full justify-center text-center text-sm"
          data-testid="mobile-continue-fitting"
        >
          Open Outfit
        </Link>
        <Link
          href="/m/moodboard"
          className="ui-btn-ghost w-full justify-center text-center text-sm"
          data-testid="mobile-continue-moodboard"
        >
          Open Look
        </Link>
        <details className="rounded-xl border border-[var(--border-subtle)] px-3 py-2">
          <summary className="type-caption cursor-pointer text-[var(--text-muted)]">
            Optional desk handoff
          </summary>
          <div className="mt-2 grid gap-2">
            <Link
              href="/day"
              className="ui-btn-ghost w-full justify-center text-center text-sm"
              data-testid="mobile-continue-desk-day"
            >
              Day on desk
            </Link>
            <Link
              href="/play"
              className="ui-btn-ghost w-full justify-center text-center text-sm"
              data-testid="mobile-continue-desk-play"
            >
              Campaign on desk
            </Link>
            <Link
              href="/roleplay"
              className="ui-btn-ghost w-full justify-center text-center text-sm"
            >
              Full Story on desk
            </Link>
          </div>
        </details>
      </div>

      {error || filmError ? (
        <div className="space-y-2">
          <FieldError>{error || filmError}</FieldError>
          {filmError && filmGuideHref ? (
            <ButtonLink
              href={filmGuideHref}
              size="sm"
              variant="ghost"
              data-testid="film-failure-playbook-link"
            >
              {resolveQueueFailureGuideLabel(filmGuideHref)}
            </ButtonLink>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
