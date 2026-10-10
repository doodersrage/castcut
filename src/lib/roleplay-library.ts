import {
  normalizePhotoPose,
  normalizePoseCameraChoice,
  normalizePoseLookChoice,
  normalizeScenePoseSpec,
} from '@/lib/day-pose-guide';
import { normalizeSpokenLine, normalizeSpokenLineTone } from './ltx25-renderer';
import { readBrowserValue, writeBrowserValue } from './browser-storage';
import { getCharacter, type CharacterRecord } from './character-os';
import { castBibleLook } from './play-cast';
import { upsertCharacterFromRoleplaySession } from './play-cast';
import { withRoleplayLookPlateFromCast } from './fitting-room';
import { resolvePlayLoopEntryCharacterId } from './play-campaign';
import { loadToolSettings } from './settings-cache';
import { DEFAULT_ROLEPLAY_TOOL_CACHE, type RoleplayToolCache } from './play-settings';
import {
  CUSTOM_ROLEPLAY_PERSONA_ID,
  getRoleplayArchetype,
  isRoleplayBioComplete,
  lastRoleplayStillImage,
  MAX_ROLEPLAY_CLIP_TAKES,
  MAX_ROLEPLAY_REJECTED_SCENES,
  capRoleplayStoryBeats,
  normalizeRoleplayCharacterName,
  normalizeRoleplayContent,
  normalizeRoleplayIsolateSubject,
  normalizeRoleplayPlayAs,
  normalizeRoleplayTone,
  parseRoleplayAllowGore,
  parseRoleplayBio,
  parseRoleplayScenes,
  ROLEPLAY_INTRO_SCENE_ID,
  type RoleplayBio,
  type RoleplayStoryBeat,
} from './roleplay';
import { normalizeStillPromptCheck } from './still-prompt-audit';
import { guardStoryForSession } from './story-session-guard';
export const ROLEPLAY_LIBRARY_KEY = 'comfy-prompt-roleplay-library-v1';
export const ROLEPLAY_LIBRARY_UPDATED_EVENT = 'roleplay-library-updated';
export const MAX_ROLEPLAY_LIBRARY_SESSIONS = 24;

export type RoleplayLibrarySession = {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  coverImageUrl?: string;
  beatCount: number;
  snapshot: RoleplayToolCache;
};

function notifyRoleplayLibraryUpdated(): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return;
  }
  window.dispatchEvent(new Event(ROLEPLAY_LIBRARY_UPDATED_EVENT));
}

