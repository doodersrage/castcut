'use client';

import { useEffect, useState } from 'react';
import type { AppTheme } from '@/lib/theme-store';
import {
  APP_THEME_CHANGED_EVENT,
  loadAppTheme,
  resolveAppTheme,
  saveAppTheme,
  systemPrefersDark,
} from '@/lib/theme-store';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { SegmentedControl } from '@/components/ui/ToolPageShell';

const THEME_OPTIONS = [
  { value: 'auto' as const, label: 'Auto' },
  { value: 'light' as const, label: 'Light' },
  { value: 'dark' as const, label: 'Dark' },
];

export default function ThemePreferenceControl({ showHint = true }: { showHint?: boolean }) {
  const [theme, setTheme] = useState<AppTheme>('auto');
  const [systemDark, setSystemDark] = useState(true);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setTheme(loadAppTheme());
      setSystemDark(systemPrefersDark());
    });
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener('change', onChange);
    const onThemeChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ theme?: AppTheme }>).detail;
      if (detail?.theme) {
        setTheme(detail.theme);
      } else {
        setTheme(loadAppTheme());
      }
    };
    window.addEventListener(APP_THEME_CHANGED_EVENT, onThemeChanged);
    return () => {
      media.removeEventListener('change', onChange);
      window.removeEventListener(APP_THEME_CHANGED_EVENT, onThemeChanged);
    };
  }, []);

  const resolved = resolveAppTheme(theme, systemDark);

  return (
    <div className="space-y-2 text-sm">
      <span className="type-caption block text-[var(--text-muted)]">Theme</span>
      <SegmentedControl
        aria-label="Theme preference"
        value={theme}
        onChange={next => {
          setTheme(next);
          saveAppTheme(next);
        }}
        options={THEME_OPTIONS}
      />
      {showHint ? (
        <p className="type-caption text-[var(--text-muted)]">
          {theme === 'auto'
            ? `Following system · currently ${resolved}. Light or Dark overrides Auto.`
            : `Override active · ${resolved}. Choose Auto to follow your system again.`}
        </p>
      ) : null}
    </div>
  );
}
