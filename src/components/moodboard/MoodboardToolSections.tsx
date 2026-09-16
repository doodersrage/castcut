'use client';

import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import CharacterOsPicker from '@/components/CharacterOsPicker';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import PlaySoftAdvanceBanner from '@/components/PlaySoftAdvanceBanner';
import { usePlaySoftAdvance } from '@/hooks/usePlaySoftAdvance';
import ScenePromptResultPanel from '@/components/scene-tool/ScenePromptResultPanel';
import { Button, ButtonLink } from '@/components/ui/Button';
import {
  ChipButton,
  FieldDivider,
  FieldError,
  FieldLabel,
  SelectInput,
  TextArea,
} from '@/components/ui/Field';
import {
  ToolActionRow,
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { isLeanWorkspaceMode } from '@/lib/workspace-mode';
import { LOOK_PRESETS, lookPackFromPreset, tilesFromLookPreset } from '@/lib/look-presets';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useGalleryHandoff } from '@/hooks/useGalleryHandoff';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import { applyCharacterRecord, addCharacterLookPack, getCharacter } from '@/lib/character-os';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { galleryPickPath } from '@/lib/gallery-handoff';
import { resolveFittingPlateFromCharacter } from '@/lib/fitting-room';
import { collectIsolateSourceUrls, loadImageBlobFromUrls } from '@/lib/isolate-subject';
import { sharedLlmRequestBody } from '@/lib/llm-request-options';
import {
  buildLookPackFromMoodboard,
  downloadLookPackFile,
  loadLookPack,
  lookPackDayHref,
  lookPackFittingHref,
  lookPackRoleplayHref,
  saveLookPack,
} from '@/lib/look-pack';
import { markOnboardingFirstPlayCampaign } from '@/lib/onboarding-hooks';
import { bumpPlayCampaignStep, playCampaignHref } from '@/lib/play-campaign';
import {
  MOODBOARD_TEMPLATE_OPTIONS,
  MOODBOARD_TILE_ROLES,
  newMoodboardTileId,
  normalizeMoodboardTemplateId,
  normalizeMoodboardTiles,
  synthesizeMoodboardPrompt,
  type MoodboardTile,
  type MoodboardTileRole,
} from '@/lib/moodboard-scene';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { buildRoleplayQueueStillOptions } from '@/lib/roleplay-play-core';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  DEFAULT_MOODBOARD_TOOL_CACHE,
  loadSettingsCache,
  saveSharedSettings,
} from '@/lib/settings-cache';

const ACCENT = 'cyan' as const;
const TOOL_ID = 'moodboard' as const;
const MAX_TILES = 4;

import type { useMoodboardToolOrchestration } from '@/hooks/useMoodboardToolOrchestration';

type ViewModel = ReturnType<typeof useMoodboardToolOrchestration>;
type Props = ViewModel & { description: string };

