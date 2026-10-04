#!/usr/bin/env node
/**
 * UI review harness: screenshots plus a DOM control inventory per page state.
 *
 * Counts the interactive elements a visitor can see (buttons, links, inputs, selects,
 * switches, radios, tabs, menu items, <summary>) on a page in a given state, splits them by
 * section, notes the ones hidden inside a closed <details>, and records the page height.
 * Optional axe (wcag2a/aa) and a Tab-walk that flags focus with no visible ring.
 *
 * Run it against an isolated production server (never the dev server, never the user's data;
 * see docs/testing). Every POST to /api/comfyui is stubbed so nothing is ever queued.
 *
 *   node scripts/ui-control-audit.mjs --base http://127.0.0.1:47980 --out tmp/ui-audit \
 *     [--login user:pass] [--axe] [--tabwalk] [--steps steps.json] [--settle 6000] \
 *     day-desk=/day day-phone=/m/day@phone day-dark=/day@dark
 *
 * A shot is `name=path` with optional `@phone` (390×844 @2x) and `@dark` flags. `--steps`
 * points at a JSON file `{ "<name>": [ {click|text|role|openDetails|scroll|y|press|fill|wait} ] }`
 * of actions to run before measuring (`click` is a test id; `role` is `[role, name]`;
 * `fill` is `[testId, value]`). Output per shot: `<name>.png` (full page), `<name>-fold.png`
 * (first screen), `<name>.json` (inventory) and a `summary.json` across shots.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const CONTROL_SELECTOR =
  'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=radio], [role=switch], [role=checkbox], [role=tab], [role=menuitem]';

/** Landmarks the inventory groups controls by (first match wins, innermost first). */
const SECTIONS = [
  '[data-testid="day-slot-sheet"]',
  '[data-testid="day-setup-sheet"]',
  '[data-testid="story-beat-sheet"]',
  '[data-testid="clothing-sheet"]',
  '[data-testid="fitting-advanced-drawer"]',
  '[data-testid="fitting-quality-bar"]',
  '[data-testid="fitting-kit-strip"]',
  '[data-testid="fitting-compare"]',
  '[data-testid="mobile-fitting-compare"]',
  '[data-testid="mobile-fitting-clothing"]',
  '[data-testid="story-wardrobe"]',
  '[data-testid="story-beat-picker"]',
  '[data-testid="story-reel"]',
  '[data-testid="day-cut-coach"]',
  '[data-testid="day-first-cut-celebrate"]',
  '[data-testid="day-plan-bar"]',
  '[data-testid="day-advanced-drawer"]',
  '[data-testid="day-mood-strip"]',
  '[data-testid="day-progress"]',
  '[data-testid="day-pose-pack"]',
  '[data-testid="day-active-plan"]',
  '[data-testid="day-slot-look"]',
  '[data-testid="day-same-seed-compare"]',
  '[data-testid="day-slot-pose"]',
  '[data-testid="day-slots"]',
  '[data-testid="day-reel"]',
  '[data-testid="day-animate"]',
  '[data-testid="day-end-pose"]',
  '[data-testid="day-character"]',
  '[data-testid="day-status-strip"]',
  '[data-testid="day-task-requirements"]',
  '[data-testid="day-animate-requirements"]',
  '[data-testid="day-get-started"]',
  '[data-testid="day-play-phases"]',
  '[data-testid="day-queue-actions"]',
  '[data-testid="mobile-day-engine"]',
  '[data-testid="day-slot-board"]',
  '[role="dialog"]',
  'aside',
  'header',
  'nav',
  'details',
  'section',
  'main',
];

function parseArgs(argv) {
  const options = {
    base: 'http://127.0.0.1:47980',
    out: 'tmp/ui-audit',
    login: '',
    axe: false,
    tabwalk: false,
    steps: '',
    settle: 6000,
    shots: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[(i += 1)];
    if (arg === '--base') options.base = next();
    else if (arg === '--out') options.out = next();
    else if (arg === '--login') options.login = next();
    else if (arg === '--steps') options.steps = next();
    else if (arg === '--settle') options.settle = Number(next());
    else if (arg === '--axe') options.axe = true;
    else if (arg === '--tabwalk') options.tabwalk = true;
    else if (arg.includes('=')) {
      // Split on the first '=' only: the path may carry a query (`/fitting?character=…`).
      const name = arg.slice(0, arg.indexOf('='));
      const rest = arg.slice(arg.indexOf('=') + 1);
      const [path, ...flags] = rest.split('@');
      options.shots.push({
        name,
        path,
        phone: flags.includes('phone'),
        dark: flags.includes('dark'),
      });
    }
  }
  return options;
}

