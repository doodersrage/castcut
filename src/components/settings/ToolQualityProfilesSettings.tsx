'use client';

import { ChipButton } from '@/components/ui/Field';
import { QUEUE_QUALITY_PROFILE_OPTIONS } from '@/lib/queue/quality-profile';
import {
  TOOL_QUEUE_QUALITY_OPTIONS,
  toolQueueQualityLabel,
  type ToolQueueQualityProfiles,
} from '@/lib/app/tool-quality-profiles';

type ToolQualityProfilesSettingsProps = {
  profiles: ToolQueueQualityProfiles;
  onChange: (profiles: ToolQueueQualityProfiles) => void;
  disabled?: boolean;
};

export default function ToolQualityProfilesSettings({
  profiles,
  onChange,
  disabled,
}: ToolQualityProfilesSettingsProps) {
  return (
    <div className="ui-surface-inset space-y-3">
      <p className="type-caption text-[var(--text-muted)]">
        Override the global queue quality profile for specific tools. Leave unset to use the sidebar
        default or per-page override chips.
      </p>
      <ul className="space-y-2">
        {TOOL_QUEUE_QUALITY_OPTIONS.map(tool => {
          const active = profiles[tool.id];
          return (
            <li
              key={tool.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/40 px-3 py-2"
            >
              <span className="type-caption text-[var(--text-secondary)]">{tool.label}</span>
              <div className="flex flex-wrap gap-1">
                <ChipButton
                  active={!active}
                  disabled={disabled}
                  onClick={() => {
                    const next = { ...profiles };
                    delete next[tool.id];
                    onChange(next);
                  }}
                >
                  Global
                </ChipButton>
                {QUEUE_QUALITY_PROFILE_OPTIONS.filter(option => option.id !== 'followSettings').map(
                  option => (
                    <ChipButton
                      key={`${tool.id}-${option.id}`}
                      active={active === option.id}
                      disabled={disabled}
                      onClick={() =>
                        onChange({
                          ...profiles,
                          [tool.id]: option.id,
                        })
                      }
                    >
                      {option.label}
                    </ChipButton>
                  )
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {Object.keys(profiles).length > 0 ? (
        <p className="type-caption text-[var(--text-muted)]">
          Active overrides:{' '}
          {Object.entries(profiles)
            .map(([toolId, profile]) => `${toolQueueQualityLabel(toolId)} → ${profile}`)
            .join(' · ')}
        </p>
      ) : null}
    </div>
  );
}
