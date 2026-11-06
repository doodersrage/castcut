/**
 * Day templates (Part 18 R7): a day's plan kept to start another from — each slot's place, beat,
 * line, reply, narration, camera, light and story state, and the day's mood — never its stills,
 * outfits or Cast. Using one puts that plan on the Day's slots (Day's Undo takes it back); the
 * stills already made stay, as for any plan edit. Kept in this browser. Pure, but for load / save.
 */

import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';
import type { DaySlot } from './planner';

export const DAY_TEMPLATES_KEY = 'day-templates';
export const DAY_TEMPLATES_CHANGED_EVENT = 'day-templates-changed';
const MAX_TEMPLATES = 40;

const PLAN_FIELDS = [
  'label',
  'location',
  'sceneHints',
  'line',
  'replyLine',
  'narration',
  'poseCamera',
  'lighting',
  'state',
] as const;

export type DayTemplateSlot = Pick<DaySlot, 'id' | (typeof PLAN_FIELDS)[number]>;
export type DayTemplate = {
  id: string;
  name: string;
  savedAt: number;
  dayMood?: string;
  slots: DayTemplateSlot[];
};

/** The plan part of the day's slots (what a template keeps). */
export function templateFromDay(input: {
  name: string;
  slots: readonly DaySlot[];
  dayMood?: string;
  id?: string;
  now?: number;
}): DayTemplate {
  return {
    id: input.id ?? `tpl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: input.name.trim().slice(0, 80) || 'A day',
    savedAt: input.now ?? Date.now(),
    ...(input.dayMood ? { dayMood: input.dayMood } : {}),
    slots: input.slots.map(slot => {
      const kept: Record<string, unknown> = { id: slot.id };
      for (const field of PLAN_FIELDS) {
        const value = slot[field];
        if (value !== undefined && value !== '') kept[field] = value;
      }
      return kept as DayTemplateSlot;
    }),
  };
}

/**
 * The day's slots with a template's plan on them: the template's slots in its order, each keeping
 * what the day already had on that slot that a template doesn't carry (its outfit, look, engine).
 */
export function applyDayTemplate(slots: readonly DaySlot[], template: DayTemplate): DaySlot[] {
  return template.slots.map(planned => {
    const current = slots.find(slot => slot.id === planned.id);
    const base: DaySlot = current
      ? { ...current }
      : ({ id: planned.id, label: planned.label } as DaySlot);
    for (const field of PLAN_FIELDS) {
      (base as Record<string, unknown>)[field] = planned[field];
    }
    if (!base.label) base.label = planned.label || String(planned.id);
    return base;
  });
}

export function normalizeDayTemplates(value: unknown): DayTemplate[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is DayTemplate =>
        Boolean(entry) &&
        typeof (entry as DayTemplate).id === 'string' &&
        typeof (entry as DayTemplate).name === 'string' &&
        Array.isArray((entry as DayTemplate).slots) &&
        (entry as DayTemplate).slots.length > 0
    )
    .slice(0, MAX_TEMPLATES);
}

export function loadDayTemplates(): DayTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    return normalizeDayTemplates(readBrowserValue<unknown>(DAY_TEMPLATES_KEY));
  } catch {
    return [];
  }
}

function writeTemplates(list: DayTemplate[]): DayTemplate[] {
  const next = list.slice(0, MAX_TEMPLATES);
  try {
    writeBrowserValue(DAY_TEMPLATES_KEY, next);
    window.dispatchEvent(new Event(DAY_TEMPLATES_CHANGED_EVENT));
  } catch {
    /* quota / private mode */
  }
  return next;
}

export function saveDayTemplate(template: DayTemplate): DayTemplate[] {
  return writeTemplates([
    template,
    ...loadDayTemplates().filter(entry => entry.id !== template.id),
  ]);
}

export function deleteDayTemplate(id: string): DayTemplate[] {
  return writeTemplates(loadDayTemplates().filter(entry => entry.id !== id));
}
