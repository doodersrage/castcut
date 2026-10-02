/**
 * A photo the player picks keeps its own filename ("IMG_0001.jpg", "image.jpg") and the upload
 * route overwrites a file of that name in ComfyUI's input folder. Two different photos with the
 * same name then shared one filename — and everything keyed by it (the dressed plate store, a
 * saved clothing photo, a Cast plate) silently pointed at the newer picture. A stamp per upload
 * keeps each picture's name its own.
 */
export function stampedUploadName(name: string, now: number = Date.now()): string {
  const trimmed = name.trim().split('/').pop() || 'upload.png';
  const match = /^(.*?)(\.[A-Za-z0-9]{1,5})?$/.exec(trimmed);
  const base = (match?.[1] || 'upload').replace(/-u[0-9a-z]{6,}$/, '');
  const extension = match?.[2] ?? '.png';
  return `${base}-u${now.toString(36)}${extension}`;
}