function readString(value: unknown, max = 240): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeStoryBeat(value: unknown): RoleplayStoryBeat | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const title = readString(record.title, 80);
  if (!title) {
    return null;
  }
  const blurb = readString(record.blurb, 400) || title;
  const id = readString(record.id, 80) || title;
  const at = typeof record.at === 'number' && Number.isFinite(record.at) ? record.at : Date.now();
  const beat: RoleplayStoryBeat = { id: id || title, title, blurb, at };
  if (record.kind === 'ending' || record.kind === 'plot') {
    beat.kind = record.kind;
  }
  if (typeof record.prompt === 'string' && record.prompt.trim()) {
    beat.prompt = record.prompt.trim().slice(0, 4000);
  }
  if (typeof record.promptId === 'string' && record.promptId.trim()) {
    beat.promptId = record.promptId.trim();
  }
  if (typeof record.imageUrl === 'string' && record.imageUrl.trim()) {
    beat.imageUrl = record.imageUrl.trim();
  }
  if (
    record.stillStatus === 'writing' ||
    record.stillStatus === 'queued' ||
    record.stillStatus === 'running' ||
    record.stillStatus === 'completed' ||
    record.stillStatus === 'error'
  ) {
    beat.stillStatus = record.stillStatus;
  }
  if (Array.isArray(record.stillTakes)) {
    beat.stillTakes = record.stillTakes
      .filter((take): take is NonNullable<RoleplayStoryBeat['stillTakes']>[number] =>
        Boolean(take && typeof take === 'object')
      )
      .slice(-8);
  }
  if (typeof record.stillTakeIndex === 'number' && Number.isInteger(record.stillTakeIndex)) {
    beat.stillTakeIndex = record.stillTakeIndex;
  }
  if (typeof record.clipPromptId === 'string' && record.clipPromptId.trim()) {
    beat.clipPromptId = record.clipPromptId.trim();
  }
  if (typeof record.clipUrl === 'string' && record.clipUrl.trim()) {
    beat.clipUrl = record.clipUrl.trim();
  }
  if (
    record.clipStatus === 'writing' ||
    record.clipStatus === 'queued' ||
    record.clipStatus === 'running' ||
    record.clipStatus === 'completed' ||
    record.clipStatus === 'error'
  ) {
    beat.clipStatus = record.clipStatus;
  }
  if (Array.isArray(record.clipTakes)) {
    beat.clipTakes = record.clipTakes
      .filter((take): take is NonNullable<RoleplayStoryBeat['clipTakes']>[number] =>
        Boolean(take && typeof take === 'object')
      )
      .slice(-MAX_ROLEPLAY_CLIP_TAKES);
  }
  if (typeof record.clipTakeIndex === 'number' && Number.isInteger(record.clipTakeIndex)) {
    beat.clipTakeIndex = record.clipTakeIndex;
  }
  const pose = normalizeScenePoseSpec(record.pose);
  if (pose) {
    beat.pose = pose;
  }
  if (typeof record.line === 'string' && record.line.trim()) {
    beat.line = normalizeSpokenLine(record.line);
  }
  if (record.lineFullFrame === true) beat.lineFullFrame = true;
  const lineTone = normalizeSpokenLineTone(record.lineTone);
  if (lineTone) beat.lineTone = lineTone;
  if (typeof record.clipRenderPromptId === 'string' && record.clipRenderPromptId.trim()) {
    beat.clipRenderPromptId = record.clipRenderPromptId.trim().slice(0, 160);
  }
  if (typeof record.extendJobId === 'string' && record.extendJobId.trim()) {
    beat.extendJobId = record.extendJobId.trim().slice(0, 80);
  }
  if (typeof record.replyLine === 'string' && record.replyLine.trim()) {
    beat.replyLine = normalizeSpokenLine(record.replyLine);
  }
  if (typeof record.suggestedLine === 'string' && record.suggestedLine.trim()) {
    beat.suggestedLine = normalizeSpokenLine(record.suggestedLine);
  }
  if (typeof record.poseLayout === 'string' && record.poseLayout.trim()) {
    beat.poseLayout = record.poseLayout.trim().slice(0, 40);
  }
  if (typeof record.poseVariant === 'number' && record.poseVariant > 0) {
    beat.poseVariant = Math.min(99, Math.floor(record.poseVariant));
  }
  const posePhoto = normalizePhotoPose(record.posePhoto);
  if (posePhoto) {
    beat.posePhoto = posePhoto;
  }
  const poseCamera = normalizePoseCameraChoice(record.poseCamera);
  if (poseCamera) {
    beat.poseCamera = poseCamera;
  }
  if (record.poseLead === 'left' || record.poseLead === 'right') {
    beat.poseLead = record.poseLead;
  }
  const poseLook = normalizePoseLookChoice(record.poseLook);
  if (poseLook) {
    beat.poseLook = poseLook;
  }
  // Without it a restored story would lose "write this scene's still again" on an edited scene.
  if (record.textEdited === true) {
    beat.textEdited = true;
  }
  if (record.stillWriteInterrupted === true) {
    beat.stillWriteInterrupted = true;
  }
  // A saved story used to come back without these: the next scene lost the continuity brief of
  // the one before it, and the pose / face checks and the picked take were forgotten.
  if (typeof record.stillBrief === 'string' && record.stillBrief.trim()) {
    beat.stillBrief = record.stillBrief.trim().slice(0, 600);
  }
  if (typeof record.poseGuideUrl === 'string' && record.poseGuideUrl.trim()) {
    beat.poseGuideUrl = record.poseGuideUrl.trim();
  }
  if (record.poseGuideExpect && typeof record.poseGuideExpect === 'object') {
    beat.poseGuideExpect = record.poseGuideExpect as RoleplayStoryBeat['poseGuideExpect'];
  }
  if (record.poseMatch && typeof record.poseMatch === 'object') {
    beat.poseMatch = record.poseMatch as RoleplayStoryBeat['poseMatch'];
  }
  if (record.faceMatch && typeof record.faceMatch === 'object') {
    beat.faceMatch = record.faceMatch as RoleplayStoryBeat['faceMatch'];
  }
  if (record.stillTakePinned === true) {
    beat.stillTakePinned = true;
  }
  if (record.stillTakeAutoPicked === true) {
    beat.stillTakeAutoPicked = true;
  }
  const promptCheck = normalizeStillPromptCheck(record.promptCheck);
  if (promptCheck) {
    beat.promptCheck = promptCheck;
  }
  const referenceNote = readString(record.referenceNote, 600);
  if (referenceNote) {
    beat.referenceNote = referenceNote;
  }
  const castId = readString(record.castId, 120);
  if (castId) {
    beat.castId = castId;
  }
  return beat;
}

