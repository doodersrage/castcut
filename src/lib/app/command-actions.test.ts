import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  commandActionsVersion,
  listCommandActions,
  registerCommandActions,
  resetCommandActionsForTests,
  runCommandAction,
  subscribeCommandActions,
} from './command-actions';

afterEach(() => resetCommandActionsForTests());

describe('command palette actions registry', () => {
  it('lists what features register, in order, and forgets them on unregister', () => {
    const off = registerCommandActions([
      { id: 'a', label: 'A', href: '/a' },
      { id: 'b', label: 'B' },
    ]);
    assert.deepEqual(
      listCommandActions().map(action => action.id),
      ['a', 'b']
    );
    off();
    off();
    assert.deepEqual(listCommandActions(), []);
  });

  it('a page action replaces the app action with its id while mounted', () => {
    registerCommandActions([{ id: 'cut', label: 'Cut the film', href: '/cut' }]);
    const ran: string[] = [];
    const unmount = registerCommandActions([
      { id: 'cut', label: 'Cut the film', run: () => ran.push('cut here') },
    ]);
    const [shown] = listCommandActions();
    assert.equal(shown?.href, undefined);
    runCommandAction(shown!, { navigate: href => ran.push(href) });
    assert.deepEqual(ran, ['cut here']);
    unmount();
    assert.equal(listCommandActions()[0]?.href, '/cut', 'back to opening Cut');
  });

  it('hides an action while it is not available (its button is disabled)', () => {
    let ready = false;
    registerCommandActions([{ id: 'queue', label: 'Queue the Day', available: () => ready }]);
    assert.equal(listCommandActions().length, 0);
    ready = true;
    assert.equal(listCommandActions().length, 1);
    registerCommandActions([
      {
        id: 'broken',
        label: 'Broken',
        available: () => {
          throw new Error('page gone');
        },
      },
    ]);
    assert.deepEqual(
      listCommandActions().map(action => action.id),
      ['queue']
    );
  });

  it('runs the handler, then navigates to its link', () => {
    const steps: string[] = [];
    runCommandAction(
      { id: 'new', label: 'New Cast member', run: () => steps.push('put down'), href: '/play?new=1' },
      { navigate: href => steps.push(href) }
    );
    assert.deepEqual(steps, ['put down', '/play?new=1']);
  });

  it('tells subscribers when the list changes', () => {
    let calls = 0;
    const unsubscribe = subscribeCommandActions(() => {
      calls += 1;
    });
    const before = commandActionsVersion();
    const off = registerCommandActions([{ id: 'x', label: 'X' }]);
    off();
    unsubscribe();
    registerCommandActions([{ id: 'y', label: 'Y' }]);
    assert.equal(calls, 2);
    assert.ok(commandActionsVersion() > before);
  });
});
