import type { Page } from '@playwright/test';
import { replaceGalleryIdb } from './idb';

const FIXTURE = {
  id: 'e2e-gallery-fixture',
  promptId: 'e2e-prompt',
  prompt: 'e2e gallery fixture',
  model: 'qwen-image-2512',
  tool: 'topics',
  comfyUrl: 'http://127.0.0.1:8188',
  status: 'completed',
  queuedAt: Date.now(),
  completedAt: Date.now(),
  images: [{ filename: 'e2e-fixture.png', subfolder: '', type: 'output' }],
};

const FIXTURE_B = {
  ...FIXTURE,
  id: 'e2e-gallery-fixture-b',
  promptId: 'e2e-prompt-b',
  prompt: 'e2e gallery fixture b',
  queuedAt: Date.now() - 1_000,
  completedAt: Date.now() - 1_000,
  images: [{ filename: 'e2e-fixture-b.png', subfolder: '', type: 'output' }],
  reviewNote: 'keeper candidate',
};

/** Ensure Studio workspace so advanced Filters / layout chips render (hidden in Simple). */
export async function ensureStudioWorkspace(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('comfy-workspace-mode-v1', 'studio');
      localStorage.setItem('comfy-workspace-mode-chosen-v1', '1');
    } catch {
      // ignore quota / private mode
    }
  });
  await page.evaluate(() => {
    try {
      localStorage.setItem('comfy-workspace-mode-v1', 'studio');
      localStorage.setItem('comfy-workspace-mode-chosen-v1', '1');
    } catch {
      // ignore
    }
  });
}

/** Seed one completed gallery entry so selection-bar e2e can run on empty CI stores. */
export async function seedGalleryFixture(page: Page): Promise<void> {
  await ensureStudioWorkspace(page);
  await page.addInitScript(entry => {
    try {
      localStorage.setItem('comfyui-gallery-v1', JSON.stringify([entry]));
    } catch {
      // ignore quota / private mode
    }
  }, FIXTURE);

  // Current document (after auth) also needs the fixture before navigating to gallery.
  await page.evaluate(entry => {
    try {
      localStorage.setItem('comfyui-gallery-v1', JSON.stringify([entry]));
      window.dispatchEvent(new Event('comfyui-gallery-updated'));
    } catch {
      // ignore
    }
  }, FIXTURE);
}

/** Seed two entries for lightbox next/prev + review-note badge coverage. */
export async function seedGalleryLightboxFixtures(page: Page): Promise<void> {
  await ensureStudioWorkspace(page);
  const entries = [FIXTURE, FIXTURE_B];
  await page.addInitScript(items => {
    try {
      localStorage.setItem('comfyui-gallery-v1', JSON.stringify(items));
    } catch {
      // ignore
    }
  }, entries);
  await page.evaluate(items => {
    try {
      localStorage.setItem('comfyui-gallery-v1', JSON.stringify(items));
      window.dispatchEvent(new Event('comfyui-gallery-updated'));
    } catch {
      // ignore
    }
  }, entries);
}

const FAILED_FIXTURE = {
  id: 'e2e-gallery-failed',
  promptId: 'e2e-prompt-failed',
  prompt: 'e2e failed job fixture',
  model: 'qwen-image-2512',
  tool: 'generate',
  comfyUrl: 'http://127.0.0.1:8188',
  status: 'error',
  statusMessage: 'Workflow node type “FaceDetailer” is not installed in ComfyUI',
  queuedAt: Date.now(),
  images: [] as { filename: string; subfolder: string; type: string }[],
};

/** Seed a failed gallery entry so recovery / one-click fix chrome can render. */
export async function seedFailedGalleryFixture(
  page: Page,
  overrides?: Partial<typeof FAILED_FIXTURE>
): Promise<void> {
  await ensureStudioWorkspace(page);
  const entry = {
    ...FAILED_FIXTURE,
    ...overrides,
    id: overrides?.id ?? `e2e-gallery-failed-${Date.now()}`,
    promptId: overrides?.promptId ?? `e2e-prompt-failed-${Date.now()}`,
  };
  // Open the app first so Dexie creates object stores, then replace gallery rows.
  if (!page.url().includes('127.0.0.1') && !page.url().includes('localhost')) {
    await page.goto('/');
  }
  await replaceGalleryIdb(page, [entry]);
}

/** Two Day stills of one Cast with Play checks (one missed its pose), plus that Cast. */
export async function seedGalleryPlayFixtures(page: Page): Promise<void> {
  await ensureStudioWorkspace(page);
  const now = Date.now();
  const entries = [
    {
      ...FIXTURE,
      id: 'e2e-play-kept',
      promptId: 'e2e-play-kept',
      prompt: 'e2e play kept still',
      tool: 'day',
      characterId: 'e2e-gallery-cast',
      queuedAt: now,
      completedAt: now,
      playChecks: { pose: 0.86, face: 0.71, at: now },
    },
    {
      ...FIXTURE,
      id: 'e2e-play-missed',
      promptId: 'e2e-play-missed',
      prompt: 'e2e play missed still',
      tool: 'day',
      characterId: 'e2e-gallery-cast',
      queuedAt: now - 1_000,
      completedAt: now - 1_000,
      images: [{ filename: 'e2e-play-missed.png', subfolder: '', type: 'output' }],
      playChecks: { pose: 0.31, poseMiss: true, at: now },
    },
  ];
  const cast = {
    version: 1,
    characters: [{ id: 'e2e-gallery-cast', name: 'Gallery Cast', version: 1, updatedAt: now }],
    removedIds: [],
  };
  const seed = ({ items, characters }: { items: unknown[]; characters: unknown }) => {
    try {
      localStorage.setItem('comfyui-gallery-v1', JSON.stringify(items));
      localStorage.setItem('comfy-prompt-characters-v1', JSON.stringify(characters));
      window.dispatchEvent(new Event('comfyui-gallery-updated'));
    } catch {
      // ignore
    }
  };
  await page.addInitScript(seed, { items: entries, characters: cast });
  await page.evaluate(seed, { items: entries, characters: cast });
}
