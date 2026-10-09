'use client';

import '@/lib/play-features';
import '@/components/PlayAppSlots';
import PlayCastPlateWatcher from '@/components/play/PlayCastPlateWatcher';

/**
 * Registers Castcut's Play features with the shared app on load (lib/play-features.ts), and
 * mounts Play's app-wide watchers (a Cast plate rendered from a description attaches itself).
 */
export default function PlayFeatures() {
  return <PlayCastPlateWatcher />;
}
