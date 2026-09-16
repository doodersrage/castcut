'use client';

import { useEffect, useState } from 'react';
import { subscribeWardrobeGarmentThumbManifest } from '@/lib/wardrobe-garment-thumbs';

/**
 * Bumps when the garment-thumb manifest finishes loading so kit pickers
 * re-resolve packshot URLs without bundling the JSON into the client chunk.
 */
export function useWardrobeGarmentThumbManifestGeneration(): number {
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    return subscribeWardrobeGarmentThumbManifest(() => {
      setGeneration(value => value + 1);
    });
  }, []);
  return generation;
}
