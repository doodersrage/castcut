'use client';

import { Button } from '@/components/ui/Button';
import { loadSavedFittingGarments } from '@/lib/fitting/saved-garments';
import { storyboardHtml } from '@/lib/print/print-sheets';
import { openPrintSheet } from '@/lib/print/print-sheets-client';
import { loadSavedFootwear } from '@/lib/wardrobe/footwear-saved';

/**
 * Outfit → Lookbook (Part 18 R6): your saved clothing and shoes, each picture with its name and the
 * words stills use — a costume reference to print or save as PDF.
 */
export default function OutfitLookbookButton() {
  return (
    <Button
      size="sm"
      variant="ghost"
      data-testid="outfit-lookbook"
      title="Your saved clothing and shoes, with what stills are told about each — print or save as PDF"
      onClick={() => {
        const garments = loadSavedFittingGarments(Number.MAX_SAFE_INTEGER);
        const shoes = loadSavedFootwear();
        openPrintSheet(
          storyboardHtml({
            title: 'Lookbook',
            subtitle: `${garments.length} piece${garments.length === 1 ? '' : 's'} · ${shoes.length} pair${shoes.length === 1 ? '' : 's'} of shoes`,
            shape: 'square',
            origin: window.location.origin,
            frames: [
              ...garments.map((garment, index) => ({
                number: String(index + 1),
                image: garment.imageUrl,
                heading: garment.label,
                notes: [['Stills are told', garment.description]] as Array<
                  [string, string | undefined]
                >,
              })),
              ...shoes.map((shoe, index) => ({
                number: `S${index + 1}`,
                image: shoe.imageUrl,
                heading: shoe.label,
                notes: [['Stills are told', shoe.words]] as Array<[string, string | undefined]>,
              })),
            ],
          })
        );
      }}
    >
      Lookbook
    </Button>
  );
}
