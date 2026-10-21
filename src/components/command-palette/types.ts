export type CommandItem = {
  id: string;
  label: string;
  subtitle?: string;
  href?: string;
  action?: () => void;
  group: string;
  /** Extra words that should find this item. */
  keywords?: string;
  /** Only listed once the player types (deep Settings entries would flood the empty list). */
  searchOnly?: boolean;
  /** Added by a feature or the open page (lib/app/command-actions.ts), not the palette itself. */
  registered?: boolean;
  /** Route whose feature access gates an action item that has no `href` of its own. */
  gateHref?: string;
};
