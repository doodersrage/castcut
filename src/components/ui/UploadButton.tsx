'use client';

/**
 * A file picker that looks like a button (a bare `<input type=file>` reads as a form field and
 * shows "No file chosen"). The input stays focusable for keyboard and test use.
 */
export default function UploadButton({
  label,
  variant = 'secondary',
  disabled = false,
  accept = 'image/*',
  ariaLabel,
  testId,
  capture,
  onFile,
}: {
  label: string;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  accept?: string;
  ariaLabel?: string;
  testId?: string;
  /** Phone: open the camera directly (`capture` on the input). */
  capture?: 'environment' | 'user';
  onFile: (file: File) => void;
}) {
  return (
    <label
      className={`${variant === 'primary' ? 'ui-btn-primary' : 'ui-btn-secondary'} inline-flex cursor-pointer items-center justify-center px-3 py-1.5 text-sm focus-within:ring-2 focus-within:ring-[var(--accent-ring)] ${
        disabled ? 'pointer-events-none opacity-55' : ''
      }`}
    >
      {label}
      <input
        type="file"
        accept={accept}
        capture={capture}
        aria-label={ariaLabel ?? label}
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
