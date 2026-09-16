'use client';

import ScenePromptResultPanel from '@/components/scene-tool/ScenePromptResultPanel';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import ToolPrimarySection from '@/components/ui/ToolPrimarySection';
import { modelUsesNegativePrompt } from '@/lib/prompt-pair';
import { getReformatTargetLabel } from '@/lib/reformat-target';
import { CollapsibleSection, CodeBlock, accentFocusClass } from '@/components/ui/ToolPageShell';
import { FieldLabel, TextArea } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import type { useGenerateToolOrchestration } from '@/hooks/useGenerateToolOrchestration';

const ACCENT = 'brand' as const;

type GenerateToolViewModel = ReturnType<typeof useGenerateToolOrchestration>;
type GenerateToolOutputSectionProps = GenerateToolViewModel;

export function GenerateToolOutputSection({
  mounted,
  shared,
  toolSettings,
  updateShared,
  updateToolSettings,
  mode,
  output,
  setOutput,
  handoffNegative,
  setHandoffNegative,
  showHandoffNegative,
  provider,
  randomResult,
  randomSeed,
  loading,
  error,
  copied,
  resultMeta,
  input,
  setInput,
  hintSource,
  historySeedScope,
  genre,
  includePeople,
  wildness,
  queueModel,
  generateModel,
  detail,
  variationEnabled,
  variationStrength,
  distinctPeople,
  alwaysIncludeClothing,
  seedLlmWithIngredients,
  autoFixRules,
  actions,
  queueGenerate,
  variationSeed,
  setQueueModel,
  setDetail,
  setVariationEnabled,
  setVariationStrength,
  setDistinctPeople,
  setModeAndCache,
  selectedModel,
  setHintSource,
  submitDisabled,
  submitDisabledReason,
  generateRandom,
  generate,
  copyOutput,
}: GenerateToolOutputSectionProps) {
  return (
    <>
      {output && (hintSource === 'random' || mode === 'positive') && (
        <ScenePromptResultPanel
          compactActions
          output={output}
          onOutputChange={setOutput}
          result={randomResult ?? resultMeta}
          copied={copied}
          onCopy={() => void copyOutput()}
          actions={actions}
          shared={shared}
          selectedComfyNode={resultMeta?.comfyNode ?? selectedModel.comfyNode}
          queueLabel="Queue"
          includeStickyBar={false}
          hints={hintSource === 'random' ? genre : input}
          extraMeta={
            hintSource === 'random' && randomSeed
              ? `seed: ${randomSeed}`
              : resultMeta
                ? `${resultMeta.limits.minChars ? `${resultMeta.limits.minChars}–` : ''}${resultMeta.limits.maxChars} char limit · ${output.length} chars`
                : undefined
          }
          variationSeed={variationSeed}
          preDiagnostics={actions.preDiagnostics}
          reformatTargetLabel={getReformatTargetLabel(generateModel)}
          onSendComfyUi={queueGenerate}
          onLockSeed={() => {
            if (variationSeed) {
              updateShared({ lockedVariationSeed: variationSeed });
            }
          }}
        />
      )}

      {showHandoffNegative && modelUsesNegativePrompt(queueModel) ? (
        <ToolPrimarySection title="Negative (from still)">
          <FieldLabel hint="Queued with Prompt+ from the gallery still. Edit or clear before send.">
            Negative prompt
          </FieldLabel>
          <TextArea
            data-testid="generate-handoff-negative"
            value={handoffNegative}
            onChange={event => setHandoffNegative(event.target.value)}
            rows={3}
            className={`font-mono text-sm ${accentFocusClass(ACCENT)}`}
          />
        </ToolPrimarySection>
      ) : null}

      {output && mode === 'negative' && (
        <ToolPrimarySection title="Generated preserve / negative prompt">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {provider ? (
              <p className="type-caption">via {provider === 'llm' ? 'LLM' : 'template fallback'}</p>
            ) : (
              <span />
            )}
            <Button variant="secondary" size="sm" onClick={() => void copyOutput()}>
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          <CodeBlock>{output}</CodeBlock>
        </ToolPrimarySection>
      )}

      {output && hintSource !== 'random' && mode === 'positive' && (
        <p className="-mt-4 text-xs text-[var(--text-muted)]">
          Paste into{' '}
          <code className="rounded bg-[var(--bg-muted)] px-1 text-[var(--accent-text)]">
            {resultMeta?.comfyNode ?? selectedModel.comfyNode}
          </code>
          . Press Ctrl+Enter to regenerate.
        </p>
      )}

      <CollapsibleSection
        title="How it works"
        summary="Model-specific prompt tips and variation controls."
        defaultOpen={false}
        persistKey="generate-how-it-works"
        className="text-sm text-[var(--text-muted)]"
      >
        <ul className="mt-1 list-inside list-disc space-y-2 leading-relaxed">
          <li>
            Pick your <strong className="font-medium text-[var(--text-muted)]">target model</strong>
            —SD1.5, SDXL, SD3, Flux, Qwen Image, Hunyuan, PixArt, and more—each uses a prompt style
            tuned for that architecture.
          </li>
          <li>
            <strong className="font-medium text-[var(--text-muted)]">Edit-2511</strong> favors
            explicit keep/change instructions and Figure 1 / Figure 2 references for multi-image
            workflows.
          </li>
          <li>
            <strong className="font-medium text-[var(--text-muted)]">FLUX.2 Klein</strong> wants
            subject-first photographic prose—materials, lighting, camera. Negative prompts are
            ignored; use positive phrasing instead.
          </li>
          <li>
            <strong className="font-medium text-[var(--text-muted)]">Image-2512</strong> favors
            concise factual prose with color, texture, and spatial relationships—quote visible text
            in double quotes.
          </li>
          <li>
            <strong className="font-medium text-[var(--text-muted)]">Image-2.0</strong> Rich detail
            targets at least ~1100 characters (max ~1400).
          </li>
          <li>
            Use <strong className="font-medium text-[var(--text-muted)]">Concise</strong> if Qwen
            output still looks jumbled; use{' '}
            <strong className="font-medium text-[var(--text-muted)]">Rich</strong> when scenes feel
            too thin.
          </li>
          <li>
            Separate ideas with commas, but keep the output focused—Qwen renders cleaner with 2–3
            short sentences, not dense prose.
          </li>
          <li>
            Use{' '}
            <strong className="font-medium text-[var(--text-muted)]">Distinct individuals</strong>{' '}
            when your input has two or more people—it breaks them into separate, fully described
            characters.
          </li>
          <li>
            Use the variation seed toggle to control randomness—off for consistent output, higher
            strength for more diverse scenes.
          </li>
          <li>
            Add &quot;keep face/pose&quot; if you want the subject preserved while the surroundings
            are repainted in words.
          </li>
        </ul>
      </CollapsibleSection>
      <MobileStickyQueueBar
        disabled={!output.trim()}
        label="Queue"
        status={actions.comfyUiStatus}
        primaryGenerate
        onQueue={queueGenerate}
      />
    </>
  );
}
