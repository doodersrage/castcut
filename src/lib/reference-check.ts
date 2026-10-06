/**
 * Reference checks (pure): is each picture about to be sent with a still the kind of picture
 * its slot expects? Two bugs this week were "wrong picture" bugs where the prompt and the graph
 * looked right — the Day partner's face upload was an unrelated full-body picture for four days
 * (d56fe14a), and a look's face lock was an old whole-body underwear plate that nude stills used
 * whole as Image 1 (f651d571). Pixels are cheap to measure: one InsightFace bounding-box run
 * (faces found, the largest box) plus the image size, and for a partner's face a similarity to
 * the partner's own plate and to the lead's. The ComfyUI runs live in reference-check-server.ts;
 * the decision is here so it can be unit-tested on fixtures.
 *
 * Verdicts fail OPEN: a check that could not run is `unknown`, never a mismatch.
 */

import type { FaceBox } from '@/lib/portrait-face-crop';

export type ReferenceRole =
  /** A face crop: Day / Story Image 1 on nude stills, the face-break crop, a face lock. */
  | 'face'
  /** A Day partner's face (a Cast member's face crop, or the invented stand-in's). */
  | 'partner-face'
  /** The clothing image (a kit packshot, your own clothing photo, a dressed plate). */
  | 'clothing'
  /** A whole-body Cast plate (Outfit / Day Image 1 on clothed stills). */
  | 'plate';

export type ReferenceFacts = {
  width: number;
  height: number;
  /** Faces InsightFace found (0 = none). */
  faces: number;
  /** The largest face, in the image's own pixels. */
  face?: FaceBox | null;
  /** Face-recognition similarity (face-match.ts): null when it could not be measured. */
  similarity?: {
    /** To the partner's own plate (role `partner-face`). */
    partner?: number | null;
    /** To the lead's plate (role `partner-face`): the partner must not be the lead. */
    lead?: number | null;
  };
};

export type ReferenceIssue =
  | 'no-face'
  | 'extra-faces'
  | 'face-too-small'
  | 'cast-plate-name'
  | 'face-crop'
  | 'other-person'
  | 'lead-face';

export type ReferenceVerdict = {
  status: 'ok' | 'mismatch' | 'unknown';
  issues: ReferenceIssue[];
  /** One sentence for a card / the health panel, set on a mismatch (and on `unknown` the reason). */
  message?: string;
  /** Face height over image height, when a face was found. */
  faceShare?: number;
  faces?: number;
};

/** What `/api/reference-check` answers (reference-check-server.ts). */
export type ReferenceCheckResponse = {
  verdict: ReferenceVerdict;
  facts?: ReferenceFacts;
  /** The pixels could not be measured (ComfyUI offline, no FaceAnalysis pack, not a ComfyUI image). */
  available: boolean;
  reason?: string;
  /** Milliseconds the measurement took on the server. */
  ms: number;
  cached?: boolean;
};

/**
 * A face crop's face is tall. Live on the user's files (2026-10-05, InsightFace box height over
 * image height): the Day nude face crop 0.43; the face-box crop is cut at 2.2× the box (~0.45);
 * the top-of-plate fallback windows (0.24–0.42 of the plate) give ~0.24–0.4. Whole-body plates:
 * 0.10 (Cast base plate), 0.11 (prepared plate, a man in boxers); the unrelated full-body picture
 * sent as the partner's face: 0.08. 0.16 sits between the two groups.
 */
export const FACE_REFERENCE_MIN_FACE_SHARE = 0.16;

/** Below this the partner's face is not the partner (face-match.ts: unrelated faces ≲0.2–0.3). */
export const PARTNER_FACE_MIN_SIMILARITY = 0.3;

/** At or above this (and closer than to the partner's plate) the "partner" is the lead. */
export const LEAD_FACE_SIMILARITY = 0.5;

/** A Cast plate upload (`cast-plate-…`, `cast-plate-prepared-…`, `cast-plate-base-…`): a whole body. */
export function isCastPlateReferenceName(value: string | null | undefined): boolean {
  const text = value?.trim();
  if (!text) return false;
  let name = text;
  try {
    name = new URL(text, 'http://x').searchParams.get('filename') ?? text;
  } catch {
    // not a URL
  }
  return /(?:^|\/)cast-plate-[^/]*$/i.test(name);
}

export function referenceFaceShare(facts: Pick<ReferenceFacts, 'face' | 'height'>): number | null {
  if (!facts.face || facts.height <= 0) return null;
  return facts.face.height / facts.height;
}

/**
 * The decision. `facts` null = the pixels could not be measured; only the name can then be
 * judged (a `cast-plate-…` file is never a face), everything else is `unknown`.
 */
