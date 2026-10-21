'use client';

import { useEffect, useRef } from 'react';
import { registerCommandActions, type CommandAction } from '@/lib/app/command-actions';

/**
 * Page actions in the command palette while the page is mounted (lib/app/command-actions.ts).
 * Handlers and `available` always read the latest render's values, so pass the same functions
 * the page's buttons call; the registration itself only changes when ids or labels do.
 */
export function useCommandActions(actions: CommandAction[]): void {
  const latest = useRef(actions);
  useEffect(() => {
    latest.current = actions;
  });
  const key = actions
    .map(action => `${action.id}\u0000${action.label}\u0000${action.subtitle ?? ''}`)
    .join('\u0001');

  useEffect(() => {
    const find = (id: string) => latest.current.find(action => action.id === id);
    const wrapped = latest.current.map((action): CommandAction => ({
      ...action,
      run: context => find(action.id)?.run?.(context),
      available: () => {
        const current = find(action.id);
        return Boolean(current) && (current?.available ? current.available() : true);
      },
    }));
    return registerCommandActions(wrapped);
  }, [key]);
}