export default function MoodboardToolSections({ description, ...vm }: Props) {
  const {
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    output,
    setOutput,
    copied,
    setCopied,
    error,
    setError,
    busy,
    extracting,
    lookStatus,
    setLookStatus,
    activeTileId,
    setActiveTileId,
    uploadingTileId,
    tiles,
    templateId,
    character,
    selectedModel,
    hasPlate,
    activeTile,
    actions,
    updateTile,
    addTile,
    removeTile,
    applyImageToTile,
    queueScene,
    previewPrompt,
    extractLookPack,
    sendLookToFitting,
    sendLookToDay,
    sendLookToRoleplay,
    saveLookPackToCast,
  } = vm;
  const workspaceMode = useWorkspaceMode();
  const leanChrome = isLeanWorkspaceMode(workspaceMode);
  const { softAdvance, cancelSoftAdvance, softAdvanceHref } = usePlaySoftAdvance();
  const engineControls = (
    <SharedToolControls
      shared={shared}
      onModelChange={model => updateShared({ model })}
      onDetailChange={detail => updateShared({ detail })}
      onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
      showWardrobeOption={false}
      seedLlmWithIngredients={false}
      autoFixRules={shared.autoFixRules !== false}
      onAutoFixRulesChange={value => updateShared({ autoFixRules: value })}
      recommendFromText={output}
      toolId={TOOL_ID}
      onSharedSettingsChange={updateShared}
      variant="roleplay"
    />
  );
  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Look · {selectedModel?.comfyNode ?? 'model'}</ToolBadge>}
      title="Look"
      description={description}
      sidebarPersistKey="moodboard"
      sidebar={engineControls}
      sidebarTitle={leanChrome ? false : undefined}
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.moodboard} />
      <PlaySoftAdvanceBanner
        key={softAdvance?.nonce ?? 'idle'}
        target={softAdvance}
        onCancel={cancelSoftAdvance}
      />

      <ToolSection
        title="Look presets"
        description="Load tiles, or jump straight to Day with a look."
        data-testid="moodboard-presets"
      >
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
        <p className="type-caption mt-3 text-[var(--text-muted)]">Use for today — skip Outfit</p>
        <div className="mt-2 flex flex-wrap gap-2" data-testid="moodboard-use-for-today">
          {LOOK_PRESETS.slice(0, 6).map(preset => (
            <Button
              key={`today-${preset.id}`}
              size="sm"
              variant="secondary"
              disabled={busy || extracting}
              data-testid={`moodboard-preset-day-${preset.id}`}
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
      </ToolSection>

      <ToolSection
        title="Character (optional)"
        description="Attach a Cast character for subject notes. Extract look replaces the Outfit plate (or queues a new one)."
        data-testid="moodboard-character"
      >
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
      </ToolSection>

      <ToolSection title="Template" description="How look cues merge into the scene prompt.">
        <div className="flex flex-wrap gap-2">
          {MOODBOARD_TEMPLATE_OPTIONS.map(option => (
            <ChipButton
              key={option.id}
              active={templateId === option.id}
              disabled={busy}
              onClick={() => updateToolSettings({ templateId: option.id })}
            >
              {option.label}
            </ChipButton>
          ))}
        </div>
        <p className="type-caption mt-2 text-[var(--text-muted)]">
          {MOODBOARD_TEMPLATE_OPTIONS.find(entry => entry.id === templateId)?.hint}
        </p>
      </ToolSection>

      <ToolSection
        title="Reference tiles"
        description={`Up to ${MAX_TILES} tiles — role, notes, and optional still per tile.`}
        data-testid="moodboard-tiles"
      >
        {tiles.length === 0 ? (
          <div className="space-y-2" data-testid="moodboard-empty">
            <p className="type-caption text-[var(--text-muted)]">
              No tiles yet — add refs, or extract a look from notes alone.
            </p>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              data-testid="moodboard-seed-tiles"
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
        <ToolActionRow className="mt-3">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || tiles.length >= MAX_TILES}
            onClick={addTile}
          >
            Add tile
          </Button>
          {activeTile ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => removeTile(activeTile.id)}
            >
              Remove tile
            </Button>
          ) : null}
        </ToolActionRow>

        {activeTile ? (
          <>
            <FieldDivider />
            <label className="space-y-2">
              <FieldLabel>Role</FieldLabel>
              <SelectInput
                value={activeTile.role}
                disabled={busy}
                className={accentFocusClass(ACCENT)}
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
            <label className="mt-3 space-y-2">
              <FieldLabel>Label (optional)</FieldLabel>
              <TextArea
                rows={1}
                value={activeTile.label ?? ''}
                className={accentFocusClass(ACCENT)}
                placeholder="e.g. rainy neon alley"
                onChange={event => updateTile(activeTile.id, { label: event.target.value })}
              />
            </label>
            <label className="mt-3 space-y-2">
              <FieldLabel>Notes</FieldLabel>
              <TextArea
                rows={3}
                value={activeTile.notes ?? ''}
                className={accentFocusClass(ACCENT)}
                placeholder="What should this reference contribute?"
                onChange={event => updateTile(activeTile.id, { notes: event.target.value })}
              />
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept="image/*"
                disabled={busy || uploadingTileId === activeTile.id}
                className="ui-file-input block min-w-0 flex-1"
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
              <ButtonLink href={galleryPickPath('moodboard')} variant="secondary" size="sm">
                Choose from Gallery
              </ButtonLink>
            </div>
            {activeTile.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activeTile.imageUrl}
                alt={activeTile.label || 'Look reference'}
                className="mt-3 max-h-48 rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-contain"
              />
            ) : (
              <p className="type-caption mt-2 text-[var(--text-muted)]">
                Optional reference still — used when extracting a look pack via vision; text notes
                always feed the scene prompt.
              </p>
            )}
          </>
        ) : null}
      </ToolSection>

      <ToolSection
        title="Scene direction"
        description="Optional instruction layered on top of the board."
      >
        <TextArea
          rows={3}
          value={toolSettings.instruction ?? ''}
          className={accentFocusClass(ACCENT)}
          placeholder="e.g. cinematic wide shot, subject centered, soft rim light"
          onChange={event => updateToolSettings({ instruction: event.target.value })}
        />
      </ToolSection>

      <ToolActionRow>
        <Button
          size="sm"
          variant="primary"
          disabled={busy || extracting}
          data-testid="moodboard-extract-look"
          onClick={() => {
            void extractLookPack().then(pack => {
              if (!pack) {
                return;
              }
              softAdvanceHref(lookPackFittingHref(pack), 'Outfit');
            });
          }}
        >
          {extracting ? 'Extracting…' : 'Extract look'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || extracting}
          onClick={() => {
            void sendLookToFitting().then(href => {
              if (!href) {
                return;
              }
              softAdvanceHref(href, 'Outfit');
            });
          }}
        >
          Continue to Outfit
        </Button>
        <Button size="sm" variant="ghost" disabled={busy || extracting} onClick={previewPrompt}>
          Preview prompt
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || extracting}
          onClick={() => void queueScene()}
        >
          {busy ? 'Queueing…' : 'Queue scene'}
        </Button>
        <details className="w-full">
          <summary className="type-caption cursor-pointer text-[var(--text-muted)]">
            More · Story, save, export
          </summary>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || extracting}
              onClick={() => {
                void sendLookToDay().then(href => {
                  if (href) {
                    softAdvanceHref(href, 'Day');
                  }
                });
              }}
            >
              Continue to Day
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || extracting}
              onClick={() => void sendLookToRoleplay()}
            >
              Continue in Story
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || extracting || !character}
              onClick={() => void saveLookPackToCast()}
            >
              Save on Cast
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || extracting}
              onClick={() => {
                const pack = loadLookPack();
                if (!pack) {
                  setLookStatus('Extract a look first.');
                  return;
                }
                downloadLookPackFile({
                  pack,
                  name: character?.name ? `${character.name} look` : 'look-pack',
                });
                setLookStatus('Downloaded look pack JSON.');
              }}
            >
              Export JSON
            </Button>
            {character ? (
              <ButtonLink href={playCampaignHref(character.id)} size="sm" variant="ghost">
                Open Film
              </ButtonLink>
            ) : null}
          </div>
        </details>
      </ToolActionRow>
      {lookStatus ? <p className="type-caption text-[var(--text-muted)]">{lookStatus}</p> : null}
      {error ? <FieldError>{error}</FieldError> : null}

      <ScenePromptResultPanel
        output={output}
        onOutputChange={setOutput}
        result={null}
        copied={copied}
        onCopy={() => {
          if (!output) {
            return;
          }
          void navigator.clipboard.writeText(output).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          });
        }}
        actions={actions}
        shared={shared}
        selectedComfyNode={selectedModel?.comfyNode ?? 'model'}
        hints={toolSettings.instruction}
        queueLabel="Queue scene"
        onSendComfyUi={() => void queueScene()}
      />
    </ToolLayout>
  );
}