function normalizeBio(value: unknown): RoleplayBio | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const name = readString(record.name, 80);
  const look = readString(record.look, 800) || readString(record.appearance, 800);
  const personality = readString(record.personality, 800) || readString(record.bio, 800);
  if (!name || !look || !personality) {
    return undefined;
  }
  return parseRoleplayBio(value);
}

export function roleplaySessionTitle(snapshot: RoleplayToolCache): string {
  const named = normalizeRoleplayCharacterName(snapshot.characterName);
  if (named) {
    return named;
  }
  const bioName = snapshot.bio?.name.trim();
  if (bioName) {
    return bioName;
  }
  if (snapshot.personaId === CUSTOM_ROLEPLAY_PERSONA_ID) {
    return snapshot.customPersona?.trim().slice(0, 40) || 'Custom roleplay';
  }
  return getRoleplayArchetype(snapshot.personaId)?.label ?? 'Untitled story';
}

export function roleplaySessionBeatCount(story: RoleplayStoryBeat[] | undefined): number {
  return (story ?? []).filter(beat => beat.id !== ROLEPLAY_INTRO_SCENE_ID).length;
}

export function roleplaySessionHasProgress(cache: RoleplayToolCache | undefined): boolean {
  if (!cache) {
    return false;
  }
  if (cache.bio?.name.trim() && cache.bio.look.trim()) {
    return true;
  }
  return (cache.story ?? []).some(beat => beat.title.trim());
}

export function normalizeRoleplayLibrarySnapshot(value: unknown): RoleplayToolCache | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const story = Array.isArray(record.story)
    ? capRoleplayStoryBeats(
        record.story
          .map(entry => normalizeStoryBeat(entry))
          .filter((entry): entry is RoleplayStoryBeat => Boolean(entry))
      )
    : [];
  const bio = normalizeBio(record.bio);
  const rejectedScenes = Array.isArray(record.rejectedScenes)
    ? parseRoleplayScenes(record.rejectedScenes).slice(-MAX_ROLEPLAY_REJECTED_SCENES)
    : [];
  return {
    personaId: readString(record.personaId, 80) || DEFAULT_ROLEPLAY_TOOL_CACHE.personaId,
    customPersona: readString(record.customPersona, 400) || undefined,
    characterName:
      normalizeRoleplayCharacterName(
        typeof record.characterName === 'string' ? record.characterName : undefined
      ) || undefined,
    extraHints: readString(record.extraHints, 800) || undefined,
    setting: readString(record.setting, 200) || undefined,
    tone: normalizeRoleplayTone(typeof record.tone === 'string' ? record.tone : undefined),
    content: normalizeRoleplayContent(
      typeof record.content === 'string' ? record.content : undefined
    ),
    playAs: normalizeRoleplayPlayAs(typeof record.playAs === 'string' ? record.playAs : undefined),
    referenceImageUrl: readString(record.referenceImageUrl, 2000) || undefined,
    referenceImageFilename: readString(record.referenceImageFilename, 240) || undefined,
    referenceOriginalUrl: readString(record.referenceOriginalUrl, 2000) || undefined,
    referenceOriginalFilename: readString(record.referenceOriginalFilename, 240) || undefined,
    isolateSubject: normalizeRoleplayIsolateSubject(record.isolateSubject),
    referenceIsolated: record.referenceIsolated === true,
    bio,
    story,
    ...(rejectedScenes.length > 0 ? { rejectedScenes } : {}),
    autoQueue: record.autoQueue !== false,
    allowGore: parseRoleplayAllowGore(record.allowGore),
    activeSessionId: readString(record.activeSessionId, 80) || undefined,
    wardrobeId: readString(record.wardrobeId, 120) || undefined,
    wardrobeCategoryFilter:
      typeof record.wardrobeCategoryFilter === 'string'
        ? (record.wardrobeCategoryFilter as RoleplayToolCache['wardrobeCategoryFilter'])
        : undefined,
    customGarmentImageUrl: readString(record.customGarmentImageUrl, 2000) || undefined,
    customGarmentImageFilename: readString(record.customGarmentImageFilename, 240) || undefined,
    customGarmentDescription: readString(record.customGarmentDescription, 800) || undefined,
  };
}

