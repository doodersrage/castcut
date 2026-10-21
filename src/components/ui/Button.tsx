import Link from 'next/link';
import type { LinkProps } from 'next/link';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'info'
  | 'accent-outline'
  /** Inline underlined action in running text ("Clear", "Show all"). */
  | 'link'
  /** Small rounded toggle / filter; aria-pressed or data-active shows it on. */
  | 'pill'
  /** Tiny action over a picture (gallery card hover row); see `tone`. */
  | 'overlay'
  /** 32 px square icon-only button (↑ ↓ ✕); give it an aria-label. */
  | 'icon';
type ButtonSize = 'default' | 'sm';
/** Colour of an `overlay` button. */
type ButtonTone = 'default' | 'strong' | 'success' | 'warning' | 'accent';

type LoadingProps = {
  loading?: boolean;
  loadingLabel?: string;
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  LoadingProps & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** Colour of an `overlay` button (ignored by the other variants). */
    tone?: ButtonTone;
    fullWidth?: boolean;
    children: ReactNode;
  };

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'ui-btn-primary',
  secondary: 'ui-btn-secondary',
  ghost: 'ui-btn-ghost',
  danger: 'ui-btn-danger',
  info: 'ui-btn-info',
  'accent-outline': 'ui-btn-accent-outline',
  link: 'ui-text-link',
  pill: 'ui-btn-pill',
  overlay: 'ui-btn-overlay',
  icon: 'ui-btn-icon',
};

/** The small variants carry their own size (and sit in the components layer, so utilities win). */
const SIZED_VARIANTS = new Set<ButtonVariant>([
  'primary',
  'secondary',
  'ghost',
  'danger',
  'info',
  'accent-outline',
]);

function buttonClassName({
  variant = 'secondary',
  size = 'default',
  fullWidth = false,
  className = '',
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}) {
  const sizeClass = size === 'sm' && SIZED_VARIANTS.has(variant) ? 'ui-btn-sm' : '';
  return `${variantClasses[variant]} ${sizeClass} ${fullWidth ? 'ui-btn-full' : ''} ${className}`.trim();
}

function ButtonContent({
  loading,
  loadingLabel,
  children,
}: {
  loading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
}) {
  return (
    <>
      {loading ? <span className="ui-spinner ui-spinner-sm" aria-hidden /> : null}
      <span className={loading ? 'opacity-90' : undefined}>{children}</span>
      {loading && loadingLabel ? <span className="sr-only">{loadingLabel}</span> : null}
    </>
  );
}

export function Spinner({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClass = size === 'sm' ? 'ui-spinner-sm' : size === 'lg' ? 'ui-spinner-lg' : '';
  return (
    <span
      className={`ui-spinner ${sizeClass} ${className}`.trim()}
      role="status"
      aria-label="Loading"
    />
  );
}

export function Skeleton({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`ui-skeleton ${className}`.trim()} {...props} />;
}

export function Button({
  variant = 'secondary',
  size = 'default',
  tone,
  fullWidth = false,
  loading = false,
  loadingLabel,
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-tone={tone && tone !== 'default' ? tone : undefined}
      className={buttonClassName({ variant, size, fullWidth, className })}
      {...props}
    >
      <ButtonContent loading={loading} loadingLabel={loadingLabel}>
        {children}
      </ButtonContent>
    </button>
  );
}

type ButtonLinkProps = Omit<LinkProps, 'className'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
};

export function ButtonLink({
  variant = 'secondary',
  size = 'default',
  className = '',
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={buttonClassName({ variant, size, className })} {...props}>
      {children}
    </Link>
  );
}

export function PrimaryButton({
  accentClassName = 'ui-btn-primary',
  className = '',
  loading = false,
  loadingLabel,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  LoadingProps & {
    accentClassName?: string;
    children: ReactNode;
  }) {
  const isDisabled = Boolean(disabled) || Boolean(loading);
  return (
    <button
      type="button"
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`${accentClassName} ${className}`.trim()}
      suppressHydrationWarning
      {...props}
    >
      <ButtonContent loading={loading} loadingLabel={loadingLabel}>
        {children}
      </ButtonContent>
    </button>
  );
}
