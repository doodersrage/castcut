/**
 * Play's tool settings: Story (roleplay), Outfit (fitting), Day and Look (moodboard) — their
 * shapes and defaults, added to the shared settings by declaration merging
 * (FeatureToolSettings in settings-cache.ts; docs/architecture-boundaries.md).
 */

export type RoleplayToolCache = {
  personaId?: string;
  customPersona?: string;
  characterName?: string;
  extraHints?: string;
  setting?: string;
  tone?: import('./roleplay').RoleplayTone;
  content?: import('./roleplay').RoleplayContentId;
  playAs?: import('./roleplay').RoleplayPlayAs;
  referenceImageUrl?: string;
  referenceImageFilename?: string;
  referenceOriginalUrl?: string;
  referenceOriginalFilename?: string;
  isolateSubject?: boolean;
  referenceIsolated?: boolean;
  /** The Cast this photo was set for: another Cast's photo is re-seeded, never queued. */
  referenceCharacterId?: string;
  bio?: import('./roleplay').RoleplayBio;
  story?: import('./roleplay').RoleplayStoryBeat[];
  /** Unpicked beat cards remembered across rolls for continuity. */
  rejectedScenes?: import('./roleplay').RoleplayScene[];
  autoQueue?: boolean;
  /** Still frames only, or still-then-clip / clip-to-clip film loop. Default clip. */
  beatOutput?: 'still' | 'clip';
  allowGore?: boolean;
  activeSessionId?: string;
  /** Filter catalog kits on Story (same strip as Day/Outfit). */
  wardrobeCategoryFilter?: import('./wardrobe-catalog-ui').WardrobeCategoryFilter;
  /** Locked outfit kit for Story stills (Image 2 packshot when no BYO). */
  wardrobeId?: string;
  /** Bring-your-own clothing packshot (Image 2) — overrides kit packshot when set. */
  customGarmentImageUrl?: string;
  customGarmentImageFilename?: string;
  /** Vision scan of the BYO clothing photo — text cue for Story stills. */
  customGarmentDescription?: string;
  /** Footwear worn with the outfit, in words ('' / unset = auto). See footwear.ts. */
  footwear?: string;
  /** Footwear packshot (a kit's, or your own photo) — rides in Image 2 with the clothing. */
  footwearImageUrl?: string;
  footwearImageFilename?: string;
  /** Adult roll mix: solo / duo / mixed (same chips as Day Intimate). */
  intimateMix?: import('./day-planner').DayIntimateMix;
};

/** Fitting Room — outfit try-on from a Cast plate + locked wardrobe kit. */
export type FittingToolCache = {
  /**
   * The try-ons in Compare (finished ones) and the one still rendering. Kept so a reload, or
   * opening Outfit on another device, still has the try-ons to choose between.
   */
  compareTryOns?: import('./fitting-room').FittingCompareTryOn[];
  pendingTryOn?: import('./fitting-room').FittingPendingTryOn;
  isolateSubject?: boolean;
  referenceIsolated?: boolean;
  /** The Cast the plate was applied for: a plate of another Cast is re-seeded, not tried on. */
  referenceCharacterId?: string;
  /**
   * The default engine Outfit last switched to (fittingDefaultEngineSwitch): it switches once per
   * best-installed engine, so the player's own pick stays until that changes.
   */
  defaultEngineApplied?: string;
  referenceImageUrl?: string;
  referenceImageFilename?: string;
  referenceOriginalUrl?: string;
  referenceOriginalFilename?: string;
  /** Optional freeform notes layered onto the outfit edit instruction. */
  notes?: string;
  /** Cast character that owns {@link notes}; reset when Cast changes (incl. remount). */
  notesCharacterId?: string;
  /** Filter full-catalog wardrobe kits by clothing type. */
  wardrobeCategoryFilter?: import('./wardrobe-catalog-ui').WardrobeCategoryFilter;
  /** Lazy draft try-on thumbs keyed by wardrobeId::lookId. */
  kitPreviews?: Record<string, import('./fitting-kit-previews').FittingKitPreview>;
  /** Auto-queue draft previews for the swipe deck when a plate is ready. */
  autoKitPreviews?: boolean;
  /** White cut-out plate used only for draft kit previews (sidecar; main ref unchanged). */
  previewPlateFilename?: string;
  previewPlateUrl?: string;
  previewPlateSourceKey?: string;
  /** Look→Outfit: await this Comfy still, then stamp it as the try-on plate. */
  pendingOutfitPlatePromptId?: string;
  /** Cast that queued {@link pendingOutfitPlatePromptId}. Completion must not stamp whoever is active. */
  pendingOutfitPlateCharacterId?: string;
  /**
   * User cleared the Outfit plate — do not auto-reseed from Cast, and let Look
   * Extract queue a fresh plate instead of reusing the old Cast look reference.
   */
  suppressAutoPlateSeed?: boolean;
  /** Bring-your-own clothing photo (Image 2) — overrides kit packshot when set. */
  customGarmentImageUrl?: string;
  customGarmentImageFilename?: string;
  /** Vision scan of the BYO clothing photo — text cue for try-on. */
  customGarmentDescription?: string;
  /** Footwear worn with the outfit, in words ('' / unset = auto). See footwear.ts. */
  footwear?: string;
  /** Footwear packshot (a kit's, or your own photo) — rides in Image 2 with the clothing. */
  footwearImageUrl?: string;
  footwearImageFilename?: string;
  /** Opt-in: score each landed try-on (face match vs plate + vision outfit read). */
  autoReviewTryOns?: boolean;
  /** Front and back: each try-on is followed by a back view of it (unset = on). */
  tryOnFrontBack?: boolean;
  /** Outfit → Pose → Custom: the joint editor's skeleton, sent as Image 3 (unset = as the plate). */
  tryOnPose?: import('./day-pose-guide').PhotoPose;
};

