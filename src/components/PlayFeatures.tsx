'use client';

import '@/lib/play/features';
import '@/components/PlayAppSlots';
import PlayCastPlateWatcher from '@/components/play/PlayCastPlateWatcher';
import LookPlateGuardWatcher from '@/components/play/LookPlateGuardWatcher';
import ClipCheckWatcher from '@/components/play/ClipCheckWatcher';
// Shell hoists (as in AppShell): Play modules most Play routes use, shipped once in the root
// chunk instead of copied into each route chunk by Turbopack. Check the build after changing.
import '@/lib/fitting/room';
import '@/lib/story/roleplay-library';

/**
 * Registers Castcut's Play features with the shared app on load (lib/play/features.ts), and
 * mounts Play's app-wide watchers (a Cast plate rendered from a description attaches itself; a
 * new look plate that is someone else is said).
 */
export default function PlayFeatures() {
  return (
    <>
      <PlayCastPlateWatcher />
      <LookPlateGuardWatcher />
      <ClipCheckWatcher />
    </>
  );
}
