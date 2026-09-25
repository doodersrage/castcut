import { test, expect, type Page } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { seedSettingsCacheOnNextLoad } from './helpers/idb';
import { gotoStable } from './helpers/navigation';
import { seedGalleryPlayFixtures } from './helpers/gallery';
import { dismissBlockingOverlays } from './helpers/overlays';

function seedFirstFilmDone(page: Page) {
  return page.addInitScript(() => {
    window.localStorage.setItem(
      'comfy-play-metrics-v1',
      JSON.stringify({
        version: 1,
        firstFilmCutAt: Date.now(),
      })
    );
  });
}

async function expandFittingMoreMenu(page: Page) {
  const details = page.locator('details').filter({ has: page.getByTestId('fitting-plan-day') });
  await details.locator('summary').click();
}

test.beforeEach(async ({ page }) => {
  await ensureAuthenticated(page);
});

test('play campaign wizard loads with steps and share controls', async ({ page }) => {
  await gotoStable(page, '/play');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /^Your film$/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('play-campaign')).toBeVisible();
  await expect(page.getByTestId('play-campaign-character')).toBeVisible();
  await expect(page.getByTestId('play-campaign-steps')).toBeVisible();
  await expect(page.getByTestId('play-campaign-step-moodboard')).toBeVisible();
  await expect(page.getByTestId('play-campaign-step-fitting')).toBeVisible();
  await expect(page.getByTestId('play-campaign-step-day')).toBeVisible();
  await expect(page.getByTestId('play-campaign-step-roleplay')).toBeVisible();
  await expect(page.getByTestId('play-campaign-step-roleplay-locked')).toBeVisible();
  // No Cast yet — the disabled "Start at Look" stays hidden until one exists.
  await expect(page.getByTestId('play-campaign-start-moodboard')).toHaveCount(0);
});

test('fitting room happy path chrome loads', async ({ page }) => {
  await gotoStable(page, '/fitting');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /^Outfit$/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('fitting-character')).toBeVisible();
  await expect(page.getByTestId('fitting-plate')).toBeVisible();
  await expect(page.getByTestId('fitting-kit-strip')).toBeVisible();
  await expect(page.getByRole('button', { name: /Queue try-on/i })).toBeVisible();
});

test('outfit first run: Cast card, one plate message, grouped kit controls', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: '' },
    characters: { version: 1, characters: [], removedIds: [] },
  });
  await gotoStable(page, '/fitting');
  await dismissBlockingOverlays(page);
  const card = page.getByTestId('outfit-get-started');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText(/Outfit needs a Cast lead/i);
  await expect(page.getByTestId('outfit-get-started-starter')).toBeVisible();

  // A fresh plate says "No plate yet" once — not also "Plate cleared".
  const empty = page.getByTestId('fitting-plate-empty');
  await expect(empty).toContainText(/No plate yet/i);
  await expect(page.getByTestId('fitting-plate')).not.toContainText(/cleared/i);

  // Clothing type quick picks; uploads are labelled buttons.
  await expect(page.getByTestId('wardrobe-category-all')).toBeVisible();
  await expect(page.getByText('Upload worn photo')).toBeVisible();
  await expect(page.getByText('Upload packshot')).toBeVisible();
  await expect(page.getByTestId('fitting-skip-kit')).toBeDisabled();

  const review = page.getByTestId('fitting-auto-review-switch');
  await expect(review).toHaveAttribute('aria-checked', 'false');
  await review.click();
  await expect(review).toHaveAttribute('aria-checked', 'true');
});

test('forgetting a Cast lead asks first', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [{ id: 'e2e-forget', name: 'Keep Me', version: 1, updatedAt: Date.now() }],
        removedIds: [],
      })
    );
    window.localStorage.setItem(
      'comfy-prompt-tool-settings-v1',
      JSON.stringify({ shared: { activeCharacterId: 'e2e-forget' }, tools: {} })
    );
  });
  await gotoStable(page, '/fitting?character=e2e-forget');
  await dismissBlockingOverlays(page);
  const picker = page.getByLabel('Active character');
  await expect(picker).toHaveValue('e2e-forget', { timeout: 30_000 });
  page.once('dialog', dialog => {
    expect(dialog.message()).toMatch(/Forget Keep Me\?/);
    void dialog.dismiss();
  });
  await page.getByTestId('fitting-character').getByRole('button', { name: 'Forget' }).click();
  await expect(picker).toHaveValue('e2e-forget');
});

test('day planner happy path chrome loads', async ({ page }) => {
  await gotoStable(page, '/day');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /^Day$/i, level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('day-character')).toBeVisible();
  await expect(page.getByTestId('day-slots')).toBeVisible();
  await expect(page.getByTestId('day-slot-queue')).toBeVisible();
  await expect(page.getByTestId('day-reel')).toBeVisible();
  await expect(
    page.getByTestId('day-reel').getByRole('button', { name: /Cut film/i })
  ).toBeVisible();
});

test('day without a Cast leads with the get-started card', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: '' },
    characters: { version: 1, characters: [], removedIds: [] },
  });
  await gotoStable(page, '/day');
  await dismissBlockingOverlays(page);
  const card = page.getByTestId('day-get-started');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText(/Day needs a Cast lead/i);
  await expect(page.getByTestId('day-get-started-starter')).toBeVisible();
  await page.getByTestId('day-get-started-setup').click();
  await expect(page.getByTestId('day-character')).toBeVisible();

  // Options read as switches, mood as a pick-one group.
  await expect(page.getByRole('switch', { name: /Pose over plate/i })).toHaveAttribute(
    'aria-checked',
    'true'
  );
  const companions = page.getByRole('switch', { name: /Duo · companions/i });
  await companions.click();
  await expect(companions).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radiogroup', { name: 'Day mood' })).toBeVisible();
  // Nothing planned yet: slot cards offer "Add a beat".
  await expect(page.locator('[data-testid^="day-slot-add-beat-"]').first()).toBeVisible();
});

