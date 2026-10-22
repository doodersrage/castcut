'use client';

import { Button } from '@/components/ui/Button';
import dynamic from 'next/dynamic';
import DiffusersWorkflowSupportHint from '@/components/DiffusersWorkflowSupportHint';
import { SETTINGS_TOOL_ACCENT } from '@/components/settings/tabs/settings-tool-shared';
import { CollapsibleSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import { FieldError, TextArea } from '@/components/ui/Field';
import type { SettingsComfyConnectionPanelProps } from '@/components/settings/panels/settings-comfy-connection-types';

const WorkflowPreviewPanel = dynamic(() => import('@/components/WorkflowPreviewPanel'), {
  loading: () => null,
});

const ACCENT = SETTINGS_TOOL_ACCENT;

type Props = Pick<
  SettingsComfyConnectionPanelProps,
  | 'settings'
  | 'updateSettings'
  | 'sharedSettings'
  | 'workflowError'
  | 'setWorkflowError'
  | 'workflowValidation'
  | 'previewPrompt'
  | 'setPreviewPrompt'
  | 'previewLoading'
  | 'previewError'
  | 'workflowPreview'
  | 'handlePreviewWorkflow'
  | 'handleImportWorkflow'
>;

export function SettingsComfyConnectionFallbackWorkflowSection({
  settings,
  updateSettings,
  sharedSettings,
  workflowError,
  setWorkflowError,
  workflowValidation,
  previewPrompt,
  setPreviewPrompt,
  previewLoading,
  previewError,
  workflowPreview,
  handlePreviewWorkflow,
  handleImportWorkflow,
}: Props) {
  if (settings.useServerDefaults) {
    return null;
  }

  return (
    <CollapsibleSection
      title="Fallback workflow & preview"
      summary="Optional JSON fallback and dry-run injection preview."
      defaultOpen={false}
      persistKey="settings-fallback-workflow"
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="workflow-json" className="text-xs text-[var(--text-secondary)]">
            Fallback workflow JSON (optional)
          </label>
          <label className="cursor-pointer type-caption ui-text-link">
            Import into editor
            <input
              type="file"
              accept="application/json,.json"
              aria-label="Choose a JSON file"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleImportWorkflow(file);
                }
                event.target.value = '';
              }}
            />
          </label>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Used only when no workflow file is selected in the library above. For multiple workflows,
          import them into the library instead.
        </p>
        <textarea
          id="workflow-json"
          value={settings.workflowJson ?? ''}
          onChange={event => {
            updateSettings({ workflowJson: event.target.value });
            setWorkflowError(null);
          }}
          rows={12}
          spellCheck={false}
          placeholder={`Paste exported ComfyUI API JSON here.\nUse ${settings.positiveToken ?? '{{POSITIVE}}'} and ${settings.negativeToken ?? '{{NEGATIVE}}'} anywhere prompts should be injected.`}
          className={`ui-input w-full font-mono text-xs leading-relaxed text-[var(--tint-success-text)] ${accentFocusClass(ACCENT)}`}
        />
        {sharedSettings.inferenceEngine === 'diffusers' ? (
          <DiffusersWorkflowSupportHint workflowJson={settings.workflowJson} className="mt-2" />
        ) : null}
        <FieldError>{workflowError}</FieldError>
        {workflowValidation && (
          <p className="text-xs text-[var(--text-muted)]">
            {workflowValidation.ok ? (
              <>
                Placeholders: {workflowValidation.placeholders?.positive ?? 0}×{' '}
                {settings.positiveToken}
                {(workflowValidation.placeholders?.negative ?? 0) > 0
                  ? ` · ${workflowValidation.placeholders?.negative}× ${settings.negativeToken}`
                  : ''}
                {workflowValidation.nodeIds?.length
                  ? ` · nodes: ${workflowValidation.nodeIds.join(', ')}`
                  : ''}
              </>
            ) : (
              <span className="text-[var(--tint-warning-text)]">{workflowValidation.error}</span>
            )}
          </p>
        )}
      </div>

      <div className="ui-recipe-shell space-y-3">
        <div className="space-y-1">
          <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--accent-text)]">
            Workflow dry-run preview
          </h3>
          <p className="text-xs text-[var(--text-muted)]">
            Test placeholder injection without queueing a ComfyUI job. Uses the current settings
            above (save first if you changed them recently).
          </p>
        </div>
        <TextArea
          value={previewPrompt}
          onChange={event => setPreviewPrompt(event.target.value)}
          rows={3}
          className={accentFocusClass(ACCENT)}
        />
        <Button
          variant="outline"
          tone="accent"
          type="button"
          disabled={previewLoading || !previewPrompt.trim()}
          onClick={() => void handlePreviewWorkflow()}
          className="rounded-lg px-4 py-2 text-sm disabled:opacity-50"
        >
          {previewLoading ? 'Previewing…' : 'Preview injection'}
        </Button>
        <WorkflowPreviewPanel
          loading={previewLoading}
          error={previewError}
          preview={workflowPreview}
        />
      </div>
    </CollapsibleSection>
  );
}
