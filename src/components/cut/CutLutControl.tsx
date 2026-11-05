'use client';

import { useRef, useState } from 'react';
import type { FilmCutOptionsValue } from '@/components/FilmCutOptionsControls';
import { OptionRow } from '@/components/cut/CutOptionParts';
import { Button } from '@/components/ui/Button';
import { parseCubeLut, storeLut } from '@/lib/video/cut-lut';

/** The biggest .cube read (a 65-point cube is about 8 MB of text). */
const MAX_CUBE_BYTES = 12 * 1024 * 1024;

/**
 * Cut → Options → Picture: a LUT for the whole film from a .cube file, after the look. Read here
 * and kept with the cut (cut-lut.ts) — the film applies it exactly, the monitor closely.
 */
export default function CutLutControl({
  value,
  onChange,
  disabled,
  testIdPrefix,
}: {
  value: FilmCutOptionsValue;
  onChange: (next: FilmCutOptionsValue) => void;
  disabled?: boolean;
  testIdPrefix: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <OptionRow
        label="LUT"
        hint="A colour grade from a .cube file (Resolve, Premiere, a LUT pack), over the whole film after the look — the film applies it exactly, the monitor closely"
      >
        <span
          className="min-w-0 flex-1 truncate type-caption text-[var(--text-primary)]"
          data-testid={`${testIdPrefix}-lut-name`}
        >
          {value.lut ? value.lut.name : 'None'}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
          data-testid={`${testIdPrefix}-lut-pick`}
        >
          {value.lut ? 'Change' : 'Add .cube'}
        </Button>
        {value.lut ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => onChange({ ...value, lut: undefined })}
            data-testid={`${testIdPrefix}-lut-clear`}
          >
            Remove
          </Button>
        ) : null}
      </OptionRow>
      <input
        ref={fileRef}
        type="file"
        accept=".cube,text/plain"
        className="hidden"
        data-testid={`${testIdPrefix}-lut-file`}
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          if (file.size > MAX_CUBE_BYTES) {
            setError('That file is too big for a LUT.');
            return;
          }
          setError(null);
          void file.text().then(text => {
            const lut = parseCubeLut(text);
            if ('error' in lut) {
              setError(lut.error);
              return;
            }
            onChange({ ...value, lut: storeLut(file.name, lut) });
          });
        }}
      />
      {error ? <p className="type-caption text-[var(--danger)]">{error}</p> : null}
    </>
  );
}