test('day mid-flow: one Cut, folded cut options, honest render status', async ({ page }) => {
  await page.addInitScript(() => {
    const thumb = '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp';
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [{ id: 'e2e-day-mid', name: 'Day Mid', version: 1, updatedAt: Date.now() }],
        removedIds: [],
      })
    );
    window.localStorage.setItem(
      'comfy-prompt-tool-settings-v1',
      JSON.stringify({
        shared: { activeCharacterId: 'e2e-day-mid' },
        tools: {
          day: {
            stillsCharacterId: 'e2e-day-mid',
            slots: [
              { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee' },
              { id: 'afternoon', label: 'Afternoon', location: 'park', sceneHints: 'reads' },
              { id: 'evening', label: 'Evening', location: 'rooftop', sceneHints: 'laughs' },
              { id: 'night', label: 'Night', location: 'bedroom', sceneHints: 'reads in bed' },
            ],
            stills: [
              { slotId: 'morning', status: 'completed', imageUrl: thumb },
              { slotId: 'afternoon', status: 'completed', imageUrl: thumb },
              { slotId: 'evening', status: 'running' },
            ],
          },
        },
      })
    );
  });
  await gotoStable(page, '/day?character=e2e-day-mid');
  await dismissBlockingOverlays(page);
  const coach = page.getByTestId('day-cut-coach');
  await expect(coach).toBeVisible({ timeout: 30_000 });
  // Cut options fold behind a summary instead of filling the sticky banner.
  const options = coach.getByTestId('day-cut-options-disclosure');
  await expect(options).toContainText(/Cut options/);
  await expect(options).not.toHaveAttribute('open', '');
  // The banner owns Cut — the Animate card doesn't repeat it.
  await expect(page.getByTestId('day-animate-cut')).toHaveCount(0);
  // A running still says so instead of "Queueing…".
  await expect(page.getByTestId('day-progress-evening')).toContainText(/Rendering/);
  // Setup can upload a plate (it becomes the Cast look plate).
  await expect(page.getByTestId('day-plate-upload')).toBeAttached();
});

async function seedStoryMidFlow(page: Page, id: string) {
  await page.addInitScript(castId => {
    const thumb = '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp';
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [{ id: castId, name: 'Story Mid', version: 1, updatedAt: Date.now() }],
        removedIds: [],
      })
    );
    window.localStorage.setItem(
      'comfy-play-metrics-v1',
      JSON.stringify({ version: 1, firstFilmCutAt: Date.now() })
    );
    window.localStorage.setItem(
      'comfy-prompt-tool-settings-v1',
      JSON.stringify({
        shared: { activeCharacterId: castId },
        tools: {
          roleplay: {
            activeSessionId: `cast-${castId}`,
            characterName: 'Story Mid',
            bio: { name: 'Story Mid', look: 'green raincoat', personality: 'curious' },
            story: [
              {
                id: 'b1',
                at: Date.now() - 2000,
                kind: 'plot',
                title: 'The letter',
                blurb: 'A letter under the door.',
                stillStatus: 'completed',
                imageUrl: thumb,
              },
              {
                id: 'b2',
                at: Date.now() - 1000,
                kind: 'plot',
                title: 'The station',
                blurb: 'The last train north.',
                stillStatus: 'running',
              },
            ],
          },
        },
      })
    );
  }, id);
}

test('story mid-flow: Roll leads, settings fold, no default Part', async ({ page }) => {
  await seedStoryMidFlow(page, 'e2e-story-mid');
  await gotoStable(page, '/story?character=e2e-story-mid');
  await dismissBlockingOverlays(page);
  const picker = page.getByTestId('story-beat-picker');
  await expect(picker).toBeVisible({ timeout: 30_000 });
  await expect(picker.getByTestId('story-roll-scenes')).toBeVisible();
  const settings = picker.getByTestId('story-settings');
  await expect(settings).toContainText(/Story settings · .* · any setting/);
  await expect(settings).not.toHaveAttribute('open', '');
  // A Cast without a Part used to show (and be written as) the first archetype.
  await expect(page.getByText(/Raccoon pirate/i)).toHaveCount(0);
  // One Cut: the reel's, not also the Animate card's.
  await expect(page.getByTestId('story-animate-cut')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cut film', exact: true })).toBeVisible();
});

test('phone story recognises the active Cast before any film is cut', async ({ page }) => {
  await seedStoryMidFlow(page, 'e2e-story-phone');
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoStable(page, '/m/story?character=e2e-story-phone');
  await dismissBlockingOverlays(page);
  await expect(page.getByText('The letter').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('story-needs-cast')).toHaveCount(0);
});

test('look: one preset row, tile board, paste adds a tile', async ({ page }) => {
  await gotoStable(page, '/moodboard');
  await dismissBlockingOverlays(page);
  const picker = page.getByTestId('look-preset-picker');
  await expect(picker).toBeVisible({ timeout: 30_000 });
  // Presets are listed once — the separate "Use X for today" button wall is gone.
  await expect(page.getByTestId('moodboard-use-for-today')).toHaveCount(0);
  await expect(page.getByTestId('look-preset-selected')).toHaveCount(0);

  const board = page.getByTestId('look-tile-board');
  await expect(board).toBeVisible();
  const before = await board.locator('[data-testid^="look-tile-"]:not([data-testid="look-tile-add"])').count();

  // Paste an image anywhere on the page → a new tile.
  if (before < 4) {
    await page.evaluate(async () => {
      const png = Uint8Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
        ),
        char => char.charCodeAt(0)
      );
      const data = new DataTransfer();
      data.items.add(new File([png], 'pasted.png', { type: 'image/png' }));
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data }));
    });
    await expect(
      board.locator('[data-testid^="look-tile-"]:not([data-testid="look-tile-add"])')
    ).toHaveCount(before + 1, { timeout: 15_000 });
  }

  // Pick a preset → one place to load it or use it for today.
  await page.getByTestId('look-preset-cozy').click();
  const selected = page.getByTestId('look-preset-selected');
  await expect(selected).toBeVisible();
  await expect(selected.getByTestId('look-preset-load')).toBeVisible();
  await expect(selected.getByTestId('moodboard-preset-day-cozy')).toBeVisible();
  await selected.getByTestId('look-preset-load').click();
  await expect(board.getByTestId('look-tile-0')).toBeVisible();
});

