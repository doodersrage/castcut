'use client';

/**
 * Edit 2511 paints a custom pose's figure as bare feet: picked shoes came out on the floor or
 * not at all (0 of 12 with the pose map, 3 of 4 without it, on the user's heel try-ons).
 */
export default function OutfitPoseShoesNote({
  model,
  hasCustomPose,
  footwear,
}: {
  model?: string;
  hasCustomPose: boolean;
  footwear?: string;
}) {
  const words = footwear?.trim() || '';
  if (!hasCustomPose || !words || /barefoot/i.test(words)) return null;
  if (!String(model ?? '').includes('qwen-image-edit-2511')) return null;
  return (
    <p
      className="type-caption text-[var(--tint-warning-text)]"
      data-testid="fitting-pose-shoes-note"
    >
      With a custom pose, Edit 2511 tends to leave the feet bare. For the shoes, try the
      plate&apos;s own stance (or another engine).
    </p>
  );
}