/** Day Planner — time-of-day slots with wardrobe + scene beats for one character. */
export type DayToolCache = {
  /** Other Casts' Days, parked when the Cast changed (day-cast-park). */
  parkedDays?: Record<string, import('./day-cast-park').ParkedDay>;
  slots?: import('./day-planner').DaySlot[];
  /** This Cast's run of Days: its idea and the last Day's beats, for Tomorrow (day-thread.ts). */
  dayThread?: import('./day-thread').DayThread;
  /** Slots that kept their own (hand-picked) outfit through Outfit's last hand-off. */
  outfitHandoffKept?: import('./day-outfit-scope').DayOutfitHandoffNotice;
  /** Stills on the Day board (2, 3, 4, 6 or 8); default four dayparts. */
  dayLength?: import('./day-planner').DayLength;
  /** Completed / in-flight stills for the day reel and Cut film. */
  stills?: import('./day-planner').DaySlotStill[];
  /** Cast character that owns {@link stills}; cleared when Cast changes. */
  stillsCharacterId?: string;
  notes?: string;
  /** Filter slot wardrobe kits by clothing type. */
  wardrobeCategoryFilter?: import('./wardrobe-catalog-ui').WardrobeCategoryFilter;
  /** Default on — isolate the Day plate on white before queueing stills. */
  isolateSubject?: boolean;
  /**
   * When true, Day may invent a second adult (friend / selfie companion) —
   * skips the hard solo lock and can diversify into duo beats.
   */
  allowCompanions?: boolean;
  /**
   * Opt-in: vision-review each landed Day still and requeue slots with broken faces, hands,
   * or outfit (bounded rerolls per slot). Needs a vision LLM; off by default.
   */
  autoReviewStills?: boolean;
  /**
   * Opt-in: when a still's pose check (DWPose vs its guide) says it missed, queue that slot once
   * more with the pose spelled out. Idle while Auto-review is on (it rerolls pose misses itself).
   */
  redoPoseMisses?: boolean;
  /**
   * Opt-in: a still whose pose guide draws a hard pose (lying, kneeling, floor, climbing,
   * bending) gets a second take with a new seed; the one whose pose reads closer is kept and the
   * other shown beside it (day-best-of-two.ts). Idle while Auto-review is on.
   */
  bestOfTwoHardPoses?: boolean;
  /**
   * Opt-in, off by default (not part of the Quality preset): each Intimate / Raunchy still is
   * queued twice back to back (same prompt, two seeds) and the player picks one; the other stays
   * as the alternate take (day-two-takes.ts). Such stills are never paired by pose score.
   */
  twoTakesIntimate?: boolean;
  /**
   * Opt-in: a one-person clothed still whose pose is clearly weak on the picked engine (pose
   * report card, src/lib/data/pose-engine-report.json) and solid on another installed engine
   * renders on that engine, this still only; the card says so (pose-engine-report.ts).
   */
  bestEnginePerPose?: boolean;
  /**
   * Default on. Loosens the identity lock and raises denoise when a beat needs a body the
   * standing plate cannot give, so Edit-2511 stops copying Image 1's stance. Turn off if faces
   * drift more than the posing is worth.
   */
  posePriority?: boolean;
  /**
   * Off by default. Face-break stills (upright Vacation / Suggestive beats) also get the full
   * plate as a mid-size ReferenceLatent: live the face got closer (0.56 → 0.46 distance) but
   * about 1 in 16 stills painted a second woman and 3 in 16 borrowed the plate's outfit cut —
   * pair with auto-review so those reroll.
   */
  identityBoost?: boolean;
  /**
   * Off by default. After each still lands (one or two people), re-render the lead's face against the Cast face
   * crop (face-finish.ts) with the best installed finisher: live, Qwen Edit 2511 + Lightning moved
   * 8/8 Rapid stills closer to the Cast (0.659 → 0.492).
   */
  faceFinish?: boolean;
  /** Everyday / suggestive / intimate heat for Day stills (intimate is NSFW-gated). */
  dayMood?: import('./day-planner').DayMoodSetting;
  /** Cast member who plays the second person on duo stills (unset: an invented stranger). */
  partnerCharacterId?: string;
  /** "Same stranger all day": the invented partner's rendered face (see day-partner-stand-in). */
  partnerStandIn?: import('./day-partner-stand-in').DayPartnerStandIn;
  /**
   * The face picture actually sent as the Cast partner on the last two-person still (the
   * uploaded crop), so the partner tile shows what the engine saw.
   */
  partnerSentFace?: { partnerId: string; filename: string; url: string };
  /** Weather / season on every setting (unset: whatever the setting says). */
  dayWeather?: import('./day-weather').DayWeather;
  /** Solo / duo / mixed beat filter when dayMood is intimate or raunchy. */
  intimateMix?: import('./day-planner').DayIntimateMix;
  /** True when {@link plateImageUrl} is the isolated cutout for {@link plateIsolateSourceKey}. */
  referenceIsolated?: boolean;
  /** Fingerprint of the source plate the isolate override was built from. */
  plateIsolateSourceKey?: string;
  /**
   * The Cast the isolated plate was built for. Without it a plate isolated before any still
   * existed had no owner, was dropped as stale on every Day load, and was isolated again.
   */
  plateCharacterId?: string;
  plateImageUrl?: string;
  plateImageFilename?: string;
  plateOriginalUrl?: string;
  plateOriginalFilename?: string;
  /** Bring-your-own clothing packshot (Image 2) — overrides catalog kit packshot when set. */
  customGarmentImageUrl?: string;
  customGarmentImageFilename?: string;
  /** Vision scan of the BYO clothing photo — text cue for Day stills. */
  customGarmentDescription?: string;
  /** Footwear worn with the outfit, in words ('' / unset = auto). See footwear.ts. */
  footwear?: string;
  /** Footwear packshot (a kit's, or your own photo) — rides in Image 2 with the clothing. */
  footwearImageUrl?: string;
  footwearImageFilename?: string;
  /**
   * When true, hide the sticky “Ready to cut” coach so it doesn’t cover the
   * board on scroll. Cut film stays available on the Day reel section.
   */
  hideStickyCutCoach?: boolean;
};

