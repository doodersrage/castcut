'use client';

export type QualityPresetOption<T extends string> = { id: T; label: string; hint?: string };

/**
 * One "Quality" control: a few named presets (Fast / Balanced / Best) as a pick-one group. When
 * the underlying switches match none of them, a read-only "Custom" segment shows as the pick —
 * picking a preset again rewrites the switches. Day uses it; Outfit and Story can share it.
 */
export default function QualityPresetSegments<T extends string>({
  label = 'Quality',
  options,
  value,
  onChange,
  disabled = false,
  testId,
  customHint = 'Set by hand under Advanced — pick a preset to go back.',
}: {
  label?: string;
  options: Array<QualityPresetOption<T>>;
  /** A preset id, or `custom` when the switches match none. */
  value: T | 'custom';
  onChange: (next: T) => void;
  disabled?: boolean;
  testId: string;
  customHint?: string;
}) {
  return (
    <div className="ui-segmented" role="radiogroup" aria-label={label} data-testid={testId}>
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          role="radio"
          className="ui-segmented-item"
          aria-checked={value === option.id}
          data-active={value === option.id ? 'true' : 'false'}
          disabled={disabled}
          title={option.hint}
          data-testid={`${testId}-${option.id}`}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
      {value === 'custom' ? (
        <span
          role="radio"
          aria-checked="true"
          aria-disabled="true"
          className="ui-segmented-item cursor-default"
          data-active="true"
          title={customHint}
          data-testid={`${testId}-custom`}
        >
          Custom
        </span>
      ) : null}
    </div>
  );
}
