'use client';

/**
 * Building blocks for the cut options panel: a foldable group with a one-line summary of what is
 * set, a label / control row, a full-width on/off switch row and a pick-one segmented control —
 * so the panel reads as a short settings list, not a wrapped form.
 */

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { loadCollapsibleOpen, saveCollapsibleOpen } from '@/lib/app/collapsible-persist';

/** A foldable group: its title, what is set (one line), the rows. Open state is remembered. */
export function OptionGroup({
  title,
  summary,
  defaultOpen = false,
  persistKey,
  testId,
  children,
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  persistKey: string;
  testId?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toggled = useRef(false);
  useEffect(() => {
    // Restored after the first paint (the server render has no saved state).
    const id = window.setTimeout(() => {
      if (!toggled.current) setOpen(loadCollapsibleOpen(persistKey, defaultOpen));
    }, 0);
    return () => window.clearTimeout(id);
  }, [defaultOpen, persistKey]);
  return (
    <details
      className="cut-opt-group"
      open={open}
      data-testid={testId}
      onToggle={event => {
        const next = event.currentTarget.open;
        if (next === open) return;
        toggled.current = true;
        setOpen(next);
        saveCollapsibleOpen(persistKey, next);
      }}
    >
      <summary>
        <span className="cut-opt-group-title">{title}</span>
        {summary ? <span className="cut-opt-group-summary">{summary}</span> : null}
        <span className="cut-opt-group-chevron" aria-hidden="true">
          ›
        </span>
      </summary>
      <div className="cut-opt-group-body">{children}</div>
    </details>
  );
}

/** A label on the left, its control filling the rest. */
export function OptionRow({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="cut-opt-row" title={hint}>
      <label className="cut-opt-row-label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="cut-opt-row-control">{children}</div>
    </div>
  );
}

/** An on/off option as a whole row: its label (and a short note), the switch on the right. */
export function OptionSwitch({
  label,
  note,
  hint,
  checked,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  /** A short muted line under the label (why it is off, what it costs). */
  note?: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      title={hint}
      className="ui-switch cut-opt-switch"
      data-testid={testId}
      onClick={() => onChange(!checked)}
    >
      <span className="cut-opt-switch-text">
        <span>{label}</span>
        {note ? <span className="cut-opt-switch-note">{note}</span> : null}
      </span>
      <span className="ui-switch-track" aria-hidden="true" />
    </button>
  );
}

/** Pick one of a few: a segmented control (each segment `${testId}-${id}`). */
export function OptionSegments<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  options: ReadonlyArray<{ id: T; label: string; hint?: string; disabled?: boolean }>;
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <div
      className="ui-segmented cut-opt-segments"
      role="radiogroup"
      aria-label={label}
      data-testid={testId}
    >
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          role="radio"
          className="ui-segmented-item"
          aria-checked={value === option.id}
          data-active={value === option.id ? 'true' : 'false'}
          disabled={disabled || option.disabled}
          title={option.hint}
          data-testid={testId ? `${testId}-${option.id}` : undefined}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A level slider with its percentage. */
export function OptionSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
  format = v => `${Math.round(v * 100)}%`,
  testId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  format?: (value: number) => string;
  testId?: string;
}) {
  return (
    <div className="cut-opt-slider">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={value}
        aria-label={label}
        aria-valuetext={format(value)}
        onChange={event => onChange(Number(event.target.value))}
        data-testid={testId}
      />
      <span className="cut-opt-slider-value">{format(value)}</span>
    </div>
  );
}

export const optionSelectClass = 'cut-opt-select';