/** Moodboard → Scene — reference tiles merged into one scene prompt. */
export type MoodboardToolCache = {
  tiles?: import('./moodboard-scene').MoodboardTile[];
  templateId?: import('./moodboard-scene').MoodboardTemplateId;
  instruction?: string;
};

export const DEFAULT_ROLEPLAY_TOOL_CACHE: RoleplayToolCache = {
  // No default Part — a Cast lead without one is written from its own look, not an archetype.
  personaId: undefined,
  customPersona: '',
  characterName: '',
  extraHints: '',
  setting: '',
  tone: 'silly',
  content: 'pg13',
  playAs: 'text',
  isolateSubject: true,
  autoQueue: false,
  beatOutput: 'clip',
  intimateMix: 'mixed',
};

export const DEFAULT_FITTING_TOOL_CACHE: FittingToolCache = {
  isolateSubject: true,
  notes: '',
  notesCharacterId: undefined,
  autoKitPreviews: false,
  kitPreviews: {},
};

export const DEFAULT_DAY_TOOL_CACHE: DayToolCache = {
  slots: undefined,
  notes: '',
  isolateSubject: true,
  allowCompanions: false,
  dayMood: 'everyday',
  intimateMix: 'mixed',
  hideStickyCutCoach: false,
  // Quality preset "Balanced" (day-quality-preset.ts): with Day's Best queue profile
  // (SUGGESTED_TOOL_QUEUE_QUALITY_PROFILES). A switch the player set keeps its value.
  faceFinish: true,
  redoPoseMisses: true,
  bestEnginePerPose: true,
};

export const DEFAULT_MOODBOARD_TOOL_CACHE: MoodboardToolCache = {
  tiles: [],
  templateId: 'scene-blend',
  instruction: '',
};

declare module './settings-cache' {
  interface FeatureToolSettings {
    roleplay?: RoleplayToolCache;
    fitting?: FittingToolCache;
    day?: DayToolCache;
    moodboard?: MoodboardToolCache;
  }
}
