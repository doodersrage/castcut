'use client';

import { useEffect, useMemo, useState } from 'react';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';
import type { ClothingCatalogFieldKey } from '@/lib/wardrobe/clothing-catalog-fields';
import { fetchClothingSelectOptions } from '@/lib/wardrobe/clothing-catalog-client';
import { parseCharacterHints } from '@/lib/character/hints';
import { subjectGenderToClothingGender } from '@/lib/wardrobe/clothing-gender';
import {
  CHARACTER_POSE_TARGET_PLACEHOLDERS,
  CHARACTER_PRESET_UI_SECTIONS,
  clearCharacterPresetPatch,
  countCharacterPresetSectionSelections,
  countCharacterPresetSelections,
  getSelectOptionsForPresetKey,
  presetOptionsFromCache,
  shouldShowPresetField,
  type CharacterPoseAction,
  type CharacterPresetOptions,
  type CharacterPresetUiField,
  type CharacterPresetUiSection,
} from '@/lib/character/options-ui';
import type { CharacterToolCache } from '@/lib/settings/cache';
import { SelectInput, TextInput } from '@/components/ui/Field';

function ClothingCatalogSelect({
  label,
  value,
  catalogKey,
  hints,
  onChange,
}: {
  label: string;
  value: string;
  catalogKey: ClothingCatalogFieldKey;
  hints?: string;
  onChange: (value: string) => void;
}) {
  const [options, setOptions] = useState<Array<{ value: string; label: string; group?: string }>>([
    { value: '', label: 'Default (random / LLM)' },
  ]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const clothingGender = useMemo(
    () => subjectGenderToClothingGender(parseCharacterHints(hints).gender),
    [hints]
  );
  const optionsKey = `${catalogKey}:${clothingGender}`;
  const catalogReady = loadedKey === optionsKey;

  useEffect(() => {
    let cancelled = false;
    void fetchClothingSelectOptions(catalogKey, clothingGender).then(next => {
      if (cancelled) {
        return;
      }
      setOptions(next);
      setLoadedKey(optionsKey);
    });
    return () => {
      cancelled = true;
    };
  }, [catalogKey, clothingGender, optionsKey]);

  const groups = new Map<string, Array<{ value: string; label: string }>>();

  for (const option of options) {
    const group = option.group ?? 'General';
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group)!.push({ value: option.value, label: option.label });
  }

  return (
    <label className="space-y-2">
      <span className="type-heading">{label}</span>
      <SelectInput
        value={value}
        onChange={event => onChange(event.target.value)}
        disabled={!catalogReady}
      >
        {options
          .filter(option => !option.group)
          .map(option => (
            <option key={option.value || 'default'} value={option.value}>
              {option.label}
            </option>
          ))}
        {[...groups.entries()].map(([group, groupOptions]) => (
          <optgroup key={group} label={group}>
            {groupOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ))}
      </SelectInput>
    </label>
  );
}

function CharacterSelect({
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
  presetOptions,
  onChange,
}: {
  field: CharacterPresetUiField;
  settings: CharacterToolCache;
  presetOptions: CharacterPresetOptions;
  onChange: (patch: Partial<CharacterToolCache>) => void;
}) {
  if (!shouldShowPresetField(field, presetOptions)) {
    return null;
  }

  if (field.kind === 'select') {
    return (
      <CharacterSelect
        label={field.label}
        value={(settings[field.key] as string | undefined) ?? ''}
        options={getSelectOptionsForPresetKey(field.key)}
        onChange={value => onChange({ [field.key]: value })}
      />
    );
  }

  if (field.kind === 'clothing-catalog') {
    return (
      <ClothingCatalogSelect
        label={field.label}
        catalogKey={field.key}
        hints={settings.hints}
        value={(settings[field.key] as string | undefined) ?? ''}
        onChange={value => onChange({ [field.key]: value })}
      />
    );
  }

  const poseAction = settings.poseAction ?? '';
  const placeholder =
    field.key === 'poseTarget' && poseAction && poseAction in CHARACTER_POSE_TARGET_PLACEHOLDERS
      ? CHARACTER_POSE_TARGET_PLACEHOLDERS[poseAction as Exclude<CharacterPoseAction, ''>]
      : field.placeholder;

  return (
    <label className="space-y-2">
      <span className="type-heading">{field.label}</span>
      <TextInput
        value={(settings[field.key] as string | undefined) ?? ''}
        onChange={event => onChange({ [field.key]: event.target.value })}
        placeholder={placeholder}
        disabled={field.requires === 'poseAction' && !poseAction}
        className="disabled:cursor-not-allowed disabled:opacity-40"
      />
      {field.key === 'poseTarget' && poseAction && !(settings.poseTarget ?? '').trim() && (
        <p className="text-xs text-[var(--tint-warning-text)]">
          Object target is required for the action anchor to apply.
        </p>
      )}
    </label>
  );
}

function shouldShowFieldForVariant(
  field: CharacterPresetUiField,
  variant: CharacterPresetControlsProps['variant']
): boolean {
  if (variant === 'solo' && (field.key === 'headcount' || field.key === 'duoDynamic')) {
    return false;
  }
  if ((variant === 'duo' || variant === 'compose') && field.key === 'headcount') {
    return false;
  }
  return true;
}

function PresetSection({
  section,
  settings,
  presetOptions,
  onChange,
  variant,
}: {
  section: CharacterPresetUiSection;
  settings: CharacterToolCache;
  presetOptions: CharacterPresetOptions;
  onChange: (patch: Partial<CharacterToolCache>) => void;
  variant: CharacterPresetControlsProps['variant'];
}) {
  if (section.showWhen && !section.showWhen(presetOptions)) {
    return null;
  }

  const sectionCount = countCharacterPresetSectionSelections(section.id, presetOptions);
  const visibleFields = section.fields.filter(
    field =>
      shouldShowFieldForVariant(field, variant) && shouldShowPresetField(field, presetOptions)
  );

  if (visibleFields.length === 0) {
    return null;
  }

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
            <span className="shrink-0 rounded-full border border-[var(--border-default)] bg-[var(--bg-muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
              {sectionCount}
            </span>
          )}
        </div>
      </summary>
      <div className="grid gap-3 border-t border-[var(--border-subtle)]/80 px-4 pb-4 pt-3 sm:grid-cols-2">
        {visibleFields.map(field => (
          <PresetField
            key={`${section.id}-${field.key}`}
            field={field}
            settings={settings}
            presetOptions={presetOptions}
            onChange={onChange}
          />
        ))}
      </div>
    </details>
  );
}

