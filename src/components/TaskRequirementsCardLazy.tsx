'use client';

import dynamic from 'next/dynamic';

/**
 * TaskRequirementsCard, loaded after the page. It renders nothing until ComfyUI answers anyway,
 * and imported directly it was copied into each of the six Day / Story / Outfit bundles
 * (desktop and phone) — Turbopack 16.2 copies a module into every route that imports it.
 */
const TaskRequirementsCard = dynamic(() => import('@/components/TaskRequirementsCard'), {
  ssr: false,
  loading: () => null,
});

export default TaskRequirementsCard;
