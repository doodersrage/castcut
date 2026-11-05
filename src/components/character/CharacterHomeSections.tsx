'use client';

import { storyboardHtml } from '@/lib/print/print-sheets';
import { openPrintSheet } from '@/lib/print/print-sheets-client';
import { lookPlateDrifted } from '@/lib/character/look-plate-guard';
import CastVoiceSection from '@/components/character/CastVoiceSection';
import CastLikenessSection from '@/components/character/CastLikenessSection';
import CastMarksSection from '@/components/character/CastMarksSection';
import CastPlacesSection from '@/components/character/CastPlacesSection';
import CastPropsSection from '@/components/character/CastPropsSection';
import CastReferenceSheetSection from '@/components/character/CastReferenceSheetSection';
import CastRelationshipsSection from '@/components/character/CastRelationshipsSection';
import CastSpeechSection from '@/components/character/CastSpeechSection';
import CastWardrobeSection from '@/components/character/CastWardrobeSection';
import CharacterFilmStudio from '@/components/CharacterFilmStudio';
import CharacterLoraFlywheel from '@/components/CharacterLoraFlywheel';
import PlaySoftAdvanceBanner from '@/components/PlaySoftAdvanceBanner';
import { Button, ButtonLink } from '@/components/ui/Button';
import { FieldError } from '@/components/ui/Field';
import { SegmentedControl, ToolLayout } from '@/components/ui/ToolPageShell';
import { ToolPageSkeleton } from '@/components/ui/ViewState';
import CastChecklist from '@/components/character/CastChecklist';
import CastProfileHeader from '@/components/character/CastProfileHeader';
import CastFilmsShowcase from '@/components/character/CastFilmsShowcase';
import { castPlateThumbUrl } from '@/lib/character/plate-thumb';
import { castAccent } from '@/lib/cast/speech';
import type { CharacterRecord } from '@/lib/character/os';
import CastStatusStrip from '@/components/character/CastStatusStrip';
import CharacterAppearanceSection from '@/components/character/CharacterAppearanceSection';
import CharacterBibleSection from '@/components/character/CharacterBibleSection';
import CharacterHomeActionRow from '@/components/character/CharacterHomeActionRow';
import CharacterLookPacksSection from '@/components/character/CharacterLookPacksSection';
import CharacterLookPlateSection from '@/components/character/CharacterLookPlateSection';
import { activeLook, looksOf } from '@/lib/character/os';
import CastSeasonsSection from '@/components/character/CastSeasonsSection';
import CharacterMediaSection from '@/components/character/CharacterMediaSection';
import CharacterPersonaSection from '@/components/character/CharacterPersonaSection';
import type { useCharacterHomeOrchestration } from '@/hooks/useCharacterHomeOrchestration';

type CharacterHomeViewModel = ReturnType<typeof useCharacterHomeOrchestration>;

