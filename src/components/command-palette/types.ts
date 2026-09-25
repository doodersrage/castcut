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
};
