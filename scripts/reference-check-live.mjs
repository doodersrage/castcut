#!/usr/bin/env node
/**
 * Run the reference checks (reference-check.ts) on real ComfyUI input files through a running
 * app server, read-only: nothing is uploaded or rendered — one InsightFace bounding-box graph per
 * file (and a face-distance graph per comparison), queued with check priority.
 *
 *   PROMPT_API_URL=http://127.0.0.1:48081 PROMPT_API_TOKEN=… \
 *     node scripts/reference-check-live.mjs face:day-nude-face-1531c597f82e0aa1.png \
 *       partner-face:day-partner-vl-ee47dfbeea68e821.png face:cast-plate-base-6eeb5f993672a860.png
 *
 * Each argument is `<role>:<input file>[:<partner plate>[:<lead plate>]]` (role: face,
 * partner-face, clothing, plate). Prints a table with the verdict, faces, face share and the
 * server time of a cold and a second (cached) call.
 */

const base = (process.env.PROMPT_API_URL ?? 'http://127.0.0.1:47832').replace(/\/+$/, '');
const token = process.env.PROMPT_API_TOKEN?.trim();
const comfyUrl = process.env.COMFYUI_API_URL?.trim();

function viewUrl(name) {
  const params = new URLSearchParams({ filename: name, subfolder: '', type: 'input' });
  return `/api/comfyui/view?${params.toString()}`;
}

async function check(spec) {
  const [role, filename, partnerPlate, leadPlate] = spec.split(':');
  const body = {
    role,
    filename,
    ...(partnerPlate ? { partnerReferenceUrl: viewUrl(partnerPlate) } : {}),
    ...(leadPlate ? { leadReferenceUrl: viewUrl(leadPlate) } : {}),
    ...(comfyUrl ? { comfyUrl } : {}),
  };
  const call = async () => {
    const started = Date.now();
    const response = await fetch(`${base}/api/reference-check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return { data, wall: Date.now() - started, status: response.status };
  };
  const cold = await call();
  const warm = await call();
  return { role, filename, cold, warm };
}

const specs = process.argv.slice(2);
if (specs.length === 0) {
  console.error('Give at least one <role>:<file> argument.');
  process.exit(2);
}
const rows = [];
for (const spec of specs) {
  const result = await check(spec);
  // A cold call can time out behind someone else's render (the check then fails open); the
  // verdict shown is the first call that answered.
  const answered = result.cold.status === 200 ? result.cold : result.warm;
  const verdict = answered.data?.verdict ?? {};
  const facts = answered.data?.facts;
  rows.push({
    role: result.role,
    file: result.filename,
    verdict: answered.status === 200 ? verdict.status : `HTTP ${answered.status}`,
    issues: (verdict.issues ?? []).join(',') || '-',
    faces: facts?.faces ?? '-',
    share: verdict.faceShare ?? '-',
    partner: facts?.similarity?.partner ?? '-',
    lead: facts?.similarity?.lead ?? '-',
    'cold ms': `${result.cold.wall} (server ${result.cold.data?.ms ?? '-'})`,
    'warm ms': `${result.warm.wall} (server ${result.warm.data?.ms ?? '-'})`,
  });
}
console.table(rows);
