'use client';

import { PRODUCT_NAME } from '@/lib/brand';

type BrandMarkProps = {
  className?: string;
  size?: number;
  /** Show wordmark beside the mark */
  withWordmark?: boolean;
  wordmarkClassName?: string;
};

/** Castcut mark — teal → sky → warm sand, studio viewport + prompt bars. */
export default function BrandMark({
  className,
  size = 28,
  withWordmark = false,
  wordmarkClassName,
}: BrandMarkProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ''}`.trim()}>
      {/* eslint-disable-next-line @next/next/no-img-element -- local SVG brand asset */}
      <img
        src="/brand-mark.svg"
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-[22%] border border-[var(--border-subtle)]"
        decoding="async"
      />
      {withWordmark ? (
        <span className={wordmarkClassName ?? 'type-brand type-title tracking-tight'}>
          {PRODUCT_NAME}
        </span>
      ) : (
        <span className="sr-only">{PRODUCT_NAME}</span>
      )}
    </span>
  );
}
