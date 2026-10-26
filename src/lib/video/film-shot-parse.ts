/**
 * The shots of a film encode request (/api/film/assemble), read from untrusted JSON: every field
 * the server encode uses (video-server-encode.ts), each checked. M4 F5 found this list short — a
 * server encode dropped Cut's speed, reverse, J / L sound, lower thirds, picture-in-picture and
 * hand-set moves, so the film didn't match the edit. Pure.
 */
import type { FilmPlaylistShot } from '../media/kind';
import { normalizeCutFraming } from './cut-move';
import { cleanLowerThird, normalizeOverlayCorner } from './cut-overlay';
import { normalizeCutTransition } from './cut-timeline';

const TEXT_MAX = 300;

function positiveSec(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : undefined;
}

function clampNumber(raw: unknown, min: number, max: number): number | undefined {
  return typeof raw === 'number' && Number.isFinite(raw)
    ? Math.min(max, Math.max(min, raw))
    : undefined;
}

const text = (raw: unknown, max = TEXT_MAX) =>
  typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, max) : '';

export function parseFilmPlaylistShots(raw: unknown): FilmPlaylistShot[] {
  if (!Array.isArray(raw)) return [];
  const shots: FilmPlaylistShot[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const url = typeof record.url === 'string' ? record.url.trim() : '';
    const title = typeof record.title === 'string' ? record.title.trim() : 'shot';
    const kind = record.kind === 'still' ? 'still' : record.kind === 'clip' ? 'clip' : null;
    if (!url || !kind) continue;
    const clip = kind === 'clip';
    const holdSec =
      typeof record.holdSec === 'number' && Number.isFinite(record.holdSec)
        ? record.holdSec
        : undefined;
    const entryId = typeof record.entryId === 'string' ? record.entryId.trim() : undefined;
    // Edited in the Cut shot list — dropping it burned the shot title instead.
    const caption = typeof record.caption === 'string' ? record.caption.trim() : '';
    const trimStartSec = positiveSec(record.trimStartSec);
    const trimEndSec = positiveSec(record.trimEndSec);
    const speed = clampNumber(record.speed, 0.25, 4);
    const soundLeadSec = clampNumber(record.soundLeadSec, 0, 3);
    const soundTailSec = clampNumber(record.soundTailSec, 0, 3);
    const lowerThird = cleanLowerThird(record.lowerThird);
    const lowerThirdSub = cleanLowerThird(record.lowerThirdSub);
    const pipUrl = typeof record.pipUrl === 'string' ? record.pipUrl.trim() : '';
    const moveFrom = normalizeCutFraming(record.moveFrom);
    const moveTo = normalizeCutFraming(record.moveTo);
    const spoken = text(record.spoken);
    const narrationText = text(record.narrationText);
    const subtitleFromSec = clampNumber(record.subtitleFromSec, 0, 600);
    const subtitleToSec = clampNumber(record.subtitleToSec, 0, 600);
    shots.push({
      url,
      title: title || 'shot',
      kind,
      ...(holdSec != null ? { holdSec } : {}),
      ...(entryId ? { entryId } : {}),
      ...(caption ? { caption } : {}),
      ...(record.captionless === true ? { captionless: true } : {}),
      ...(record.holdFixed === true ? { holdFixed: true } : {}),
      ...(typeof record.narrationUrl === 'string' &&
      record.narrationUrl.startsWith('/api/comfyui/view?')
        ? { narrationUrl: record.narrationUrl }
        : {}),
      ...(spoken ? { spoken } : {}),
      ...(narrationText ? { narrationText } : {}),
      // Set in Cut (M4 F5); '' is kept: no subtitle on this shot.
      ...(typeof record.subtitle === 'string'
        ? { subtitle: record.subtitle.replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX) }
        : {}),
      ...(subtitleFromSec !== undefined ? { subtitleFromSec } : {}),
      ...(subtitleToSec !== undefined ? { subtitleToSec } : {}),
      ...(typeof record.volume === 'number' && Number.isFinite(record.volume)
        ? { volume: Math.min(2, Math.max(0, record.volume)) }
        : {}),
      ...(record.motion === 'in' ||
      record.motion === 'out' ||
      record.motion === 'none' ||
      (record.motion === 'custom' && moveFrom && moveTo)
        ? { motion: record.motion }
        : {}),
      ...(record.motion === 'custom' && moveFrom && moveTo ? { moveFrom, moveTo } : {}),
      ...(normalizeCutTransition(record.transitionIn)
        ? { transitionIn: normalizeCutTransition(record.transitionIn) }
        : {}),
      ...(clip && trimStartSec != null ? { trimStartSec } : {}),
      ...(clip && trimEndSec != null ? { trimEndSec } : {}),
      ...(clip && speed != null && speed !== 1 ? { speed } : {}),
      ...(clip && record.reverse === true ? { reverse: true } : {}),
      ...(clip && soundLeadSec ? { soundLeadSec } : {}),
      ...(clip && soundTailSec ? { soundTailSec } : {}),
      ...(lowerThird ? { lowerThird, ...(lowerThirdSub ? { lowerThirdSub } : {}) } : {}),
      ...(pipUrl ? { pipUrl, pipCorner: normalizeOverlayCorner(record.pipCorner, 'br') } : {}),
    });
  }
  return shots;
}
