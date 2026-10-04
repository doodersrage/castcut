'use client';

import dynamic from 'next/dynamic';

/**
 * The Clothing picker (kits, own photo, shoes), loaded when a Clothing sheet opens. Day, Story
 * and Outfit — desktop and phone — all show it only inside a sheet; imported directly it and its
 * kit browser, tiles and shoe field were copied into each of those six bundles (Turbopack 16.2
 * copies a module into every route that imports it).
 */
const ClothingPicker = dynamic(() => import('@/components/wardrobe/ClothingPicker'), {
  ssr: false,
  loading: () => <p className="type-caption text-[var(--text-muted)]">Loading clothing…</p>,
});

export default ClothingPicker;