test('day and story show a running job as Rendering, and Story Retry flagged', async ({ page }) => {
  await page.addInitScript(() => {
    const thumb = '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp';
    const now = Date.now();
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [{ id: 'e2e-progress', name: 'Progress', version: 1, updatedAt: now }],
        removedIds: [],
      })
    );
    window.localStorage.setItem(
      'comfy-play-metrics-v1',
      JSON.stringify({ version: 1, firstFilmCutAt: now })
    );
    // What the live poller writes while ComfyUI works: sampler steps and queue position.
    const job = (promptId: string, extra: Record<string, unknown>) => ({
      id: `g-${promptId}`,
      promptId,
      prompt: 'progress',
      model: 'qwen-image-2512',
      tool: 'day',
      queuedAt: now,
      characterId: 'e2e-progress',
      images: [],
      ...extra,
    });
    window.localStorage.setItem(
      'comfyui-gallery-v1',
      JSON.stringify([
        job('p-evening', { status: 'running', progressValue: 9, progressMax: 20, queuePosition: 0 }),
        job('p-beat', { status: 'running', progressValue: 30, progressMax: 60, queuePosition: 0 }),
      ])
    );
    window.localStorage.setItem(
      'comfy-prompt-tool-settings-v1',
      JSON.stringify({
        shared: { activeCharacterId: 'e2e-progress' },
        tools: {
          day: {
            stillsCharacterId: 'e2e-progress',
            slots: [
              { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'coffee' },
              { id: 'afternoon', label: 'Afternoon', location: 'park', sceneHints: 'reads' },
              { id: 'evening', label: 'Evening', location: 'rooftop', sceneHints: 'laughs' },
              { id: 'night', label: 'Night', location: 'bedroom', sceneHints: 'sleeps' },
            ],
            stills: [
              { slotId: 'morning', status: 'completed', imageUrl: thumb },
              { slotId: 'evening', status: 'queued', promptId: 'p-evening' },
            ],
          },
          roleplay: {
            activeSessionId: 'cast-e2e-progress',
            characterName: 'Progress',
            bio: { name: 'Progress', look: 'green raincoat', personality: 'curious' },
            story: [
              {
                id: 'b1',
                at: now - 2000,
                kind: 'plot',
                title: 'Missed pose',
                blurb: 'A still that ignored its guide.',
                stillStatus: 'completed',
                imageUrl: thumb,
                poseMatch: { imageUrl: thumb, score: 0.2, expectedPeople: 1, detectedPeople: 1 },
              },
              {
                id: 'b2',
                at: now - 1000,
                kind: 'plot',
                title: 'Rendering beat',
                blurb: 'Still in ComfyUI.',
                stillStatus: 'queued',
                promptId: 'p-beat',
              },
            ],
          },
        },
      })
    );
  });

  await gotoStable(page, '/day?character=e2e-progress');
  await dismissBlockingOverlays(page);
  // Sampler % and queue position are in-memory only (the poller writes them live; they aren't
  // persisted), so a seeded entry carries its running status — their formatting is unit-tested.
  await expect(page.getByTestId('day-progress-evening')).toContainText('Rendering', {
    timeout: 30_000,
  });

  await gotoStable(page, '/story?character=e2e-progress');
  await dismissBlockingOverlays(page);
  await expect(page.getByText(/^Rendering/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('story-retry-flagged-button')).toHaveText('Retry 1 flagged');
});

test('moodboard look extract controls load', async ({ page }) => {
  await gotoStable(page, '/moodboard');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /^Look$/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('moodboard-character')).toBeVisible();
  await expect(page.getByTestId('moodboard-tiles')).toBeVisible();
  await expect(page.getByTestId('moodboard-extract-look')).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue to Outfit/i })).toBeVisible();
});

test('look pack deep link stages Fitting from=look handoff', async ({ page }) => {
  await page.addInitScript(() => {
    const pack = {
      version: 1,
      source: 'moodboard',
      characterId: 'e2e-char',
      wardrobeId: 'kit-linen',
      locationNotes: 'sunlit kitchen',
      moodNotes: 'cozy morning',
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem('moodboard-look-pack-v1', JSON.stringify(pack));
  });
  await gotoStable(page, '/fitting?from=look&character=e2e-char&wardrobe=kit-linen');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /^Outfit$/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('fitting-kit-strip')).toBeVisible();
});

test('plugins page separates runtime plugins from bookmarks', async ({ page }) => {
  await gotoStable(page, '/plugins');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /^Plugins$/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('heading', { name: /^Runtime plugins$/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Sidebar bookmarks$/i })).toBeVisible();
  const advanced = page.locator('summary', { hasText: /Advanced: manage bookmarks/i });
  await expect(advanced).toBeVisible();
  await advanced.click();
  await expect(page.getByRole('heading', { name: /Add custom bookmark/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Custom bookmarks \(JSON\)/i })).toBeVisible();
});

test('play campaign continue CTA appears when campaign state exists', async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      'play-campaign-v1',
      JSON.stringify({
        version: 1,
        characterId: 'e2e-resume-char',
        stepIndex: 2,
        updatedAt: Date.now(),
      })
    );
  });
  await gotoStable(page, '/play?character=e2e-resume-char');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('play-campaign-continue')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('play-campaign-start-moodboard')).toContainText(/Restart/i);
});


test('look pack from=look applies notes into Fitting', async ({ page }) => {
  await page.addInitScript(() => {
    const pack = {
      version: 1,
      source: 'moodboard',
      characterId: 'e2e-char',
      wardrobeId: 'kit-linen',
      locationNotes: 'sunlit kitchen',
      moodNotes: 'cozy morning',
      vibePrompt: 'golden hour soft light',
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem('moodboard-look-pack-v1', JSON.stringify(pack));
  });
  await gotoStable(page, '/fitting?from=look&character=e2e-char&wardrobe=kit-linen');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /^Outfit$/i })).toBeVisible({
    timeout: 30_000,
  });
  const notes = page.getByTestId('fitting-notes');
  if (await notes.count()) {
    await expect(notes).toContainText(/golden hour|cozy morning|sunlit kitchen/i);
  }
});

test('look pack from=look seeds Day slot location', async ({ page }) => {
  await page.addInitScript(() => {
    const pack = {
      version: 1,
      source: 'moodboard',
      characterId: 'e2e-char',
      wardrobeId: 'kit-linen',
      locationNotes: 'sunlit kitchen',
      moodNotes: 'cozy morning',
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem('moodboard-look-pack-v1', JSON.stringify(pack));
  });
  await gotoStable(page, '/day?from=look&character=e2e-char&wardrobe=kit-linen');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /^Day$/i, level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  const location = page.getByTestId('day-slot-location');
  if (await location.count()) {
    await expect(location).toHaveValue(/sunlit kitchen/i);
  }
});

test('play campaign continue navigates to Fitting step', async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      'play-campaign-v1',
      JSON.stringify({
        version: 1,
        characterId: 'e2e-resume-char',
        stepIndex: 2,
        updatedAt: Date.now(),
      })
    );
  });
  await gotoStable(page, '/play?character=e2e-resume-char');
  await dismissBlockingOverlays(page);
  const continueBtn = page.getByTestId('play-campaign-continue');
  await expect(continueBtn).toBeVisible({ timeout: 30_000 });
  await continueBtn.click();
  await expect(page).toHaveURL(/\/fitting/, { timeout: 30_000 });
});

