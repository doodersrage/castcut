import { rememberToolDraft } from '@/lib/app/tool-draft-memory';

/** Sync helper for tool UIs — prefers the first non-empty field for the preview. */
export function rememberDraftFields(input: {
  toolKey: string;
  label: string;
  href: string;
  fields: Array<string | null | undefined>;
}): void {
  const text = input.fields
    .map(field => field?.trim() ?? '')
    .filter(field => field.length > 0)
    .join(' · ');
  rememberToolDraft({
    toolKey: input.toolKey,
    label: input.label,
    href: input.href,
    text,
  });
}
