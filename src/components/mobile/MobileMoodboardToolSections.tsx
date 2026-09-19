'use client';

import Link from 'next/link';
import CharacterOsPicker from '@/components/CharacterOsPicker';
import PlaySoftAdvanceBanner from '@/components/PlaySoftAdvanceBanner';
import PlayFilmEngineBanner from '@/components/PlayFilmEngineBanner';
import PlayPersistenceTriad from '@/components/PlayPersistenceTriad';
import LookPlayPhaseStrip from '@/components/moodboard/LookPlayPhaseStrip';
import LookStatusStrip from '@/components/moodboard/LookStatusStrip';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { ChipButton, FieldError, FieldLabel, SelectInput, TextArea } from '@/components/ui/Field';
import { usePlaySoftAdvance } from '@/hooks/usePlaySoftAdvance';
import type { useMoodboardToolOrchestration } from '@/hooks/useMoodboardToolOrchestration';
import { cacheBustIdentityMediaUrl } from '@/lib/gallery-media-client';
import { galleryPickPath } from '@/lib/gallery-handoff';
import {
  copyPortableLookPackShareLink,
  lookPackDayHref,
  lookPackFittingHref,
  loadLookPack,
  saveLookPack,
} from '@/lib/look-pack';
import { LOOK_PRESETS, lookPackFromPreset, tilesFromLookPreset } from '@/lib/look-presets';
import {
  LOOK_PREVIEW_HINT,
  MOODBOARD_TEMPLATE_OPTIONS,
  MOODBOARD_TILE_ROLES,
  markMoodboardGalleryPlatePick,
  moodboardExtractBlockReason,
  moodboardQueueBlockReason,
  moodboardSessionStatusLine,
  resolveLookPlayPhase,
  type MoodboardTileRole,
} from '@/lib/moodboard-scene';
import { toMobileStudioHref } from '@/lib/mobile-studio';
import { bumpPlayCampaignStep } from '@/lib/play-campaign';
import { resolvePlayStepHref } from '@/lib/play-step-machine';

type ViewModel = ReturnType<typeof useMoodboardToolOrchestration>;

