'use client';

import { useRef } from 'react';
import type { PromptSidecar } from '@/lib/prompt/sidecar';
import { readPromptSidecarFile } from '@/lib/prompt/sidecar';

type SidecarImportButtonProps = {
  onImport: (sidecar: PromptSidecar) => void;
  onError?: (message: string) => void;
  label?: string;
  className?: string;
};

export default function SidecarImportButton({
  onImport,
  onError,
  label = 'Import sidecar',
  className = 'cursor-pointer rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-primary)] hover:border-[var(--border-default)]',
}: SidecarImportButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <label className={className}>
      {label}
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        aria-label="Choose a JSON file"
        className="hidden"
        onChange={event => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }

          void readPromptSidecarFile(file)
            .then(onImport)
            .catch(error => {
              onError?.(error instanceof Error ? error.message : 'Sidecar import failed.');
            })
            .finally(() => {
              event.target.value = '';
            });
        }}
      />
    </label>
  );
}
