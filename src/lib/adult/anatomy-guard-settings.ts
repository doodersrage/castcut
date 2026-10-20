'use client';

import { loadSettingsCache } from '../settings/cache';
import {
  DEFAULT_ANATOMY_GUARD_MODE,
  normalizeAnatomyGuardMode,
  type AnatomyGuardMode,
} from './anatomy-guard';

export function loadAnatomyGuardMode(): AnatomyGuardMode {
  if (typeof window === 'undefined') {
    return DEFAULT_ANATOMY_GUARD_MODE;
  }
  return normalizeAnatomyGuardMode(loadSettingsCache().shared.anatomyGuardMode);
}