export default function MobileMoodboardToolSections(vm: ViewModel) {
  const { softAdvance, cancelSoftAdvance, softAdvanceHref } = usePlaySoftAdvance({ mobile: true });
  const {
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    error,
    setError,
    busy,
    extracting,
    lookStatus,
    activeTileId,
    setActiveTileId,
    uploadingTileId,
    plateUploading,
    tiles,
    templateId,
    character,
    plate,
    hasPlate,
    activeTile,
    actions,
    updateTile,
    addTile,
    removeTile,
    applyImageToTile,
    applyLookPlate,
    clearLookPlate,
    keepSceneAsLookPlate,
    queueScene,
    previewPrompt,
    extractLookPack,
    sendLookToFitting,
    sendLookToDay,
    sendLookToRoleplay,
    saveLookPackToCast,
    setLookStatus,
  } = vm;

  const stagedLookPack = loadLookPack();
  const hasInstruction = Boolean(toolSettings.instruction?.trim());
  const extractBlocked = moodboardExtractBlockReason({
    hasTiles: tiles.length > 0,
    hasInstruction,
    tileUploading: Boolean(uploadingTileId),
    extracting,
    busy,
  });
  const queueBlocked = moodboardQueueBlockReason({
    hasTiles: tiles.length > 0,
    hasInstruction,
    tileUploading: Boolean(uploadingTileId),
    busy,
  });
  const statusLine = moodboardSessionStatusLine({
    tileCount: tiles.length,
    hasPlate,
    hasLookPack: Boolean(stagedLookPack),
  });
  const lookPhase = resolveLookPlayPhase({
    tileCount: tiles.length,
    hasInstruction,
    hasLookPack: Boolean(stagedLookPack),
    hasPlate,
    softAdvanceActive: Boolean(softAdvance),
  });
  const daySkipHref = toMobileStudioHref(
    character ? resolvePlayStepHref('day', character.id) : '/day'
  );
  const platePreviewUrl = plate?.imageUrl?.trim()
    ? cacheBustIdentityMediaUrl(plate.imageUrl.trim())
    : '';
  const scenePreviewUrl = actions.comfyUiPreviewUrl?.trim() || '';
  const demoteQueue = Boolean(softAdvance || stagedLookPack);

  const handoff = async (target: 'fitting' | 'day' | 'play') => {
    if (target === 'fitting') {
      const href = await sendLookToFitting();
      if (href) {
        softAdvanceHref(href, 'Outfit');
      }
      return;
    }
    if (target === 'day') {
      const href = await sendLookToDay();
      if (href) {
        softAdvanceHref(href, 'Day');
      }
      return;
    }
    const href = await sendLookToRoleplay();
    if (href) {
      softAdvanceHref(href, 'Story');
    }
  };

  return (
    <div className="space-y-4" data-testid="mobile-moodboard">
      <div className="space-y-1">
        <h1 className="type-display text-2xl tracking-tight">Look</h1>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          Stack look tiles, extract a pack, continue to Outfit or Day.
        </p>
      </div>

      <PlayFilmEngineBanner />
      <PlaySoftAdvanceBanner
        key={softAdvance?.nonce ?? 'idle'}
        target={softAdvance}
        onCancel={cancelSoftAdvance}
      />

      <LookPlayPhaseStrip activePhase={lookPhase} />
      <LookStatusStrip
        statusLine={statusLine}
        extractBlockReason={extractBlocked}
        queueBlockReason={!extractBlocked ? queueBlocked : null}
        previewHint={LOOK_PREVIEW_HINT}
        lookStatus={lookStatus}
      />

      <div className="space-y-2" data-testid="mobile-moodboard-presets">
        <p className="type-caption text-[var(--text-muted)]">Look presets</p>
        <div className="flex flex-wrap gap-2">
          {LOOK_PRESETS.map(preset => (
            <ChipButton
              key={preset.id}
              active={false}
              disabled={busy || extracting}
              title={preset.hint}
              onClick={() => {
                const tilesNext = tilesFromLookPreset(preset);
                updateToolSettings({ tiles: tilesNext });
                if (tilesNext[0]) {
                  setActiveTileId(tilesNext[0].id);
                }
                const pack = lookPackFromPreset(preset, character?.id);
                saveLookPack(pack);
                setLookStatus(`Loaded ${preset.label} — Extract look or Continue to Outfit.`);
              }}
            >
              {preset.label}
            </ChipButton>
          ))}
        </div>
        <p className="type-caption text-[var(--text-muted)]">Use for today — skip Outfit</p>
        <div className="grid gap-2" data-testid="moodboard-use-for-today">
          {LOOK_PRESETS.slice(0, 4).map(preset => (
            <Button
              key={`today-${preset.id}`}
              variant="secondary"
              disabled={busy || extracting}
              data-testid={`moodboard-preset-day-${preset.id}`}
              className="w-full justify-center"
              onClick={() => {
                const tilesNext = tilesFromLookPreset(preset);
                updateToolSettings({ tiles: tilesNext });
                if (tilesNext[0]) {
                  setActiveTileId(tilesNext[0].id);
                }
                const pack = lookPackFromPreset(preset, character?.id);
                saveLookPack(pack);
                void sendLookToDay().then(href => {
                  if (href) {
                    softAdvanceHref(href, 'Day', `Using ${preset.label} for today`);
                  }
                });
              }}
            >
              Use {preset.label} for today
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 p-3">
        <CharacterOsPicker
          shared={shared}
          hints={character?.hints}
          onApply={patch => {
            try {
              updateShared(patch);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not apply that character.');
            }
          }}
        />
        {character ? (
          <div className="mt-3 space-y-2" data-testid="mobile-moodboard-look-plate">
            <div className="flex flex-wrap gap-2">
              <label className="ui-btn-secondary inline-flex flex-1 cursor-pointer items-center justify-center px-3 py-1.5 text-sm">
                Upload plate
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  aria-label="Upload Cast look plate"
                  disabled={busy || plateUploading}
                  className="sr-only"
                  data-testid="mobile-moodboard-look-plate-upload"
                  onChange={event => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) {
                      void applyLookPlate({ file });
                    }
                  }}
                />
              </label>
              <Link
                href={toMobileStudioHref(
                  galleryPickPath('moodboard', { characterId: character.id })
                )}
                className="ui-btn-secondary inline-flex flex-1 items-center justify-center px-3 py-1.5 text-sm"
                data-testid="mobile-moodboard-look-plate-gallery"
                onClick={() => markMoodboardGalleryPlatePick()}
              >
                Gallery
              </Link>
              {hasPlate ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || plateUploading}
                  onClick={clearLookPlate}
                  className="flex-1 justify-center"
                >
                  Remove
                </Button>
              ) : null}
            </div>
            {platePreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={platePreviewUrl}
                alt="Look plate"
                className="max-h-36 w-full rounded-xl border border-[var(--border-subtle)] object-contain"
              />
            ) : (
              <p className="type-caption text-[var(--text-muted)]">
                No plate yet — upload, Gallery, or Extract look.
              </p>
            )}
          </div>
        ) : (
          <p className="type-caption mt-2 text-[var(--text-muted)]">
            Pick a Cast character to set a look plate here.
          </p>
        )}
      </div>

      <label className="block space-y-1.5 text-sm">
        <FieldLabel>Template</FieldLabel>
        <SelectInput
          value={templateId}
          disabled={busy}
          onChange={event =>
            updateToolSettings({
              templateId: event.target.value as typeof templateId,
            })
          }
        >
          {MOODBOARD_TEMPLATE_OPTIONS.map(option => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </SelectInput>
      </label>

      <div className="space-y-2" data-testid="mobile-moodboard-tiles">
        {tiles.length === 0 ? (
          <div className="space-y-2" data-testid="mobile-moodboard-empty">
            <p className="type-caption text-[var(--text-muted)]">
              No tiles yet — add starter refs, or extract from notes alone.
            </p>
            <Button
              variant="secondary"
              disabled={busy}
              data-testid="mobile-moodboard-seed-tiles"
              className="w-full justify-center"
              onClick={() => {
                addTile();
                addTile();
              }}
            >
              Add starter tiles
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tiles.map((tile, index) => (
              <ChipButton
                key={tile.id}
                active={activeTileId === tile.id}
                disabled={busy}
                onClick={() => setActiveTileId(tile.id)}
              >
                {tile.label?.trim() ||
                  MOODBOARD_TILE_ROLES.find(entry => entry.id === tile.role)?.label ||
                  `Tile ${index + 1}`}
              </ChipButton>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || tiles.length >= 4}
            onClick={addTile}
            className="flex-1 justify-center"
          >
            Add tile
          </Button>
          {activeTile ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => removeTile(activeTile.id)}
              className="flex-1 justify-center"
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      {activeTile ? (
        <div className="space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/30 p-3">
          <label className="block space-y-1.5 text-sm">
            <FieldLabel>Role</FieldLabel>
            <SelectInput
              value={activeTile.role}
              disabled={busy}
              onChange={event =>
                updateTile(activeTile.id, { role: event.target.value as MoodboardTileRole })
              }
            >
              {MOODBOARD_TILE_ROLES.map(role => (
                <option key={role.id} value={role.id}>
                  {role.label}
                </option>
              ))}
            </SelectInput>
          </label>
          <label className="block space-y-1.5 text-sm">
            <FieldLabel>Notes</FieldLabel>
            <TextArea
              rows={2}
              value={activeTile.notes ?? ''}
              placeholder="What this reference contributes"
              onChange={event => updateTile(activeTile.id, { notes: event.target.value })}
            />
          </label>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={busy || uploadingTileId === activeTile.id}
            className="ui-file-input block w-full"
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) {
                return;
              }
              void applyImageToTile(activeTile.id, { file }).catch(err => {
                setError(err instanceof Error ? err.message : 'Could not upload that photo.');
              });
            }}
          />
          <Link
            href={toMobileStudioHref(galleryPickPath('moodboard'))}
            className="ui-btn-secondary inline-flex w-full justify-center text-sm"
          >
            Choose from Gallery
          </Link>
          {activeTile.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={activeTile.imageUrl}
              alt={activeTile.label || 'Look reference'}
              className="max-h-44 w-full rounded-xl border border-[var(--border-subtle)] object-contain"
            />
          ) : null}
        </div>
      ) : null}

      <label className="block space-y-1.5 text-sm">
        <FieldLabel>Scene direction</FieldLabel>
        <TextArea
          rows={2}
          value={toolSettings.instruction ?? ''}
          placeholder="Optional shot notes"
          onChange={event => updateToolSettings({ instruction: event.target.value })}
        />
      </label>

      <div className="grid gap-2">
        <PrimaryButton
          disabled={Boolean(extractBlocked) || busy || extracting}
          loading={extracting}
          title={extractBlocked || undefined}
          onClick={() => {
            void extractLookPack().then(pack => {
              if (!pack) {
                return;
              }
              softAdvanceHref(
                lookPackFittingHref(pack),
                'Outfit',
                'Look ready — continuing to Outfit (or go to Day)',
                [
                  {
                    href: lookPackDayHref(pack),
                    label: 'Go to Day instead',
                    onNavigate: () => {
                      const characterId = pack.characterId?.trim();
                      if (characterId) {
                        bumpPlayCampaignStep({ characterId, stepId: 'day' });
                      }
                    },
                  },
                ]
              );
            });
          }}
          className="w-full justify-center"
          data-testid="mobile-moodboard-extract"
        >
          Extract look
        </PrimaryButton>
        <Button
          variant="secondary"
          disabled={busy || extracting}
          onClick={() => void handoff('fitting')}
          className="w-full justify-center"
          data-testid="mobile-moodboard-to-fitting"
        >
          Continue to Outfit
        </Button>
        {character && !softAdvance ? (
          <Link
            href={daySkipHref}
            className="ui-btn-secondary inline-flex w-full justify-center text-sm"
            data-testid="mobile-moodboard-skip-day"
            onClick={() => {
              bumpPlayCampaignStep({ characterId: character.id, stepId: 'day' });
            }}
          >
            Skip look · Day
          </Link>
        ) : null}
        <Button
          variant="ghost"
          disabled={Boolean(queueBlocked) || extracting}
          title={queueBlocked || LOOK_PREVIEW_HINT}
          onClick={previewPrompt}
          className="w-full justify-center"
          data-testid="mobile-moodboard-preview"
        >
          Preview prompt
        </Button>
        <Button
          variant={demoteQueue ? 'ghost' : 'secondary'}
          disabled={Boolean(queueBlocked) || extracting}
          title={queueBlocked || undefined}
          onClick={() => void queueScene()}
          className="w-full justify-center"
          data-testid="mobile-moodboard-queue"
        >
          {busy ? 'Queueing…' : 'Queue scene still'}
        </Button>
        {scenePreviewUrl ? (
          <div
            className="space-y-2 rounded-2xl border border-[var(--border-subtle)] p-3"
            data-testid="mobile-moodboard-scene-preview"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={scenePreviewUrl}
              alt="Queued scene still"
              className="max-h-40 w-full rounded-xl object-contain"
            />
            <Button
              variant="primary"
              disabled={!character || plateUploading || busy}
              className="w-full justify-center"
              data-testid="mobile-moodboard-keep-as-plate"
              onClick={() => void keepSceneAsLookPlate()}
            >
              Keep as plate
            </Button>
            <Button
              variant="secondary"
              disabled={Boolean(queueBlocked) || extracting}
              className="w-full justify-center"
              onClick={() => void queueScene()}
            >
              Requeue scene
            </Button>
          </div>
        ) : null}
        {stagedLookPack ? (
          <Button
            variant="secondary"
            disabled={busy || extracting}
            className="w-full justify-center"
            data-testid="mobile-moodboard-share-look"
            onClick={() => {
              const pack = loadLookPack();
              if (!pack) {
                setLookStatus('Extract a look first.');
                return;
              }
              void copyPortableLookPackShareLink({
                pack,
                name: character?.name ? `${character.name} look` : 'Look pack',
              }).then(result => {
                setLookStatus(
                  result.ok
                    ? 'Share link copied — send this look to another Castcut.'
                    : result.error || 'Could not copy share link.'
                );
              });
            }}
          >
            Share this look
          </Button>
        ) : null}
        <details className="rounded-xl border border-[var(--border-subtle)] px-3 py-2">
          <summary className="type-caption cursor-pointer text-[var(--text-muted)]">
            More · Day, Story, save
          </summary>
          <div className="mt-2 grid gap-2">
            <Button
              variant="secondary"
              disabled={busy || extracting}
              onClick={() => void handoff('day')}
              className="w-full justify-center"
              data-testid="mobile-moodboard-to-day"
            >
              Continue to Day
            </Button>
            <Button
              variant="ghost"
              disabled={busy || extracting || !character}
              onClick={() => void saveLookPackToCast()}
              className="w-full justify-center"
            >
              Save on Cast
            </Button>
            <Button
              variant="ghost"
              disabled={busy || extracting}
              onClick={() => void handoff('play')}
              className="w-full justify-center"
            >
              Continue in Story
            </Button>
          </div>
        </details>
      </div>

      {lookStatus ? <PlayPersistenceTriad compact /> : null}
      <FieldError>{error}</FieldError>
    </div>
  );
}