async function contextFor(browser, options, { phone, dark }) {
  const context = await browser.newContext({
    baseURL: options.base,
    viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: phone ? 2 : 1,
    colorScheme: dark ? 'dark' : 'light',
    reducedMotion: 'reduce',
  });
  if (options.login) {
    const [username, password] = options.login.split(':');
    await context.request.post('/api/auth/login', { data: { username, password } });
  }
  // Never queue on a shared ComfyUI: every write to the proxy fails fast.
  await context.route(/\/api\/comfyui(\/|$)/, route => {
    if (route.request().method() !== 'GET') {
      return route.fulfill({ status: 503, body: 'stubbed by ui-control-audit' });
    }
    return route.continue();
  });
  return context;
}

async function inventory(page) {
  return page.evaluate(
    ({ selector, sections }) => {
      const controls = [];
      for (const element of document.querySelectorAll(selector)) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const visible =
          (rect.width > 0 && rect.height > 0) || element.classList.contains('sr-only');
        if (!visible || style.visibility === 'hidden') continue;
        const label = (
          element.getAttribute('aria-label') ||
          element.textContent ||
          element.getAttribute('placeholder') ||
          ''
        )
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 60);
        const testId = element.getAttribute('data-testid') || '';
        const closedDetails = element.closest('details:not([open])');
        if (closedDetails && element.tagName !== 'SUMMARY') {
          controls.push({
            hidden: true,
            tag: element.tagName.toLowerCase(),
            label,
            testId,
            section:
              'closed:' +
              (closedDetails.querySelector('summary')?.textContent || '')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 40),
          });
          continue;
        }
        let section = '';
        for (const candidate of sections) {
          if (element.closest(candidate)) {
            section = candidate;
            break;
          }
        }
        controls.push({
          tag: element.tagName.toLowerCase(),
          type: element.getAttribute('type') || element.getAttribute('role') || '',
          label,
          testId,
          section,
          y: Math.round(rect.top + window.scrollY),
        });
      }
      return { controls, height: document.documentElement.scrollHeight };
    },
    { selector: CONTROL_SELECTOR, sections: SECTIONS }
  );
}

async function runSteps(page, name, steps) {
  for (const step of steps) {
    try {
      if (step.click) await page.getByTestId(step.click).first().click({ timeout: 8000 });
      if (step.text)
        await page.getByText(step.text, { exact: true }).first().click({ timeout: 8000 });
      if (step.role) {
        await page
          .getByRole(step.role[0], { name: step.role[1], exact: true })
          .first()
          .click({ timeout: 8000 });
      }
      if (step.fill) await page.getByTestId(step.fill[0]).first().fill(step.fill[1]);
      if (step.openDetails) {
        await page.evaluate(text => {
          for (const details of document.querySelectorAll('details')) {
            const title = details.querySelector('summary')?.textContent || '';
            if (title.includes(text)) {
              details.open = true;
              details.scrollIntoView({ block: 'start' });
            }
          }
        }, step.openDetails);
      }
      if (step.scroll) {
        await page
          .getByTestId(step.scroll)
          .first()
          .evaluate((element, offset) => {
            window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - offset);
          }, step.offset ?? 100);
      }
      if (step.y != null) await page.evaluate(y => window.scrollTo(0, y), step.y);
      if (step.press) await page.keyboard.press(step.press);
      if (step.wait) await page.waitForTimeout(step.wait);
    } catch (error) {
      console.log(
        name,
        'STEP FAILED',
        JSON.stringify(step),
        String(error).split('\n')[0].slice(0, 160)
      );
    }
    await page.waitForTimeout(600);
  }
}