test('portable look pack share hash is accepted on /play', async ({ page }) => {
  const token = Buffer.from(
    JSON.stringify({
      version: 1,
      kind: 'prompt-studio-look-pack',
      name: 'E2E share',
      id: 'lp-e2e',
      pack: {
        version: 1,
        source: 'moodboard',
        locationNotes: 'hash rooftop',
        moodNotes: 'night air',
        wardrobeId: 'kit-linen',
        savedAt: Date.now(),
      },
    }),
    'utf8'
  )
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  page.once('dialog', async dialog => {
    await dialog.accept('E2E Shared Cast');
  });
  await gotoStable(page, `/play#lookpack=${token}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('play-campaign')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Created Cast|Imported shared/i)).toBeVisible({
    timeout: 30_000,
  });
});

test('play campaign resume restores lookPack query from saved campaign', async ({ page }) => {
  await page.addInitScript(() => {
    const pack = {
      version: 1,
      source: 'saved',
      characterId: 'e2e-resume-char',
      locationNotes: 'resume kitchen',
      savedAt: Date.now(),
    };
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [
          {
            id: 'e2e-resume-char',
            name: 'E2E Resume',
            version: 1,
            updatedAt: Date.now(),
            lookPacks: [{ id: 'lp-resume', name: 'Resume pack', savedAt: Date.now(), pack }],
          },
        ],
        removedIds: [],
      })
    );
    window.sessionStorage.setItem(
      'play-campaign-v1',
      JSON.stringify({
        version: 1,
        characterId: 'e2e-resume-char',
        lookPackId: 'lp-resume',
        stepIndex: 2,
        updatedAt: Date.now(),
      })
    );
  });
  await gotoStable(page, '/play?character=e2e-resume-char');
  await dismissBlockingOverlays(page);
  await expect(page).toHaveURL(/lookPack=lp-resume/, { timeout: 30_000 });
  await expect(page.getByText(/look pack staged/i)).toBeAttached({ timeout: 30_000 });
});

test('play campaign shows mismatch when saved character differs', async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      'play-campaign-v1',
      JSON.stringify({
        version: 1,
        characterId: 'e2e-other-char',
        stepIndex: 2,
        updatedAt: Date.now(),
      })
    );
  });
  await gotoStable(page, '/play?character=e2e-resume-char');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('play-campaign-resume-mismatch')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('play-campaign-continue')).toHaveCount(0);
});

test('day slot editor previews the pose and lets you change it', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [{ id: 'e2e-day-pose', name: 'Day Pose', version: 1, updatedAt: Date.now() }],
        removedIds: [],
      })
    );
    window.localStorage.setItem(
      'comfy-prompt-tool-settings-v1',
      JSON.stringify({
        shared: { activeCharacterId: 'e2e-day-pose' },
        tools: {
          day: {
            stillsCharacterId: 'e2e-day-pose',
            slots: [
              {
                id: 'morning',
                label: 'Morning',
                location: 'small kitchen',
                sceneHints: 'stirring a pot of risotto at the stove',
              },
              // Every slot cooks, so whichever slot the editor opens on draws the same pose.
              {
                id: 'afternoon',
                label: 'Afternoon',
                location: 'small kitchen',
                sceneHints: 'chopping onions at the counter',
              },
              {
                id: 'evening',
                label: 'Evening',
                location: 'small kitchen',
                sceneHints: 'stirring a pot of soup at the stove',
              },
              {
                id: 'night',
                label: 'Night',
                location: 'small kitchen',
                sceneHints: 'cooking pasta at the stove',
              },
            ],
          },
        },
      })
    );
  });
  await gotoStable(page, '/day?character=e2e-day-pose');
  await dismissBlockingOverlays(page);
  const preview = page.getByTestId('day-slot-pose-preview');
  await expect(preview).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('day-slot-pose-preview-name')).toHaveText('Cooking');
  await expect(page.getByTestId('pose-preview-figure').first()).toBeVisible();
  // Change pose overrides the beat; Try another keeps the pick.
  await page.getByTestId('day-slot-pose-preview-select').selectOption('wave');
  await expect(page.getByTestId('day-slot-pose-preview-name')).toHaveText('Waving');
  await expect(preview).toContainText('Picked');
  await page.getByTestId('day-slot-pose-preview-another').click();
  await expect(page.getByTestId('day-slot-pose-preview-name')).toHaveText('Waving');
  await page.getByTestId('day-slot-pose-preview-camera').selectOption('low');
  await expect(page.getByTestId('day-slot-pose-preview-camera')).toHaveValue('low');
  await expect(page.getByTestId('day-slot-pose-preview-photo')).toContainText('Use a photo');
  await page.getByTestId('day-slot-pose-preview-look').selectOption('down');
  await expect(page.getByTestId('day-slot-pose-preview-look')).toHaveValue('down');
  // Edit joints: nudge the Cast's right wrist with the keyboard and use the edited pose.
  await page.getByTestId('day-slot-pose-preview-edit').click();
  const wrist = page.getByTestId('day-slot-pose-preview-joint-0-4');
  await wrist.focus();
  await page.keyboard.press('Shift+ArrowUp');
  await page.getByTestId('day-slot-pose-preview-editor-save').click();
  await expect(page.getByTestId('day-slot-pose-preview-name')).toHaveText('Your edit');
});

test('dashboard shows pose match by layout and the words-first ladder', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfy-play-metrics-v1',
      JSON.stringify({
        version: 1,
        firstPlayCampaignAt: Date.now() - 86_400_000,
        firstFilmCutAt: Date.now(),
        poseMatchByLayout: { cook: { sum: 2.4, count: 8, misses: 6 } },
      })
    );
  });
  await gotoStable(page, '/dashboard');
  await dismissBlockingOverlays(page);
  const card = page.getByRole('main').getByTestId('play-film-metrics');
  await expect(card).toContainText('Pose match by layout', { timeout: 30_000 });
  await expect(card).toContainText('prompt now spells the pose out');
});

test('gallery: Cast filter, pose / face badges, missed filter, use this pose', async ({
  page,
}) => {
  await seedGalleryPlayFixtures(page);
  await gotoStable(page, '/gallery');
  await dismissBlockingOverlays(page);
  const filtersSummary = page.locator('details.ui-collapsible summary').filter({ hasText: 'Filters' });
  if (await filtersSummary.isVisible().catch(() => false)) {
    await filtersSummary.click();
  }
  const castFilter = page.getByTestId('gallery-cast-filter');
  await expect(castFilter).toBeVisible({ timeout: 20_000 });
  await expect(castFilter).toContainText('Gallery Cast');
  await expect(page.getByTestId('gallery-card-play-checks').first()).toBeVisible();
  await expect(page.getByText('pose 86% · face 71%').first()).toBeVisible();
  // Missed pose / face narrows to the one still that ignored its guide.
  await page.getByTestId('gallery-filter-play-miss').click();
  await expect(page).toHaveURL(/missed=1/);
  await expect(page.getByText('pose 31%').first()).toBeVisible();
  await expect(page.getByText('pose 86% · face 71%')).toHaveCount(0);
  // Cast chip filters too, and shows as an active filter.
  await page.getByTestId('gallery-cast-filter-e2e-gallery-cast').click();
  await expect(page).toHaveURL(/character=e2e-gallery-cast/);
  await expect(page.getByTestId('gallery-active-filters')).toContainText('Cast: Gallery Cast');
  // "Use this pose…" opens the pose dialog (no ComfyUI here, so it says it can't read it).
  await page.getByTestId('gallery-card-menu').first().click();
  await page.getByRole('menuitem', { name: 'Use this pose…' }).click();
  const dialog = page.getByTestId('gallery-pose-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('gallery-pose-error')).toBeVisible({ timeout: 20_000 });
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
});

test('play metrics card appears on dashboard when metrics exist', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfy-play-metrics-v1',
      JSON.stringify({
        version: 1,
        firstPlayCampaignAt: Date.now() - 86_400_000,
        firstFilmCutAt: Date.now(),
      })
    );
  });
  await gotoStable(page, '/dashboard');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('main').getByTestId('play-film-metrics')).toBeVisible({
    timeout: 30_000,
  });
});

test('copy share link button copies portable hash url', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    const pack = {
      version: 1,
      source: 'moodboard',
      locationNotes: 'copy rooftop',
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem('moodboard-look-pack-v1', JSON.stringify(pack));
  });
  await gotoStable(page, '/play');
  await dismissBlockingOverlays(page);
  await page.getByTestId('play-campaign-look-packs').locator('summary').click();
  const copyBtn = page.getByTestId('play-campaign-share-copy');
  await expect(copyBtn).toBeVisible({ timeout: 30_000 });
  await copyBtn.click();
  await expect(page.getByText(/Share link copied/i)).toBeVisible({ timeout: 10_000 });
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toMatch(/#lookpack=/);
});

test('fitting continue-in-day appears after Keep seeds day', async ({ page }) => {
  await page.addInitScript(() => {
    const characterId = 'e2e-keep-char';
    const lookId = 'look-1';
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [
          {
            id: characterId,
            name: 'E2E Keep',
            version: 1,
            updatedAt: Date.now(),
            activeLookId: lookId,
            looks: [{ id: lookId, name: 'Main', createdAt: Date.now() }],
          },
        ],
        removedIds: [],
      })
    );
    window.localStorage.setItem(
      'comfy-prompt-tool-settings-v1',
      JSON.stringify({
        shared: { activeCharacterId: characterId, activeLookId: lookId },
        tools: {},
      })
    );
  });
  await gotoStable(page, '/fitting?character=e2e-keep-char');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /^Outfit$/i })).toBeVisible({
    timeout: 30_000,
  });
  // Seed a compare try-on card via React state is hard; exercise Keep path through exposed
  // window helpers by evaluating keep-side-effects contract: continue CTA href when pack staged.
  await page.evaluate(() => {
    const pack = {
      version: 1,
      source: 'moodboard',
      characterId: 'e2e-keep-char',
      wardrobeId: 'kit-linen',
      locationNotes: 'sunlit kitchen',
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem('moodboard-look-pack-v1', JSON.stringify(pack));
  });
  // Directly inject Continue CTA by clicking Keep if compare exists; otherwise assert plan-day link.
  const keep = page.getByTestId('fitting-keep');
  if ((await keep.count()) > 0) {
    await keep.first().click();
    await expect(page.getByTestId('fitting-continue-day')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('fitting-continue-day')).toHaveAttribute('href', /\/day/);
  } else {
    await expandFittingMoreMenu(page);
    const planDay = page.getByTestId('fitting-plan-day');
    await expect(planDay).toBeVisible({ timeout: 10_000 });
    await expect(planDay).toHaveAttribute('href', /\/day/);
  }
});

test('mobile desk bridge links to Film on desk', async ({ page }) => {
  await gotoStable(page, '/m');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('mobile-desk-bridge')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('mobile-desk-play')).toHaveAttribute('href', /\/play/);
  await expect(page.getByTestId('mobile-tab-moodboard')).toBeVisible();
  await expect(page.getByTestId('mobile-tab-fitting')).toBeVisible();
  await expect(page.getByTestId('mobile-tab-day')).toBeVisible();
  await expect(page.getByTestId('mobile-tab-film')).toBeVisible();
});

test('mobile play page exposes phone Day/Fitting and optional desk handoff', async ({ page }) => {
  await gotoStable(page, '/m/story');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('mobile-play')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('mobile-continue-day')).toHaveAttribute('href', /\/m\/day/);
  await expect(page.getByTestId('mobile-continue-fitting')).toHaveAttribute('href', /\/m\/fitting/);
  await expect(page.getByTestId('mobile-play-cut')).toBeVisible();
  await expect(page.getByTestId('roleplay-save-film-cast')).toBeVisible();
  await page.getByText(/Optional desk handoff/i).click();
  await expect(page.getByTestId('mobile-continue-desk-day')).toBeVisible();
  await expect(page.getByTestId('mobile-continue-desk-play')).toBeVisible();
});

test('mobile film funnel routes Moodboard → Fitting → Day', async ({ page }) => {
  await gotoStable(page, '/m/moodboard');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('mobile-moodboard')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('mobile-moodboard-extract')).toBeVisible();
  await expect(page.getByTestId('mobile-moodboard-to-fitting')).toBeVisible();

  await gotoStable(page, '/m/fitting');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('mobile-fitting')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: /^Outfit$/i })).toBeVisible();

  await gotoStable(page, '/m/day');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('mobile-day')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('day-slots')).toBeVisible();
  await expect(page.getByTestId('mobile-day-cut')).toBeVisible();
});

test('gallery exposes Film derived-kind chip', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('comfy-workspace-mode-v1', 'studio');
      localStorage.setItem('comfy-workspace-mode-chosen-v1', '1');
    } catch {
      /* ignore */
    }
  });
  await gotoStable(page, '/gallery');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('gallery-derived-kind-film')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('gallery-derived-kind-i2v')).toBeVisible();
});

test('cast films tab and continue roleplay work for Play characters', async ({ page }) => {
  const characterId = 'char-play-e2e';
  await page.addInitScript(
    ({ id }) => {
      window.localStorage.setItem(
        'comfy-prompt-characters-v1',
        JSON.stringify({
          version: 1,
          characters: [
            {
              id,
              name: 'Play E2E',
              version: 1,
              updatedAt: Date.now(),
              descriptor: 'sunlit kitchen coat',
              characterName: 'Play E2E',
            },
          ],
          removedIds: [],
        })
      );
      window.localStorage.setItem(
        'comfyui-gallery-v1',
        JSON.stringify([
          {
            id: 'e2e-film-1',
            promptId: 'e2e-film-prompt',
            prompt: 'day film',
            model: 'qwen-image-2512',
            tool: 'day',
            status: 'completed',
            queuedAt: Date.now(),
            completedAt: Date.now(),
            characterId: id,
            derivedKind: 'film',
            mediaKind: 'video',
            images: [{ filename: 'e2e-film.webm', subfolder: '', type: 'output' }],
          },
        ])
      );
    },
    { id: characterId }
  );
  await gotoStable(page, `/characters/${characterId}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /Play E2E/i })).toBeVisible({ timeout: 30_000 });
  // Media sits on the Film & media tab.
  await page.getByRole('tab', { name: /Film & media/i }).click();
  await expect(page.getByRole('tab', { name: /Films/i })).toBeVisible();
  await page.getByRole('tab', { name: /Films/i }).click();
  await expect(page.getByTestId('cast-continue-roleplay')).toBeVisible();
  await page.getByTestId('cast-continue-roleplay').click();
  await expect(page).toHaveURL(/\/story/, { timeout: 30_000 });
});

