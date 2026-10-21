/**
 * The app's stacking order for overlays, low to high. Use these (as `style={{ zIndex }}`)
 * instead of a fresh `z-[NN]` so a new overlay lands where it should against the others.
 *
 * - `sheet` / `sheetRaised`: side sheets (a raised one stacks over another sheet).
 * - `dialog`: an ordinary modal dialog.
 * - `tray`: the system tray notices — above dialogs so an Undo stays reachable.
 * - `palette`: the command palette.
 * - `dialogRaised`: a dialog opened over another dialog or the command palette.
 * - `lightbox`: the full-screen image lightbox.
 * - `dialogOverLightbox`: a dialog opened from inside the lightbox (Fix area).
 * - `confirm`: a confirm question — over everything it can be asked from.
 * - `popover`: menus portalled to the body (they close before anything above opens).
 */
export const Z_INDEX = {
  sheet: 70,
  sheetRaised: 76,
  dialog: 80,
  tray: 90,
  palette: 100,
  dialogRaised: 110,
  lightbox: 120,
  dialogOverLightbox: 140,
  confirm: 160,
  popover: 200,
} as const;

export type ZLayer = keyof typeof Z_INDEX;
