import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { followCurrentPlayLoopHref } from './play-loop-nav-click';

function click(overrides: Partial<{ button: number; metaKey: boolean }> = {}) {
  const event = {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
    preventDefault() {
      event.defaultPrevented = true;
    },
  };
  return event;
}

describe('nav links follow the Cast active at the click', () => {
  it('goes to the current Cast when the link was rendered for the previous one', () => {
    const event = click();
    const pushed: string[] = [];
    followCurrentPlayLoopHref(event, '/day?character=b', '/day', href => pushed.push(href), 'a');
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(pushed, ['/day?character=a']);
  });

  it('leaves an up-to-date link, other pages and modified clicks alone', () => {
    const pushed: string[] = [];
    const current = click();
    followCurrentPlayLoopHref(current, '/day?character=a', '/day', href => pushed.push(href), 'a');
    assert.equal(current.defaultPrevented, false);
    const gallery = click();
    followCurrentPlayLoopHref(gallery, '/gallery', '/gallery', href => pushed.push(href), 'a');
    assert.equal(gallery.defaultPrevented, false);
    const newTab = click({ metaKey: true });
    followCurrentPlayLoopHref(newTab, '/day?character=b', '/day', href => pushed.push(href), 'a');
    assert.equal(newTab.defaultPrevented, false);
    assert.deepEqual(pushed, []);
  });
});
