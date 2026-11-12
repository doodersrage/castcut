'use client';

import { useEffect, useState } from 'react';
import ActionMenu, { ACTION_MENU_ITEM_CLASS } from '@/components/ui/ActionMenu';
import { Button } from '@/components/ui/Button';
import {
  DAY_TEMPLATES_CHANGED_EVENT,
  deleteDayTemplate,
  loadDayTemplates,
  saveDayTemplate,
  templateFromDay,
  type DayTemplate,
} from '@/lib/day/day-templates';
import type { DaySlot } from '@/lib/day/planner';

/**
 * Day → Templates (Part 18 R7): keep this day's plan — places, beats, lines, camera, light, story
 * state, the mood — to start another day from; using one puts its plan on the slots (Undo takes it
 * back). Outfits, the Cast and the stills are never in a template.
 */
export default function DayTemplatesMenu({
  slots,
  dayMood,
  moodLabel,
  disabled,
  onUse,
}: {
  slots: readonly DaySlot[];
  dayMood?: string;
  moodLabel?: string;
  disabled?: boolean;
  onUse: (template: DayTemplate) => void;
}) {
  const [templates, setTemplates] = useState<DayTemplate[]>([]);
  useEffect(() => {
    const read = () => setTemplates(loadDayTemplates());
    read();
    window.addEventListener(DAY_TEMPLATES_CHANGED_EVENT, read);
    return () => window.removeEventListener(DAY_TEMPLATES_CHANGED_EVENT, read);
  }, []);
  const name = [moodLabel, slots.find(slot => slot.location?.trim())?.location?.trim()]
    .filter(Boolean)
    .join(' · ');
  return (
    <ActionMenu label="Templates" testId="day-templates-menu">
      <button
        type="button"
        className={ACTION_MENU_ITEM_CLASS}
        disabled={disabled || !slots.length}
        data-testid="day-template-save"
        title="Keep this short's plan — places, beats, lines, camera, light — to start another short from"
        onClick={() => saveDayTemplate(templateFromDay({ name: name || 'A day', slots, dayMood }))}
      >
        Save this day as a template
      </button>
      {templates.length ? (
        templates.map(template => (
          <div key={template.id} className="flex items-center gap-1">
            <button
              type="button"
              className={ACTION_MENU_ITEM_CLASS}
              disabled={disabled}
              data-testid="day-template-use"
              title="Put this plan on this short's moments (Undo takes it back; the stills made stay)"
              onClick={() => onUse(template)}
            >
              Use “{template.name}” · {template.slots.length} slots
            </button>
            <Button
              variant="icon"
              aria-label={`Delete the template ${template.name}`}
              onClick={() => deleteDayTemplate(template.id)}
            >
              ×
            </Button>
          </div>
        ))
      ) : (
        <p className="type-caption px-2 py-1 text-[var(--text-muted)]">No templates yet.</p>
      )}
    </ActionMenu>
  );
}
