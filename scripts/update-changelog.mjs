#!/usr/bin/env node
/**
 * Prepends a new CHANGELOG.md section for the release being cut.
 *
 * Prefer curated bullets already under ## [Unreleased] when present so a
 * minor/major cut can ship a short product narrative instead of hundreds of
 * merge-commit subjects. Fall back to git history (same convention used to
 * backfill CHANGELOG.md originally) when Unreleased is empty.
 *
 * Run by .github/workflows/release.yml's "Cut version on main" step, after
 * `npm version` has bumped package.json but before that bump is committed,
 * so the new CHANGELOG.md section lands in the same "Release vX.Y.Z" commit.
 *
 * Usage: node scripts/update-changelog.mjs <version>   (e.g. 1.5.0 -- no "v" prefix)
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const CHANGELOG_PATH = join(ROOT, 'CHANGELOG.md');

const version = process.argv[2];
if (!version) {
  console.error('update-changelog: usage: node scripts/update-changelog.mjs <version>');
  process.exit(1);
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function bulletsFromGitHistory() {
  let previousReleaseSha = '';
  try {
    previousReleaseSha = git(['log', '--grep=^Release v[0-9]', '-E', '--format=%H', '-1']);
  } catch {
    previousReleaseSha = '';
  }

  const range = previousReleaseSha ? `${previousReleaseSha}..HEAD` : 'HEAD';
  let log = '';
  try {
    log = git(['log', range, '--no-merges', '--format=%s']);
  } catch (error) {
    console.error(`update-changelog: git log failed for range ${range}: ${error.message}`);
    process.exit(1);
  }

  return log
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .filter(line => !/^Release v[0-9]/.test(line));
}

function bulletsFromUnreleasedBody(body) {
  return body
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('- '))
    .map(line => line.slice(2).trim())
    .filter(Boolean);
}

if (!existsSync(CHANGELOG_PATH)) {
  console.error(`update-changelog: ${CHANGELOG_PATH} not found.`);
  process.exit(1);
}

const changelog = readFileSync(CHANGELOG_PATH, 'utf8');
const unreleasedHeading = '## [Unreleased]';
const idx = changelog.indexOf(unreleasedHeading);
if (idx === -1) {
  console.error(`update-changelog: could not find "${unreleasedHeading}" heading in CHANGELOG.md.`);
  process.exit(1);
}

const afterHeading = idx + unreleasedHeading.length;
const nextHeadingIdx = changelog.indexOf('\n## [', afterHeading);
const unreleasedBody =
  nextHeadingIdx === -1
    ? changelog.slice(afterHeading)
    : changelog.slice(afterHeading, nextHeadingIdx);
const tail = nextHeadingIdx === -1 ? '' : changelog.slice(nextHeadingIdx + 1);

const curated = bulletsFromUnreleasedBody(unreleasedBody);
const bullets = curated.length > 0 ? curated : bulletsFromGitHistory();
const source = curated.length > 0 ? 'Unreleased' : 'git history';

if (bullets.length === 0) {
  console.log(
    'update-changelog: no Unreleased bullets and no new commits since the last release — leaving CHANGELOG.md unchanged.'
  );
  process.exit(0);
}

const versionHeading = `## [v${version}]`;
if (changelog.includes(versionHeading)) {
  // Already curated/promoted before the cut — keep that section; clear empty Unreleased only.
  if (curated.length === 0 && unreleasedBody.trim() === '') {
    console.log(
      `update-changelog: ${versionHeading} already present — leaving CHANGELOG.md unchanged.`
    );
    process.exit(0);
  }
  const cleaned =
    changelog.slice(0, afterHeading) +
    '\n\n' +
    (tail ? tail.replace(/^\n+/, '') : '');
  writeFileSync(CHANGELOG_PATH, cleaned);
  console.log(
    `update-changelog: ${versionHeading} already present — cleared Unreleased body without duplicating.`
  );
  process.exit(0);
}

const date = new Date().toISOString().slice(0, 10);
const newSection = `## [v${version}] - ${date}\n\n${bullets.map(b => `- ${b}`).join('\n')}\n`;

const updated =
  changelog.slice(0, afterHeading) + '\n\n' + newSection + (tail ? '\n' + tail : '\n');

writeFileSync(CHANGELOG_PATH, updated);
console.log(
  `update-changelog: added v${version} section with ${bullets.length} entries (from ${source}).`
);
