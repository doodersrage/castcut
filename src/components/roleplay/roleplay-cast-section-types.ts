import type { RoleplayBeatOutput } from '@/lib/roleplay-film';
import type {
  RoleplayBio,
  RoleplayContentId,
  RoleplayPlayAs,
  RoleplayStoryBeat,
  RoleplayStoryPhase,
  RoleplayTone,
} from '@/lib/roleplay';
import type { RoleplayToolCache } from '@/lib/settings-cache';

export type RoleplayCastApplyReferenceInput = {
  file?: File | null;
  imageUrl?: string;
  filename?: string;
  isolate?: boolean;
};

export type RoleplayCastSectionProps = {
  busy: boolean;
  bio: RoleplayBio | undefined;
  story: RoleplayStoryBeat[];
  storyPhase: RoleplayStoryPhase;
  personaId: string;
  playAs: RoleplayPlayAs;
  tone: RoleplayTone;
  content: RoleplayContentId;
  adultEnabled: boolean;
  autoQueue: boolean;
  beatOutput: RoleplayBeatOutput;
  photoReady: boolean;
  toolSettings: RoleplayToolCache;
  /** Active Cast character — Story continues this; empty gates creation. */
  activeCharacterId?: string | null;
  castCharacterName?: string | null;
  castHomeHref: string;
  filmHref: string;
  isolateSubject: boolean;
  hasReferenceImage: boolean;
  scanning: boolean;
  referenceUploading: boolean;
  isolateStatus: string | null;
  displayReferenceUrl: string;
  referenceOriginalFilename: string;
  referenceOriginalUrl: string;
  referenceImageFilename: string;
  referenceImageUrl: string;
  lastStill: { url: string; title: string } | null;
  onUpdateToolSettings: (partial: Partial<RoleplayToolCache>) => void;
  onClearReference: () => void;
  onApplyReference: (input: RoleplayCastApplyReferenceInput) => Promise<void>;
  onReferencePreviewUrlChange: (
    url: string | null | ((prev: string | null) => string | null)
  ) => void;
  onIsolateStatusChange: (status: string | null) => void;
  onError: (message: string) => void;
  onScanWithVision: () => void;
  onRestartStory: () => void;
};
