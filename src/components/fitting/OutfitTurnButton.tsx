'use client';

import { useState } from 'react';
import OutfitTurnSheet from '@/components/character/OutfitTurnSheet';
import { Button } from '@/components/ui/Button';
import { useOutfitRunwayClip } from '@/hooks/character/useOutfitRunwayClip';
import { normalizeCastWardrobe, saveOutfitRunway } from '@/lib/cast-wardrobe';
import { getCharacter } from '@/lib/character-os';
import { dayPartnerNoun } from '@/lib/day-partner';

/** Clips made this session, by picture (a try-on not kept has no Wardrobe outfit to keep it). */
const made = new Map<string, string>();

/**
 * Outfit stage "Turn around": the try-on's runway clip (made the first time, about a minute) as a
 * drag-to-turn viewer. Kept on the Wardrobe outfit once the try-on is kept. Loaded lazily — it
 * owns a ComfyUI queue hook.
 */
export default function OutfitTurnButton({
  characterId,
  promptId,
  imageUrl,
  label,
  disabled,
}: {
  characterId: string;
  promptId: string;
  imageUrl: string;
  label: string;
  disabled?: boolean;
}) {
  const makeClip = useOutfitRunwayClip();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [clipUrl, setClipUrl] = useState<string | null>(null);

  const open = async () => {
    const character = getCharacter(characterId);
    if (!character) return;
    const outfit = normalizeCastWardrobe(character.wardrobe)?.find(item =>
      item.promptIds.includes(promptId)
    );
    const known =
      (outfit?.runwayUrl && outfit.runwayFor === imageUrl ? outfit.runwayUrl : null) ??
      made.get(imageUrl);
    if (known) {
      setClipUrl(known);
      return;
    }
    setBusy(true);
    setStatus('Making the turn — about a minute…');
    try {
      const url = await makeClip({
        castId: character.id,
        imageUrl,
        man: dayPartnerNoun(character) === 'man',
      });
      made.set(imageUrl, url);
      if (outfit) saveOutfitRunway(character.id, outfit.key, url, imageUrl);
      setStatus(null);
      setClipUrl(url);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not make the turn.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled || busy}
        title="See this outfit from every side — drag to turn her around (a short clip, about a minute the first time)"
        data-testid="fitting-turn-try-on"
        onClick={() => void open()}
      >
        {busy ? 'Making the turn…' : 'Turn around'}
      </Button>
      {status ? (
        <span className="type-caption self-center text-[var(--text-muted)]" role="status">
          {status}
        </span>
      ) : null}
      {clipUrl ? (
        <OutfitTurnSheet open onClose={() => setClipUrl(null)} clipUrl={clipUrl} title={label} />
      ) : null}
    </>
  );
}