export default function CharacterHomeSections(props: CharacterHomeViewModel) {
  const { character } = props;

  const jumpTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Their voice, in the header: open the Bible tab at the Voice section.
  const openVoice = () => {
    props.setHomeTab('bible');
    window.setTimeout(() => {
      document
        .querySelector('[data-testid="cast-voice-section"]')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  };

  if (!props.hydrated) {
    return <ToolPageSkeleton label="Loading character" />;
  }

  if (!character) {
    return (
      <ToolLayout
        accent="sky"
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
      width="full"
      title={character.name}
      description={
        character.descriptor?.trim() ||
        'Looks, stills, clips, the film cut, and the LoRA flywheel for this character.'
      }
    >
      {/* Who they are, their looks, voice, what's next and where to take them — one header. The
          facts line and the missing plate are said there (the frame is Add a plate). */}
      <CastProfileHeader
        name={character.name}
        plateUrl={props.lookPlate?.imageUrl ? castPlateThumbUrl(character) : null}
        facts={props.castStatus.statusLine}
        looks={props.plateTiles}
        activeLookId={character.activeLookId}
        onSelectLook={props.selectPlate}
        voice={castVoiceLine(character)}
        onVoice={openVoice}
        onAddPlate={file => {
          void props.applyLookPlate({ file });
        }}
        busy={props.plateUploading}
        checklist={
          props.checklist ? (
            <CastChecklist
              compact
              checklist={props.checklist}
              onTab={props.setHomeTab}
              go={props.go}
            />
          ) : null
        }
        actions={
          <>
            <CharacterHomeActionRow
              character={character}
              go={props.go}
              playCampaignHref={props.playCampaignHref}
              removeFromCast={props.removeFromCast}
              continueRoleplay={props.continueRoleplay}
            />
            <Button
              size="sm"
              variant="ghost"
              data-testid="cast-character-sheet"
              title="Every look's plate and outfit, the voice and the description on one page — print or save as PDF"
              onClick={() =>
                openPrintSheet(
                  storyboardHtml({
                    title: `${character.name} — character sheet`,
                    subtitle: [
                      props.castStatus.statusLine,
                      castVoiceLine(character) ?? 'no voice yet',
                    ]
                      .filter(Boolean)
                      .join(' · '),
                    shape: 'vertical',
                    origin: window.location.origin,
                    frames: props.plateTiles.map((tile, index) => {
                      const look = looksOf(character).find(entry => entry.id === tile.id);
                      return {
                        number: String(index + 1),
                        image: tile.thumb,
                        heading: tile.label,
                        notes: [
                          ['Wearing', tile.outfit],
                          ['Looks like', look?.descriptor ?? character.descriptor],
                        ],
                      };
                    }),
                  })
                )
              }
            >
              Character sheet
            </Button>
          </>
        }
      />
      <CastStatusStrip plateStatus={props.plateStatus} plateError={props.castStatus.plateError} />
      <PlaySoftAdvanceBanner
        key={props.softAdvance?.nonce ?? 'idle'}
        target={props.softAdvance}
        onCancel={props.cancelSoftAdvance}
      />
      {props.continueError ? <FieldError>{props.continueError}</FieldError> : null}
      {/* Kept in reach under the app header on a long tab. */}
      <div className="ui-sticky-surface sticky top-16 z-10 w-fit max-w-full rounded-[var(--radius-md)]">
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
      </div>
      {props.homeTab === 'overview' ? (
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
          onPreparePlate={(sendComfyUi, options) => {
            void props.prepareLookPlate(sendComfyUi, options);
          }}
          canUndoPrepare={props.canUndoPlatePrepare}
          onUndoPrepare={() => {
            void props.undoLookPlatePrepare();
          }}
          stance={props.plateStance}
          noun={props.plateSubjectNoun}
          faceDrift={props.plateFaceDrift}
          hasMarks={Boolean(character.marks?.length)}
          plates={props.plateTiles}
          activePlateId={character.activeLookId}
          onSelectPlate={props.selectPlate}
          onNewLook={() => {
            void props.newLookFromCurrent();
          }}
          onRemovePlate={props.removeActivePlate}
          onRenamePlate={props.renameActivePlate}
          plateHistory={activeLook(character).plateHistory}
          plateDrift={
            lookPlateDrifted(activeLook(character)) && activeLook(character).plateCheck
              ? {
                  face: activeLook(character).plateCheck!.face ?? 0,
                  against: activeLook(character).plateCheck!.against,
                  noFace: activeLook(character).plateCheck!.noFace,
                }
              : null
          }
          onRestorePlate={props.restoreActivePlate}
          onDeprecatePlate={props.deprecateActivePlate}
        />
      ) : null}
      {props.homeTab === 'overview' ? (
        <CastReferenceSheetSection
          character={character}
          noun={props.plateSubjectNoun}
          onUpdated={props.persistApply}
        />
      ) : null}
      {props.homeTab === 'overview' ? (
        <CastWardrobeSection
          character={character}
          entries={props.entries}
          onUpdated={props.persistApply}
        />
      ) : null}
      {props.homeTab === 'overview' ? (
        <CastLikenessSection
          character={character}
          entries={props.entries}
          onRemakePlate={lookId => {
            props.selectPlate(lookId);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      ) : null}
      {props.homeTab === 'bible' ? (
        <>
          {/* Nine sections on one tab: a row to jump to each (2026-11-05). */}
          <nav
            aria-label="Bible sections"
            className="flex flex-wrap gap-1.5"
            data-testid="cast-bible-jump"
          >
            <Button
              size="sm"
              variant="chip"
              onClick={() => jumpTo('cast-bible-appearance')}
              data-testid="cast-bible-jump-appearance"
            >
              Appearance
            </Button>
            <Button
              size="sm"
              variant="chip"
              onClick={() => jumpTo('cast-bible-marks')}
              data-testid="cast-bible-jump-marks"
            >
              Marks
            </Button>
            <Button
              size="sm"
              variant="chip"
              onClick={() => jumpTo('cast-bible-places')}
              data-testid="cast-bible-jump-places"
            >
              Places
            </Button>
            <Button
              size="sm"
              variant="chip"
              onClick={() => jumpTo('cast-bible-props')}
              data-testid="cast-bible-jump-props"
            >
              Props
            </Button>
            <Button
              size="sm"
              variant="chip"
              onClick={() => jumpTo('cast-bible-voice')}
              data-testid="cast-bible-jump-voice"
            >
              Voice
            </Button>
            <Button
              size="sm"
              variant="chip"
              onClick={() => jumpTo('cast-bible-speech')}
              data-testid="cast-bible-jump-speech"
            >
              How they talk
            </Button>
            <Button
              size="sm"
              variant="chip"
              onClick={() => jumpTo('cast-bible-relationships')}
              data-testid="cast-bible-jump-relationships"
            >
              People
            </Button>
            <Button
              size="sm"
              variant="chip"
              onClick={() => jumpTo('cast-bible-persona')}
              data-testid="cast-bible-jump-persona"
            >
              Part
            </Button>
            <Button
              size="sm"
              variant="chip"
              onClick={() => jumpTo('cast-bible-bible')}
              data-testid="cast-bible-jump-bible"
            >
              Character bible
            </Button>
          </nav>
          <div id="cast-bible-appearance" className="scroll-mt-32">
            <CharacterAppearanceSection character={character} onUpdated={props.persistApply} />
          </div>
          <div id="cast-bible-marks" className="scroll-mt-32">
            <CastMarksSection character={character} onUpdated={props.persistApply} />
          </div>
          <div id="cast-bible-places" className="scroll-mt-32">
            <CastPlacesSection character={character} onUpdated={props.persistApply} />
          </div>
          <div id="cast-bible-props" className="scroll-mt-32">
            <CastPropsSection character={character} onUpdated={props.persistApply} />
          </div>
          <div id="cast-bible-voice" className="scroll-mt-32">
            <CastVoiceSection character={character} onUpdated={props.persistApply} />
          </div>
          <div id="cast-bible-speech" className="scroll-mt-32">
            <CastSpeechSection character={character} onUpdated={props.persistApply} />
          </div>
          <div id="cast-bible-relationships" className="scroll-mt-32">
            <CastRelationshipsSection character={character} onUpdated={props.persistApply} />
          </div>
          <div id="cast-bible-persona" className="scroll-mt-32">
            <CharacterPersonaSection character={character} onUpdated={props.persistApply} />
          </div>
          <div id="cast-bible-bible" className="scroll-mt-32">
            <CharacterBibleSection character={character} onUpdated={props.persistApply} />
          </div>
        </>
      ) : null}
      {props.homeTab === 'film' ? (
        <>
          <CastFilmsShowcase films={props.filmEntries} />
          <CharacterFilmStudio
            characterId={character.id}
            characterName={character.name}
            lookId={character.activeLookId}
            filmCut={character.filmCut}
            entries={props.entries}
          />
          <CastSeasonsSection characterId={character.id} />
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
            preferKeeper={props.preferKeeper}
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

/** "Voice set · Scottish accent", or what there is of it; null with neither. */
function castVoiceLine(character: CharacterRecord): string | null {
  const accent = castAccent(character.id);
  if (character.voice?.sample) return accent ? `Voice set · ${accent} accent` : 'Voice set';
  return accent ? `${accent} accent · no voice sample yet` : null;
}
