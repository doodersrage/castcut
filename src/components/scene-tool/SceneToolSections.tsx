'use client';

import type { ReactNode } from 'react';
import { FieldDivider, FieldError, FieldLabel, TextArea } from '@/components/ui/Field';
import { PrimaryButton } from '@/components/ui/Button';
import { SCENE_HINTS_LABEL } from '@/lib/tool-ui-labels';
import { accentButtonClass } from '@/lib/tool-theme';
import type { ToolAccent } from '@/lib/tool-theme';

type SceneQuickTagsProps = {
  settingType: string;
  timeOfDay: string;
  mood: string;
  onSettingTypeChange: (value: string) => void;
  onTimeOfDayChange: (value: string) => void;
  onMoodChange: (value: string) => void;
  inputClassName?: string;
};

export function SceneQuickTags({
  settingType,
  timeOfDay,
  mood,
  onSettingTypeChange,
  onTimeOfDayChange,
  onMoodChange,
  inputClassName = '',
}: SceneQuickTagsProps) {
  return (
    <>
      <FieldLabel hint="Optional shortcuts—structured presets below offer fuller control.">
        Quick tags
      </FieldLabel>
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          value={settingType}
          onChange={event => onSettingTypeChange(event.target.value)}
          placeholder="Place type"
          className={`ui-input px-3 py-2 text-sm ${inputClassName}`.trim()}
        />
        <input
          value={timeOfDay}
          onChange={event => onTimeOfDayChange(event.target.value)}
          placeholder="Time / light"
          className={`ui-input px-3 py-2 text-sm ${inputClassName}`.trim()}
        />
        <input
          value={mood}
          onChange={event => onMoodChange(event.target.value)}
          placeholder="Mood"
          className={`ui-input px-3 py-2 text-sm ${inputClassName}`.trim()}
        />
      </div>
    </>
  );
}

type VariationSliderFieldProps = {
  label?: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
  valueLabel: string;
  minLabel?: string;
  maxLabel?: string;
  accentRingClassName?: string;
  id?: string;
  showLabel?: boolean;
};

export function VariationSliderField({
  label,
  hint,
  value,
  onChange,
  valueLabel,
  minLabel = 'Stable',
  maxLabel = 'Varied',
  accentRingClassName = '',
  id,
  showLabel = true,
}: VariationSliderFieldProps) {
  return (
    <>
      {showLabel && label ? <FieldLabel hint={hint}>{label}</FieldLabel> : null}
      {/* The slider keeps at least 7rem and the value wraps under it: a long value label on a
          phone used to shrink the slider to its thumb. */}
      <div className="grid grid-cols-[auto_minmax(7rem,1fr)] items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)] sm:grid-cols-[auto_minmax(7rem,1fr)_auto]">
        <span className="type-caption">{minLabel}</span>
        <input
          id={id}
          type="range"
          aria-label={label || `${minLabel} to ${maxLabel}`}
          min={0}
          max={100}
          step={5}
          value={value}
          onChange={event => onChange(Number(event.target.value))}
          className={`h-8 w-full min-w-0 cursor-pointer accent-[var(--accent)] ${accentRingClassName}`.trim()}
        />
        <span className="type-caption col-span-2 text-right font-medium text-[var(--text-primary)] sm:col-span-1">
          {valueLabel}
        </span>
      </div>
    </>
  );
}

type SceneHintsFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  label?: string;
  hint?: string;
};

export function SceneHintsField({
  value,
  onChange,
  placeholder,
  rows = 3,
  className = '',
  label = SCENE_HINTS_LABEL,
  hint,
}: SceneHintsFieldProps) {
  return (
    <>
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <TextArea
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={className}
      />
    </>
  );
}

type SceneGenerateFooterProps = {
  accent: ToolAccent;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  error?: string | null;
  children?: ReactNode;
};

export function SceneGenerateFooter({
  accent,
  label,
  onClick,
  disabled,
  loading,
  loadingLabel,
  error,
  children,
}: SceneGenerateFooterProps) {
  return (
    <>
      <FieldDivider />
      <div className="flex flex-wrap gap-3">
        <PrimaryButton
          accentClassName={accentButtonClass(accent)}
          onClick={onClick}
          disabled={disabled}
          loading={loading}
          loadingLabel={loadingLabel}
          data-action="primary-generate"
        >
          {label}
        </PrimaryButton>
        {children}
      </div>
      <FieldError>{error}</FieldError>
    </>
  );
}

export function SceneToolSection({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="ui-section-stack">
      {title ? (
        <header className="space-y-2">
          <h2 className="type-title">{title}</h2>
          {description ? <p className="type-caption">{description}</p> : null}
        </header>
      ) : null}
      <div className="ui-block-group">{children}</div>
    </section>
  );
}
