'use client';

import { usePathname } from 'next/navigation';
import { githubBugReportUrl } from '@/lib/project-links';

export default function ReportBugLink({
  className = '',
  variant = 'link',
  role,
}: {
  className?: string;
  variant?: 'link' | 'button';
  /** "menuitem" inside a role="menu" list. */
  role?: 'menuitem';
}) {
  const pathname = usePathname();
  const href = githubBugReportUrl({ pathname: pathname || undefined });
  const classes =
    variant === 'button' ? `ui-btn-secondary ui-btn-sm ${className}`.trim() : className;

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={classes} role={role}>
      Report a bug
    </a>
  );
}