export function normalizeRoleplayLibrarySession(value: unknown): RoleplayLibrarySession | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const normalized = normalizeRoleplayLibrarySnapshot(record.snapshot ?? record);
  if (!normalized) {
    return null;
  }
  const id = readString(record.id, 80) || `roleplay-${crypto.randomUUID()}`;
  // A Cast's session never holds another Cast's scenes (story-session-guard.ts).
  const guarded = guardStoryForSession(normalized.story, id);
  const snapshot =
    guarded.story === normalized.story ? normalized : { ...normalized, story: guarded.story };
  if (!roleplaySessionHasProgress(snapshot)) {
    return null;
  }
  const createdAt =
    typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
      ? record.createdAt
      : Date.now();
  const updatedAt =
    typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : createdAt;
  const cover = lastRoleplayStillImage(snapshot.story)?.url;
  return {
    id,
    createdAt,
    updatedAt,
    title: readString(record.title, 80) || roleplaySessionTitle(snapshot),
    ...(cover ? { coverImageUrl: cover } : {}),
    beatCount: roleplaySessionBeatCount(snapshot.story),
    snapshot: { ...snapshot, activeSessionId: id },
  };
}

export function loadRoleplayLibrary(): RoleplayLibrarySession[] {
  const raw = readBrowserValue<unknown>(ROLEPLAY_LIBRARY_KEY) ?? [];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map(entry => normalizeRoleplayLibrarySession(entry))
    .filter((entry): entry is RoleplayLibrarySession => Boolean(entry))
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_ROLEPLAY_LIBRARY_SESSIONS);
}

export function saveRoleplayLibrary(sessions: RoleplayLibrarySession[]): void {
  writeBrowserValue(
    ROLEPLAY_LIBRARY_KEY,
    sessions
      .map(entry => normalizeRoleplayLibrarySession(entry))
      .filter((entry): entry is RoleplayLibrarySession => Boolean(entry))
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_ROLEPLAY_LIBRARY_SESSIONS)
  );
  notifyRoleplayLibraryUpdated();
}

export function snapshotRoleplaySession(
  cache: RoleplayToolCache,
  id?: string
): RoleplayLibrarySession | null {
  const snapshot = normalizeRoleplayLibrarySnapshot({
    ...cache,
    activeSessionId: id?.trim() || cache.activeSessionId,
  });
  if (!snapshot || !roleplaySessionHasProgress(snapshot)) {
    return null;
  }
  const sessionId = snapshot.activeSessionId?.trim() || `roleplay-${crypto.randomUUID()}`;
  const existing = loadRoleplayLibrary().find(entry => entry.id === sessionId);
  const now = Date.now();
  return normalizeRoleplayLibrarySession({
    id: sessionId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    title: roleplaySessionTitle(snapshot),
    snapshot: { ...snapshot, activeSessionId: sessionId },
  });
}

function sameStoryIgnoringTime(a: RoleplayLibrarySession, b: RoleplayLibrarySession): boolean {
  const strip = (session: RoleplayLibrarySession) =>
    JSON.stringify({ ...session, updatedAt: 0, snapshot: { ...session.snapshot } });
  return strip(a) === strip(b);
}

