'use client';

import UiIcon from '@/components/ui/UiIcon';

/** Dashed "upload a photo" tile used by the clothing and footwear pickers. */
export default function UploadTile({
  title,
  hint,
  ariaLabel,
  disabled,
  testId,
  onFile,
}: {
  title: string;
  hint: string;
  ariaLabel: string;
  disabled: boolean;
  testId?: string;
  onFile: (file: File) => void;
}) {
  return (
    <label
      className={`group flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[var(--border-default)] px-3 py-2.5 transition hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] focus-within:ring-2 focus-within:ring-[var(--accent-ring)] ${
        disabled ? 'pointer-events-none opacity-55' : ''
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-muted)] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
        <UiIcon name="upload" size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[var(--text-primary)]">{title}</span>
        <span className="block type-caption text-[var(--text-muted)]">{hint}</span>
      </span>
      <input
        type="file"
        accept="image/*"
        aria-label={ariaLabel}
        data-testid={testId}
        disabled={disabled}
        className="sr-only"
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) {
            onFile(file);
          }
        }}
      />
    </label>
  );
}
