'use client';

import {
  addCharacterLookPack,
  characterFromShared,
  getCharacter,
  lookPacksOf,
  upsertCharacter,
} from '@/lib/character-os';
import { getCharacterLookPack } from '@/lib/character-os';
import {
  copyPortableLookPackShareLink,
  downloadLookPackFile,
  parseLookPackFile,
  saveLookPack,
} from '@/lib/look-pack';
import { loadSettingsCache } from '@/lib/settings-cache';
import { Button } from '@/components/ui/Button';
import { ToolSection } from '@/components/ui/ToolPageShell';
import type { usePlayCampaignWizardOrchestration } from '@/hooks/usePlayCampaignWizardOrchestration';

type PlayCampaignShareLookPackSectionProps = Pick<
  ReturnType<typeof usePlayCampaignWizardOrchestration>,
  | 'lookPackFileRef'
  | 'character'
  | 'characterId'
  | 'activeLookPack'
  | 'effectiveLookPackId'
  | 'portableShareLink'
  | 'shareCopyStatus'
  | 'setShareCopyStatus'
  | 'setStatus'
  | 'persistCharacter'
  | 'replacePlay'
>;

export default function PlayCampaignShareLookPackSection({
  lookPackFileRef,
  character,
  characterId,
  activeLookPack,
  effectiveLookPackId,
  portableShareLink,
  shareCopyStatus,
  setShareCopyStatus,
  setStatus,
  persistCharacter,
  replacePlay,
}: PlayCampaignShareLookPackSectionProps) {
  return (
    <ToolSection
      title="Share look pack"
      description="Export JSON to another machine, or import a pack onto this Cast character (creates Cast when none is selected)."
    >
      <input
        ref={lookPackFileRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        data-testid="play-look-pack-import"
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) {
            return;
          }
          void parseLookPackFile(file).then(portable => {
            if (!portable) {
              setStatus('That file is not a Castcut look pack.');
              return;
            }
            if (!character) {
              const defaultName =
                portable.name?.trim() || portable.pack.characterId?.trim() || 'Imported look';
              const name =
                typeof window !== 'undefined'
                  ? window
                      .prompt('Name the new Cast character for this look pack', defaultName)
                      ?.trim() || defaultName
                  : defaultName;
              const createdList = upsertCharacter(
                characterFromShared(loadSettingsCache().shared, { name })
              );
              const record = createdList.at(-1) ?? getCharacter(createdList[0]?.id ?? '');
              if (!record) {
                saveLookPack(portable.pack);
                setStatus('Look pack staged — could not create a Cast character.');
                return;
              }
              const withPack = addCharacterLookPack(record.id, portable.name || 'Imported look', {
                ...portable.pack,
                characterId: record.id,
                source: 'saved',
              });
              const entry = withPack ? lookPacksOf(withPack)[0] : undefined;
              persistCharacter(record.id);
              saveLookPack({
                ...portable.pack,
                characterId: record.id,
                source: 'saved',
              });
              if (entry) {
                replacePlay(
                  `/play?character=${encodeURIComponent(record.id)}&lookPack=${encodeURIComponent(entry.id)}`
                );
              } else {
                replacePlay(`/play?character=${encodeURIComponent(record.id)}`);
              }
              setStatus(`Created Cast "${record.name}" and imported the look pack.`);
              return;
            }
            const saved = addCharacterLookPack(
              character.id,
              portable.name || 'Imported look',
              portable.pack
            );
            const entry = saved ? lookPacksOf(saved)[0] : undefined;
            saveLookPack({ ...portable.pack, characterId: character.id, source: 'saved' });
            if (entry) {
              replacePlay(
                `/play?character=${encodeURIComponent(character.id)}&lookPack=${encodeURIComponent(entry.id)}`
              );
            }
            setStatus(`Imported "${portable.name || 'look pack'}" onto ${character.name}.`);
          });
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={!activeLookPack}
          data-testid="play-look-pack-export"
          onClick={() => {
            if (!activeLookPack) {
              return;
            }
            const saved = effectiveLookPackId
              ? getCharacterLookPack(characterId, effectiveLookPackId)
              : undefined;
            downloadLookPackFile({
              pack: activeLookPack,
              name: saved?.name || character?.name || 'look-pack',
              id: saved?.id,
            });
            setStatus('Downloaded look pack JSON.');
          }}
        >
          Export JSON
        </Button>
        <Button size="sm" variant="secondary" onClick={() => lookPackFileRef.current?.click()}>
          Import JSON
        </Button>
        {activeLookPack && portableShareLink ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={portableShareLink.tooLarge}
              data-testid="play-campaign-share-copy"
              onClick={() => {
                void copyPortableLookPackShareLink({
                  pack: activeLookPack,
                  name: character?.name,
                  id: effectiveLookPackId || undefined,
                }).then(result => {
                  if (result.tooLarge) {
                    setShareCopyStatus('Pack too large for a URL — use Export JSON instead.');
                    return;
                  }
                  setShareCopyStatus(
                    result.ok ? 'Share link copied.' : (result.error ?? 'Could not copy link.')
                  );
                });
              }}
            >
              Copy share link
            </Button>
            {portableShareLink.tooLarge ? (
              <p
                className="type-caption w-full text-[var(--text-muted)]"
                data-testid="play-campaign-share-too-large"
              >
                Pack too large for a URL ({portableShareLink.tokenChars} chars) — use Export JSON.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
      {shareCopyStatus ? (
        <p className="type-caption mt-2 text-[var(--text-muted)]">{shareCopyStatus}</p>
      ) : null}
    </ToolSection>
  );
}
