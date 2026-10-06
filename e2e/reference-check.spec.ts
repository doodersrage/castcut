import { test, expect, type Page } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { seedSettingsCacheOnNextLoad } from './helpers/idb';
import { gotoStable, openComfyUiSettingsTab } from './helpers/navigation';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

/**
 * Reference checks (reference-check.ts): the pictures a still goes out with are checked against
 * their roles. The ComfyUI measurement is stubbed at `/api/reference-check`; what is tested here
 * is that a mismatch reaches the player — on the Day card, on the Story beat, and in the
 * workflow health panel for the active Cast and Day partner.
 */

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

const LEAD_ID = 'e2e-ref-lead';
const PARTNER_ID = 'e2e-ref-partner';

function cast(id: string, name: string, base: string, lock: string) {
  return {
    id,
    name,
    version: 1,
    updatedAt: Date.now(),
    reference: {
      originalFilename: `${base}.png`,
      originalUrl: '/icon.svg',
      isolatedFilename: `${base}-cutout.png`,
      isolatedUrl: '/icon.svg',
      isolated: true,
    },
    ipAdapter: { imageFilename: lock, imageUrl: '/icon.svg' },
  };
}

/** The server's answer, by the file name asked about. */
async function stubReferenceCheck(page: Page, calls: Array<Record<string, unknown>>) {
  await page.route('**/api/reference-check', async route => {
    const body = route.request().postDataJSON() as {
      role: string;
      filename?: string;
      subject?: string;
      partnerReferenceUrl?: string;
      leadReferenceUrl?: string;
    };
    calls.push(body);
    const name = body.filename ?? '';
    const subject = body.subject ?? '';
    let verdict: Record<string, unknown>;
    if (/fox-girl/.test(name)) {
      verdict = {
        status: 'mismatch',
        issues: ['face-too-small', 'other-person'],
        message: `${subject}'s face picture is a whole-body picture, not a face crop and shows someone else's face — check Cast → ${subject}.`,
        faceShare: 0.082,
        faces: 1,
      };
    } else if (/offline/.test(name)) {
      verdict = { status: 'unknown', issues: [], message: 'ComfyUI is offline.' };
    } else {
      verdict = { status: 'ok', issues: [], faceShare: 0.43, faces: 1 };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ available: verdict.status !== 'unknown', verdict, ms: 3 }),
    });
  });
}

test('the health panel checks the active Cast and the Day partner, and names a wrong face lock', async ({
  page,
}) => {
  const calls: Array<Record<string, unknown>> = [];
  await stubReferenceCheck(page, calls);
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: LEAD_ID },
    tools: { day: { partnerCharacterId: PARTNER_ID } },
    characters: {
      version: 1,
      characters: [
        cast(LEAD_ID, 'Nora', 'nora-plate', 'nora-face-offline-1.png'),
        cast(PARTNER_ID, 'Tomas', 'tomas-plate', 'fox-girl-1.png'),
      ],
      removedIds: [],
    },
  });
  await gotoStable(page, '/settings?tab=comfyui&section=workflow-library');
  await openComfyUiSettingsTab(page);
  await dismissBlockingOverlays(page);
  const panel = page.getByTestId('reference-health');
  await expect(panel).toBeVisible({ timeout: 45_000 });

  await expect(page.getByTestId('reference-health-lead-plate')).toHaveAttribute('data-status', 'ok', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('reference-health-lead-plate')).toContainText('Nora — plate: OK');
  // A check that could not run is said as such — never a mismatch.
  const leadFace = page.getByTestId('reference-health-lead-face');
  await expect(leadFace).toHaveAttribute('data-status', 'unknown');
  await expect(leadFace).toContainText('Not checked — ComfyUI is offline.');
  await expect(page.getByTestId('reference-health-partner-plate')).toHaveAttribute('data-status', 'ok');
  const partnerFace = page.getByTestId('reference-health-partner-face');
  await expect(partnerFace).toHaveAttribute('data-status', 'mismatch');
  await expect(partnerFace).toContainText(
    "Tomas — face lock (Day partner): Tomas's face picture is a whole-body picture, not a face crop and shows someone else's face — check Cast → Tomas."
  );
  // The partner's face is compared with their own plate and the lead's.
  const partnerCall = calls.find(call => call.role === 'partner-face');
  expect(partnerCall?.filename).toBe('fox-girl-1.png');
  expect(String(partnerCall?.partnerReferenceUrl)).toContain('tomas-plate-cutout.png');
  expect(String(partnerCall?.leadReferenceUrl)).toContain('nora-plate-cutout.png');
});

test('a Day card and a Story beat say when a reference picture was not what its slot expects', async ({
  page,
}) => {
  const now = Date.now();
  const note =
    "Tomas's face picture is a whole-body picture, not a face crop — check Cast → Tomas. This still invents the partner instead.";
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: LEAD_ID },
    tools: {
      day: {
        stillsCharacterId: LEAD_ID,
        slots: [
          { id: 'morning', label: 'Morning', location: 'Kitchen', sceneHints: 'coffee with Tomas' },
          { id: 'afternoon', label: 'Afternoon', location: 'Park', sceneHints: 'a walk' },
        ],
        stills: [
          { slotId: 'morning', promptId: 'p-ref', status: 'queued', referenceNote: note },
          { slotId: 'afternoon', promptId: 'p-clean', status: 'queued' },
        ],
      },
      roleplay: {
        // Match the Cast-linked session id so the deep-link sync keeps this reel.
        activeSessionId: `cast-${LEAD_ID}`,
        characterName: 'Nora',
        bio: { name: 'Nora', look: 'a green raincoat', personality: 'curious' },
        story: [
          {
            id: 'b1',
            at: now - 2000,
            kind: 'plot',
            title: 'Morning',
            blurb: 'Coffee.',
            stillStatus: 'queued',
            promptId: 'p-story',
            referenceNote:
              "Nora's face picture is a Cast plate (a whole body), not a face crop — check Cast → Nora. The face was cropped from the look's plate instead.",
          },
        ],
      },
    },
    characters: {
      version: 1,
      characters: [cast(LEAD_ID, 'Nora', 'nora-plate', 'nora-face-1.png')],
      removedIds: [],
    },
  });
  await gotoStable(page, `/day?character=${LEAD_ID}`);
  await dismissBlockingOverlays(page);
  const cardNote = page.getByTestId('day-slot-reference-note-morning');
  await expect(cardNote).toBeVisible({ timeout: 30_000 });
  await expect(cardNote).toHaveText(note);
  await expect(page.getByTestId('day-slot-reference-note-afternoon')).toHaveCount(0);

  await gotoStable(page, `/story?character=${LEAD_ID}`);
  await dismissBlockingOverlays(page);
  const beatNote = page.getByTestId('story-beat-reference-note').first();
  await expect(beatNote).toBeVisible({ timeout: 30_000 });
  await expect(beatNote).toContainText("Nora's face picture is a Cast plate (a whole body), not a face crop");
});
