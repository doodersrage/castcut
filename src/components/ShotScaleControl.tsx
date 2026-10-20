'use client';

import {
  FANTASY_SHOT_SCALE_OPTIONS,
  SHOT_SCALE_LABEL,
  SUBJECT_SHOT_SCALE_OPTIONS,
  type FantasyShotScale,
  type SubjectShotScale,
} from '@/lib/app/tool-ui-labels';
import { ChipButton, FieldLabel } from '@/components/ui/Field';

type ShotScaleControlProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ label: string; value: T }>;
  activeClassName?: string;
};

function ShotScaleButtons<T extends string>({
  value,
  onChange,
  options,
}: ShotScaleControlProps<T>) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(option => (
        <ChipButton
          key={option.value}
          active={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </ChipButton>
      ))}
    </div>
  );
}

export function SubjectShotScaleControl({
  value,
  onChange,
}: {
  value: SubjectShotScale;
  onChange: (value: SubjectShotScale) => void;
  activeClassName?: string;
}) {
  return (
    <>
      <FieldLabel>{SHOT_SCALE_LABEL}</FieldLabel>
      <ShotScaleButtons value={value} onChange={onChange} options={SUBJECT_SHOT_SCALE_OPTIONS} />
    </>
  );
}

export function FantasyShotScaleControl({
  value,
  onChange,
  environmentOnly = false,
}: {
  value: FantasyShotScale;
  onChange: (value: FantasyShotScale) => void;
  activeClassName?: string;
  environmentOnly?: boolean;
}) {
  const options = environmentOnly
    ? FANTASY_SHOT_SCALE_OPTIONS.filter(option => option.value === 'wide')
    : FANTASY_SHOT_SCALE_OPTIONS;

  return (
    <>
      <FieldLabel>{SHOT_SCALE_LABEL}</FieldLabel>
      <ShotScaleButtons value={value} onChange={onChange} options={options} />
    </>
  );
}
