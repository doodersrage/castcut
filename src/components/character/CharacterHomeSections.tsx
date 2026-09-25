'use client';

import CharacterFilmStudio from '@/components/CharacterFilmStudio';
import CharacterLoraFlywheel from '@/components/CharacterLoraFlywheel';
import PlaySoftAdvanceBanner from '@/components/PlaySoftAdvanceBanner';
import { ButtonLink } from '@/components/ui/Button';
import { FieldError } from '@/components/ui/Field';
import { SegmentedControl, ToolBadge, ToolLayout } from '@/components/ui/ToolPageShell';
import { ToolPageSkeleton } from '@/components/ui/ViewState';
import CastStatusStrip from '@/components/character/CastStatusStrip';
import CharacterBibleSection from '@/components/character/CharacterBibleSection';
import CharacterHomeActionRow from '@/components/character/CharacterHomeActionRow';
import CharacterLookPacksSection from '@/components/character/CharacterLookPacksSection';
import CharacterLookPlateSection from '@/components/character/CharacterLookPlateSection';
import CharacterLooksSection from '@/components/character/CharacterLooksSection';
import CharacterMediaSection from '@/components/character/CharacterMediaSection';
import CharacterPersonaSection from '@/components/character/CharacterPersonaSection';
import type { useCharacterHomeOrchestration } from '@/hooks/useCharacterHomeOrchestration';

type CharacterHomeViewModel = ReturnType<typeof useCharacterHomeOrchestration>;

export default function CharacterHomeSections(props: CharacterHomeViewModel) {
  const { character } = props;

  if (!props.hydrated) {
    return <ToolPageSkeleton label="Loading character" />;
  }

  if (!character) {
    return (
      <ToolLayout
        accent="sky"
        badge={<ToolBadge accent="sky">Cast</ToolBadge>}
        title="Character not found"
        description="That record is not in this browser’s Character OS store."
      >
        <ButtonLink href="/characters" size="sm" variant="secondary">
          Back to cast
        </ButtonLink>
      </ToolLayout>
    );
  }

  return (
    <ToolLayout
      accent="sky"
      width="wide"
      badge={<ToolBadge accent="sky">Cast</ToolBadge>}
      title={character.name}
      description={
        character.descriptor?.trim() ||
        'Looks, stills, clips, the film cut, and the LoRA flywheel for this character.'
      }
    >
      <CastStatusStrip
        statusLine={props.castStatus.statusLine}
        plateHint={props.castStatus.plateHint}
        plateStatus={props.plateStatus}
        plateError={props.castStatus.plateError}
      />
      <PlaySoftAdvanceBanner
        key={props.softAdvance?.nonce ?? 'idle'}
        target={props.softAdvance}
        onCancel={props.cancelSoftAdvance}
      />
      <CharacterHomeActionRow
        character={character}
        go={props.go}
        playCampaignHref={props.playCampaignHref}
        removeFromCast={props.removeFromCast}
        continueRoleplay={props.continueRoleplay}
      />
      {props.continueError ? <FieldError>{props.continueError}</FieldError> : null}
      <SegmentedControl
        aria-label="Character sections"
        value={props.homeTab}
        onChange={props.setHomeTab}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'bible', label: 'Bible' },
          {
            value: 'film',
            label:
              props.filmEntries.length > 0
                ? `Film & media · ${props.filmEntries.length}`
                : 'Film & media',
          },
          { value: 'more', label: 'Packs & LoRA' },
        ]}
      />
      {props.homeTab === 'overview' ? (
        <>
          <CharacterLookPlateSection
            characterId={character.id}
            plate={props.lookPlate}
            uploading={props.plateUploading}
            status={props.plateStatus}
            error={props.plateError}
            onClear={props.clearLookPlate}
            onUpload={file => {
              void props.applyLookPlate({ file });
            }}
          />
          <CharacterLooksSection
            character={character}
            looks={props.looks}
            lookName={props.lookName}
            setLookName={props.setLookName}
            persistApply={props.persistApply}
            activateLook={props.activateLook}
            removeLook={props.removeLook}
            addLookFromShared={props.addLookFromShared}
            loadSettingsCache={props.loadSettingsCache}
          />
        </>
      ) : null}
      {props.homeTab === 'bible' ? (
        <>
          <CharacterPersonaSection character={character} onUpdated={props.persistApply} />
          <CharacterBibleSection character={character} onUpdated={props.persistApply} />
        </>
      ) : null}
      {props.homeTab === 'film' ? (
        <>
          <CharacterFilmStudio
            characterId={character.id}
            characterName={character.name}
            lookId={character.activeLookId}
            filmCut={character.filmCut}
            entries={props.entries}
          />
          <CharacterMediaSection
            character={character}
            mediaTab={props.mediaTab}
            setMediaTab={props.setMediaTab}
            entries={props.entries}
            stillEntries={props.stillEntries}
            clipEntries={props.clipEntries}
            filmEntries={props.filmEntries}
            keepers={props.keepers}
            visible={props.visible}
            lastClip={props.lastClip}
            currentLook={props.currentLook}
            continueError={props.continueError}
            go={props.go}
            extendReel={props.extendReel}
            continueRoleplay={props.continueRoleplay}
            animateStill={props.animateStill}
            toggleKeeper={props.toggleKeeper}
            removeFromCharacter={props.removeFromCharacter}
            continueClipActionLabel={props.continueClipActionLabel}
            loadEngineSettings={props.loadEngineSettings}
            galleryEntryPrimaryViewUrl={props.galleryEntryPrimaryViewUrl}
          />
        </>
      ) : null}
      {props.homeTab === 'more' ? (
        <>
          <CharacterLookPacksSection
            character={character}
            savedLookPacks={props.savedLookPacks}
            lookPackFileRef={props.lookPackFileRef}
            lookPackStatus={props.lookPackStatus}
            importLookPack={props.importLookPack}
            playCampaignHref={props.playCampaignHref}
            go={props.go}
            saveLookPack={props.saveLookPack}
            lookPackFittingHref={props.lookPackFittingHref}
            lookPackDayHref={props.lookPackDayHref}
            downloadLookPackFile={props.downloadLookPackFile}
            removeCharacterLookPack={props.removeCharacterLookPack}
          />
          {props.currentLook ? (
            <CharacterLoraFlywheel
              character={character}
              look={props.currentLook}
              keepers={props.keepers}
              onApplied={props.persistApply}
            />
          ) : null}
        </>
      ) : null}
    </ToolLayout>
  );
}