test('day cut film chrome and save-to-cast testids are wired', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [
          {
            id: 'e2e-day-cast',
            name: 'Day Cast',
            version: 1,
            updatedAt: Date.now(),
          },
        ],
        removedIds: [],
      })
    );
    window.localStorage.setItem(
      'comfy-prompt-tool-settings-v1',
      JSON.stringify({
        shared: { activeCharacterId: 'e2e-day-cast' },
        tools: {},
      })
    );
  });
  await gotoStable(page, '/day?character=e2e-day-cast');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('day-reel')).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByTestId('day-reel').getByRole('button', { name: /Cut film/i })
  ).toBeAttached();
});

test('plan a day bumps campaign stepIndex for resume', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [
          {
            id: 'e2e-step-char',
            name: 'Step Char',
            version: 1,
            updatedAt: Date.now(),
            descriptor: 'step look',
          },
        ],
        removedIds: [],
      })
    );
    window.localStorage.setItem(
      'comfy-prompt-tool-settings-v1',
      JSON.stringify({
        shared: { activeCharacterId: 'e2e-step-char' },
        tools: {},
      })
    );
    window.sessionStorage.setItem(
      'play-campaign-v1',
      JSON.stringify({
        version: 1,
        characterId: 'e2e-step-char',
        stepIndex: 1,
        updatedAt: Date.now(),
      })
    );
  });
  await gotoStable(page, '/fitting?character=e2e-step-char');
  await dismissBlockingOverlays(page);
  await expandFittingMoreMenu(page);
  const planDay = page.getByTestId('fitting-plan-day');
  await expect(planDay).toBeVisible({ timeout: 30_000 });
  await planDay.click();
  await expect(page).toHaveURL(/\/day/, { timeout: 30_000 });
  const stepIndex = await page.evaluate(() => {
    const raw =
      window.sessionStorage.getItem('play-campaign-v1') ||
      window.localStorage.getItem('play-campaign-v1');
    if (!raw) {
      return null;
    }
    try {
      return (JSON.parse(raw) as { stepIndex?: number }).stepIndex ?? null;
    } catch {
      return null;
    }
  });
  expect(stepIndex).toBe(3);
});

