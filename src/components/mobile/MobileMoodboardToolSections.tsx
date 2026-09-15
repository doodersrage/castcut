'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import CharacterOsPicker from '@/components/CharacterOsPicker';
import PlaySoftAdvanceBanner, {
  type PlaySoftAdvanceTarget,
} from '@/components/PlaySoftAdvanceBanner';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { ChipButton, FieldError, FieldLabel, SelectInput, TextArea } from '@/components/ui/Field';
import type { useMoodboardToolOrchestration } from '@/hooks/useMoodboardToolOrchestration';
import { markOnboardingFirstPlayCampaign } from '@/lib/onboarding-hooks';
import { bumpPlayCampaignStep } from '@/lib/play-campaign';
import { lookPackDayHref, lookPackFittingHref, lookPackRoleplayHref } from '@/lib/look-pack';
import {
  MOODBOARD_TEMPLATE_OPTIONS,
  MOODBOARD_TILE_ROLES,
  type MoodboardTileRole,
} from '@/lib/moodboard-scene';
import { toMobileStudioHref } from '@/lib/mobile-studio';
import { galleryPickPath } from '@/lib/gallery-handoff';

type ViewModel = ReturnType<typeof useMoodboardToolOrchestration>;

export default function MobileMoodboardToolSections(vm: ViewModel) {
  const router = useRouter();
  const [softAdvance, setSoftAdvance] = useState<PlaySoftAdvanceTarget | null>(null);
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
    saveLookPackToCast,
  } = vm;

  const handoff = async (target: 'fitting' | 'day' | 'play') => {
    const pack = await extractLookPack();
    if (!pack) {
      return;
    }
    markOnboardingFirstPlayCampaign();
    if (pack.characterId) {
      bumpPlayCampaignStep({
        characterId: pack.characterId,
        stepId: target === 'play' ? 'roleplay' : target,
      });
    }
    const href =
      target === 'fitting'
        ? lookPackFittingHref(pack)
        : target === 'day'
          ? lookPackDayHref(pack)
          : lookPackRoleplayHref(pack);
    router.push(toMobileStudioHref(href));
  };

  return (
    <div className="space-y-4" data-testid="mobile-moodboard">
      <div className="space-y-1">
        <h1 className="type-display text-2xl tracking-tight">Moodboard</h1>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          Stack look tiles, extract a pack, hand off to Fitting or Day.
        </p>
      </div>

      <PlaySoftAdvanceBanner
        key={softAdvance?.nonce ?? 'idle'}
        target={softAdvance}
        onCancel={() => setSoftAdvance(null)}
      />

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
          {hasPlate ? 'Cast plate ready for Fitting.' : 'No Cast plate yet — stills still work.'}
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
              alt={activeTile.label || 'Moodboard reference'}
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
              setSoftAdvance({
                href: toMobileStudioHref(lookPackFittingHref(pack)),
                label: 'Outfit',
                nonce: Date.now(),
              });
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
          Use in Fitting
        </Button>
        <Button
          variant="secondary"
          disabled={busy || extracting}
          onClick={() => void handoff('day')}
          className="w-full justify-center"
          data-testid="mobile-moodboard-to-day"
        >
          Use in Day
        </Button>
        <Button
          variant="ghost"
          disabled={busy || extracting}
          onClick={() => void queueScene()}
          className="w-full justify-center"
        >
          {busy ? 'Queueing…' : 'Queue scene still'}
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
          Continue in Play
        </Button>
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
