import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FIRST_RUN_GENERATE_HREF,
  FIRST_RUN_QUEUE_HREF,
  resolveStudioEmptyCta,
  resolveWelcomeLandingCta,
} from './empty-cta';

describe('empty-cta', () => {
  it('sends first-run Generate to random surprise', () => {
    assert.equal(FIRST_RUN_GENERATE_HREF, '/?source=random');
  });

  it('sends first-run queue funnel through autogen + autoqueue', () => {
    assert.equal(FIRST_RUN_QUEUE_HREF, '/?source=random&autogen=1&autoqueue=1');
  });

  it('welcome landing defaults to Generate (SSR / no window mode)', () => {
    assert.deepEqual(resolveWelcomeLandingCta(), {
      label: 'Open Generate',
      href: FIRST_RUN_GENERATE_HREF,
    });
  });

  it('studio empty CTA defaults to Start a film when SSR / no window', () => {
    assert.deepEqual(resolveStudioEmptyCta(), {
      label: 'Start a film',
      href: '/play',
    });
  });
});
