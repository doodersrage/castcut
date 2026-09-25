'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { DEFAULT_SHARED_SETTINGS, type SharedToolSettings } from '@/lib/settings-cache';
import { changedSettings, resetSettingsPatch } from '@/lib/settings-defaults-diff';
import { settingsSearchHref } from '@/lib/settings-search-index';

/** Settings that differ from a fresh install, grouped by area, each with a reset. */
export default function ChangedSettingsPanel({
  sharedSettings,
  updateSharedSettings,
}: {
  sharedSettings: SharedToolSettings;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
}) {
  const changed = changedSettings(sharedSettings, DEFAULT_SHARED_SETTINGS);
  const areas = [...new Set(changed.map(entry => entry.area.label))];

  return (
    <ToolSection
      id="settings-changed-defaults"
      title="Changed from defaults"
      description="Preferences that differ from a fresh install — reset one, an area, or all. Keys, loader maps and your Cast are never listed or reset here."
    >
      {changed.length === 0 ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="changed-settings-none">
          Everything is on its default.
        </p>
      ) : (
        <div className="space-y-4" data-testid="changed-settings">
          {areas.map(areaLabel => {
            const rows = changed.filter(entry => entry.area.label === areaLabel);
            const area = rows[0]!.area;
            return (
              <div key={areaLabel} className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={settingsSearchHref(area)} className="type-heading ui-text-link">
                    {areaLabel}
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      updateSharedSettings(
                        resetSettingsPatch(
                          rows.map(row => row.key),
                          DEFAULT_SHARED_SETTINGS
                        )
                      )
                    }
                  >
                    Reset {areaLabel}
                  </Button>
                </div>
                <ul className="divide-y divide-[var(--border-subtle)] rounded-[var(--radius-md)] border border-[var(--border-subtle)]">
                  {rows.map(row => (
                    <li
                      key={row.key}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-sm"
                      data-testid={`changed-setting-${row.key}`}
                    >
                      <span className="min-w-0">
                        <span className="text-[var(--text-primary)]">{row.label}</span>
                        <span className="type-caption ml-2 text-[var(--text-muted)]">
                          {row.value} <span aria-hidden>·</span> default {row.defaultValue}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        data-testid={`changed-setting-reset-${row.key}`}
                        onClick={() =>
                          updateSharedSettings(
                            resetSettingsPatch([row.key], DEFAULT_SHARED_SETTINGS)
                          )
                        }
                      >
                        Reset
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <Button
            size="sm"
            variant="secondary"
            data-testid="changed-settings-reset-all"
            onClick={() => {
              if (
                window.confirm(
                  `Reset ${changed.length} setting${changed.length === 1 ? '' : 's'} to their defaults?`
                )
              ) {
                updateSharedSettings(
                  resetSettingsPatch(
                    changed.map(row => row.key),
                    DEFAULT_SHARED_SETTINGS
                  )
                );
              }
            }}
          >
            Reset all {changed.length}
          </Button>
        </div>
      )}
    </ToolSection>
  );
}