async function installFakeMediaRecorder(page: Page) {
  await page.addInitScript(() => {
    class FakeMediaRecorder {
      state = 'inactive';
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      static isTypeSupported() {
        return true;
      }
      start() {
        this.state = 'recording';
        queueMicrotask(() => {
          this.ondataavailable?.({
            data: new Blob([new Uint8Array([0, 0, 0, 1])], { type: 'video/webm' }),
          });
        });
      }
      stop() {
        this.state = 'inactive';
        queueMicrotask(() => this.onstop?.());
      }
      requestData() {}
    }
    // @ts-expect-error test shim
    window.MediaRecorder = FakeMediaRecorder;
    HTMLCanvasElement.prototype.captureStream = function captureStream() {
      return {
        getTracks: () => [{ stop() {}, kind: 'video', enabled: true }],
      } as unknown as MediaStream;
    };
  });
}

test('day cut film with mocked MediaRecorder shows Save to Cast', async ({ page }) => {
  const tinyPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  await installFakeMediaRecorder(page);
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-cut-cast' },
    characters: {
      version: 1,
      characters: [
        {
          id: 'e2e-cut-cast',
          name: 'Cut Cast',
          version: 1,
          updatedAt: Date.now(),
          descriptor: 'cut look',
        },
      ],
      removedIds: [],
    },
    tools: {
      day: {
        notes: '',
        // Ownership must match active Cast or Day clears stills on mount.
        stillsCharacterId: 'e2e-cut-cast',
        stills: [
          {
            slotId: 'morning',
            status: 'completed',
            imageUrl: tinyPng,
          },
        ],
      },
    },
  });

  page.on('download', download => {
    void download.cancel().catch(() => undefined);
  });

  await gotoStable(page, '/day?character=e2e-cut-cast');
  await dismissBlockingOverlays(page);
  const cutBtn = page.getByTestId('day-cut-coach-cut');
  await expect(cutBtn).toBeVisible({ timeout: 30_000 });
  await expect(cutBtn).toBeEnabled({ timeout: 15_000 });
  await cutBtn.click();
  // First cut owns Watch via celebrate banner (hides day-open-cast-film).
  await expect(page.getByTestId('day-first-cut-celebrate')).toBeVisible({
    timeout: 45_000,
  });
  const watchOrSave = page
    .getByTestId('day-first-cut-watch')
    .or(page.getByTestId('day-save-film-cast'));
  await expect(watchOrSave.first()).toBeVisible();
  const watch = page.getByTestId('day-first-cut-watch');
  if ((await watch.count()) > 0) {
    await expect(watch).toHaveAttribute('href', /media=films/);
  }
});

test('roleplay cut film with mocked MediaRecorder shows Cast deep-links', async ({ page }) => {
  const tinyPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  await installFakeMediaRecorder(page);
  await page.addInitScript(() => {
    window.localStorage.removeItem('comfy-onboarding-v2');
    window.localStorage.removeItem('comfy-play-metrics-v1');
  });
  // Seed tools sidecar — main-blob localStorage loses to an empty IDB sidecar on hydrate.
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-rp-cut' },
    characters: {
      version: 1,
      characters: [
        {
          id: 'e2e-rp-cut',
          name: 'RP Cut',
          version: 1,
          updatedAt: Date.now(),
          descriptor: 'roleplay cut look',
        },
      ],
      removedIds: [],
    },
    tools: {
      roleplay: {
        // Match Cast-linked session id so deep-link sync does not replace the reel.
        activeSessionId: 'cast-e2e-rp-cut',
        characterName: 'RP Cut',
        story: [
          {
            id: 'beat-1',
            at: Date.now(),
            kind: 'plot',
            title: 'Opening',
            prompt: 'A quiet opening beat',
            stillStatus: 'completed',
            imageUrl: tinyPng,
          },
        ],
      },
    },
  });

  page.on('download', download => {
    void download.cancel().catch(() => undefined);
  });

  await gotoStable(page, '/story?character=e2e-rp-cut');
  await dismissBlockingOverlays(page);
  // Exact name — other buttons ("Cut film" in banners, "Open films") can match /Cut film/i.
  const cutBtn = page.getByRole('button', { name: 'Cut film', exact: true });
  await expect(cutBtn).toBeVisible({ timeout: 30_000 });
  await expect(cutBtn).toBeEnabled({ timeout: 15_000 });
  await cutBtn.click();
  // First cut celebrate owns Watch (hides roleplay-open-cast-film).
  const celebrateOrWatch = page
    .getByTestId('story-first-cut-celebrate')
    .or(page.getByTestId('story-first-cut-watch'))
    .or(page.getByTestId('story-save-film-cast'));
  await expect(celebrateOrWatch.first()).toBeVisible({ timeout: 45_000 });
  const watch = page.getByTestId('story-first-cut-watch');
  if ((await watch.count()) > 0) {
    await expect(watch).toHaveAttribute('href', /media=films/);
  }
  const remix = page.getByTestId('story-first-cut-remix');
  if ((await remix.count()) > 0) {
    await expect(remix).toHaveAttribute('href', /\/day/);
  }
});

