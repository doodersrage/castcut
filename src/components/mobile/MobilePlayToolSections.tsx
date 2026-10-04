'use client';

import StoryOwnScene from '@/components/roleplay/StoryOwnScene';
import { StoryBeatEditProvider } from '@/components/roleplay/StoryBeatEditContext';
import StoryScenePoseFigure from '@/components/roleplay/StoryScenePoseFigure';
import StoryStartOverDialog from '@/components/roleplay/StoryStartOverDialog';
import { storyBeatAwaitsRewrite } from '@/hooks/roleplay/story-beat-edit';
import { useStoryScenePoses } from '@/hooks/roleplay/useStoryScenePoses';
import { useStoryStartOver } from '@/hooks/roleplay/useStoryStartOver';
import { RoleplayCastToneSettingSection } from '@/components/roleplay/sections/RoleplayCastToneSettingSection';
import { useNsfwGeneratorStatus } from '@/hooks/useNsfwGeneratorEnabled';
import { roleplayMoodSummary } from '@/lib/roleplay';
import { FilmCutOptionsDisclosure } from '@/components/FilmCutOptionsControls';
import { roleplayWatchPlaylist } from '@/lib/character-film';
import type { KeyedShot } from '@/lib/film-cut-plan';
import TaskRequirementsCard from '@/components/TaskRequirementsCardLazy';
import CutProblemsDialog from '@/components/CutProblemsDialog';
import Link from 'next/link';
import { useMemo, useSyncExternalStore } from 'react';
import RoleplayStoryReel from '@/components/RoleplayStoryReel';
import RoleplayWardrobeSection from '@/components/roleplay/RoleplayWardrobeSection';
import StoryPlayPhaseStrip from '@/components/roleplay/StoryPlayPhaseStrip';
import StoryStatusStrip from '@/components/roleplay/StoryStatusStrip';
import PlaySoftAdvanceBanner from '@/components/PlaySoftAdvanceBanner';
import PlayFilmEngineBanner from '@/components/PlayFilmEngineBanner';
import { Button, ButtonLink, PrimaryButton } from '@/components/ui/Button';
import { ChipButton, FieldError, TextInput } from '@/components/ui/Field';
import { usePlaySoftAdvance } from '@/hooks/usePlaySoftAdvance';
import type { useMobilePlayToolOrchestration } from '@/hooks/useMobilePlayToolOrchestration';
import { DAY_INTIMATE_MIX_OPTIONS, normalizeDayIntimateMix } from '@/lib/day-planner';
import { useNsfwGeneratorEnabled } from '@/hooks/useNsfwGeneratorEnabled';
import { deriveStoryPhase } from '@/lib/play-step-machine';
import {
  applyRoleplayCharacterName,
  countRoleplayCompletedClips,
  countRoleplayCompletedStills,
  isRoleplayAdultContent,
  MAX_ROLEPLAY_CHARACTER_NAME,
  roleplayQueueBlockReason,
  storySessionStatusLine,
} from '@/lib/roleplay';
import {
  roleplayPatchFromPlate,
  toMobileStudioHref,
  withCharacterQuery,
} from '@/lib/mobile-studio';
import StoryRetryFlagged from '@/components/roleplay/StoryRetryFlagged';
import {
  getCharacter,
  getCharactersSnapshot,
  getServerCharactersSnapshot,
  subscribeCharacters,
} from '@/lib/character-os';
import { confirmRoleplayUndoScene, type RoleplayStoryBeat } from '@/lib/roleplay';
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
    shared,
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
    storyRef,
    storyProgress,
    beatOutput,
    autoQueue,
    content,
    tone,
    assemblingFilm,
    filmStatus,
    filmNeedsCast,
    filmCharacterId,
    firstCutCelebrate,
    clearFirstCutCelebrate,
    cutRoleplayFilm,
    cutProblems,
    resolveCutProblems,
    saveFilmToCast,
    shareLastCut,
    filmError,
    filmGuideHref,
    filmCutOptions,
    setFilmCutOptions,
    hasReferenceImage,
    playScene,
    rollScenes,
    scenesLoading,
    animateAllReady,
    queueBeat,
    beatEdit,
    writeBio,
    selectStillTake,
    setBeatPose,
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
  // As desk Story: the reel as it is now (a still that just finished is not put back).
  const undoLastScene = () => {
    const current = storyRef.current;
    const last = current[current.length - 1];
    if (!last || !confirmRoleplayUndoScene(last.title)) {
      return;
    }
    updateToolSettings({ story: current.slice(0, -1) });
    setScenes([]);
  };
  const { ready: adultGateReady } = useNsfwGeneratorStatus();
  // The active Cast lead (as desktop Story does). filmCharacterId is only set once a film is
  // cut, so gating on it alone told every phone player "Story needs a Cast lead" until then.
  const activeCastId = shared.activeCharacterId?.trim() || '';
  // Follow the Cast list: it can load a moment after this page, and read once the page stayed
  // on "No Cast lead" with Roll disabled until something else re-rendered it.
  const castRoster = useSyncExternalStore(
    subscribeCharacters,
    getCharactersSnapshot,
    getServerCharactersSnapshot
  );
  const castId =
    filmCharacterId?.trim() ||
    (activeCastId && castRoster.length > 0 ? getCharacter(activeCastId)?.id || '' : '');
  // Asked in the page, as on desk: keep the bible, or have a new one written for this lead.
  const startOver = useStoryStartOver({
    clearStory: () => {
      updateToolSettings({ story: [], rejectedScenes: [] });
      setScenes([]);
    },
    clearScenes: () => setScenes([]),
    writeBio,
    leadName:
      toolSettings.characterName?.trim() || (castId ? getCharacter(castId)?.name?.trim() : ''),
  });
  const startStoryOver = startOver.ask;
  // "Retry flagged" / "Retry them first": a scene whose text was edited has no still prompt to
  // retry with — its fresh take is the scene written again (as desk Story).
  const retryStill = (beat: RoleplayStoryBeat) =>
    storyBeatAwaitsRewrite(beat) ? beatEdit.rewriteBeat(beat) : queueBeat(beat, { retry: true });
  // The figure on each scene card: the pose its still would be drawn in (as desk Story).
  const scenePoses = useStoryScenePoses({
    scenes,
    story,
    model: shared.model,
    poseGuideStyle: shared.poseGuideStyle,
    adult: isRoleplayAdultContent(content),
    solo: toolSettings.intimateMix === 'solo',
    enabled: playAs === 'photo',
  });
  const castBibleHref = castId ? `/characters/${encodeURIComponent(castId)}` : '/characters';
  const busy =
    bioLoading ||
    Boolean(playingId) ||
    isolating ||
    assemblingFilm ||
    wardrobe.garmentUploading ||
    scenesLoading ||
    // One scene is written at a time: picking a card mid-rewrite would save over its result.
    Boolean(beatEdit.rewritingKey);
  const adultEnabled = useNsfwGeneratorEnabled();
  const completedShotCount = useMemo(() => countRoleplayCompletedStills(story), [story]);
  const completedClipCount = useMemo(() => countRoleplayCompletedClips(story), [story]);
  const storyPhase = useMemo(
    () =>
      deriveStoryPhase({
        completedStills: completedShotCount,
        completedClips: completedClipCount,
        beatCount: story.length,
      }),
    [completedClipCount, completedShotCount, story.length]
  );
  const showAnimateCoach =
    completedShotCount > 0 &&
    completedClipCount < completedShotCount &&
    !firstCutCelebrate &&
    !assemblingFilm;
  const queueBlockReason = useMemo(
    () =>
      roleplayQueueBlockReason({
        hasCharacter: Boolean(castId),
        hasBio: Boolean(bio),
        playAsPhoto: playAs === 'photo',
        hasPlate: hasReferenceImage,
        isolateSubject,
        isolatePending:
          isolateSubject && hasReferenceImage && toolSettings.referenceIsolated !== true,
      }),
    [bio, castId, hasReferenceImage, isolateSubject, playAs, toolSettings.referenceIsolated]
  );
  const storyStatusLine = storySessionStatusLine({
    hasCharacter: Boolean(castId),
    characterName: bio?.name,
    hasPlate: hasReferenceImage,
    hasWardrobe: Boolean(
      toolSettings.wardrobeId?.trim() || toolSettings.customGarmentImageUrl?.trim()
    ),
    completedStills: completedShotCount,
    completedClips: completedClipCount,
    beatTotal: story.length,
  });
  const intimateMix = normalizeDayIntimateMix(toolSettings.intimateMix);
  const showIntimateMix = adultEnabled && isRoleplayAdultContent(content);

  return (
    <div className="space-y-4" data-testid="mobile-play">
      <CutProblemsDialog
        problems={cutProblems}
        onResolve={action => void resolveCutProblems(action, retryStill)}
      />
      <StoryStartOverDialog
        open={startOver.open}
        sceneCount={story.length}
        leadName={bio?.name}
        onResolve={startOver.resolve}
      />
      <div className="space-y-1">
        <h1 className="type-display text-2xl tracking-tight">Story</h1>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          Optional beats after Day — continues your Cast lead. Change the lead or their photo on
          Film / Cast.
        </p>
      </div>

      <PlayFilmEngineBanner />
      <PlaySoftAdvanceBanner
        key={softAdvance?.nonce ?? 'idle'}
        target={softAdvance}
        onCancel={cancelSoftAdvance}
      />

      {!firstCutCelebrate ? (
        <div className="space-y-2">
          <StoryPlayPhaseStrip
            activePhase={storyPhase}
            completedStills={completedShotCount}
            completedClips={completedClipCount}
            beatTotal={story.length}
          />
          <StoryStatusStrip statusLine={storyStatusLine} queueBlockReason={queueBlockReason} />
        </div>
      ) : null}

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
        <>
          <TaskRequirementsCard
            task="This Story"
            testId="story-task-requirements"
            input={{ model: shared.model, adult: content === 'explicit' }}
          />
          <RoleplayWardrobeSection
            busy={busy}
            toolSettings={toolSettings}
            onUpdateToolSettings={updateToolSettings}
            onError={message => setError(message)}
            wardrobe={wardrobe}
          />
          {/* Tone / content rating / setting — desk Story had these; the phone page could only
              use whatever was last set on desk. */}
          <details
            className="rounded-2xl border border-[var(--border-subtle)] px-4 py-3"
            data-testid="mobile-story-settings"
          >
            <summary className="flex min-h-8 cursor-pointer items-center text-sm text-[var(--text-secondary)]">
              Story settings ·{' '}
              {roleplayMoodSummary(tone, content, toolSettings.setting, toolSettings.allowGore)}
            </summary>
            <div className="mt-3 space-y-3">
              <RoleplayCastToneSettingSection
                busy={busy}
                playAs={playAs}
                tone={tone}
                content={content}
                adultEnabled={adultEnabled}
                adultGateReady={adultGateReady}
                toolSettings={toolSettings}
                onUpdateToolSettings={updateToolSettings}
              />
              {story.length > 0 ? (
                <p
                  className="type-caption text-[var(--text-muted)]"
                  data-testid="mobile-story-settings-midway"
                >
                  Changes apply from the next scene — the {story.length} scene
                  {story.length === 1 ? '' : 's'} so far stay as they are.{' '}
                  <button
                    type="button"
                    className="ui-text-link inline-block py-2"
                    disabled={busy}
                    onClick={startStoryOver}
                  >
                    Start the story over
                  </button>{' '}
                  to use them from the first scene.
                </p>
              ) : null}
            </div>
          </details>
        </>
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

      {showIntimateMix ? (
        <div className="space-y-2" data-testid="story-intimate-mix">
          <p className="type-caption text-[var(--text-muted)]">Intimate mix</p>
          <div className="flex flex-wrap gap-2">
            {DAY_INTIMATE_MIX_OPTIONS.map(option => (
              <ChipButton
                key={option.id}
                active={intimateMix === option.id}
                disabled={busy}
                data-testid={`story-intimate-mix-${option.id}`}
                title={option.hint}
                onClick={() =>
                  updateToolSettings({ intimateMix: normalizeDayIntimateMix(option.id) })
                }
              >
                {option.label}
              </ChipButton>
            ))}
          </div>
        </div>
      ) : null}

      {storyProgress.phase !== 'complete' ? (
        <div className="space-y-2" data-testid="story-beat-picker">
          <p className="type-caption text-[var(--text-muted)]">{storyProgress.heading}</p>
          <p className="text-xs text-[var(--text-muted)]">{storyProgress.hint}</p>
          <Button
            variant="secondary"
            loading={scenesLoading}
            loadingLabel="Rolling scenes"
            disabled={Boolean(queueBlockReason) || busy}
            data-testid="story-roll-scenes"
            onClick={() => void rollScenes()}
            className="w-full justify-center"
          >
            {scenes.length > 0 ? storyProgress.rerollLabel : storyProgress.rollLabel}
          </Button>
          {story.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="ghost"
                disabled={busy}
                data-testid="story-undo-scene"
                onClick={undoLastScene}
                className="justify-center"
              >
                Take back last scene
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                data-testid="story-start-over"
                onClick={startStoryOver}
                className="justify-center"
              >
                Start over
              </Button>
            </div>
          ) : null}
          {queueBlockReason ? (
            <p
              className="type-caption text-[var(--text-muted)]"
              data-testid="story-queue-block-reason"
            >
              {queueBlockReason}
            </p>
          ) : null}
          {scenes.length > 0 ? (
            <div className="grid gap-2">
              {scenes.map(scene => (
                <button
                  key={scene.id}
                  type="button"
                  disabled={playingId !== null || busy}
                  onClick={() => void playScene(scene)}
                  data-testid="story-scene-card"
                  className="flex items-start gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 px-3 py-3 text-left transition hover:border-[var(--accent-border)] disabled:opacity-50"
                >
                  <span className="block min-w-0 flex-1">
                    <span className="block text-sm font-medium">{scene.title}</span>
                    <span className="mt-1 block text-xs text-[var(--text-muted)]">
                      {scene.blurb}
                    </span>
                    {playingId === scene.id ? (
                      <span className="mt-1 block type-caption text-[var(--accent-text)]">
                        {beatOutput === 'clip' && autoQueue ? 'Writing clip…' : 'Writing still…'}
                      </span>
                    ) : null}
                  </span>
                  {/* At the side, in a fixed box: the text keeps its width and the card its
                      height whether or not it has a figure. */}
                  <StoryScenePoseFigure pose={scenePoses.get(scene.id)} />
                </button>
              ))}
            </div>
          ) : null}
          {bio && !queueBlockReason ? (
            <StoryOwnScene
              disabled={playingId !== null || busy}
              ending={storyProgress.phase === 'finale'}
              onPlay={scene => void playScene(scene)}
            />
          ) : null}
        </div>
      ) : null}

      {storyProgress.phase === 'complete' ? (
        <div className="space-y-2">
          <p className="text-sm text-[var(--text-secondary)]">{storyProgress.hint}</p>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={startStoryOver}
            className="w-full justify-center"
          >
            Restart story
          </Button>
        </div>
      ) : null}

      {showAnimateCoach ? (
        <div
          className="space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/30 p-3"
          data-testid="story-animate"
        >
          <p className="type-caption text-[var(--text-muted)]">Next · Animate → Cut</p>
          <p className="text-xs text-[var(--text-muted)]">
            Stills are ready — animate into clips, then Cut film.
          </p>
          <Button
            variant="primary"
            disabled={busy}
            data-testid="story-animate-all"
            onClick={() => void animateAllReady()}
            className="w-full justify-center"
          >
            Animate all ready stills
          </Button>
        </div>
      ) : null}

      <StoryRetryFlagged story={story} busy={busy} fullWidth onRetry={retryStill} />

      <StoryBeatEditProvider value={beatEdit}>
        <RoleplayStoryReel
          story={story}
          busy={busy}
          bioPresent={Boolean(bio)}
          scenesLoading={scenesLoading}
          castBibleHref={castBibleHref}
          onQueue={beat => void queueBeat(beat)}
          onRetry={beat => void queueBeat(beat, { retry: true })}
          onRetryClip={retryClip}
          onAnimate={animateBeat}
          onExtend={extendBeat}
          onSelectTake={selectStillTake}
          onPoseChange={setBeatPose}
          onSelectClipTake={selectClipTake}
          onRollScenes={() => void rollScenes()}
        />
      </StoryBeatEditProvider>

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
        {/* Cut options (vertical, crossfade, titles, length, music) — desk Story had them, the
            phone page cut with defaults only. */}
        {!firstCutCelebrate && story.length > 0 ? (
          <FilmCutOptionsDisclosure
            value={filmCutOptions}
            onChange={setFilmCutOptions}
            disabled={assemblingFilm}
            testIdPrefix="mobile-story-cut"
            shots={roleplayWatchPlaylist(story) as KeyedShot[]}
          />
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
