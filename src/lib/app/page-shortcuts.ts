/**
 * The keys each page handles itself (2026-11-05), for the shortcuts dialog ("?"): they were only
 * in tooltips and the guides. Keep in step with the pages' key handlers.
 */

export type PageShortcut = { keys: string; does: string };
export type PageShortcuts = { page: string; keys: PageShortcut[] };

const PAGES: Array<{ match: RegExp; page: string; keys: PageShortcut[] }> = [
  {
    match: /^\/cut(?:\/|$)/,
    page: 'Cut',
    keys: [
      { keys: 'Space · K / L', does: 'Pause / play' },
      { keys: 'J', does: 'Back a shot' },
      { keys: '← → · , .', does: 'Previous / next shot · one frame back / on' },
      { keys: 'Shift+← → · Home / End', does: 'A second back / on · the start / the end' },
      { keys: 'S · I / O', does: 'Split at the playhead · trim in / out to it' },
      { keys: 'F · D', does: 'Freeze frame · duplicate the shot' },
      { keys: 'Alt+← → · Delete', does: 'Move the shot · leave it out / back in' },
      { keys: 'M · [ ]', does: 'Drop a marker · jump to the marker before / after' },
      { keys: '+ − · \\', does: 'Zoom the timeline · fit the cut' },
      { keys: 'Ctrl+Z · Ctrl+Shift+Z', does: 'Undo · redo' },
    ],
  },
  {
    match: /^\/day(?:\/|$)/,
    page: 'Day',
    keys: [
      { keys: '← →', does: 'The slot before / after' },
      { keys: 'Enter', does: 'Edit the slot' },
      { keys: 'Q · A', does: 'Queue (or requeue) its still · animate it' },
    ],
  },
  {
    match: /^\/scene(?:\/|$)/,
    page: 'Scene',
    keys: [
      { keys: '← →', does: 'The take before / after' },
      { keys: 'K · X', does: 'Keep the take · reject it' },
      { keys: 'N', does: 'Another take' },
      { keys: '[ ]', does: 'The scene before / after' },
    ],
  },
  {
    match: /^\/fitting(?:\/|$)/,
    page: 'Outfit',
    keys: [
      { keys: '← →', does: 'The kit before / after' },
      { keys: 'Enter', does: 'Try it on' },
      { keys: 'N', does: 'Try it on, then the next kit' },
      { keys: 'K', does: 'Keep the try-on' },
    ],
  },
  {
    match: /^\/story(?:\/|$)/,
    page: 'Story',
    keys: [
      { keys: '1–4', does: 'Pick a beat' },
      { keys: 'R', does: 'Roll new beats' },
      { keys: 'U', does: 'Take back the last scene' },
      { keys: '← →', does: 'The scene before / after' },
    ],
  },
  {
    match: /^\/gallery(?:\/|$)/,
    page: 'Gallery',
    keys: [
      { keys: '← → ↑ ↓', does: 'Move between pictures' },
      { keys: 'Enter', does: 'Open the picture' },
      { keys: 'F · X', does: 'Favourite it · select it' },
      { keys: '1–5 · F · N / P', does: 'In review: rate · favourite · next / previous' },
    ],
  },
];

/** This page's own keys, or null on a page without any. */
export function pageShortcuts(pathname: string | null | undefined): PageShortcuts | null {
  const path = pathname ?? '';
  const found = PAGES.find(entry => entry.match.test(path));
  return found ? { page: found.page, keys: found.keys } : null;
}
