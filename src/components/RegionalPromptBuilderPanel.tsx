'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  buildInpaintInstruction,
  buildRegionalPrompt,
  buildRegionalPromptParenForm,
  DEFAULT_REGIONAL_REGIONS,
  parseRegionalSegments,
  REGIONAL_PROMPT_TOKENS,
  type RegionalPromptSegment,
} from '@/lib/prompt/regional-prompt-builder';
import { FieldLabel, TextArea } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';

type RegionalPromptBuilderPanelProps = {
  onApply: (prompt: string) => void;
  accentClassName?: string;
  segments?: RegionalPromptSegment[];
  onSegmentsChange?: (segments: RegionalPromptSegment[]) => void;
};

function defaultSegments(): RegionalPromptSegment[] {
  return DEFAULT_REGIONAL_REGIONS.map(region => ({
    regionId: region.id,
    prompt: '',
  }));
}

export default function RegionalPromptBuilderPanel({
  onApply,
  accentClassName,
  segments: controlledSegments,
  onSegmentsChange,
}: RegionalPromptBuilderPanelProps) {
  const [segments, setSegments] = useState<RegionalPromptSegment[]>(
    controlledSegments?.length ? controlledSegments : defaultSegments()
  );
  const [maskDescription, setMaskDescription] = useState('');
  const [changeDescription, setChangeDescription] = useState('');
  const [rawImport, setRawImport] = useState('');

  useEffect(() => {
    if (!controlledSegments) {
      return;
    }
    scheduleAfterCommit(() => {
      setSegments(controlledSegments.length > 0 ? controlledSegments : defaultSegments());
    });
  }, [controlledSegments]);

  const updateSegments = (next: RegionalPromptSegment[]) => {
    setSegments(next);
    onSegmentsChange?.(next);
  };

  const composed = useMemo(() => buildRegionalPrompt(segments), [segments]);
  const parenForm = useMemo(() => buildRegionalPromptParenForm(segments), [segments]);
  const inpaint = useMemo(
    () =>
      maskDescription.trim() && changeDescription.trim()
        ? buildInpaintInstruction(maskDescription, changeDescription)
        : '',
    [maskDescription, changeDescription]
  );

  return (
    <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)]/40 p-4">
      <p className="text-sm text-[var(--text-secondary)]">Regional prompt builder</p>
      <p className="text-xs text-[var(--text-muted)]">
        Labeled subject/background/lighting segments feed hints and, at queue time, fill{' '}
        <code className="text-[var(--text-muted)]">{REGIONAL_PROMPT_TOKENS.subject}</code> (and
        related) tokens on imported regional/attention-mask packs.
      </p>

      {DEFAULT_REGIONAL_REGIONS.map(region => {
        const segment = segments.find(entry => entry.regionId === region.id);
        return (
          <div key={region.id} className="space-y-1">
            <FieldLabel hint={region.description}>{region.label}</FieldLabel>
            <TextArea
              rows={2}
              value={segment?.prompt ?? ''}
              onChange={event =>
                updateSegments(
                  segments.map(entry =>
                    entry.regionId === region.id ? { ...entry, prompt: event.target.value } : entry
                  )
                )
              }
              placeholder={`${region.label} details…`}
              className={accentClassName}
            />
          </div>
        );
      })}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <FieldLabel>Mask region</FieldLabel>
          <TextArea
            rows={2}
            value={maskDescription}
            onChange={event => setMaskDescription(event.target.value)}
            placeholder="e.g. sky above horizon"
            className={accentClassName}
          />
        </div>
        <div className="space-y-1">
          <FieldLabel>Inpaint change</FieldLabel>
          <TextArea
            rows={2}
            value={changeDescription}
            onChange={event => setChangeDescription(event.target.value)}
            placeholder="e.g. replace with storm clouds"
            className={accentClassName}
          />
        </div>
      </div>

      <div className="space-y-1">
        <FieldLabel hint="One line per region: Label: prompt text">Import lines</FieldLabel>
        <TextArea
          rows={3}
          value={rawImport}
          onChange={event => setRawImport(event.target.value)}
          placeholder={'Subject: cyclist in red kit\nBackground: misty forest'}
          className={accentClassName}
        />
        <Button
          variant="secondary"
          className="!min-h-9"
          onClick={() => {
            if (!rawImport.trim()) {
              return;
            }
            updateSegments(parseRegionalSegments(rawImport));
          }}
        >
          Parse import
        </Button>
      </div>

      {(composed || inpaint) && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 text-xs text-[var(--text-secondary)]">
          {[composed, inpaint].filter(Boolean).join('\n\n')}
        </pre>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="accent-outline"
          disabled={!composed.trim()}
          onClick={() => onApply(composed)}
        >
          Apply regional prompt
        </Button>
        <Button variant="secondary" disabled={!parenForm.trim()} onClick={() => onApply(parenForm)}>
          Apply (region: …) form
        </Button>
        <Button variant="secondary" disabled={!inpaint.trim()} onClick={() => onApply(inpaint)}>
          Apply inpaint instruction
        </Button>
      </div>
    </div>
  );
}
