'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { ToolSection } from '@/components/ui/ToolPageShell';
import {
  CAST_CATCHPHRASES_MAX,
  CAST_PRONUNCIATIONS_MAX,
  normalizeCastSpeech,
  pronounceLine,
  saveCastSpeech,
  type CastSpeech,
} from '@/lib/cast/speech';
import type { CharacterRecord } from '@/lib/character-os';

/**
 * Cast → How they talk (cast-speech.ts): sounds-like spellings for words the clip voice gets
 * wrong (only the clip prompt changes; the line and captions keep the real spelling), and
 * their own lines, offered as one tap beside a clip's line.
 */
export default function CastSpeechSection({
  character,
  onUpdated,
}: {
  character: CharacterRecord;
  onUpdated?: (character: CharacterRecord) => void;
}) {
  const speech = normalizeCastSpeech(character.speech) ?? {};
  const pronunciations = speech.pronunciations ?? [];
  const catchphrases = speech.catchphrases ?? [];
  const [word, setWord] = useState('');
  const [sayAs, setSayAs] = useState('');
  const [phrase, setPhrase] = useState('');
  const save = (next: CastSpeech) => {
    const saved = saveCastSpeech(character.id, next);
    if (saved) onUpdated?.(saved);
  };
  const addPronunciation = () => {
    if (!word.trim() || !sayAs.trim()) return;
    save({ ...speech, pronunciations: [...pronunciations, { word, sayAs }] });
    setWord('');
    setSayAs('');
  };
  const addPhrase = () => {
    if (!phrase.trim()) return;
    save({ ...speech, catchphrases: [...catchphrases, phrase] });
    setPhrase('');
  };
  const example = pronunciations.length
    ? `“${pronunciations[0]!.word} is here” is said as “${pronounceLine(`${pronunciations[0]!.word} is here`, pronunciations)}”.`
    : '';

  return (
    <ToolSection
      title="How they talk"
      description="Words the clip voice says wrong, spelled the way they sound — only what the voice reads changes, the line and captions keep the real spelling. Their own lines show as one tap beside a clip's line."
      data-testid="cast-speech-section"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium text-[var(--text-primary)]">Say it like</p>
          {pronunciations.map(item => (
            <div key={item.word} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-[var(--text-primary)]">{item.word}</span>
              <span className="text-[var(--text-muted)]">→</span>
              <span className="text-[var(--text-secondary)]">{item.sayAs}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  save({
                    ...speech,
                    pronunciations: pronunciations.filter(other => other.word !== item.word),
                  })
                }
              >
                Remove
              </Button>
            </div>
          ))}
          {pronunciations.length < CAST_PRONUNCIATIONS_MAX ? (
            <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <TextInput
                className="min-w-0"
                aria-label="Word"
                placeholder="Siobhan"
                value={word}
                onChange={event => setWord(event.target.value)}
              />
              <TextInput
                className="min-w-0"
                aria-label="Say it as"
                placeholder="Shiv-awn"
                value={sayAs}
                onChange={event => setSayAs(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') addPronunciation();
                }}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={!word.trim() || !sayAs.trim()}
                onClick={addPronunciation}
              >
                Add
              </Button>
            </div>
          ) : null}
          {example ? <p className="type-caption text-[var(--text-muted)]">{example}</p> : null}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-[var(--text-primary)]">Their lines</p>
          {catchphrases.map(item => (
            <div key={item} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-[var(--text-secondary)]">“{item}”</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  save({ ...speech, catchphrases: catchphrases.filter(other => other !== item) })
                }
              >
                Remove
              </Button>
            </div>
          ))}
          {catchphrases.length < CAST_CATCHPHRASES_MAX ? (
            <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <TextInput
                className="min-w-0"
                aria-label="A line they'd say"
                placeholder="Okay, but hear me out."
                value={phrase}
                onChange={event => setPhrase(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') addPhrase();
                }}
              />
              <Button size="sm" variant="secondary" disabled={!phrase.trim()} onClick={addPhrase}>
                Add
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </ToolSection>
  );
}
