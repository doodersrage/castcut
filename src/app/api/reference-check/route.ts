import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { checkReferenceInComfy } from '@/lib/reference-check-server';
import type { ReferenceRole } from '@/lib/reference-check';

export const runtime = 'nodejs';

const ROLES: ReferenceRole[] = ['face', 'partner-face', 'clothing', 'plate'];

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/reference-check');
}

/**
 * Is a reference picture the kind its slot expects (reference-check.ts)? JSON body: `role`,
 * `filename` (a ComfyUI input file) or `imageUrl` (a ComfyUI view URL), optional `comfyUrl`,
 * `subject` (the Cast's name, for the message), and for `partner-face` the `partnerReferenceUrl`
 * / `leadReferenceUrl` view URLs it is compared with. Always 200 with a verdict: a check that
 * could not run answers `available: false` and an `unknown` verdict (callers fail open).
 */
export async function POST(request: Request) {
  let body: {
    role?: string;
    filename?: string;
    imageUrl?: string;
    comfyUrl?: string;
    subject?: string;
    partnerReferenceUrl?: string;
    leadReferenceUrl?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('JSON body is required.', 400);
  }
  const role = ROLES.find(entry => entry === body.role?.trim());
  if (!role) {
    return apiError(`role must be one of ${ROLES.join(', ')}.`, 400);
  }
  if (!body.filename?.trim() && !body.imageUrl?.trim()) {
    return apiError('filename or imageUrl is required.', 400);
  }
  try {
    return apiJson(
      await checkReferenceInComfy({
        role,
        filename: body.filename?.trim() || undefined,
        imageUrl: body.imageUrl?.trim() || undefined,
        comfyUrl: body.comfyUrl?.trim() || undefined,
        subject: body.subject?.trim() || undefined,
        partnerReferenceUrl: body.partnerReferenceUrl?.trim() || undefined,
        leadReferenceUrl: body.leadReferenceUrl?.trim() || undefined,
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reference check failed.';
    const status = /not allowed|Invalid URL|allowlist/i.test(message) ? 400 : 502;
    return apiError(message, status);
  }
}
