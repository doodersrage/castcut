import { test, expect, type Page } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable, revealFullSettings } from './helpers/navigation';

test.beforeEach(async ({ page }) => {
  await ensureAuthenticated(page);
});

const SYSTEM = {
  os: 'linux',
  comfyuiVersion: '0.37.0',
  pythonVersion: '3.14.7',
  embeddedPython: false,
  deployEnvironment: 'local-git',
  argv: ['/opt/comfyui/main.py', '--listen', '127.0.0.1'],
};

/**
 * The card reads /api/comfyui/castcut-nodes, which the server builds from ComfyUI's object_info
 * (one entry per pack node), /system_stats, /queue and the Manager's version. Mocked here with
 * what that object_info yields: nothing (missing) or entries carrying "[castcut-nodes 1.1.0]".
 */
async function mockReport(page: Page, report: Record<string, unknown>) {
  await page.route('**/api/comfyui/castcut-nodes**', async route => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: report });
  });
}

async function openCard(page: Page) {
  await gotoStable(page, '/settings?tab=comfyui&section=castcut-nodes');
  await revealFullSettings(page);
  const card = page.getByTestId('castcut-nodes-card');
  await expect(card).toBeVisible({ timeout: 45_000 });
  return card;
}

test('Castcut nodes card: missing pack with ComfyUI-Manager offers the Manager install', async ({
  page,
}) => {
  await mockReport(page, {
    reachable: true,
    status: {
      state: 'missing',
      installedVersion: null,
      bundledVersion: '1.1.0',
      missingNodes: ['CastcutPoseScore', 'CastcutPickBest', 'CastcutFaceDistance', 'CastcutMaskRepair', 'CastcutReport'],
      installedAs: null,
    },
    manager: { version: 'V3.41', api: 'v1' },
    queue: { running: 0, pending: 0 },
    system: SYSTEM,
    needsAuth: false,
  });
  const card = await openCard(page);
  await expect(card.getByTestId('castcut-nodes-state')).toHaveAttribute('data-state', 'missing');
  await expect(card.getByRole('button', { name: 'Install with ComfyUI-Manager' })).toBeVisible();
  // The copy commands stay one click away, folded.
  await expect(card.getByTestId('castcut-nodes-copy')).not.toHaveAttribute('open', '');
});

test('Castcut nodes card: no Manager shows the copy command for this ComfyUI', async ({ page }) => {
  await mockReport(page, {
    reachable: true,
    status: {
      state: 'missing',
      installedVersion: null,
      bundledVersion: '1.1.0',
      missingNodes: [],
      installedAs: null,
    },
    manager: null,
    queue: { running: 0, pending: 0 },
    system: SYSTEM,
    needsAuth: false,
  });
  const card = await openCard(page);
  await expect(card.getByRole('button', { name: /ComfyUI-Manager/ })).toHaveCount(0);
  const curl = card.getByTestId('castcut-nodes-command-curl');
  await expect(curl).toBeVisible();
  await expect(curl.locator('pre')).toContainText('/api/castcut-nodes/file');
  await expect(curl.locator('pre')).toContainText('/opt/comfyui/custom_nodes/castcut_nodes.py');
  await expect(curl.locator('pre')).toContainText('sudo install -m 644');
  await expect(card.getByRole('link', { name: /download castcut_nodes\.py/i })).toBeVisible();
});

test('Castcut nodes card: installed pack shows its version and no install action', async ({
  page,
}) => {
  await mockReport(page, {
    reachable: true,
    status: {
      state: 'current',
      installedVersion: '1.1.0',
      bundledVersion: '1.1.0',
      missingNodes: [],
      installedAs: 'file',
    },
    manager: { version: 'V3.41', api: 'v1' },
    queue: { running: 1, pending: 0 },
    system: SYSTEM,
    needsAuth: false,
  });
  const card = await openCard(page);
  await expect(card.getByTestId('castcut-nodes-state')).toHaveAttribute('data-state', 'current');
  await expect(card.getByTestId('castcut-nodes-state')).toContainText('v1.1.0');
  await expect(card.getByTestId('castcut-nodes-status-line')).toContainText('up to date');
  await expect(card.getByRole('button', { name: /Install|Update/ })).toHaveCount(0);
  await expect(card.getByTestId('castcut-nodes-restart')).toHaveCount(0);
});

test('Castcut nodes card: restart waits for running jobs', async ({ page }) => {
  await mockReport(page, {
    reachable: true,
    status: {
      state: 'outdated',
      installedVersion: '1.0.0',
      bundledVersion: '1.1.0',
      missingNodes: [],
      installedAs: 'folder',
    },
    manager: { version: 'V3.41', api: 'v1' },
    queue: { running: 1, pending: 1 },
    system: SYSTEM,
    needsAuth: false,
  });
  const card = await openCard(page);
  await expect(card.getByRole('button', { name: 'Update with ComfyUI-Manager' })).toBeVisible();
  await expect(card.getByTestId('castcut-nodes-restart-open')).toHaveText('Wait for 2 jobs');
  await expect(card.getByTestId('castcut-nodes-restart-open')).toBeDisabled();
});
