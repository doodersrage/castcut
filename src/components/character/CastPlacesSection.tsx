'use client';

import { useState } from 'react';
import { ChipButton, TextInput } from '@/components/ui/Field';
import { ToolSection } from '@/components/ui/ToolPageShell';
import {
  CAST_PLACE_CUSTOM_MAX,
  defaultPlaceDesign,
  HOME_DESIGNS,
  normalizeCastPlaces,
  resolveCastPlace,
  saveCastPlace,
  WORK_DESIGNS,
  type CastPlaceKind,
} from '@/lib/cast-places';
import type { CharacterRecord } from '@/lib/character-os';

const KINDS: Array<{ kind: CastPlaceKind; title: string; rooms: string }> = [
  {
    kind: 'home',
    title: 'Home',
    rooms: 'bedroom, kitchen, living room, bathroom, hallway, balcony',
  },
  { kind: 'work', title: 'Work', rooms: 'desk, meeting room, office kitchen' },
];

/**
 * Cast → Places: the one home and one workplace every Day still in those rooms shows
 * (cast-places.ts). A design, their own words, or off; unset is a design picked for them.
 */
export default function CastPlacesSection({
  character,
  onUpdated,
}: {
  character: CharacterRecord;
  onUpdated?: (character: CharacterRecord) => void;
}) {
  const places = normalizeCastPlaces(character.places) ?? {};
  const [drafts, setDrafts] = useState<Partial<Record<CastPlaceKind, string>>>({});
  const save = (kind: CastPlaceKind, choice: Parameters<typeof saveCastPlace>[2]) => {
    const next = saveCastPlace(character.id, kind, choice);
    if (next) onUpdated?.(next);
  };
  return (
    <ToolSection
      title="Places"
      description="Their home and workplace look the same in every Day still set there — same walls, floors and furniture, room to room."
      data-testid="cast-places-section"
    >
      <div className="space-y-5">
        {KINDS.map(({ kind, title, rooms }) => {
          const choice = places[kind];
          const designs = kind === 'home' ? HOME_DESIGNS : WORK_DESIGNS;
          const fallback = defaultPlaceDesign(character.id, kind);
          const pickedId =
            choice && 'design' in choice ? choice.design : choice ? null : fallback.id;
          const own = Boolean(choice && 'custom' in choice);
          const off = Boolean(choice && 'off' in choice);
          const resolved = resolveCastPlace(character, kind);
          const draft = drafts[kind] ?? (choice && 'custom' in choice ? choice.custom : '');
          return (
            <div key={kind} className="space-y-2" data-testid={`cast-place-${kind}`}>
              <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label={`${title} look`}>
                {designs.map(design => (
                  <ChipButton
                    key={design.id}
                    active={pickedId === design.id}
                    data-testid={`cast-place-${kind}-${design.id}`}
                    onClick={() => save(kind, { design: design.id })}
                  >
                    {design.label}
                  </ChipButton>
                ))}
                <ChipButton
                  active={own}
                  data-testid={`cast-place-${kind}-own`}
                  onClick={() => setDrafts(previous => ({ ...previous, [kind]: draft || ' ' }))}
                >
                  Own words
                </ChipButton>
                <ChipButton
                  active={off}
                  data-testid={`cast-place-${kind}-off`}
                  onClick={() => save(kind, { off: true })}
                >
                  Off
                </ChipButton>
              </div>
              {own || drafts[kind] !== undefined ? (
                <TextInput
                  value={draft.trimStart()}
                  maxLength={CAST_PLACE_CUSTOM_MAX}
                  aria-label={`${title} in your own words`}
                  placeholder={
                    kind === 'home'
                      ? 'a tiny attic flat with slanted ceilings, wood beams and plants'
                      : 'a busy newsroom with long shared desks and screens'
                  }
                  data-testid={`cast-place-${kind}-own-input`}
                  onChange={event =>
                    setDrafts(previous => ({ ...previous, [kind]: event.target.value }))
                  }
                  onBlur={() => {
                    const text = draft.trim();
                    if (text) save(kind, { custom: text });
                  }}
                />
              ) : null}
              <p
                className="type-caption text-[var(--text-muted)]"
                data-testid={`cast-place-${kind}-note`}
              >
                {resolved
                  ? `${resolved.style.charAt(0).toUpperCase()}${resolved.style.slice(1)}. Used for: ${rooms}.`
                  : 'Off — each still in these rooms is made up on its own.'}
              </p>
            </div>
          );
        })}
      </div>
    </ToolSection>
  );
}
