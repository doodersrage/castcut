'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CharacterOsPicker from '@/components/CharacterOsPicker';
import PlaySoftAdvanceBanner from '@/components/PlaySoftAdvanceBanner';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { ChipButton, FieldError, FieldLabel, SelectInput, TextArea } from '@/components/ui/Field';
import { usePlaySoftAdvance } from '@/hooks/usePlaySoftAdvance';
import type { useMoodboardToolOrchestration } from '@/hooks/useMoodboardToolOrchestration';
import { markOnboardingFirstPlayCampaign } from '@/lib/onboarding-hooks';
import { bumpPlayCampaignStep } from '@/lib/play-campaign';
import { lookPackFittingHref, lookPackRoleplayHref } from '@/lib/look-pack';
import {
  MOODBOARD_TEMPLATE_OPTIONS,
  MOODBOARD_TILE_ROLES,
  type MoodboardTileRole,
} from '@/lib/moodboard-scene';
import { toMobileStudioHref } from '@/lib/mobile-studio';
import { galleryPickPath } from '@/lib/gallery-handoff';
import { LOOK_PRESETS, lookPackFromPreset, tilesFromLookPreset } from '@/lib/look-presets';
import { saveLookPack } from '@/lib/look-pack';

type ViewModel = ReturnType<typeof useMoodboardToolOrchestration>;

export default function MobileMoodboardToolSections(vm: ViewModel) {
  const router = useRouter();
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
    tiles,
    templateId,
    character,
    hasPlate,
    activeTile,
    updateTile,
    addTile,
    removeTile,
    applyImageToTile,
    queueScene,
    extractLookPack,
    sendLookToFitting,
    sendLookToDay,
    saveLookPackToCast,
    setLookStatus,
  } = vm;

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
    const pack = await extractLookPack();
    if (!pack) {
      return;
    }
    markOnboardingFirstPlayCampaign();
    if (pack.characterId) {
      bumpPlayCampaignStep({
        characterId: pack.characterId,
        stepId: 'roleplay',
      });
    }
    router.push(toMobileStudioHref(lookPackRoleplayHref(pack)));
  };

  return (
    <div className="space-y-4" data-testid="mobile-moodboard">
      <div className="space-y-1">
        <h1 className="type-display text-2xl tracking-tight">Look</h1>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          Stack look tiles, extract a pack, continue to Outfit or Day.
        </p>
      </div>

      <PlaySoftAdvanceBanner
        key={softAdvance?.nonce ?? 'idle'}
        target={softAdvance}
        onCancel={cancelSoftAdvance}
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
        <p className="type-caption mt-2 text-[var(--text-muted)]">
          {hasPlate
            ? 'Cast plate ready — Extract look will replace it for Outfit.'
            : 'No Cast plate yet — Extract look will set or queue one for Outfit.'}
        </p>
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

      <div className="space-y-2">
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
            href={galleryPickPath('moodboard')}
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
          disabled={busy || extracting}
          loading={extracting}
          onClick={() => {
            void extractLookPack().then(pack => {
              if (!pack) {
                return;
              }
              markOnboardingFirstPlayCampaign();
              if (pack.characterId) {
                bumpPlayCampaignStep({
                  characterId: pack.characterId,
                  stepId: 'fitting',
                });
              }
              softAdvanceHref(lookPackFittingHref(pack), 'Outfit');
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
        <Button
          variant="ghost"
          disabled={busy || extracting}
          onClick={() => void queueScene()}
          className="w-full justify-center"
        >
          {busy ? 'Queueing…' : 'Queue scene still'}
        </Button>
        <details className="rounded-xl border border-[var(--border-subtle)] px-3 py-2">
          <summary className="type-caption cursor-pointer text-[var(--text-muted)]">
            More · Day skip, Story, save
          </summary>
          <div className="mt-2 grid gap-2">
            {LOOK_PRESETS.map(preset => (
              <Button
                key={`day-${preset.id}`}
                variant="ghost"
                disabled={busy || extracting}
                data-testid={`moodboard-preset-day-${preset.id}`}
                onClick={() => {
                  const tilesNext = tilesFromLookPreset(preset);
                  updateToolSettings({ tiles: tilesNext });
                  const pack = lookPackFromPreset(preset, character?.id);
                  saveLookPack(pack);
                  void handoff('day');
                }}
                className="w-full justify-center"
              >
                {preset.label} → Day
              </Button>
            ))}
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

      {lookStatus ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="mobile-moodboard-status">
          {lookStatus}
        </p>
      ) : null}
      <FieldError>{error}</FieldError>
    </div>
  );
}
