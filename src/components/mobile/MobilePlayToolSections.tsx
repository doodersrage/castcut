'use client';

import Link from 'next/link';
import RoleplayStoryReel from '@/components/RoleplayStoryReel';
import RoleplayWardrobeSection from '@/components/roleplay/RoleplayWardrobeSection';
import PlaySoftAdvanceBanner from '@/components/PlaySoftAdvanceBanner';
import PlayFilmEngineBanner from '@/components/PlayFilmEngineBanner';
import { Button, ButtonLink, PrimaryButton } from '@/components/ui/Button';
import { ChipButton, FieldError, TextInput } from '@/components/ui/Field';
import { usePlaySoftAdvance } from '@/hooks/usePlaySoftAdvance';
import type { useMobilePlayToolOrchestration } from '@/hooks/useMobilePlayToolOrchestration';
import { applyRoleplayCharacterName, MAX_ROLEPLAY_CHARACTER_NAME } from '@/lib/roleplay';
import {
  roleplayPatchFromPlate,
  toMobileStudioHref,
  withCharacterQuery,
} from '@/lib/mobile-studio';
import { remixDayFilmHref } from '@/lib/play-starter';
import { resolveQueueFailureGuideLabel } from '@/lib/queue-failure-playbook';
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
    playScene,
    queueBeat,
    selectStillTake,
    selectClipTake,
    animateBeat,
    retryClip,
    extendBeat,
    plateUrl,
    autoIsolateAttemptedRef,
    setActivePlate,
    wardrobe,
    setError,
  } = vm;

  const { softAdvance, cancelSoftAdvance } = usePlaySoftAdvance({ mobile: true });
  const castId = filmCharacterId?.trim() || '';
  const castBibleHref = castId ? `/characters/${encodeURIComponent(castId)}` : '/characters';
  const busy =
    bioLoading || Boolean(playingId) || isolating || assemblingFilm || wardrobe.garmentUploading;

  return (
    <div className="space-y-4" data-testid="mobile-play">
      <div className="space-y-1">
        <h1 className="type-display text-2xl tracking-tight">Story</h1>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          Optional beats after Day — continues your Cast lead. Part and From photo live on Film /
          Cast.
        </p>
      </div>

      <PlayFilmEngineBanner />
      <PlaySoftAdvanceBanner
        key={softAdvance?.nonce ?? 'idle'}
        target={softAdvance}
        onCancel={cancelSoftAdvance}
      />

      {!castId ? (
        <div
          className="rounded-2xl border border-dashed border-[var(--border-subtle)] px-4 py-8 text-center"
          data-testid="story-needs-cast"
        >
          <p className="text-sm text-[var(--text-muted)]">
            Story needs a Cast lead — create one on Film first.
          </p>
          <Link href="/m/film" className="ui-btn-primary mt-3 inline-flex justify-center">
            Open Film
          </Link>
        </div>
      ) : null}

      {castId && plateUrl ? (
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
              {playAs === 'photo' ? 'From photo' : 'From bio'}
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
      ) : castId ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] px-4 py-8 text-center">
          <p className="text-sm text-[var(--text-muted)]">No look plate yet — set one on Cast.</p>
          <Link
            href={`/characters/${encodeURIComponent(castId)}`}
            className="ui-btn-secondary mt-3 inline-flex justify-center"
          >
            Open Cast
          </Link>
        </div>
      ) : null}

      {castId ? (
        <RoleplayWardrobeSection
          busy={busy}
          toolSettings={toolSettings}
          onUpdateToolSettings={updateToolSettings}
          onError={message => setError(message)}
          wardrobe={wardrobe}
        />
      ) : null}

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

      <ButtonLink
        href={castBibleHref}
        variant="secondary"
        className="w-full justify-center"
        data-testid="mobile-story-edit-cast-bible"
      >
        {bio ? 'Edit bible on Cast' : 'Set bible on Cast'}
      </ButtonLink>

      {bio ? (
        <p className="text-xs text-[var(--text-muted)]">
          Continuing as {bio.name} — rewrite or clear the bible on Cast.
        </p>
      ) : null}

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
        bioPresent={Boolean(bio)}
        castBibleHref={castBibleHref}
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
              {filmNeedsCast
                ? 'Save the cut to Cast first — then tap Watch on Cast.'
                : 'Tap Watch on Cast when you are ready — or share / cut another Story reel.'}
            </p>
            <div className="mt-3 grid gap-2">
              {filmNeedsCast ? (
                <Button
                  variant="primary"
                  className="w-full justify-center"
                  disabled={bioLoading || assemblingFilm}
                  onClick={saveFilmToCast}
                  data-testid="story-save-film-cast"
                >
                  Save film to Cast
                </Button>
              ) : null}
              {filmCharacterId && !filmNeedsCast ? (
                <Link
                  href={toMobileStudioHref(
                    `/characters/${encodeURIComponent(filmCharacterId)}?media=films`
                  )}
                  className="ui-btn-primary w-full justify-center text-center text-sm"
                  data-testid="story-first-cut-watch"
                  onClick={() => {
                    clearFirstCutCelebrate();
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
          href={withCharacterQuery('/m/day', castId)}
          className="ui-btn-secondary w-full justify-center text-center text-sm"
          data-testid="mobile-continue-day"
        >
          Open Day
        </Link>
        <Link
          href={withCharacterQuery('/m/fitting', castId)}
          className="ui-btn-ghost w-full justify-center text-center text-sm"
          data-testid="mobile-continue-fitting"
        >
          Open Outfit
        </Link>
        <Link
          href={withCharacterQuery('/m/moodboard', castId)}
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
              Film on desk
            </Link>
            <Link href="/story" className="ui-btn-ghost w-full justify-center text-center text-sm">
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
