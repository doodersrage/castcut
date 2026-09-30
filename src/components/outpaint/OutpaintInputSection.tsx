'use client';

import EditToolRecipeStrip from '@/components/EditToolRecipeStrip';
import { HistoryHintSeedPanel } from '@/components/scene-tool/HistoryHintSeedPanel';
import TurboEditStrengthControls from '@/components/TurboEditStrengthControls';
import VisionScanButton from '@/components/VisionScanButton';
import { Button, ButtonLink, PrimaryButton } from '@/components/ui/Button';
import { FieldError, FieldLabel, TextArea, TextInput } from '@/components/ui/Field';
import { ToolSection, accentButtonClass, accentFocusClass } from '@/components/ui/ToolPageShell';
import { galleryPickPath } from '@/lib/gallery-handoff';
import { normalizeTurboEditStrength } from '@/lib/turbo-edit-strength';
import { normalizeHistorySeedScope, normalizeSceneHintSource } from '@/lib/scene-hint-source';
import type { useOutpaintToolOrchestration } from '@/hooks/useOutpaintToolOrchestration';

const ACCENT = 'amber' as const;

type ViewModel = ReturnType<typeof useOutpaintToolOrchestration>;

type Props = Pick<
  ViewModel,
  | 'shared'
  | 'toolSettings'
  | 'updateShared'
  | 'updateToolSettings'
  | 'intent'
  | 'pad'
  | 'sourceUrl'
  | 'scanning'
  | 'status'
  | 'error'
  | 'busy'
  | 'setIntent'
  | 'setPadSide'
  | 'onFile'
  | 'scanWithVision'
  | 'runOutpaint'
  | 'clearSource'
>;

export default function OutpaintInputSection({
  shared,
  toolSettings,
  updateShared,
  updateToolSettings,
  intent,
  pad,
  sourceUrl,
  scanning,
  status,
  error,
  busy,
  setIntent,
  setPadSide,
  onFile,
  scanWithVision,
  runOutpaint,
  clearSource,
}: Props) {
  return (
    <>
      <EditToolRecipeStrip
        toolId="outpaint"
        shared={shared}
        onApplied={next => updateShared(next)}
      />
      <TurboEditStrengthControls
        model={shared.model}
        tool="outpaint"
        value={normalizeTurboEditStrength(shared.turboEditStrength)}
        onChange={turboEditStrength => updateShared({ turboEditStrength })}
      />
      <HistoryHintSeedPanel
        tool="outpaint"
        hintSource={normalizeSceneHintSource(toolSettings.hintSource)}
        historySeedScope={normalizeHistorySeedScope(toolSettings.historySeedScope)}
        hints={intent}
        randomTheme={toolSettings.randomTheme ?? ''}
        lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
        onHintSourceChange={source => updateToolSettings({ hintSource: source })}
        onHistorySeedScopeChange={scope => updateToolSettings({ historySeedScope: scope })}
        onHintsChange={setIntent}
        onRandomThemeChange={theme => updateToolSettings({ randomTheme: theme })}
        onHistorySeedApplied={result =>
          updateToolSettings({
            intent: result.hints,
            lastHistorySeedEntryId: result.entryId,
            hintSource: 'history',
          })
        }
        accentFocusClassName={accentFocusClass(ACCENT)}
      />
      <ToolSection title="Source">
        <FieldLabel>Image</FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            aria-label="Choose an image file"
            accept="image/*"
            onChange={event => onFile(event.target.files?.[0] ?? null)}
            className={`ui-file-input min-w-[14rem] flex-1 ${accentFocusClass(ACCENT)}`}
          />
          <ButtonLink href={galleryPickPath('outpaint')} variant="secondary" size="sm">
            Choose from Gallery
          </ButtonLink>
          <VisionScanButton
            disabled={!sourceUrl || busy}
            scanning={scanning}
            onClick={() => void scanWithVision()}
          />
        </div>
        <p className="mt-2 type-caption text-[var(--text-muted)]">
          Scan with vision fills Intent for the new border from the still.
        </p>
        {sourceUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sourceUrl}
            alt="Outpaint source"
            className="mt-3 max-h-64 rounded-xl border border-[var(--border-subtle)]/80 object-contain shadow-[0_12px_40px_-24px_rgba(0,0,0,0.8)]"
          />
        ) : (
          <p className="mt-3 rounded-xl border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-3 py-2.5 text-xs text-[var(--tint-warning-text)]">
            Upload a source image, or send one here from the Gallery Outpaint action.
          </p>
        )}
      </ToolSection>
      <ToolSection title="Expand">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(['top', 'right', 'bottom', 'left'] as const).map(side => (
            <label key={side} className="space-y-1.5 text-xs text-[var(--text-muted)]">
              <span className="capitalize">{side} (px)</span>
              <TextInput
                type="number"
                min={0}
                max={1024}
                value={String(pad[side])}
                onChange={event => setPadSide(side, Number(event.target.value) || 0)}
                className={accentFocusClass(ACCENT)}
              />
            </label>
          ))}
        </div>
        <div className="mt-4 space-y-1.5">
          <FieldLabel hint="Describes what should appear in the new border.">
            Intent for the new border
          </FieldLabel>
          <TextArea
            rows={3}
            value={intent}
            onChange={event => setIntent(event.target.value)}
            placeholder="continue the scene naturally with matching lighting"
            className={accentFocusClass(ACCENT)}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <PrimaryButton
            accentClassName={accentButtonClass(ACCENT)}
            type="button"
            data-action="primary-generate"
            disabled={busy || !sourceUrl}
            onClick={() => void runOutpaint()}
          >
            {busy ? 'Working…' : 'Queue outpaint'}
          </PrimaryButton>
          <Button
            type="button"
            variant="secondary"
            disabled={!sourceUrl && !intent}
            onClick={clearSource}
          >
            Clear source
          </Button>
          {status ? <p className="text-xs text-[var(--text-muted)]">{status}</p> : null}
        </div>
        <FieldError>{error}</FieldError>
      </ToolSection>
    </>
  );
}
