import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
// The script is plain .mjs outside the TypeScript project: loaded by path, typed here.
const SCRIPT = '../../../scripts/ci-status.mjs';
type Run = { status?: string; conclusion?: string | null; created_at?: string; html_url?: string };
type Script = {
  ciVerdict: (runs: Run[]) => { state: 'green' | 'red' | 'running' | 'none'; detail: string };
  repoFromRemote: (url: string) => string | null;
  isReleaseCommit: (subject: string) => boolean;
};
let script: Script;
before(async () => {
  script = (await import(SCRIPT)) as Script;
});

describe('CI gate (M7 T1)', () => {
  const at = (minute: number) => `2026-10-28T01:${String(minute).padStart(2, '0')}:00Z`;

  it('green only when the latest run passed', () => {
    assert.equal(
      script.ciVerdict([{ status: 'completed', conclusion: 'success', created_at: at(1) }]).state,
      'green'
    );
    assert.equal(
      script.ciVerdict([{ status: 'completed', conclusion: 'failure', created_at: at(1) }]).state,
      'red'
    );
    assert.equal(
      script.ciVerdict([{ status: 'completed', conclusion: 'cancelled', created_at: at(1) }]).state,
      'red'
    );
  });

  it('the latest run decides, in any order', () => {
    const older = { status: 'completed', conclusion: 'success', created_at: at(1) };
    const newer = { status: 'completed', conclusion: 'failure', created_at: at(9) };
    assert.equal(script.ciVerdict([older, newer]).state, 'red');
    assert.equal(script.ciVerdict([newer, older]).state, 'red');
    // A re-run that passed, after the red one.
    const rerun = { status: 'completed', conclusion: 'success', created_at: at(20) };
    assert.equal(script.ciVerdict([newer, rerun, older]).state, 'green');
  });

  it('a run in progress is not green, and no run at all is not green', () => {
    assert.equal(script.ciVerdict([{ status: 'in_progress', created_at: at(1) }]).state, 'running');
    assert.equal(script.ciVerdict([{ status: 'queued', created_at: at(1) }]).state, 'running');
    assert.equal(script.ciVerdict([]).state, 'none');
  });

  it('says where the run is', () => {
    const verdict = script.ciVerdict([
      {
        status: 'completed',
        conclusion: 'failure',
        created_at: at(1),
        html_url: 'https://github.com/o/r/actions/runs/1',
      },
    ]);
    assert.match(verdict.detail, /failure — https:\/\/github\.com\/o\/r\/actions\/runs\/1/);
  });

  it('reads the repository from a remote, and knows a release commit', () => {
    assert.equal(script.repoFromRemote('https://github.com/doodersrage/castcut.git'), 'doodersrage/castcut');
    assert.equal(script.repoFromRemote('git@github.com:doodersrage/castcut.git'), 'doodersrage/castcut');
    assert.equal(script.repoFromRemote('https://github.com/doodersrage/castcut'), 'doodersrage/castcut');
    assert.equal(script.repoFromRemote('https://example.com/x/y.git'), null);
    assert.equal(script.isReleaseCommit('Release v3.0.1'), true);
    assert.equal(script.isReleaseCommit('M6 D18–D20: no thumbnail as an original'), false);
  });
});
