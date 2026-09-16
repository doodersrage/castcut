'use client';

import type { SharedToolSettings } from '@/lib/settings-cache';
import type { CampaignStepResult } from '@/lib/campaign-runner';
import type { CampaignTemplate } from '@/lib/campaign-templates';
import { toastHeldMax } from '@/lib/app-toast';
import {
  ToolBlockGroup,
  ToolContentPanel,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';
import type { ToolAccent } from '@/lib/tool-theme';
import { FieldLabel, TextArea } from '@/components/ui/Field';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/ViewState';

export type StudioCampaignTabProps = {
  accent: ToolAccent;
  shared: SharedToolSettings;
  campaignTarget: 'random-scene' | 'topics';
  campaignCount: number;
  campaignGenre: string;
  campaignTopics: string;
  campaignQueue: boolean;
  campaignBestOfN: number;
  campaignBestOfNVision: boolean;
  campaignLoading: boolean;
  campaignStatus: string | null;
  campaignResults: CampaignStepResult[];
  campaignTemplates: CampaignTemplate[];
  campaignTemplateName: string;
  onCampaignTargetChange: (target: 'random-scene' | 'topics') => void;
  onCampaignCountChange: (count: number) => void;
  onCampaignGenreChange: (genre: string) => void;
  onCampaignTopicsChange: (topics: string) => void;
  onCampaignQueueChange: (queue: boolean) => void;
  onCampaignBestOfNChange: (value: number) => void;
  onCampaignBestOfNVisionChange: (value: boolean) => void;
  onCampaignLoadingChange: (loading: boolean) => void;
  onCampaignStatusChange: (status: string | null) => void;
  onCampaignResultsChange: (results: CampaignStepResult[]) => void;
  onCampaignTemplateNameChange: (name: string) => void;
  onCampaignTemplatesChange: (templates: CampaignTemplate[]) => void;
  onBackupStatusChange: (status: string) => void;
  onGalleryRevision: () => void;
  onSaveCampaignTemplate: () => void;
  onLoadCampaignTemplate: (template: CampaignTemplate) => void;
  onDeleteCampaignTemplate: (id: string) => void;
};

export default function StudioCampaignTab({
  accent,
  shared,
  campaignTarget,
  campaignCount,
  campaignGenre,
  campaignTopics,
  campaignQueue,
  campaignBestOfN,
  campaignBestOfNVision,
  campaignLoading,
  campaignStatus,
  campaignResults,
  campaignTemplates,
  campaignTemplateName,
  onCampaignTargetChange,
  onCampaignCountChange,
  onCampaignGenreChange,
  onCampaignTopicsChange,
  onCampaignQueueChange,
  onCampaignBestOfNChange,
  onCampaignBestOfNVisionChange,
  onCampaignLoadingChange,
  onCampaignStatusChange,
  onCampaignResultsChange,
  onCampaignTemplateNameChange,
  onSaveCampaignTemplate,
  onLoadCampaignTemplate,
  onDeleteCampaignTemplate,
  onBackupStatusChange,
  onGalleryRevision,
}: StudioCampaignTabProps) {
  return (
    <ToolSection title="Prompt batch runner">
      <p className="text-sm text-[var(--text-secondary)]">
        Generate a series of prompts (random scenes or topic list) and optionally queue each to
        ComfyUI under the active project.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-[var(--text-secondary)]">
          Source
          <select
            value={campaignTarget}
            onChange={event =>
              onCampaignTargetChange(event.target.value as 'random-scene' | 'topics')
            }
            className="ui-input block px-3 py-[var(--input-padding-y)] type-body"
          >
            <option value="random-scene">Random scenes</option>
            <option value="topics">Topics batch</option>
          </select>
        </label>
        <label className="space-y-1 text-xs text-[var(--text-secondary)]">
          Count
          <input
            type="number"
            min={1}
            max={12}
            value={campaignCount}
            onChange={event => onCampaignCountChange(Number(event.target.value) || 4)}
            className="ui-input block w-full px-3 py-[var(--input-padding-y)] type-body"
          />
        </label>
      </div>
      {campaignTarget === 'random-scene' ? (
        <FieldLabel htmlFor="campaign-genre">Genre/theme hint (optional)</FieldLabel>
      ) : (
        <FieldLabel htmlFor="campaign-topics">Topics (one per line)</FieldLabel>
      )}
      {campaignTarget === 'random-scene' ? (
        <input
          id="campaign-genre"
          value={campaignGenre}
          onChange={event => onCampaignGenreChange(event.target.value)}
          className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
        />
      ) : (
        <TextArea
          id="campaign-topics"
          rows={4}
          value={campaignTopics}
          onChange={event => onCampaignTopicsChange(event.target.value)}
          placeholder="sunset gravel race&#10;rainy alley portrait"
          className={accentFocusClass(accent)}
        />
      )}
      <label className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={campaignQueue}
          onChange={event => onCampaignQueueChange(event.target.checked)}
          className={`h-4 w-4 rounded ${accentFocusClass()}`}
        />
        Queue each prompt to ComfyUI
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-[var(--text-secondary)]">
          Best-of-N (text rank)
          <select
            value={campaignBestOfN}
            onChange={event => onCampaignBestOfNChange(Number(event.target.value) || 1)}
            className="ui-input block w-full px-3 py-[var(--input-padding-y)] type-body"
          >
            <option value={1}>Off</option>
            <option value={2}>2×</option>
            <option value={3}>3×</option>
            <option value={4}>4×</option>
          </select>
        </label>
        <label className="mt-6 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={campaignBestOfNVision}
            disabled={!campaignQueue || campaignBestOfN <= 1}
            onChange={event => onCampaignBestOfNVisionChange(event.target.checked)}
            className={`h-4 w-4 rounded ${accentFocusClass()}`}
          />
          Vision-rank queued outputs (needs LLM_VISION_MODEL)
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <PrimaryButton
          accentClassName={accentButtonClass(accent)}
          loading={campaignLoading}
          loadingLabel="Running campaign"
          disabled={
            campaignTarget === 'topics' &&
            campaignTopics
              .split('\n')
              .map(line => line.trim())
              .filter(Boolean).length === 0
          }
          onClick={() => {
            void (async () => {
              onCampaignLoadingChange(true);
              onCampaignStatusChange('Running batch…');
              try {
                const topics =
                  campaignTarget === 'topics'
                    ? campaignTopics
                        .split('\n')
                        .map(line => line.trim())
                        .filter(Boolean)
                    : undefined;
                const { runPromptCampaign } = await import('@/lib/campaign-runner');
                const results = await runPromptCampaign({
                  model: shared.model,
                  target: campaignTarget,
                  count: campaignCount,
                  genre: campaignGenre.trim() || undefined,
                  topics,
                  queueToComfyUi: campaignQueue,
                  hints: campaignGenre.trim() || campaignTopics.slice(0, 200),
                  bestOfN: campaignBestOfN,
                  bestOfNVision: campaignBestOfNVision,
                  onVisionProgress: message => onCampaignStatusChange(message),
                });
                onCampaignResultsChange(results);
                const queued = results.filter(step => step.queued).length;
                const held = results.filter(step => step.held).length;
                const errors = results.filter(step => step.error).length;
                onCampaignStatusChange(
                  [
                    `Batch finished · ${queued}/${results.length} queued`,
                    held > 0 ? `${held} held Max` : null,
                    errors > 0 ? `${errors} errors` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                );
                if (held > 0) {
                  toastHeldMax({
                    text: 'Max campaign jobs held until ComfyUI is idle',
                    count: held,
                  });
                }
                onGalleryRevision();
              } catch (err) {
                onCampaignStatusChange(err instanceof Error ? err.message : 'Batch failed.');
              } finally {
                onCampaignLoadingChange(false);
              }
            })();
          }}
        >
          Run campaign
        </PrimaryButton>
      </div>
      {campaignStatus ? (
        <p className="type-caption text-[var(--accent-text)]">{campaignStatus}</p>
      ) : null}
      {campaignResults.length > 0 ? (
        <ToolBlockGroup className="mt-[var(--block-gap)]">
          {campaignResults.map(step => (
            <ToolContentPanel key={step.index} className="ui-block-group">
              <p className="type-caption text-[var(--text-muted)]">
                Step {step.index + 1}
                {step.queued ? ' · queued' : ''}
                {step.held ? ' · held Max until idle' : ''}
                {step.promptId ? ` · ${step.promptId}` : ''}
                {step.error ? ` · ${step.error}` : ''}
              </p>
              {step.prompt ? (
                <pre className="type-code max-h-32 overflow-auto whitespace-pre-wrap text-[var(--text-secondary)]">
                  {step.prompt}
                </pre>
              ) : null}
            </ToolContentPanel>
          ))}
        </ToolBlockGroup>
      ) : null}

      <div className="ui-surface-inset mt-6 space-y-3">
        <p className="text-sm font-medium text-[var(--text-primary)]">Batch templates</p>
        <p className="text-xs text-[var(--text-muted)]">
          Save the current campaign settings as a reusable recipe.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            id="studio-campaign-template-name"
            value={campaignTemplateName}
            onChange={event => onCampaignTemplateNameChange(event.target.value)}
            placeholder="Template name"
            className="ui-input min-w-[180px] flex-1 px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
          />
          <Button
            variant="secondary"
            disabled={!campaignTemplateName.trim()}
            onClick={onSaveCampaignTemplate}
          >
            Save template
          </Button>
        </div>
        {campaignTemplates.length > 0 ? (
          <ul className="space-y-2">
            {campaignTemplates.map(template => (
              <li
                key={template.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-sm"
              >
                <div>
                  <p className="text-[var(--text-primary)]">{template.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {template.target} · {template.count} prompts
                    {template.queueToComfyUi ? ' · auto-queue' : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="type-caption"
                    onClick={() => {
                      onLoadCampaignTemplate(template);
                      onBackupStatusChange(`Loaded template “${template.name}”.`);
                    }}
                  >
                    Load
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="type-caption"
                    onClick={() => onDeleteCampaignTemplate(template.id)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            compact
            icon="template"
            title="No batch templates yet"
            description="Name the current campaign settings above and save them as a reusable recipe for later batches."
            action={{
              label: 'Name a template',
              onClick: () => {
                document.getElementById('studio-campaign-template-name')?.focus();
              },
            }}
          />
        )}
      </div>
    </ToolSection>
  );
}
