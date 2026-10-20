'use client';

import type { BatchPromptItemActions } from '@/components/EnhancedPromptResult';
import ScenePromptResultPanel from '@/components/scene-tool/ScenePromptResultPanel';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import { regionalPromptCustomTokens } from '@/lib/prompt/regional-prompt-builder';
import { getSportPreset } from '@/lib/scene/sport-presets';
import { readVariationSeedFromMetadata } from '@/lib/variation/seed-metadata';
import type { useCharacterToolOrchestration } from '@/hooks/useCharacterToolOrchestration';

type CharacterToolViewModel = ReturnType<typeof useCharacterToolOrchestration>;

export function CharacterToolResultSection(vm: CharacterToolViewModel) {
  const {
    shared,
    toolSettings,
    updateShared,
    output,
    setOutput,
    batchResults,
    setBatchResults,
    result,
    copied,
    sceneMode,
    accent,
    actions,
    selectedModel,
    inferredSport,
    variationSeed,
    copyOutput,
    exportBatch,
    batchPrompts,
    soloBatchCount,
  } = vm;

  return (
    <>
      <ScenePromptResultPanel
        output={output}
        onOutputChange={setOutput}
        result={result}
        copied={copied}
        onCopy={() => void copyOutput()}
        actions={actions}
        shared={shared}
        selectedComfyNode={result?.comfyNode ?? selectedModel.comfyNode}
        queueLabel="Queue character"
        hints={toolSettings.hints}
        includeStickyBar={false}
        extraMeta={
          sceneMode === 'duo' && toolSettings.sportPresetId
            ? getSportPreset(toolSettings.sportPresetId)?.label
            : undefined
        }
        preDiagnostics={actions.preDiagnostics}
        previewSport={inferredSport}
        variationSeed={variationSeed}
        onLockSeed={() => {
          if (variationSeed) {
            updateShared({ lockedVariationSeed: variationSeed });
          }
        }}
        onSendComfyUi={() =>
          void actions.sendComfyUi(output, inferredSport, undefined, {
            customTokens: regionalPromptCustomTokens(toolSettings.regionalSegments ?? []),
          })
        }
        onCopyPair={() => void actions.copyPromptPair(output, inferredSport)}
        resultExtras={{
          onExportBatch: batchResults.length > 1 ? exportBatch : undefined,
          onQueueBatchComfyUi:
            batchResults.length > 1
              ? () => void actions.sendBatchComfyUi(batchPrompts, inferredSport)
              : undefined,
          batchItems:
            batchResults.length > 1
              ? batchResults.map(entry => ({
                  prompt: entry.prompt,
                  metadata: entry.metadata,
                }))
              : undefined,
          onBatchPromptChange:
            batchResults.length > 1
              ? (index: number, value: string) => {
                  setBatchResults(previous =>
                    previous.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, prompt: value } : entry
                    )
                  );
                }
              : undefined,
          batchCrossLinks: {
            hintsForDuo: toolSettings.hints,
            hintsForCharacter: toolSettings.hints,
          },
          batchPromptActions: {
            onQueueComfyUi: prompt =>
              void actions.sendComfyUi(prompt, inferredSport, undefined, {
                customTokens: regionalPromptCustomTokens(toolSettings.regionalSegments ?? []),
              }),
            onSaveHistory: ({ prompt, metadata }) =>
              actions.saveHistory({
                prompt,
                hints: toolSettings.hints,
                metadata,
              }),
            onCopyPair: prompt => void actions.copyPromptPair(prompt, inferredSport),
            onExportSidecar: (prompt, _index, metadata) =>
              void actions.exportSidecar(prompt, {
                comfyNode: result?.comfyNode ?? selectedModel.comfyNode,
                metadata,
                variationSeed:
                  readVariationSeedFromMetadata(metadata) ?? shared.lockedVariationSeed,
              }),
          } satisfies BatchPromptItemActions,
        }}
      />
      <MobileStickyQueueBar
        disabled={!output.trim()}
        label="Queue character"
        status={actions.comfyUiStatus}
        primaryGenerate
        onQueue={() =>
          void actions.sendComfyUi(output, inferredSport, undefined, {
            customTokens: regionalPromptCustomTokens(toolSettings.regionalSegments ?? []),
          })
        }
      />
    </>
  );
}
