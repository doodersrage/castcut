/**
 * The film assembler, loaded when a film is cut. Day, Story, Outfit (and their phone pages) and
 * the Cast page all cut films; importing `character-film-assemble.ts` directly put a copy of it
 * in each of their bundles (Turbopack 16.2 copies a module into every route that imports it).
 * Through this module it is one chunk, fetched on the first cut.
 */

import type * as Assemble from './character-film-assemble';

export { downloadFilmBlob, shareFilmBlob } from './video-blob-download';

const load = () => import('./character-film-assemble');

export async function assembleFilmBlob(
  ...args: Parameters<typeof Assemble.assembleFilmBlob>
): ReturnType<typeof Assemble.assembleFilmBlob> {
  return (await load()).assembleFilmBlob(...args);
}

export async function assembleAndStampFilm(
  ...args: Parameters<typeof Assemble.assembleAndStampFilm>
): ReturnType<typeof Assemble.assembleAndStampFilm> {
  return (await load()).assembleAndStampFilm(...args);
}

export async function stampAssembledFilm(
  ...args: Parameters<typeof Assemble.stampAssembledFilm>
): ReturnType<typeof Assemble.stampAssembledFilm> {
  return (await load()).stampAssembledFilm(...args);
}

export async function stitchSelectedGalleryVideos(
  ...args: Parameters<typeof Assemble.stitchSelectedGalleryVideos>
): ReturnType<typeof Assemble.stitchSelectedGalleryVideos> {
  return (await load()).stitchSelectedGalleryVideos(...args);
}
