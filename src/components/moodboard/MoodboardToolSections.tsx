'use client';

import { useMemo } from 'react';
import CharacterOsPicker from '@/components/CharacterOsPicker';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import PlaySoftAdvanceBanner from '@/components/PlaySoftAdvanceBanner';
import PlayFilmFunnelChrome from '@/components/PlayFilmFunnelChrome';
import PlayFilmEngineBanner from '@/components/PlayFilmEngineBanner';
import PlayPersistenceTriad from '@/components/PlayPersistenceTriad';
import LookPlayPhaseStrip from '@/components/moodboard/LookPlayPhaseStrip';
import LookStatusStrip from '@/components/moodboard/LookStatusStrip';
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
import { usePlaySoftAdvance } from '@/hooks/usePlaySoftAdvance';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { cacheBustIdentityMediaUrl } from '@/lib/gallery-media-client';
import { galleryPickPath } from '@/lib/gallery-handoff';
import {
  copyPortableLookPackShareLink,
  downloadLookPackFile,
  loadLookPack,
  lookPackDayHref,
  lookPackFittingHref,
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
import { bumpPlayCampaignStep, playCampaignHref } from '@/lib/play-campaign';
import { resolvePlayStepHref } from '@/lib/play-step-machine';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { isLeanWorkspaceMode } from '@/lib/workspace-mode';
import type { useMoodboardToolOrchestration } from '@/hooks/useMoodboardToolOrchestration';

const ACCENT = 'cyan' as const;
const TOOL_ID = 'moodboard' as const;
const MAX_TILES = 4;

type ViewModel = ReturnType<typeof useMoodboardToolOrchestration>;
type Props = ViewModel & { description: string };

export default function MoodboardToolSections({ description, ...vm }: Props) {
  const {
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
    plateUploading,
    tiles,
    templateId,
    character,
    selectedModel,
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
  } = vm;
  const workspaceMode = useWorkspaceMode();
  const leanChrome = isLeanWorkspaceMode(workspaceMode);
  const { softAdvance, cancelSoftAdvance, softAdvanceHref } = usePlaySoftAdvance();
  const stagedLookPack = useMemo(() => {
    void lookStatus;
    return loadLookPack();
  }, [lookStatus, tiles, character?.id]);
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
  const daySkipHref = character ? resolvePlayStepHref('day', character.id) : '/day';
  const platePreviewUrl = plate?.imageUrl?.trim()
    ? cacheBustIdentityMediaUrl(plate.imageUrl.trim())
    : '';
  const scenePreviewUrl = actions.comfyUiPreviewUrl?.trim() || '';
  const demoteQueue = Boolean(softAdvance || stagedLookPack);

  const startExtractSoftAdvance = (pack: NonNullable<ReturnType<typeof loadLookPack>>) => {
    const fittingHref = lookPackFittingHref(pack);
    const dayHref = lookPackDayHref(pack);
    softAdvanceHref(fittingHref, 'Outfit', 'Look ready — continuing to Outfit (or go to Day)', [
      {
        href: dayHref,
        label: 'Go to Day instead',
        onNavigate: () => {
          const characterId = pack.characterId?.trim();
          if (characterId) {
            bumpPlayCampaignStep({ characterId, stepId: 'day' });
          }
        },
      },
    ]);
  };

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
      <PlayFilmEngineBanner />
      <PlayFilmFunnelChrome />
      <PlaySoftAdvanceBanner
        key={softAdvance?.nonce ?? 'idle'}
        target={softAdvance}
        onCancel={cancelSoftAdvance}
      />

      <LookPlayPhaseStrip activePhase={lookPhase} />
      <LookStatusStrip
        className="mt-2"
        statusLine={statusLine}
        extractBlockReason={extractBlocked}
        queueBlockReason={!extractBlocked ? queueBlocked : null}
        previewHint={LOOK_PREVIEW_HINT}
        lookStatus={lookStatus}
      />
      {lookStatus ? (
        <div className="mt-2">
          <PlayPersistenceTriad compact />
        </div>
      ) : null}

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
        description="Attach a Cast character for subject notes. Upload or pick a look plate here, or let Extract queue a full-body plate."
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
        {character ? (
          <div className="mt-3 space-y-2" data-testid="moodboard-look-plate">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept="image/*"
                disabled={busy || plateUploading}
                className="ui-file-input block min-w-0 flex-1"
                data-testid="moodboard-look-plate-upload"
                onChange={event => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) {
                    void applyLookPlate({ file });
                  }
                }}
              />
              <ButtonLink
                href={galleryPickPath('moodboard', { characterId: character.id })}
                variant="secondary"
                size="sm"
                data-testid="moodboard-look-plate-gallery"
                onClick={() => markMoodboardGalleryPlatePick()}
              >
                Choose from Gallery
              </ButtonLink>
              {hasPlate ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy || plateUploading}
                  data-testid="moodboard-look-plate-clear"
                  onClick={clearLookPlate}
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
                className="max-h-40 rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-contain"
                data-testid="moodboard-look-plate-preview"
              />
            ) : (
              <p className="type-caption text-[var(--text-muted)]">
                No Cast plate yet — upload, Gallery, or Extract look.
              </p>
            )}
          </div>
        ) : (
          <p className="type-caption mt-2 text-[var(--text-muted)]">
            Pick a Cast character to upload a look plate in place.
          </p>
        )}
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
          disabled={Boolean(extractBlocked) || busy || extracting}
          title={extractBlocked || undefined}
          data-testid="moodboard-extract-look"
          onClick={() => {
            void extractLookPack().then(pack => {
              if (!pack) {
                return;
              }
              startExtractSoftAdvance(pack);
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
        {character && !softAdvance ? (
          <ButtonLink
            href={daySkipHref}
            size="sm"
            variant="secondary"
            data-testid="moodboard-skip-day"
            onClick={() => {
              bumpPlayCampaignStep({ characterId: character.id, stepId: 'day' });
            }}
          >
            Skip look · Day
          </ButtonLink>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          disabled={Boolean(queueBlocked) || extracting}
          title={queueBlocked || LOOK_PREVIEW_HINT}
          data-testid="moodboard-preview-prompt"
          onClick={previewPrompt}
        >
          Preview prompt
        </Button>
        <Button
          size="sm"
          variant={demoteQueue ? 'ghost' : 'secondary'}
          disabled={Boolean(queueBlocked) || extracting}
          title={queueBlocked || undefined}
          data-testid="moodboard-queue-scene"
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
            {stagedLookPack ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || extracting}
                data-testid="moodboard-share-look"
                onClick={() => {
                  void copyPortableLookPackShareLink({
                    pack: stagedLookPack,
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
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || extracting}
              onClick={() => {
                void sendLookToRoleplay().then(href => {
                  if (href) {
                    softAdvanceHref(href, 'Story');
                  }
                });
              }}
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
      {error ? <FieldError>{error}</FieldError> : null}

      {scenePreviewUrl ? (
        <div
          className="mt-3 flex flex-wrap items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3"
          data-testid="moodboard-scene-preview"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={scenePreviewUrl}
            alt="Queued scene still"
            className="max-h-40 rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-contain"
          />
          <div className="space-y-2">
            <p className="type-caption text-[var(--text-muted)]">
              Scene still ready — Keep as Cast look plate, or requeue.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="primary"
                disabled={!character || plateUploading || busy}
                data-testid="moodboard-keep-as-plate"
                onClick={() => void keepSceneAsLookPlate()}
              >
                Keep as plate
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={Boolean(queueBlocked) || extracting}
                data-testid="moodboard-requeue-scene"
                onClick={() => void queueScene()}
              >
                Requeue scene
              </Button>
            </div>
          </div>
        </div>
      ) : null}

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
        showQueueButton={false}
        onSendComfyUi={() => void queueScene()}
      />
    </ToolLayout>
  );
}