async function tabWalk(page) {
  // Start from the top of the document and Tab through the visible focus order.
  await page.evaluate(() => {
    document.activeElement instanceof HTMLElement && document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  const seen = new Set();
  const stops = [];
  for (let i = 0; i < 400; i += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) return null;
      const style = getComputedStyle(element);
      const ring =
        (style.outlineStyle !== 'none' && style.outlineWidth !== '0px') ||
        style.boxShadow !== 'none';
      const key =
        element.getAttribute('data-testid') ||
        `${element.tagName}:${(element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 40)}:${Math.round(element.getBoundingClientRect().top)}`;
      return { key, tag: element.tagName.toLowerCase(), ring };
    });
    if (!stop || seen.has(stop.key)) break;
    seen.add(stop.key);
    stops.push(stop);
  }
  return { stops: stops.length, noRing: stops.filter(stop => !stop.ring).map(stop => stop.key) };
}

async function shoot(browser, options, shot, steps) {
  const context = await contextFor(browser, options, shot);
  const page = await context.newPage();
  const errors = [];
  page.on('response', response => {
    if (response.status() >= 400 && !response.url().includes('/api/comfyui')) {
      errors.push(`${response.status()} ${response.url().slice(0, 120)}`);
    }
  });
  await page.goto(shot.path);
  await page.waitForTimeout(options.settle);
  await runSteps(page, shot.name, steps);
  await page.waitForTimeout(1200);

  const result = await inventory(page);
  result.errors = errors.slice(0, 20);
  if (options.axe) {
    try {
      const { default: AxeBuilder } = await import('@axe-core/playwright');
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      result.axe = axe.violations
        .filter(violation => violation.impact === 'critical' || violation.impact === 'serious')
        .map(violation => ({
          id: violation.id,
          impact: violation.impact,
          nodes: violation.nodes.slice(0, 5).map(node => node.target.join(' ')),
        }));
    } catch (error) {
      result.axe = [{ id: 'axe-unavailable', impact: 'n/a', nodes: [String(error).slice(0, 120)] }];
    }
  }
  if (options.tabwalk) {
    result.tabwalk = await tabWalk(page);
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(options.out, `${shot.name}-fold.png`), fullPage: false });
  // Fixed chrome below the header (phone tab bar, queue pill) would repeat down a full-page shot.
  await page.evaluate(() => {
    for (const element of document.querySelectorAll('body *')) {
      const style = getComputedStyle(element);
      if (style.position === 'fixed' && element.getBoundingClientRect().top > 80) {
        element.style.visibility = 'hidden';
      }
    }
  });
  await page.screenshot({ path: join(options.out, `${shot.name}.png`), fullPage: true });
  writeFileSync(join(options.out, `${shot.name}.json`), JSON.stringify(result, null, 1));
  await context.close();

  const shown = result.controls.filter(control => !control.hidden).length;
  const hidden = result.controls.length - shown;
  const bySection = {};
  for (const control of result.controls) {
    if (control.hidden) continue;
    bySection[control.section || '(page)'] = (bySection[control.section || '(page)'] || 0) + 1;
  }
  return {
    name: shot.name,
    path: shot.path,
    phone: shot.phone,
    dark: shot.dark,
    height: result.height,
    controls: shown,
    hidden,
    bySection,
    errors: result.errors.length,
    axe: result.axe
      ? result.axe.reduce((sum, violation) => sum + violation.nodes.length, 0)
      : undefined,
    focusNoRing: result.tabwalk ? result.tabwalk.noRing.length : undefined,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.shots.length === 0) {
    console.error('usage: ui-control-audit.mjs --base URL --out DIR name=path[@phone][@dark] ...');
    process.exit(2);
  }
  mkdirSync(options.out, { recursive: true });
  const steps = options.steps ? JSON.parse(readFileSync(options.steps, 'utf8')) : {};
  const browser = await chromium.launch();
  const summary = [];
  for (const shot of options.shots) {
    const row = await shoot(browser, options, shot, steps[shot.name] ?? []);
    summary.push(row);
    console.log(
      `${row.name.padEnd(28)} height ${String(row.height).padStart(5)}  controls ${String(row.controls).padStart(3)}  hidden-in-closed ${String(row.hidden).padStart(3)}` +
        (row.axe != null ? `  axe ${row.axe}` : '') +
        (row.focusNoRing != null ? `  focus-no-ring ${row.focusNoRing}` : '') +
        (row.errors ? `  ERR ${row.errors}` : '')
    );
  }
  await browser.close();
  writeFileSync(join(options.out, 'summary.json'), JSON.stringify(summary, null, 1));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
