'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ToolSection } from '@/components/ui/ToolPageShell';
import {
  CAST_VOICE_AUDITION_COUNT,
  CAST_VOICE_AUDITIONS,
  castVoiceOf,
  requestCastVoiceAudition,
  saveCastVoice,
  shiftCastVoice,
  takeCastVoiceFromClip,
} from '@/lib/cast-voice';
import { getCharacter, type CharacterRecord } from '@/lib/character-os';
import { resolveFittingPlateFromCharacter } from '@/lib/character-plate';

type Audition = { index: number; url?: string; error?: string };

/**
 * Cast → Voice: hear the Cast in four kinds of voice (short LTX-2.5 clips of them saying hello),
 * keep one, nudge it deeper or higher. Talking clips are steered toward the kept voice (ID-LoRA).
 */
export default function CastVoiceSection({
  character,
  onUpdated,
}: {
  character: CharacterRecord;
  onUpdated?: (character: CharacterRecord) => void;
}) {
  const voice = castVoiceOf(character.id);
  const lead = character.traits?.sex === 'man' ? 'man' : 'woman';
  const plate = resolveFittingPlateFromCharacter(character);
  const plateUrl = plate?.originalUrl?.trim() || plate?.imageUrl?.trim() || '';
  const [auditions, setAuditions] = useState<Audition[]>([]);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refresh = () => {
    const next = getCharacter(character.id);
    if (next) onUpdated?.(next);
  };
  const audition = async () => {
    setRunning(true);
    setNote(null);
    setAuditions([]);
    for (let index = 0; index < CAST_VOICE_AUDITION_COUNT; index += 1) {
      setAuditions(previous => [...previous, { index }]);
      try {
        const url = await requestCastVoiceAudition({ plateUrl, name: character.name, lead, index });
        setAuditions(previous =>
          previous.map(item => (item.index === index ? { index, url } : item))
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The audition did not render.';
        setAuditions(previous =>
          previous.map(item => (item.index === index ? { index, error: message } : item))
        );
        break;
      }
    }
    setRunning(false);
  };
  const keep = async (url: string) => {
    setBusy(true);
    const error = await takeCastVoiceFromClip({ castId: character.id, clipUrl: url });
    setBusy(false);
    setNote(error ?? 'Voice kept — their talking clips are steered toward it.');
    refresh();
  };
  const shift = async (direction: 'deeper' | 'higher') => {
    setBusy(true);
    const error = await shiftCastVoice(character.id, direction);
    setBusy(false);
    setNote(error ?? (direction === 'deeper' ? 'A little deeper.' : 'A little higher.'));
    refresh();
  };

  return (
    <ToolSection
      title="Voice"
      description="What they sound like in talking clips (a line on a Day slot or Story scene). Hear four voices and keep one — later clips are steered toward it."
      data-testid="cast-voice-section"
    >
      <div className="space-y-3">
        {voice ? (
          <div className="flex flex-wrap items-center gap-2" data-testid="cast-voice-current">
            <audio
              controls
              preload="none"
              className="h-9 max-w-full"
              src={`/api/comfyui/view?${new URLSearchParams({ filename: voice.sample, type: 'input' }).toString()}`}
            />
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void shift('deeper')}>
              Deeper
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void shift('higher')}>
              Higher
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              data-testid="cast-voice-remove"
              onClick={() => {
                saveCastVoice(character.id, null);
                setNote('Voice removed — each talking clip picks its own.');
                refresh();
              }}
            >
              Remove
            </Button>
          </div>
        ) : (
          <p className="type-caption text-[var(--text-muted)]">
            No voice kept yet — each talking clip picks its own.
          </p>
        )}
        <Button
          size="sm"
          variant={voice ? 'secondary' : 'primary'}
          loading={running}
          loadingLabel="Rendering auditions"
          disabled={running || busy || !plateUrl}
          title={plateUrl ? undefined : 'Give this Cast a picture first.'}
          data-testid="cast-voice-audition"
          onClick={() => void audition()}
        >
          {voice ? 'Hear other voices' : 'Audition voices'}
        </Button>
        {auditions.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="cast-voice-auditions">
            {auditions.map(item => (
              <li key={item.index} className="space-y-1.5">
                <p className="type-caption text-[var(--text-muted)]">
                  {CAST_VOICE_AUDITIONS[lead][item.index]}
                </p>
                {item.url ? (
                  <>
                    <video
                      controls
                      playsInline
                      preload="metadata"
                      // #t: show the first frame instead of a black box before it plays.
                      src={`${item.url}#t=0.1`}
                      className="aspect-[3/4] max-h-72 w-full rounded-[var(--radius-md)] bg-black object-contain"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      data-testid={`cast-voice-keep-${item.index}`}
                      onClick={() => void keep(item.url!)}
                    >
                      Use this voice
                    </Button>
                  </>
                ) : item.error ? (
                  <p className="type-caption text-[var(--tint-danger-text)]" role="alert">
                    {item.error}
                  </p>
                ) : (
                  <p className="type-caption text-[var(--text-muted)]">
                    Rendering… (about a minute)
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        {note ? (
          <p
            className="type-caption text-[var(--text-muted)]"
            role="status"
            data-testid="cast-voice-note"
          >
            {note}
          </p>
        ) : null}
      </div>
    </ToolSection>
  );
}