export function upsertRoleplayLibrarySession(
  session: RoleplayLibrarySession
): RoleplayLibrarySession {
  const normalized = normalizeRoleplayLibrarySession(session);
  if (!normalized) {
    return session;
  }
  // Unchanged but for the time: keep the stored copy. Story saved itself on every visit, and
  // stories now merge across devices by time — a fresh time on unchanged data would beat a real
  // edit made on another device.
  const library = loadRoleplayLibrary();
  const stored = library.find(entry => entry.id === normalized.id);
  if (stored && sameStoryIgnoringTime(stored, normalized)) {
    return stored;
  }
  const next = [normalized, ...library.filter(entry => entry.id !== normalized.id)].slice(
    0,
    MAX_ROLEPLAY_LIBRARY_SESSIONS
  );
  saveRoleplayLibrary(next);
  return normalized;
}

export function persistRoleplayLibraryFromCache(
  cache: RoleplayToolCache
): { session: RoleplayLibrarySession; cache: RoleplayToolCache } | null {
  const session = snapshotRoleplaySession(cache);
  if (!session) {
    return null;
  }
  const saved = upsertRoleplayLibrarySession(session);
  upsertCharacterFromRoleplaySession(saved);
  return {
    session: saved,
    cache: { ...cache, ...saved.snapshot, activeSessionId: saved.id },
  };
}

export function deleteRoleplayLibrarySession(id: string): void {
  const key = id.trim();
  if (!key) {
    return;
  }
  saveRoleplayLibrary(loadRoleplayLibrary().filter(entry => entry.id !== key));
}

export function getRoleplayLibrarySession(id: string): RoleplayLibrarySession | null {
  const key = id.trim();
  if (!key) {
    return null;
  }
  return loadRoleplayLibrary().find(entry => entry.id === key) ?? null;
}

export function applyRoleplayLibrarySession(session: RoleplayLibrarySession): RoleplayToolCache {
  const snapshot = normalizeRoleplayLibrarySnapshot(session.snapshot) ?? session.snapshot;
  return {
    ...DEFAULT_ROLEPLAY_TOOL_CACHE,
    ...snapshot,
    activeSessionId: session.id,
  };
}

export function startNewRoleplaySession(current: RoleplayToolCache): RoleplayToolCache {
  return {
    ...DEFAULT_ROLEPLAY_TOOL_CACHE,
    personaId: current.personaId,
    customPersona: current.customPersona,
    // Name lock is per draft — keep it blank so the writer can invent a new one.
    characterName: '',
    extraHints: current.extraHints,
    setting: current.setting,
    tone: current.tone,
    content: current.content,
    playAs: current.playAs,
    referenceImageUrl: current.referenceImageUrl,
    referenceImageFilename: current.referenceImageFilename,
    referenceOriginalUrl: current.referenceOriginalUrl,
    referenceOriginalFilename: current.referenceOriginalFilename,
    isolateSubject: current.isolateSubject,
    referenceIsolated: current.referenceIsolated,
    autoQueue: current.autoQueue,
    allowGore: current.allowGore,
    // Explicit clears — updateToolSettings shallow-merges, so omitted keys keep the old story.
    bio: undefined,
    story: [],
    rejectedScenes: [],
    activeSessionId: undefined,
  };
}

export type RoleplayContinueFromCast =
  | { ok: true; session: RoleplayLibrarySession; cache: RoleplayToolCache }
  | {
      ok: false;
      reason: 'not-roleplay-character' | 'session-missing';
      message: string;
    };

/** Stable Roleplay library session id for a Cast character id. */
export function roleplayLibraryIdForCharacter(characterId: string): string | null {
  const key = characterId.trim();
  if (!key) {
    return null;
  }
  if (key.startsWith('char-rp-')) {
    const sessionId = key.slice('char-rp-'.length).trim();
    return sessionId || null;
  }
  return `cast-${key}`;
}

/**
 * Story entry Cast: same as play-loop entry (query wins, else active Cast).
 */
