'use client';

import { useEffect, useMemo, useState } from 'react';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';
import {
  BACKGROUND_PRESET_UI_SECTIONS,
  BACKGROUND_SURFACE_MATERIAL_OPTIONS,
  clearBackgroundPresetPatch,
  countBackgroundPresetSectionSelections,
  countBackgroundPresetSelections,
  getSelectOptionsForBackgroundPresetKey,
  presetOptionsFromBackgroundCache,
  toggleBackgroundSurfaceMaterial,
  type BackgroundPresetOptions,
  type BackgroundPresetUiField,
  type BackgroundPresetUiSection,
} from '@/lib/scene/background-options';
import type { BackgroundToolCache } from '@/lib/settings/cache';
import { SelectInput, TextInput } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

function BackgroundSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="type-heading">{label}</span>
      <SelectInput value={value} onChange={event => onChange(event.target.value)}>
        {options.map(option => (
          <option key={option.value || 'default'} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectInput>
    </label>
  );
}

function PresetField({
  field,
  settings,
  onChange,
}: {
  field: BackgroundPresetUiField;
  settings: BackgroundToolCache;
  onChange: (patch: Partial<BackgroundToolCache>) => void;
}) {
  if (field.kind === 'select') {
    return (
      <BackgroundSelect
        label={field.label}
        value={(settings[field.key] as string | undefined) ?? ''}
        options={getSelectOptionsForBackgroundPresetKey(field.key)}
        onChange={value => onChange({ [field.key]: value })}
      />
    );
  }

  return (
    <label className="space-y-2 sm:col-span-2">
      <span className="type-heading">{field.label}</span>
      <TextInput
        value={settings.environmentDetail ?? ''}
        onChange={event => onChange({ environmentDetail: event.target.value })}
        placeholder={field.placeholder}
      />
    </label>
  );
}

function MaterialSection({
  settings,
  presetOptions,
  onChange,
}: {
  settings: BackgroundToolCache;
  presetOptions: BackgroundPresetOptions;
  onChange: (patch: Partial<BackgroundToolCache>) => void;
}) {
  const selected = new Set(presetOptions.surfaceMaterials ?? []);
  const sectionCount = presetOptions.surfaceMaterials?.length ?? 0;

  return (
    <details className="rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/30">
      <summary className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">Material textures</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Inject physical surface nouns to reduce smooth CGI-looking backgrounds.
            </p>
          </div>
          {sectionCount > 0 && (
            <span className="shrink-0 rounded-full border border-[var(--border-default)] bg-[var(--bg-muted)] px-2 py-0.5 text-3xs font-medium text-[var(--text-muted)]">
              {sectionCount}
            </span>
          )}
        </div>
      </summary>
      <div className="border-t border-[var(--border-subtle)]/80 px-4 pb-4 pt-3">
        <div className="flex flex-wrap gap-2">
          {BACKGROUND_SURFACE_MATERIAL_OPTIONS.map(option => {
            const active = selected.has(option.value);
            return (
              <label
                key={option.value}
                className={`cursor-pointer rounded-lg border px-3 py-2 text-xs font-medium ${
                  active
                    ? 'border-teal-500 bg-teal-500/15 text-teal-200'
                    : 'border-[var(--border-default)] text-[var(--text-muted)]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={event =>
                    onChange({
                      surfaceMaterials: toggleBackgroundSurfaceMaterial(
                        settings.surfaceMaterials,
                        option.value,
                        event.target.checked
                      ),
                    })
                  }
                  className="sr-only"
                />
                {option.label}
              </label>
            );
          })}
        </div>
      </div>
    </details>
  );
}

function PresetSection({
  section,
  settings,
  onChange,
}: {
  section: BackgroundPresetUiSection;
  settings: BackgroundToolCache;
  onChange: (patch: Partial<BackgroundToolCache>) => void;
}) {
  const presetOptions = presetOptionsFromBackgroundCache(settings);
  const sectionCount = countBackgroundPresetSectionSelections(section.id, presetOptions);

  return (
    <details
      className="rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/30"
      open={section.defaultOpen}
    >
      <summary className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">{section.title}</p>
            {section.description && (
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{section.description}</p>
            )}
          </div>
          {sectionCount > 0 && (
            <span className="shrink-0 rounded-full border border-[var(--border-default)] bg-[var(--bg-muted)] px-2 py-0.5 text-3xs font-medium text-[var(--text-muted)]">
              {sectionCount}
            </span>
          )}
        </div>
      </summary>
      <div className="grid gap-3 border-t border-[var(--border-subtle)]/80 px-4 pb-4 pt-3 sm:grid-cols-2">
        {section.fields.map(field => (
          <PresetField
            key={`${section.id}-${field.key}`}
            field={field}
            settings={settings}
            onChange={onChange}
          />
        ))}
      </div>
    </details>
  );
}

type BackgroundPresetControlsProps = {
  mounted: boolean;
  settings: BackgroundToolCache;
  onChange: (patch: Partial<BackgroundToolCache>) => void;
};

export default function BackgroundPresetControls({
  mounted,
  settings,
  onChange,
}: BackgroundPresetControlsProps) {
  const presetOptions = useMemo(() => presetOptionsFromBackgroundCache(settings), [settings]);

  const activeCount = countBackgroundPresetSelections(presetOptions);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    scheduleAfterCommit(() => {
      if (mounted && activeCount > 0) {
        setOpen(true);
      }
    });
  }, [mounted, activeCount]);

  return (
    <details
      open={open}
      onToggle={event => setOpen(event.currentTarget.open)}
      className="group border-t border-[var(--border-subtle)] pt-4"
    >
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)]/40 px-4 py-3 transition hover:border-[var(--border-default)]">
          <div className="space-y-1">
            <p className="type-heading">Background presets (optional)</p>
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
              Archetype, scale, perspective, depth, atmosphere, palette, lighting, clutter,
              materials, and custom environment anchors—collapsed by default.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            {activeCount > 0 && (
              <span className="rounded-full border border-teal-500/40 bg-teal-500/10 px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide text-teal-300">
                {activeCount} active
              </span>
            )}
            <span className="text-[var(--text-muted)] transition group-open:rotate-180">▾</span>
          </div>
        </div>
      </summary>

      <div className="mt-4 space-y-3">
        {BACKGROUND_PRESET_UI_SECTIONS.map(section => (
          <PresetSection
            key={section.id}
            section={section}
            settings={settings}
            onChange={onChange}
          />
        ))}

        <MaterialSection settings={settings} presetOptions={presetOptions} onChange={onChange} />

        {activeCount > 0 && (
          <Button
            variant="quiet"
            type="button"
            onClick={() => onChange(clearBackgroundPresetPatch())}
            className="text-xs font-medium hover:text-[var(--text-secondary)] hover:underline"
          >
            Clear all presets
          </Button>
        )}
      </div>
    </details>
  );
}
