'use client';

import { useEffect } from 'react';
import { applyAppTheme, subscribeSystemTheme } from '@/lib/app/theme-store';
import { applyAmbientIntensity } from '@/lib/settings/ambient-settings';
import { applyCalmUi } from '@/lib/settings/calm-settings';
import { applyUiDensity } from '@/lib/settings/density-settings';
import { applyWorkspaceMode } from '@/lib/app/workspace-mode';

export default function ThemeInit() {
  useEffect(() => {
    applyAppTheme();
    applyAmbientIntensity();
    applyUiDensity();
    applyCalmUi();
    applyWorkspaceMode();

    return subscribeSystemTheme();
  }, []);

  return null;
}
