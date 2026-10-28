#!/usr/bin/env node
/**
 * Is CI green on a commit (M7 T1)? The gate before a release, and the check after each push —
 * in M6 the end-to-end job was red for 15 commits before anyone looked.
 *
 *   node scripts/ci-status.mjs                 # HEAD; exit 0 green, 1 red or missing, 2 running
 *   node scripts/ci-status.mjs --sha <sha> --wait 40   # wait up to 40 minutes while it runs
 *
 * Reads the CI workflow's runs (`.github/workflows/ci.yml`) for the commit from the GitHub API:
 * the token is GITHUB_TOKEN / GH_TOKEN, or `gh auth token`; the repository is GITHUB_REPOSITORY or
 * the `origin` remote. A "Release vX.Y.Z" commit with no CI run of its own — the Release
 * workflow's, since a push with the workflow's token starts no workflow — is judged by its parent;
 * one made by hand and pushed (docs/releasing.md "Tag from a checkout") has its own run.
 */
import { execFileSync } from 'node:child_process';

/**
 * The verdict from a commit's CI runs (GitHub's `workflow_runs`, any order): the latest run
 * decides — a re-run that passed counts, an older green run under a newer red one doesn't.
 */
export function ciVerdict(runs) {
  const latest = [...(runs ?? [])].sort(
    (a, b) => Date.parse(b.created_at ?? 0) - Date.parse(a.created_at ?? 0)
  )[0];
  if (!latest) return { state: 'none', detail: 'no CI run for this commit' };
  const where = latest.html_url ? ` — ${latest.html_url}` : '';
  if (latest.status !== 'completed') {
    return { state: 'running', detail: `CI is ${latest.status ?? 'running'}${where}` };
  }
  if (latest.conclusion === 'success') return { state: 'green', detail: `CI passed${where}` };
  return { state: 'red', detail: `CI ${latest.conclusion ?? 'failed'}${where}` };
}

/** "owner/name" from a remote URL (https or ssh). */
export function repoFromRemote(url) {
  const match = /github\.com[:/]([^/]+)\/([^/.\s]+?)(?:\.git)?\s*$/.exec(url ?? '');
  return match ? `${match[1]}/${match[2]}` : null;
}

/** The Release workflow's own commit (no CI run of its own): judge its parent. */
export function isReleaseCommit(subject) {
  return /^Release v\d+\.\d+\.\d+/.test(subject ?? '');
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function token() {
  const fromEnv = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (fromEnv) return fromEnv;
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

async function runsFor(repo, sha, auth) {
  const response = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=20`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      },
    }
  );
  if (!response.ok) {
    throw new Error(`GitHub answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return (await response.json()).workflow_runs ?? [];
}

async function main() {
  const args = process.argv.slice(2);
  const flag = name => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const repo = process.env.GITHUB_REPOSITORY || repoFromRemote(git('remote', 'get-url', 'origin'));
  if (!repo) throw new Error('Could not tell the GitHub repository (set GITHUB_REPOSITORY).');
  let sha = git('rev-parse', flag('--sha') ?? 'HEAD');
  const auth = token();
  if (
    isReleaseCommit(git('log', '-1', '--format=%s', sha)) &&
    (await runsFor(repo, sha, auth)).length === 0
  ) {
    const parent = git('rev-parse', `${sha}^`);
    console.log(
      `${sha.slice(0, 8)} is a release commit with no CI run: checking its parent ${parent.slice(0, 8)}.`
    );
    sha = parent;
  }
  const until = Date.now() + Number(flag('--wait') ?? 0) * 60_000;
  for (;;) {
    const verdict = ciVerdict(await runsFor(repo, sha, auth));
    if (verdict.state !== 'running' || Date.now() >= until) {
      console.log(`${sha.slice(0, 8)}: ${verdict.detail}`);
      process.exit(verdict.state === 'green' ? 0 : verdict.state === 'running' ? 2 : 1);
    }
    console.log(`${sha.slice(0, 8)}: ${verdict.detail}; waiting…`);
    await new Promise(resolve => setTimeout(resolve, 30_000));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
