/** Max prompt history entries kept in browser storage. */
export const PROMPT_HISTORY_LIMIT = 500;

export const DEFAULT_HISTORY_PAGE_SIZE = 25;

export const HISTORY_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export type HistoryPageSize = (typeof HISTORY_PAGE_SIZE_OPTIONS)[number];

export type PaginatedSlice<T> = {
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  rangeStart: number;
  rangeEnd: number;
  items: T[];
};

export function paginateItems<T>(items: T[], page: number, pageSize: number): PaginatedSlice<T> {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    page: safePage,
    pageSize,
    totalPages,
    totalItems,
    rangeStart: totalItems === 0 ? 0 : start + 1,
    rangeEnd: Math.min(safePage * pageSize, totalItems),
    items: items.slice(start, start + pageSize),
  };
}

/** Page (1-based) that contains `index` in a list with `pageSize` rows. */
export function pageForIndex(index: number, pageSize: number): number {
  if (index < 0) {
    return 1;
  }
  return Math.floor(index / pageSize) + 1;
}