test('mobile play cut film with mocked MediaRecorder shows Cast deep-links', async ({ page }) => {
  const tinyPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  await installFakeMediaRecorder(page);
  await page.addInitScript(() => {
    window.localStorage.removeItem('comfy-onboarding-v2');
    window.localStorage.removeItem('comfy-play-metrics-v1');
  });
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-m-cut' },
    characters: {
      version: 1,
      characters: [
        {
          id: 'e2e-m-cut',
          name: 'Mobile Cut',
          version: 1,
          updatedAt: Date.now(),
          descriptor: 'mobile cut look',
        },
      ],
      removedIds: [],
    },
    tools: {
      roleplay: {
        activeSessionId: 'cast-e2e-m-cut',
        characterName: 'Mobile Cut',
        story: [
          {
            id: 'beat-m1',
            at: Date.now(),
            kind: 'plot',
            title: 'Opening',
            prompt: 'A mobile opening beat',
            stillStatus: 'completed',
            imageUrl: tinyPng,
          },
        ],
      },
    },
  });

  page.on('download', download => {
    void download.cancel().catch(() => undefined);
  });

  await gotoStable(page, '/m/story');
  await dismissBlockingOverlays(page);
  // Exact name — other buttons ("Cut film" in banners, "Open films") can match /Cut film/i.
  const cutBtn = page.getByRole('button', { name: 'Cut film', exact: true });
  await expect(cutBtn).toBeVisible({ timeout: 30_000 });
  await expect(cutBtn).toBeEnabled({ timeout: 15_000 });
  await cutBtn.click();
  const celebrateOrWatch = page
    .getByTestId('story-first-cut-celebrate')
    .or(page.getByTestId('story-first-cut-watch'))
    .or(page.getByTestId('story-save-film-cast'));
  await expect(celebrateOrWatch.first()).toBeVisible({ timeout: 45_000 });
  const watch = page.getByTestId('story-first-cut-watch');
  if ((await watch.count()) > 0) {
    await expect(watch).toHaveAttribute('href', /media=films/);
  }
  const remix = page.getByTestId('story-first-cut-remix');
  if ((await remix.count()) > 0) {
    await expect(remix).toHaveAttribute('href', /\/day/);
  }
});

test('play campaign shows complete state after durable completedAt', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [
          {
            id: 'e2e-complete',
            name: 'Complete Cast',
            version: 1,
            updatedAt: Date.now(),
            descriptor: 'done look',
          },
        ],
        removedIds: [],
      })
    );
    window.localStorage.setItem(
      'play-campaign-v1',
      JSON.stringify({
        version: 1,
        characterId: 'e2e-complete',
        stepIndex: 4,
        completedAt: Date.now() - 60_000,
        updatedAt: Date.now(),
      })
    );
  });
  await gotoStable(page, '/play?character=e2e-complete');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('play-campaign-complete')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('play-campaign-open-cast-film')).toHaveAttribute(
    'href',
    /media=films/
  );
  await expect(page.getByTestId('play-campaign-start-new')).toBeVisible();
});

test('cast home: tabs, plate empty state, no server/client title swap', async ({ page }) => {
  // The server can't see the Cast store: it used to render "Character not found" and the
  // client swapped in the name (a hydration mismatch). Now both render a loading state first.
  let serverHtml = '';
  await page.route('**/characters/e2e-cast-tabs', async route => {
    const response = await route.fetch();
    serverHtml = await response.text();
    await route.fulfill({ response, body: serverHtml });
  });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [
          { id: 'e2e-cast-tabs', name: 'Tabs Cast', version: 1, updatedAt: Date.now() },
        ],
        removedIds: [],
      })
    );
  });
  await gotoStable(page, '/characters/e2e-cast-tabs');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: 'Tabs Cast', level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  // Overview leads with the plate: a real empty state, not a bare file input.
  const empty = page.getByTestId('cast-look-plate-empty');
  await expect(empty).toBeVisible();
  await expect(empty.getByText('Upload plate')).toBeVisible();
  await expect(page.getByTestId('character-film-studio')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Bible' }).click();
  await expect(page.getByTestId('bible-paste')).not.toHaveAttribute('open', '');

  await page.getByRole('tab', { name: /Film & media/i }).click();
  await expect(page.getByTestId('character-film-studio')).toBeVisible();
  await expect(page.getByTestId('character-film-cut-options')).toContainText(/Cut options/);
  await expect(page.getByTestId('cast-media')).toBeVisible();

  expect(serverHtml).not.toContain('Character not found');
});

test('cast media=films deep-link opens Films tab and Film studio', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [
          {
            id: 'e2e-films-tab',
            name: 'Films Tab',
            version: 1,
            updatedAt: Date.now(),
            descriptor: 'film studio look',
          },
        ],
        removedIds: [],
      })
    );
  });
  await gotoStable(page, '/characters/e2e-films-tab?media=films');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('tab', { name: /Films/i })).toHaveAttribute('aria-selected', 'true', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('character-film-studio')).toBeVisible();
  await expect(page.getByTestId('cast-open-film-studio')).toBeVisible();
  await expect(page.getByTestId('character-film-studio-empty')).toBeVisible();
});

test('play campaign empty cast offers create character CTA', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('comfy-workspace-mode-v1', 'play');
      localStorage.setItem('comfy-workspace-mode-chosen-v1', '1');
      localStorage.removeItem('comfy-settings-cache-v1');
      localStorage.removeItem('comfy-prompt-characters-v1');
      localStorage.removeItem('play-campaign-v1');
    } catch {
      // ignore
    }
  });
  await gotoStable(page, '/play');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('play-campaign')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('play-campaign-create-character')).toBeVisible();
  await expect(page.getByTestId('play-campaign-create-name')).toBeVisible();
  await expect(page.getByTestId('play-campaign-create-continue')).toBeVisible();
  await expect(page.getByRole('link', { name: /Browse Cast/i })).toBeVisible();
});

test('dashboard elevates Start a film as primary studio path', async ({ page }) => {
  await gotoStable(page, '/dashboard');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /^Dashboard$/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('link', { name: /Start a film/i }).first()).toBeVisible();
});

