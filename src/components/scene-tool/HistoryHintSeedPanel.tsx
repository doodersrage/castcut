'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChipButton, FieldDivider, FieldLabel, TextInput } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { CollapsibleSection } from '@/components/ui/ToolPageShell';
import {
  countHistorySeedCandidates,
  listHistoryHintSuggestions,
  pickHistoryHintSeed,
  type HistoryHintSeedResult,
} from '@/lib/history-hint-seed';
import {
  HISTORY_SEED_SCOPE_OPTIONS,
  SCENE_HINT_SOURCE_OPTIONS,
  type HistorySeedScope,
  type HistorySeedTool,
  type SceneHintSource,
} from '@/lib/scene-hint-source';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import AppRouteLink from '@/components/ui/AppRouteLink';
import { appHasRoute } from '@/lib/app-profile';

const HISTORY_EMPTY_GUIDANCE: Partial<
  Record<HistorySeedTool, { message: string; href: string; linkLabel: string }>
> = {
  generate: {
    message: 'Generate a few scenes on the home page, then save results to Studio history.',
    href: '/',
    linkLabel: 'Open Generate',
  },
  character: {
    message: 'Create solo or duo character prompts and save them to history.',
    href: '/character',
    linkLabel: 'Open Character',
  },
  duo: {
    message: 'Generate duo scenes and save them to history for future seeds.',
    href: '/character?mode=duo',
    linkLabel: 'Open Duo mode',
  },
  compose: {
    message: 'Compose character + background prompts and save to history.',
    href: '/character?mode=compose',
    linkLabel: 'Open Compose mode',
  },
  background: {
    message: 'Generate background prompts and save them to Studio history.',
    href: '/background',
    linkLabel: 'Open Background',
  },
  pet: {
    message: 'Generate pet scenes and save them to history.',
    href: '/pet',
    linkLabel: 'Open Pet',
  },
  fantasy: {
    message: 'Generate fantasy scenes and save them to history.',
    href: '/fantasy',
    linkLabel: 'Open Fantasy',
  },
  refine: {
    message: 'Run a few refine/edit jobs and save prompts to history for intent seeds.',
    href: '/refine',
    linkLabel: 'Open Refine',
  },
  inpaint: {
    message: 'Queue inpaint edits and save instructions to history for reuse.',
    href: '/inpaint',
    linkLabel: 'Open Inpaint',
  },
  outpaint: {
    message: 'Queue outpaint expands and save border intents to history.',
    href: '/outpaint',
    linkLabel: 'Open Outpaint',
  },
  video: {
    message: 'Build a few video prompts and save them to history for motion seeds.',
    href: '/video',
    linkLabel: 'Open Video',
  },
  controlnet: {
    message: 'Queue ControlNet jobs and save guided prompts to history.',
    href: '/controlnet',
    linkLabel: 'Open ControlNet',
  },
  imagePrompt: {
    message: 'Run a few Image → Prompt captions and save them to history for hint seeds.',
    href: '/image-prompt',
    linkLabel: 'Open Image → Prompt',
  },
};

type HistoryHintSeedPanelProps = {
  tool: HistorySeedTool;
  hintSource: SceneHintSource;
  historySeedScope: HistorySeedScope;
  hints: string;
  randomTheme?: string;
  lastHistorySeedEntryId?: string;
  onHintSourceChange: (source: SceneHintSource) => void;
  onHistorySeedScopeChange: (scope: HistorySeedScope) => void;
  onHintsChange: (hints: string) => void;
  onRandomThemeChange: (theme: string) => void;
  onHistorySeedApplied: (result: HistoryHintSeedResult) => void;
  accentFocusClassName?: string;
  /** When true, hide History/Random chips until expanded — keywords-first layout. Auto on in Simple workspace. */
  compact?: boolean;
};

