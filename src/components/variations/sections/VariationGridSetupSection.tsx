'use client';

import SportPresetChips from '@/components/SportPresetChips';
import { HistoryHintSeedPanel } from '@/components/scene-tool/HistoryHintSeedPanel';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import type { MatrixAxisKind } from '@/lib/variation-matrix';
import type { VariationTarget } from '@/lib/variation-request-body';
import { SHOT_SCALE_LABEL } from '@/lib/tool-ui-labels';
import { accentFocusClass, accentRingClass } from '@/components/ui/ToolPageShell';
import { FieldLabel, TextArea } from '@/components/ui/Field';
import { VARIATION_GRID_ACCENT } from '@/components/variations/variation-grid-shared';
import type { useVariationGridOrchestration } from '@/hooks/useVariationGridOrchestration';

type Props = Pick<
  ReturnType<typeof useVariationGridOrchestration>,
  | 'isSimple'
  | 'shared'
  | 'toolSettings'
  | 'updateToolSettings'
  | 'target'
  | 'hintSource'
  | 'historySeedScope'
  | 'historyTool'
  | 'historyCandidateCount'
  | 'gridMode'
  | 'count'
  | 'matrixRowCount'
  | 'matrixColCount'
  | 'matrixAxisRow'
  | 'matrixAxisCol'
>;

export function VariationGridSetupSection({
  isSimple,
  toolSettings,
  updateToolSettings,
  target,
  hintSource,
  historySeedScope,
  historyTool,
  gridMode,
  count,
  matrixRowCount,
  matrixColCount,
  matrixAxisRow,
  matrixAxisCol,
}: Props) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <FieldLabel>Generator</FieldLabel>
          <select
            value={target}
            onChange={event =>
              updateToolSettings({
                target: event.target.value as VariationTarget,
              })
            }
            className="ui-input w-full px-3 py-2 text-sm"
          >
            <option value="generate">Generate (keywords)</option>
            <option value="character">Character</option>
            <option value="duo">Duo</option>
            <option value="pet">Pet</option>
            <option value="fantasy">Fantasy</option>
            <option value="background">Background</option>
          </select>
        </div>

        <div className="space-y-1">
          <FieldLabel>Grid mode</FieldLabel>
          <select
            value={gridMode}
            onChange={event =>
              updateToolSettings({
                gridMode: event.target.value as 'roll' | 'matrix' | 'imported',
              })
            }
            className="ui-input w-full px-3 py-2 text-sm"
          >
            <option value="roll">Roll variations</option>
            {!isSimple ? (
              <>
                <option value="matrix">Variation matrix</option>
                <option value="imported">Imported batch (Topics)</option>
              </>
            ) : null}
          </select>
        </div>

        {gridMode === 'roll' ? (
          <div className="space-y-1">
            <FieldLabel>Count ({count})</FieldLabel>
            <input
              type="range"
              min={2}
              max={12}
              value={count}
              onChange={event => updateToolSettings({ count: Number(event.target.value) })}
              className={`w-full ${accentRingClass(VARIATION_GRID_ACCENT)}`}
            />
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <FieldLabel>Row axis</FieldLabel>
              <select
                value={matrixAxisRow}
                onChange={event =>
                  updateToolSettings({
                    matrixAxisRow: event.target.value as MatrixAxisKind,
                  })
                }
                className="ui-input w-full px-3 py-2 text-sm"
              >
                <option value="variation">Variation strength</option>
                <option value="sportPreset">Sport preset</option>
                <option value="location">Location</option>
              </select>
            </div>

            <div className="space-y-1">
              <FieldLabel>Column axis</FieldLabel>
              <select
                value={matrixAxisCol}
                onChange={event =>
                  updateToolSettings({
                    matrixAxisCol: event.target.value as MatrixAxisKind,
                  })
                }
                className="ui-input w-full px-3 py-2 text-sm"
              >
                <option value="variation">Variation strength</option>
                <option value="sportPreset">Sport preset</option>
                <option value="location">Location</option>
              </select>
            </div>

            <div className="space-y-1">
              <FieldLabel>Rows ({matrixRowCount})</FieldLabel>
              <input
                type="range"
                min={2}
                max={6}
                value={matrixRowCount}
                onChange={event =>
                  updateToolSettings({ matrixRowCount: Number(event.target.value) })
                }
                className={`w-full ${accentRingClass(VARIATION_GRID_ACCENT)}`}
              />
            </div>

            <div className="space-y-1">
              <FieldLabel>Columns ({matrixColCount})</FieldLabel>
              <input
                type="range"
                min={2}
                max={6}
                value={matrixColCount}
                onChange={event =>
                  updateToolSettings({ matrixColCount: Number(event.target.value) })
                }
                className={`w-full ${accentRingClass(VARIATION_GRID_ACCENT)}`}
              />
            </div>
          </>
        )}
      </div>

      {(target === 'character' || target === 'duo' || target === 'pet' || target === 'fantasy') && (
        <div className="space-y-1">
          <FieldLabel>{SHOT_SCALE_LABEL}</FieldLabel>
          <select
            value={toolSettings.portraitStyle ?? 'action'}
            onChange={event =>
              updateToolSettings({
                portraitStyle: event.target.value as 'portrait' | 'full-body' | 'action',
              })
            }
            className="ui-input w-full px-3 py-2 text-sm"
          >
            <option value="portrait">Portrait</option>
            <option value="full-body">Full body</option>
            <option value="action">Action</option>
          </select>
        </div>
      )}

      {target === 'duo' && (
        <SportPresetChips
          selectedId={toolSettings.sportPresetId ?? ''}
          mode="duo"
          onSelect={preset => updateToolSettings({ sportPresetId: preset.id })}
        />
      )}

      <HistoryHintSeedPanel
        tool={historyTool}
        hintSource={hintSource}
        historySeedScope={historySeedScope}
        hints={toolSettings.hints ?? ''}
        randomTheme={toolSettings.randomTheme ?? ''}
        lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
        onHintSourceChange={source => updateToolSettings({ hintSource: source })}
        onHistorySeedScopeChange={scope => updateToolSettings({ historySeedScope: scope })}
        onHintsChange={value => {
          updateToolSettings({ hints: value });
          rememberDraftFields({
            toolKey: 'variations',
            label: 'Variations',
            href: '/variations',
            fields: [value],
          });
        }}
        onRandomThemeChange={value => updateToolSettings({ randomTheme: value })}
        onHistorySeedApplied={result => {
          updateToolSettings({
            hints: result.hints,
            lastHistorySeedEntryId: result.entryId,
          });
        }}
        accentFocusClassName={accentFocusClass(VARIATION_GRID_ACCENT)}
      />

      <FieldLabel>Hints / base input</FieldLabel>
      <TextArea
        value={toolSettings.hints ?? ''}
        onChange={event => {
          const value = event.target.value;
          updateToolSettings({ hints: value });
          rememberDraftFields({
            toolKey: 'variations',
            label: 'Variations',
            href: '/variations',
            fields: [value],
          });
        }}
        rows={4}
        placeholder="e.g. neon alley, rain, black cat"
        className={accentFocusClass(VARIATION_GRID_ACCENT)}
        disabled={hintSource !== 'manual'}
      />
    </>
  );
}