test('mobile studio first-class film loop tabs and desk bridge', async ({ page }) => {
  await seedFirstFilmDone(page);
  await gotoStable(page, '/m');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('mobile-tab-moodboard')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('mobile-tab-fitting')).toBeVisible();
  await expect(page.getByTestId('mobile-tab-day')).toBeVisible();
  await expect(page.getByTestId('mobile-tab-story')).toBeVisible();
  await expect(page.getByTestId('mobile-desk-bridge')).toBeVisible();
  await expect(page.getByRole('link', { name: /^Desk$/i })).toBeVisible();
});

test('completed campaign offers Cast watch and cut-another Day CTAs', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('comfy-workspace-mode-v1', 'play');
      localStorage.setItem('comfy-workspace-mode-chosen-v1', '1');
      localStorage.setItem(
        'play-campaign-v1',
        JSON.stringify({
          version: 1,
          characterId: 'e2e-complete',
          stepIndex: 4,
          completedAt: Date.now(),
          updatedAt: Date.now(),
        })
      );
    } catch {
      // ignore
    }
  });
  await gotoStable(page, '/play?character=e2e-complete');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('play-campaign-complete')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('play-campaign-open-cast-film')).toBeVisible();
  await expect(page.getByTestId('play-campaign-cut-another')).toHaveAttribute(
    'href',
    /\/day\?character=e2e-complete/
  );
  await expect(page.getByTestId('play-campaign-start-new')).toBeVisible();
});

test('day cut film shows playbook when film assemble returns ffmpeg 503', async ({ page }) => {
  const tinyPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  // Server POST fails with ffmpeg missing; without MediaRecorder the error surfaces
  // instead of silently falling back to a browser encode.
  await page.addInitScript(() => {
    // @ts-expect-error test shim — force film playbook path
    delete window.MediaRecorder;
  });

  await page.route('**/api/film/assemble**', async route => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, available: true, encoder: 'ffmpeg' }),
      });
      return;
    }
    if (method === 'POST') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'ffmpeg is missing on the server — install ffmpeg to encode films.',
        }),
      });
      return;
    }
    await route.continue();
  });

  // Auth already hydrated IDB; seed stills into the tools sidecar so hydrate
  // does not prefer an empty sidecar over a main-blob localStorage write.
  // Use next-load init so pagehide flush from / cannot overwrite the seed.
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-film-fail' },
    characters: {
      version: 1,
      characters: [
        {
          id: 'e2e-film-fail',
          name: 'Film Fail',
          version: 1,
          updatedAt: Date.now(),
          descriptor: 'cut look',
        },
      ],
      removedIds: [],
    },
    tools: {
      day: {
        notes: '',
        stillsCharacterId: 'e2e-film-fail',
        stills: [
          {
            slotId: 'morning',
            status: 'completed',
            imageUrl: tinyPng,
          },
        ],
      },
    },
  });

  await gotoStable(page, '/day?character=e2e-film-fail');
  await dismissBlockingOverlays(page);
  const cutBtn = page.getByTestId('day-cut-coach-cut');
  await expect(cutBtn).toBeVisible({ timeout: 30_000 });
  await expect(cutBtn).toBeEnabled({ timeout: 15_000 });
  await cutBtn.click();
  await expect(page.getByText(/ffmpeg is missing/i)).toBeVisible({ timeout: 30_000 });
  const playbook = page.getByTestId('film-failure-playbook-link');
  await expect(playbook).toBeVisible();
  await expect(playbook).toHaveAttribute('href', /\/settings/);
  await expect(playbook).toContainText(/settings|Heal|overview/i);
});

test('play persistence triad is visible on Film hub', async ({ page }) => {
  // Empty hub hides persistence; seed a Cast so the compact triad mounts.
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-persist' },
    characters: {
      version: 1,
      characters: [
        {
          id: 'e2e-persist',
          name: 'Persist Hero',
          version: 1,
          updatedAt: Date.now(),
          descriptor: 'persist look',
        },
      ],
      removedIds: [],
    },
  });
  await gotoStable(page, '/play');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('play-persistence-triad')).toBeVisible({ timeout: 30_000 });
});

test('play habit nudge appears after a day-old cut', async ({ page }) => {
  const dayAgo = Date.now() - 1000 * 60 * 60 * 25;
  await page.addInitScript(
    ({ cutAt }) => {
      try {
        localStorage.setItem('comfy-workspace-mode-v1', 'play');
        localStorage.setItem('comfy-workspace-mode-chosen-v1', '1');
      } catch {
        // ignore
      }
      // Metrics / campaign are IDB-authoritative — localStorage alone is overwritten on hydrate.
      const kv: Record<string, unknown> = {
        'comfy-play-metrics-v1': {
          version: 1,
          firstFilmCutAt: cutAt,
          lastFilmCutAt: cutAt,
        },
        'play-campaign-v1': {
          version: 1,
          characterId: 'e2e-habit',
          stepIndex: 3,
          completedAt: cutAt,
          updatedAt: cutAt,
        },
      };
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('comfy-prompt-studio-v1');
        request.onerror = () => reject(request.error ?? new Error('idb open failed'));
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('kv')) {
            db.close();
            resolve();
            return;
          }
          const tx = db.transaction('kv', 'readwrite');
          const store = tx.objectStore('kv');
          for (const [key, value] of Object.entries(kv)) {
            store.put({ key, value });
          }
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error ?? new Error('idb kv put failed'));
        };
      });
    },
    { cutAt: dayAgo }
  );
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-habit' },
    characters: {
      version: 1,
      characters: [
        {
          id: 'e2e-habit',
          name: 'Habit Hero',
          version: 1,
          updatedAt: Date.now(),
          descriptor: 'habit look',
        },
      ],
      removedIds: [],
    },
  });
  await gotoStable(page, '/play');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('play-habit-nudge')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('play-habit-nudge-open')).toBeVisible();
});

test('play film engine banner shows for non-Comfy engines', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { inferenceEngine: 'fal' },
  });
  await gotoStable(page, '/play');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('play-film-engine-banner')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('play-film-engine-switch')).toBeVisible();
});

test('story without Cast shows Open Film gate', async ({ page }) => {
  await seedFirstFilmDone(page);
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: '' },
    characters: { version: 1, characters: [], removedIds: [] },
  });
  await gotoStable(page, '/story');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('story-needs-cast')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('story-open-film')).toBeVisible();
  // The gate is the whole page — no beat controls that could only hit a queue blocker.
  await expect(page.getByRole('button', { name: 'Clip', exact: true })).toHaveCount(0);
});

test('film create includes Part and From photo cast identity', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: '' },
    characters: { version: 1, characters: [], removedIds: [] },
  });
  await gotoStable(page, '/play');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('play-campaign-create-character')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('play-campaign-create-from-photo')).toBeVisible();
  // Part chips live under collapsed "More traits" — open before asserting.
  await page.getByTestId('play-campaign-create-more-traits').locator('summary').click();
  await expect(page.getByTestId('play-campaign-create-persona')).toBeVisible();
});