type CharacterPresetControlsProps = {
  mounted: boolean;
  settings: CharacterToolCache;
  onChange: (patch: Partial<CharacterToolCache>) => void;
  variant?: 'solo' | 'duo' | 'compose';
};

export default function CharacterPresetControls({
  mounted,
  settings,
  onChange,
  variant = 'solo',
}: CharacterPresetControlsProps) {
  const presetOptions = useMemo(() => presetOptionsFromCache(settings), [settings]);

  const activeCount = countCharacterPresetSelections(presetOptions);
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
            <p className="type-heading">Character presets (optional)</p>
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
              40+ camera, lighting, body, pose, wardrobe library, and prop options—collapsed by
              default. Each selection maps to prompt script language.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            {activeCount > 0 && (
              <span className="ui-badge" data-tone="accent" data-size="xs" data-upper="true">
                {activeCount} active
              </span>
            )}
            <span className="text-[var(--text-muted)] transition group-open:rotate-180">▾</span>
          </div>
        </div>
      </summary>

      <div className="mt-4 space-y-3">
        {settings.headcount === 'duo' && (
          <p className="rounded-lg border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-3 py-2 text-xs text-[var(--tint-warning-text)]">
            Duo mode generates two interacting people. Solo-subject enforcement is disabled for this
            preset.
          </p>
        )}

        {CHARACTER_PRESET_UI_SECTIONS.map(section => (
          <PresetSection
            key={section.id}
            section={section}
            settings={settings}
            presetOptions={presetOptions}
            onChange={onChange}
            variant={variant}
          />
        ))}

        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => onChange(clearCharacterPresetPatch())}
            className="text-xs font-medium text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text-secondary)] hover:underline"
          >
            Clear all presets
          </button>
        )}
      </div>
    </details>
  );
}