export function resolveStoryEntryCharacterId(options: {
  queryCharacterId?: string | null;
  activeCharacterId?: string | null;
}): string | null {
  return resolvePlayLoopEntryCharacterId(options);
}

/** True when the live Story draft is not already the Cast-linked library session. */
export function shouldSyncRoleplaySessionToCharacter(
  characterId: string,
  activeSessionId?: string | null
): boolean {
  const expected = roleplayLibraryIdForCharacter(characterId);
  if (!expected) {
    return false;
  }
  return (activeSessionId?.trim() || '') !== expected;
}

/** Rebuild a Roleplay library session from Cast fields when the library entry aged out. */
export function synthesizeRoleplaySessionFromCharacter(
  characterId: string
): RoleplayLibrarySession | null {
  const key = characterId.trim();
  if (!key) {
    return null;
  }
  const sessionId = roleplayLibraryIdForCharacter(key);
  if (!sessionId) {
    return null;
  }
  const character = getCharacter(key);
  if (!character) {
    return null;
  }
  const name =
    character.characterName?.trim() || character.bio?.name?.trim() || character.name?.trim() || '';
  const look =
    castBibleLook(character) ||
    character.descriptor?.trim() ||
    character.looks?.[0]?.descriptor?.trim() ||
    'a character';
  if (!name) {
    return null;
  }
  const bio = {
    name,
    look,
    personality: character.bio?.personality?.trim() || 'to be discovered',
    ...(character.bio?.catchphrase?.trim()
      ? { catchphrase: character.bio.catchphrase.trim() }
      : {}),
  };
  const cache: RoleplayToolCache = {
    ...DEFAULT_ROLEPLAY_TOOL_CACHE,
    // Cast → Story should queue stills/clips; Play Make defaults autoQueue off elsewhere.
    autoQueue: true,
    activeSessionId: sessionId,
    characterName: name,
    bio,
    personaId: character.personaId || DEFAULT_ROLEPLAY_TOOL_CACHE.personaId,
    customPersona: character.customPersona,
    setting: character.setting,
    tone: character.tone ?? DEFAULT_ROLEPLAY_TOOL_CACHE.tone,
    content: character.content ?? DEFAULT_ROLEPLAY_TOOL_CACHE.content,
    playAs: character.playAs ?? DEFAULT_ROLEPLAY_TOOL_CACHE.playAs,
  };
  const withPlate = withRoleplayLookPlateFromCast(cache, character);
  const snapshot = normalizeRoleplayLibrarySnapshot(withPlate);
  if (!snapshot || !roleplaySessionHasProgress(snapshot)) {
    return null;
  }
  const now = Date.now();
  return normalizeRoleplayLibrarySession({
    id: sessionId,
    createdAt: character.updatedAt || now,
    updatedAt: now,
    title: roleplaySessionTitle(snapshot),
    snapshot: { ...snapshot, activeSessionId: sessionId },
  });
}

/** Overlay Cast bible / persona onto a Story cache so Cast remains the source of truth. */
export function withRoleplayCacheFromCastCharacter(
  cache: RoleplayToolCache,
  character: CharacterRecord | null | undefined
): RoleplayToolCache {
  if (!character) {
    return cache;
  }
  const next: RoleplayToolCache = { ...cache };
  if (character.bio && isRoleplayBioComplete(character.bio)) {
    const look = castBibleLook(character) ?? character.bio.look;
    next.bio = look === character.bio.look ? character.bio : { ...character.bio, look };
    next.characterName = character.bio.name;
  } else if (character.characterName?.trim() || character.name?.trim()) {
    next.characterName =
      character.characterName?.trim() || character.name.trim() || cache.characterName;
  }
  // The Part is the Cast's, not the Story tool's: a Cast without one clears the previous
  // Cast's Part instead of inheriting it.
  next.personaId = character.personaId?.trim() || undefined;
  if (character.customPersona?.trim()) {
    next.customPersona = character.customPersona.trim();
  } else if (character.personaId !== CUSTOM_ROLEPLAY_PERSONA_ID) {
    next.customPersona = undefined;
  }
  if (character.tone) {
    next.tone = character.tone;
  }
  if (character.content) {
    next.content = character.content;
  }
  if (character.setting?.trim()) {
    next.setting = character.setting.trim();
  }
  if (character.playAs) {
    next.playAs = character.playAs;
  }
  return next;
}

