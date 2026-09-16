'use client';

import CharacterFilmStudio from '@/components/CharacterFilmStudio';
import CharacterLoraFlywheel from '@/components/CharacterLoraFlywheel';
import { ButtonLink } from '@/components/ui/Button';
import { FieldError } from '@/components/ui/Field';
import { ToolBadge, ToolLayout } from '@/components/ui/ToolPageShell';
import CharacterHomeActionRow from '@/components/character/CharacterHomeActionRow';
import CharacterLookPacksSection from '@/components/character/CharacterLookPacksSection';
import CharacterLookPlateSection from '@/components/character/CharacterLookPlateSection';
import CharacterLooksSection from '@/components/character/CharacterLooksSection';
import CharacterMediaSection from '@/components/character/CharacterMediaSection';
import type { useCharacterHomeOrchestration } from '@/hooks/useCharacterHomeOrchestration';

type CharacterHomeViewModel = ReturnType<typeof useCharacterHomeOrchestration>;

export default function CharacterHomeSections(props: CharacterHomeViewModel) {
  const { character } = props;

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
      <CharacterHomeActionRow
        character={character}
        go={props.go}
        playCampaignHref={props.playCampaignHref}
        removeFromCast={props.removeFromCast}
        continueRoleplay={props.continueRoleplay}
      />
      {props.continueError ? <FieldError>{props.continueError}</FieldError> : null}
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
      {props.currentLook ? (
        <CharacterLoraFlywheel
          character={character}
          look={props.currentLook}
          keepers={props.keepers}
          onApplied={props.persistApply}
        />
      ) : null}
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
    </ToolLayout>
  );
}