export function HistoryHintSeedPanel({
  tool,
  hintSource,
  historySeedScope,
  hints,
  randomTheme = '',
  lastHistorySeedEntryId,
  onHintSourceChange,
  onHistorySeedScopeChange,
  onHintsChange,
  onRandomThemeChange,
  onHistorySeedApplied,
  accentFocusClassName = '',
  compact: compactProp,
}: HistoryHintSeedPanelProps) {
  const workspaceMode = useWorkspaceMode();
  const compact = compactProp ?? workspaceMode === 'simple';
  const [historyStatus, setHistoryStatus] = useState<string | null>(null);
  const candidateCount = useMemo(
    () => countHistorySeedCandidates(tool, historySeedScope),
    [tool, historySeedScope]
  );
  const suggestions = useMemo(
    () =>
      hintSource === 'history'
        ? listHistoryHintSuggestions({
            tool,
            scope: historySeedScope,
            referenceHints: hints,
          })
        : [],
    [tool, historySeedScope, hintSource, hints]
  );

  const applyHistorySeed = useCallback(
    (options?: { excludeEntryId?: string; hintsOverride?: string }) => {
      if (options?.hintsOverride) {
        onHintsChange(options.hintsOverride);
        setHistoryStatus('Applied history suggestion.');
        return;
      }

      const result = pickHistoryHintSeed({
        tool,
        scope: historySeedScope,
        excludeEntryId: options?.excludeEntryId ?? lastHistorySeedEntryId,
        referenceHints: hints,
      });

      if (!result) {
        const guidance = HISTORY_EMPTY_GUIDANCE[tool];
        setHistoryStatus(
          guidance
            ? `${guidance.message} Or switch to Related tools / Favorites scope.`
            : 'No matching history yet — generate and save a few prompts first.'
        );
        return;
      }

      onHintsChange(result.hints);
      onHistorySeedApplied(result);
      setHistoryStatus(`Seeded from ${result.label}.`);
    },
    [tool, historySeedScope, hints, lastHistorySeedEntryId, onHintsChange, onHistorySeedApplied]
  );

  useEffect(() => {
    if (hintSource !== 'history' || hints.trim() || candidateCount === 0) {
      return;
    }
    scheduleAfterCommit(() => {
      applyHistorySeed();
    });
  }, [hintSource, hints, candidateCount, applyHistorySeed]);

  const activeSource = SCENE_HINT_SOURCE_OPTIONS.find(option => option.value === hintSource);

  const emptyGuidance = HISTORY_EMPTY_GUIDANCE[tool];

  const hintSourcePicker = (
    <>
      <FieldLabel hint="Choose how scene hints are filled before generation.">
        Hint source
      </FieldLabel>
      <div className="flex flex-wrap gap-2">
        {SCENE_HINT_SOURCE_OPTIONS.map(option => (
          <ChipButton
            key={option.value}
            active={hintSource === option.value}
            onClick={() => onHintSourceChange(option.value)}
          >
            {option.label}
          </ChipButton>
        ))}
      </div>
      {activeSource ? <p className="type-caption">{activeSource.description}</p> : null}
    </>
  );

  return (
    <>
      {compact && hintSource === 'manual' ? (
        <CollapsibleSection
          title="More input modes"
          summary="Seed from history or roll a random surprise scene."
          defaultOpen={false}
          persistKey={`hint-source-alt-${tool}`}
        >
          {hintSourcePicker}
        </CollapsibleSection>
      ) : compact && hintSource !== 'manual' ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="type-caption text-[var(--text-secondary)]">
            Input mode: <span className="text-[var(--text-primary)]">{activeSource?.label}</span>
          </p>
          <Button variant="ghost" size="sm" onClick={() => onHintSourceChange('manual')}>
            Back to keywords
          </Button>
        </div>
      ) : (
        hintSourcePicker
      )}

      {hintSource === 'history' ? (
        <>
          <FieldDivider />
          <FieldLabel hint="Which saved prompts to pull keywords from.">History scope</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {HISTORY_SEED_SCOPE_OPTIONS.map(option => (
              <ChipButton
                key={option.value}
                active={historySeedScope === option.value}
                onClick={() => onHistorySeedScopeChange(option.value)}
              >
                {option.label}
              </ChipButton>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={candidateCount === 0}
              onClick={() => applyHistorySeed()}
            >
              Roll from history
            </Button>
            <span className="type-caption">
              {candidateCount > 0
                ? `${candidateCount} saved prompt${candidateCount === 1 ? '' : 's'} match this scope.`
                : 'No saved prompts match — try Related tools or generate a few scenes first.'}
            </span>
          </div>
          {hintSource === 'history' && candidateCount === 0 && emptyGuidance ? (
            <p className="type-caption">
              {emptyGuidance.message}{' '}
              <AppRouteLink
                href={emptyGuidance.href}
                className="text-[var(--accent-text)] hover:text-[var(--accent-text)]"
              >
                {emptyGuidance.linkLabel}
              </AppRouteLink>
              {appHasRoute('/studio') ? (
                <>
                  {' · '}
                  <Link
                    href="/studio"
                    className="text-[var(--accent-text)] hover:text-[var(--accent-text)]"
                  >
                    Open Studio history
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
          {suggestions.length > 0 ? (
            <div className="space-y-2">
              <p className="type-caption">Recent suggestions</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map(item => (
                  <button
                    key={item.entryId}
                    type="button"
                    onClick={() => {
                      onHintsChange(item.hints);
                      onHistorySeedApplied(item);
                      setHistoryStatus(`Applied ${item.label}.`);
                    }}
                    className="ui-chip max-w-full text-left"
                    title={item.hints}
                  >
                    <span className="block truncate">{item.hints}</span>
                    <span className="type-caption mt-0.5 block text-[var(--text-muted)]">
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {historyStatus ? <p className="type-caption">{historyStatus}</p> : null}
        </>
      ) : null}

      {hintSource === 'random' ? (
        <>
          <FieldDivider />
          <FieldLabel hint="Optional theme to steer the random ingredient roll.">
            Random theme (optional)
          </FieldLabel>
          <TextInput
            value={randomTheme}
            onChange={event => onRandomThemeChange(event.target.value)}
            placeholder={
              tool === 'pet'
                ? 'e.g. rainy day, holiday card, agility course'
                : 'e.g. solarpunk ruins, moonlit ritual, dragon rider'
            }
            className={accentFocusClassName}
          />
        </>
      ) : null}
    </>
  );
}

export function resolveSceneHintsForGeneration(options: {
  hintSource: SceneHintSource;
  hints?: string;
  randomTheme?: string;
}): string {
  if (options.hintSource === 'random') {
    return options.randomTheme?.trim() ?? '';
  }
  return options.hints?.trim() ?? '';
}

export function resolveBackgroundTagsForGeneration(options: {
  hintSource: SceneHintSource;
  settingType?: string;
  timeOfDay?: string;
  mood?: string;
  randomTheme?: string;
}): {
  settingType: string;
  timeOfDay: string;
  mood: string;
} {
  if (options.hintSource === 'random') {
    const theme = options.randomTheme?.trim() ?? '';
    return { settingType: theme, timeOfDay: '', mood: '' };
  }

  return {
    settingType: options.settingType?.trim() ?? '',
    timeOfDay: options.timeOfDay?.trim() ?? '',
    mood: options.mood?.trim() ?? '',
  };
}