/** Keep the Cast-linked Story library session in sync after a Cast bible edit. */
export function syncRoleplayLibraryBioFromCharacter(character: CharacterRecord): void {
  const sessionId = roleplayLibraryIdForCharacter(character.id);
  if (!sessionId || !character.bio || !isRoleplayBioComplete(character.bio)) {
    return;
  }
  const existing = getRoleplayLibrarySession(sessionId);
  if (!existing) {
    return;
  }
  upsertRoleplayLibrarySession({
    ...existing,
    updatedAt: Date.now(),
    title: character.bio.name,
    snapshot: {
      ...existing.snapshot,
      bio: character.bio,
      characterName: character.bio.name,
      personaId: character.personaId ?? existing.snapshot.personaId,
      customPersona: character.customPersona ?? existing.snapshot.customPersona,
      activeSessionId: sessionId,
    },
  });
}

/** Clear bible on the Cast-linked Story library session after Cast Clear bible. */
export function clearRoleplayLibraryBioFromCharacter(character: CharacterRecord): void {
  const sessionId = roleplayLibraryIdForCharacter(character.id);
  if (!sessionId) {
    return;
  }
  const existing = getRoleplayLibrarySession(sessionId);
  if (!existing) {
    return;
  }
  upsertRoleplayLibrarySession({
    ...existing,
    updatedAt: Date.now(),
    snapshot: {
      ...existing.snapshot,
      bio: undefined,
    },
  });
}

/** Continue in Roleplay from any Cast character — synthesize from Cast when the library session is gone. */
export function resolveRoleplayContinueFromCharacter(
  characterId: string
): RoleplayContinueFromCast {
  const key = characterId.trim();
  if (!key) {
    return {
      ok: false,
      reason: 'not-roleplay-character',
      message: 'Pick a Cast character before continuing in Roleplay.',
    };
  }
  const character = getCharacter(key);
  if (!character) {
    return {
      ok: false,
      reason: 'session-missing',
      message:
        'That Cast character is not in this browser. Open Cast to pick another, or start Story fresh.',
    };
  }
  const sessionId = roleplayLibraryIdForCharacter(key);
  if (sessionId) {
    const session = getRoleplayLibrarySession(sessionId);
    if (session) {
      const cache = withRoleplayCacheFromCastCharacter(
        { ...applyRoleplayLibrarySession(session), autoQueue: true },
        character
      );
      return {
        ok: true,
        session,
        cache: withRoleplayLookPlateFromCast(cache, character),
      };
    }
  }
  const synthesized = synthesizeRoleplaySessionFromCharacter(key);
  if (synthesized) {
    const saved = upsertRoleplayLibrarySession(synthesized);
    const cache = withRoleplayCacheFromCastCharacter(
      { ...applyRoleplayLibrarySession(saved), autoQueue: true },
      character
    );
    return {
      ok: true,
      session: saved,
      cache: withRoleplayLookPlateFromCast(cache, character),
    };
  }
  return {
    ok: false,
    reason: 'session-missing',
    message:
      'Not enough Cast bio to continue in Story. Add a look or descriptor on Cast, or open Story and write a bio.',
  };
}

/** Library plus the live Roleplay draft so Cast sees a bio that has not flushed yet. */
export function roleplaySessionsForCharacterSync(): RoleplayLibrarySession[] {
  const library = loadRoleplayLibrary();
  const live = snapshotRoleplaySession(loadToolSettings('roleplay', DEFAULT_ROLEPLAY_TOOL_CACHE));
  if (!live) {
    return library;
  }
  return [live, ...library.filter(entry => entry.id !== live.id)];
}

/** Shelve the current session, then return a blank draft that will get a new library id. */
export function archiveAndStartNewRoleplaySession(current: RoleplayToolCache): {
  archived: RoleplayLibrarySession | null;
  next: RoleplayToolCache;
} {
  const archived = persistRoleplayLibraryFromCache(current)?.session ?? null;
  return { archived, next: startNewRoleplaySession(current) };
}