export function judgeReference(
  role: ReferenceRole,
  facts: ReferenceFacts | null,
  context?: { filename?: string | null; subject?: string | null; unavailableReason?: string }
): ReferenceVerdict {
  const subject = context?.subject?.trim() || '';
  const issues: ReferenceIssue[] = [];
  const name = context?.filename ?? '';
  const castPlateName = isCastPlateReferenceName(name);
  if ((role === 'face' || role === 'partner-face' || role === 'clothing') && castPlateName) {
    issues.push('cast-plate-name');
  }
  if (!facts) {
    if (issues.length > 0) {
      return { status: 'mismatch', issues, message: referenceMessage(role, issues, subject) };
    }
    return {
      status: 'unknown',
      issues,
      message: context?.unavailableReason?.trim() || 'The picture could not be checked.',
    };
  }
  const share = referenceFaceShare(facts);
  if (role === 'face' || role === 'partner-face') {
    if (facts.faces <= 0) {
      issues.push('no-face');
    } else {
      if (facts.faces > 1) issues.push('extra-faces');
      if (share !== null && share < FACE_REFERENCE_MIN_FACE_SHARE) issues.push('face-too-small');
    }
    if (role === 'partner-face' && facts.faces > 0) {
      const partner = facts.similarity?.partner;
      const lead = facts.similarity?.lead;
      if (
        typeof lead === 'number' &&
        lead >= LEAD_FACE_SIMILARITY &&
        (typeof partner !== 'number' || lead > partner)
      ) {
        issues.push('lead-face');
      } else if (typeof partner === 'number' && partner < PARTNER_FACE_MIN_SIMILARITY) {
        issues.push('other-person');
      }
    }
  } else if (role === 'clothing') {
    if (facts.faces > 0 && share !== null && share >= FACE_REFERENCE_MIN_FACE_SHARE) {
      issues.push('face-crop');
    }
  } else if (role === 'plate') {
    if (facts.faces <= 0) issues.push('no-face');
    else if (facts.faces > 1) issues.push('extra-faces');
  }
  const unique = Array.from(new Set(issues));
  return {
    status: unique.length > 0 ? 'mismatch' : 'ok',
    issues: unique,
    ...(unique.length > 0 ? { message: referenceMessage(role, unique, subject) } : {}),
    ...(share !== null ? { faceShare: Math.round(share * 1000) / 1000 } : {}),
    faces: facts.faces,
  };
}

function whose(role: ReferenceRole, subject: string): string {
  if (role === 'partner-face')
    return subject ? `${subject}'s face picture` : "The partner's face picture";
  if (role === 'face') return subject ? `${subject}'s face picture` : 'The face picture';
  if (role === 'clothing') return 'The clothing picture';
  return subject ? `${subject}'s plate` : 'The plate';
}

function issueClause(issue: ReferenceIssue): string {
  switch (issue) {
    case 'no-face':
      return "doesn't show a face";
    case 'extra-faces':
      return 'shows more than one face';
    case 'face-too-small':
      return 'is a whole-body picture, not a face crop';
    case 'cast-plate-name':
      return 'is a Cast plate (a whole body), not a face crop';
    case 'face-crop':
      return 'is a face crop, not clothing';
    case 'other-person':
      return "shows someone else's face";
    case 'lead-face':
      return "is the lead's face, not the partner's";
    default:
      return 'is not what this slot expects';
  }
}

/** "Nora's face picture doesn't show a face — check Cast → Nora." */
export function referenceMessage(
  role: ReferenceRole,
  issues: ReferenceIssue[],
  subject: string
): string {
  const clauses = issues.map(issueClause);
  const what =
    clauses.length <= 1
      ? (clauses[0] ?? issueClause('no-face'))
      : `${clauses.slice(0, -1).join(', ')} and ${clauses[clauses.length - 1]}`;
  const where =
    role === 'clothing'
      ? ' — pick the clothing again.'
      : subject
        ? ` — check Cast → ${subject}.`
        : ' — check the Cast page.';
  return `${whose(role, subject)} ${what}${where}`;
}

/** One cache key per picture × role × what it is compared with. */
export function referenceCheckCacheKey(input: {
  role: ReferenceRole;
  filename?: string | null;
  imageUrl?: string | null;
  partnerReferenceUrl?: string | null;
  leadReferenceUrl?: string | null;
}): string {
  return [
    input.role,
    input.filename?.trim() || '',
    input.filename?.trim() ? '' : input.imageUrl?.trim() || '',
    input.role === 'partner-face' ? input.partnerReferenceUrl?.trim() || '' : '',
    input.role === 'partner-face' ? input.leadReferenceUrl?.trim() || '' : '',
  ].join('\u0000');
}

/** The verdict shown as one word on the health panel. */
export function referenceVerdictLabel(verdict: ReferenceVerdict | null | undefined): string {
  if (!verdict) return 'Checking…';
  if (verdict.status === 'ok') return 'OK';
  if (verdict.status === 'mismatch') return verdict.message ?? 'Not what this slot expects';
  return `Not checked — ${verdict.message ?? 'the check did not run'}`;
}
