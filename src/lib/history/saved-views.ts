'use client';

import type { HistoryFilter } from './filter';
import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';

export type HistorySavedView = {
  id: string;
  name: string;
  filter: HistoryFilter;
  createdAt: number;
};

const KEY = 'comfy-history-saved-views-v1';

export function loadHistorySavedViews(): HistorySavedView[] {
  if (typeof window === 'undefined') {
    return [];
  }
  return readBrowserValue<HistorySavedView[]>(KEY) ?? [];
}

export function saveHistorySavedViews(views: HistorySavedView[]): void {
  writeBrowserValue(KEY, views.slice(0, 20));
}

export function upsertHistorySavedView(
  view: Omit<HistorySavedView, 'createdAt'> & { createdAt?: number }
): HistorySavedView {
  const next: HistorySavedView = {
    ...view,
    createdAt: view.createdAt ?? Date.now(),
  };
  saveHistorySavedViews([next, ...loadHistorySavedViews().filter(entry => entry.id !== view.id)]);
  return next;
}

export function deleteHistorySavedView(id: string): void {
  saveHistorySavedViews(loadHistorySavedViews().filter(entry => entry.id !== id));
}
