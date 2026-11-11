import type { CharacterRecord } from '@/lib/character/os';

/**
 * Who a Cast member is, in one line for the script writer (2026-11-08): the writer had only
 * names, so everyone sounded alike and the places were invented. From what the Cast already
 * keeps: how they look, what they are to the lead, what they carry. Pure.
 */
export function episodeCastAbout(
  member:
    | Pick<CharacterRecord, 'id' | 'descriptor' | 'relationships' | 'props' | 'speech'>
    | null
    | undefined,
  lead?: Pick<CharacterRecord, 'id' | 'relationships'> | null
): string {
  if (!member) return '';
  const parts: string[] = [];
  const looks = member.descriptor?.replace(/\s+/g, ' ').trim();
  if (looks) parts.push(looks.slice(0, 120));
  if (lead && lead.id !== member.id) {
    const kind =
      lead.relationships?.find(entry => entry.castId === member.id)?.kind ??
      member.relationships?.find(entry => entry.castId === lead.id)?.kind;
    if (kind) parts.push(`her ${kind.replace('-', ' ')}`);
  }
  // Not the accent or a catchphrase: told them, the writer put dialect and the phrase at the head
  // of nearly every line he spoke (34 'Aye's in nine scenes). The voice reads the accent.
  const props = (member.props ?? [])
    .map(prop => prop.name.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (props.length) parts.push(`has a ${props.join(' and a ')}`);
  // How they talk, as a manner (Cast → How they talk, for the writer): what makes their lines
  // theirs without dialect or a phrase to repeat.
  const manner = member.speech?.manner?.replace(/\s+/g, ' ').trim();
  if (manner) parts.push(`talks: ${manner.slice(0, 120)}`);
  return parts.join('; ').slice(0, 320);
}
