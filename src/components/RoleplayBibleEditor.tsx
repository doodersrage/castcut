'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextArea, TextInput } from '@/components/ui/Field';
import { isRoleplayBioComplete, parseRoleplayBioFromText, type RoleplayBio } from '@/lib/roleplay';

export default function RoleplayBibleEditor({
  initial,
  characterName,
  disabled,
  accentClass,
  applyLabel = 'Use this bible',
  onApply,
}: {
  initial?: RoleplayBio | null;
  characterName?: string;
  disabled?: boolean;
  accentClass?: string;
  applyLabel?: string;
  onApply: (bio: RoleplayBio) => void;
}) {
  const [name, setName] = useState(initial?.name ?? characterName ?? '');
  const [look, setLook] = useState(initial?.look ?? '');
  const [personality, setPersonality] = useState(initial?.personality ?? '');
  const [catchphrase, setCatchphrase] = useState(initial?.catchphrase ?? '');
  const [paste, setPaste] = useState('');
  const [error, setError] = useState<string | null>(null);

  const applyFromFields = () => {
    const bio = parseRoleplayBioFromText(
      [
        `Name: ${name}`,
        `Look: ${look}`,
        `Personality: ${personality}`,
        catchphrase ? `Catchphrase: ${catchphrase}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      characterName
    );
    if (!bio || !isRoleplayBioComplete(bio)) {
      setError('Need a name, look, and personality.');
      return;
    }
    setError(null);
    onApply(bio);
  };

  const applyFromPaste = () => {
    const bio = parseRoleplayBioFromText(paste, name || characterName);
    if (!bio || !isRoleplayBioComplete(bio)) {
      setError(
        'Paste a bible with a name, look, and personality — labeled lines or three paragraphs.'
      );
      return;
    }
    setName(bio.name);
    setLook(bio.look);
    setPersonality(bio.personality);
    setCatchphrase(bio.catchphrase ?? '');
    setError(null);
    onApply(bio);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm sm:col-span-2">
          <span className="type-caption text-[var(--text-muted)]">Name</span>
          <TextInput
            name="roleplay-bible-name"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={name}
            disabled={disabled}
            maxLength={40}
            placeholder="Your character’s name"
            onChange={event => setName(event.target.value)}
            className={accentClass}
          />
        </label>
        <label className="block space-y-1.5 text-sm sm:col-span-2">
          <span className="type-caption text-[var(--text-muted)]">Look</span>
          <TextArea
            value={look}
            disabled={disabled}
            rows={2}
            placeholder="One visual sentence: body, clothes, colors, props"
            onChange={event => setLook(event.target.value)}
            className={accentClass}
          />
        </label>
        <label className="block space-y-1.5 text-sm sm:col-span-2">
          <span className="type-caption text-[var(--text-muted)]">Personality</span>
          <TextArea
            value={personality}
            disabled={disabled}
            rows={2}
            placeholder="How they talk and what they want"
            onChange={event => setPersonality(event.target.value)}
            className={accentClass}
          />
        </label>
        <label className="block space-y-1.5 text-sm sm:col-span-2">
          <span className="type-caption text-[var(--text-muted)]">Catchphrase (optional)</span>
          <TextInput
            value={catchphrase}
            disabled={disabled}
            maxLength={160}
            placeholder="A line they keep saying"
            onChange={event => setCatchphrase(event.target.value)}
            className={accentClass}
          />
        </label>
      </div>
      <Button type="button" variant="secondary" disabled={disabled} onClick={applyFromFields}>
        {applyLabel}
      </Button>
      <label className="block space-y-1.5 text-sm">
        <span className="type-caption text-[var(--text-muted)]">Or paste a bible</span>
        <TextArea
          value={paste}
          disabled={disabled}
          rows={4}
          placeholder={
            'Name: Mara Quill\nLook: ink-stained coat, satchel, gold-rim glasses\nPersonality: dry, loyal, always late\nCatchphrase: notes first'
          }
          onChange={event => setPaste(event.target.value)}
          className={accentClass}
        />
      </label>
      <Button
        type="button"
        variant="ghost"
        disabled={disabled || !paste.trim()}
        onClick={applyFromPaste}
      >
        Use pasted bible
      </Button>
      {error ? <p className="text-xs text-[var(--danger-text)]">{error}</p> : null}
    </div>
  );
}
