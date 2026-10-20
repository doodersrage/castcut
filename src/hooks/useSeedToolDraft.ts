'use client';

import { useEffect, useRef } from 'react';
import { rememberDraftFields } from '@/lib/app/remember-draft-fields';

/**
 * After settings hydrate, push any non-trivial cached draft into the
 * resume pointer so Dashboard / Ctrl+K match restored form text without typing.
 */
export function useSeedToolDraft(
  mounted: boolean,
  draft: {
    toolKey: string;
    label: string;
    href: string;
    fields: Array<string | null | undefined>;
  }
): void {
  const seededRef = useRef(false);
  const draftRef = useRef(draft);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!mounted || seededRef.current) {
      return;
    }
    const current = draftRef.current;
    const ready = current.fields.some(field => (field?.trim().length ?? 0) >= 3);
    if (!ready) {
      return;
    }
    seededRef.current = true;
    rememberDraftFields(current);
  }, [mounted, draft]);
}
