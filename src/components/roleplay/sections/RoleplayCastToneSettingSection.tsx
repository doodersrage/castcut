'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ChipButton, TextArea, TextInput } from '@/components/ui/Field';
import { accentFocusClass } from '@/components/ui/ToolPageShell';
import {
  ROLEPLAY_CONTENT,
  ROLEPLAY_SETTING_PRESETS,
  ROLEPLAY_TONES,
  rollRoleplaySetting,
} from '@/lib/roleplay';
import type { RoleplayCastSectionProps } from '@/components/roleplay/roleplay-cast-section-types';

const ACCENT = 'amber' as const;

/** Setting chips shown before "More settings…" — the full preset list is ~70 places. */
const COMMON_SETTING_IDS = new Set([
  'kitchen',
  'cafe',
  'bedroom',
  'living-room',
  'park',
  'beach',
  'rooftop',
  'forest',
  'neon-alley',
  'tavern',
]);

export function RoleplayCastToneSettingSection({
  busy,
  playAs,
  tone,
  content,
  adultEnabled,
  toolSettings,
  onUpdateToolSettings,
}: Pick<
  RoleplayCastSectionProps,
  'busy' | 'playAs' | 'tone' | 'content' | 'adultEnabled' | 'toolSettings' | 'onUpdateToolSettings'
>) {
  const [allSettings, setAllSettings] = useState(false);
  const currentSetting = (toolSettings.setting ?? '').trim();
  // Keep the picked preset visible even when it isn't one of the common ones.
  const settingChips = allSettings
    ? ROLEPLAY_SETTING_PRESETS
    : ROLEPLAY_SETTING_PRESETS.filter(
        entry => COMMON_SETTING_IDS.has(entry.id) || entry.setting === currentSetting
      );
  const hiddenSettingCount = ROLEPLAY_SETTING_PRESETS.length - settingChips.length;

  return (
    <>
      <div className="space-y-2">
        <p className="type-caption text-[var(--text-muted)]">Tone</p>
        <div className="flex flex-wrap gap-1.5">
          {ROLEPLAY_TONES.map(entry => (
            <ChipButton
              key={entry.id}
              active={tone === entry.id}
              disabled={busy}
              title={entry.hint}
              onClick={() => onUpdateToolSettings({ tone: entry.id, content })}
            >
              {entry.label}
            </ChipButton>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="type-caption text-[var(--text-muted)]">Content</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="type-caption w-12 shrink-0 text-[var(--text-muted)]">SFW</span>
          {ROLEPLAY_CONTENT.filter(entry => entry.group === 'sfw').map(entry => (
            <ChipButton
              key={entry.id}
              active={content === entry.id}
              disabled={busy}
              title={entry.hint}
              onClick={() => onUpdateToolSettings({ content: entry.id, tone })}
            >
              {entry.label}
            </ChipButton>
          ))}
        </div>
        {adultEnabled ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="type-caption w-12 shrink-0 text-[var(--text-muted)]">Adult</span>
            {ROLEPLAY_CONTENT.filter(entry => entry.group === 'adult').map(entry => (
              <ChipButton
                key={entry.id}
                active={content === entry.id}
                disabled={busy}
                title={entry.hint}
                onClick={() => onUpdateToolSettings({ content: entry.id, tone })}
              >
                {entry.label}
              </ChipButton>
            ))}
          </div>
        ) : (
          <p className="type-caption text-[var(--text-muted)]" data-testid="roleplay-adult-hint">
            Adult heat tones stay off until the NSFW generator env flag is enabled.
          </p>
        )}
        <ChipButton
          active={toolSettings.allowGore === true}
          disabled={busy}
          title="Horror stills: blood, wounds, viscera. Stacks with any rating."
          onClick={() =>
            onUpdateToolSettings({
              allowGore: toolSettings.allowGore !== true,
              tone,
              content,
            })
          }
        >
          Gore
        </ChipButton>
      </div>
      <div className="space-y-2">
        <p className="type-caption text-[var(--text-muted)]">Setting</p>
        <p className="text-xs text-[var(--text-muted)]">
          {playAs === 'photo'
            ? 'Replaces the photo backdrop. Leave blank to invent a place per beat.'
            : 'Where opening beats happen. Leave blank to let the story pick places.'}
        </p>
        <div className="flex flex-wrap gap-1.5" data-testid="story-setting-chips">
          {settingChips.map(entry => (
            <ChipButton
              key={entry.id}
              active={currentSetting === entry.setting}
              disabled={busy}
              title={entry.setting}
              onClick={() =>
                onUpdateToolSettings({
                  setting: currentSetting === entry.setting ? '' : entry.setting,
                })
              }
            >
              {entry.label}
            </ChipButton>
          ))}
          {allSettings || hiddenSettingCount > 0 ? (
            <button
              type="button"
              className="ui-chip border-dashed"
              aria-expanded={allSettings}
              data-testid="story-setting-more"
              onClick={() => setAllSettings(value => !value)}
            >
              {allSettings ? 'Fewer settings' : `More settings… (${hiddenSettingCount})`}
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            value={toolSettings.setting ?? ''}
            disabled={busy}
            placeholder="e.g. flooded cathedral, your kitchen, a moonlit pier"
            onChange={event => onUpdateToolSettings({ setting: event.target.value })}
            className={`min-w-0 flex-1 ${accentFocusClass(ACCENT)}`}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              onUpdateToolSettings({ setting: rollRoleplaySetting(toolSettings.setting) })
            }
          >
            Roll
          </Button>
          {(toolSettings.setting ?? '').trim() ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => onUpdateToolSettings({ setting: '' })}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </div>
      <label className="block space-y-1.5 text-sm">
        <span className="type-caption text-[var(--text-muted)]">Optional notes</span>
        <TextArea
          value={toolSettings.extraHints ?? ''}
          disabled={busy}
          placeholder="Must include a yellow umbrella. Allergic to plot armor."
          onChange={event => onUpdateToolSettings({ extraHints: event.target.value })}
          className={accentFocusClass(ACCENT)}
          rows={2}
        />
      </label>
    </>
  );
}
