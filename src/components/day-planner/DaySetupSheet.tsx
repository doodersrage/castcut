'use client';

import CharacterOsPicker from '@/components/shared-tool-controls/CharacterOsPicker';
import DayPlateSection from '@/components/day-planner/DayPlateSection';
import SideSheet from '@/components/ui/SideSheet';
import type { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';
import { followCastOutfitInSessions } from '@/lib/cast/plate-switch';

type DayEngineView = ReturnType<typeof useDayPlannerToolOrchestration>;

/** What Setup reads from Day's engine. */
export type DaySetupSheetVm = Pick<
  DayEngineView,
  | 'character'
  | 'hasPlate'
  | 'shared'
  | 'updateShared'
  | 'setError'
  | 'plate'
  | 'platePreviewUrl'
  | 'activeSlot'
  | 'busy'
  | 'isolateSubject'
  | 'isolateBusy'
  | 'isolateStatus'
  | 'isolatePending'
  | 'setIsolateSubject'
  | 'uploadCastPlate'
  | 'makeCastPlate'
  | 'makePlateStatus'
  | 'plateUploading'
  | 'plateUploadError'
>;

/**
 * Setup behind the status chip beside the title: the Cast lead and the plate that carries their
 * identity. Day and Scene share it.
 */
export default function DaySetupSheet({
  vm,
  open,
  onClose,
}: {
  vm: DaySetupSheetVm;
  open: boolean;
  onClose: () => void;
}) {
  const {
    character,
    hasPlate,
    shared,
    updateShared,
    setError,
    plate,
    platePreviewUrl,
    activeSlot,
    busy,
    isolateSubject,
    isolateBusy,
    isolateStatus,
    isolatePending,
    setIsolateSubject,
    uploadCastPlate,
    makeCastPlate,
    makePlateStatus,
    plateUploading,
    plateUploadError,
  } = vm;
  return (
    <SideSheet
      open={open}
      onClose={onClose}
      title="Setup"
      description={
        hasPlate
          ? `${character?.name?.trim() || 'Cast'} · plate ready`
          : 'Character and plate for identity.'
      }
      testId="day-setup-sheet"
    >
      <div data-testid="day-character" className="day-character-section space-y-4">
        <CharacterOsPicker
          onCastChange={followCastOutfitInSessions}
          shared={shared}
          hints={character?.hints}
          onApply={patch => {
            try {
              updateShared(patch);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not apply that character.');
            }
          }}
        />
        <DayPlateSection
          plate={plate}
          platePreviewUrl={platePreviewUrl}
          characterId={shared.activeCharacterId}
          lookId={activeSlot.lookId}
          lockedWardrobeId={activeSlot.wardrobeId || shared.lockedWardrobeId}
          busy={busy}
          isolateSubject={isolateSubject}
          isolateBusy={isolateBusy}
          isolateStatus={isolateStatus}
          isolatePending={isolatePending}
          onIsolateSubjectChange={setIsolateSubject}
          onUploadPlate={file => void uploadCastPlate(file)}
          onMakePlate={() => void makeCastPlate()}
          makePlateStatus={makePlateStatus}
          uploading={plateUploading}
          uploadError={plateUploadError}
        />
      </div>
    </SideSheet>
  );
}
