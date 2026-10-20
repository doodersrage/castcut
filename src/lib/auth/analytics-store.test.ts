import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import type { UserAnalyticsSnapshot } from '../user/analytics';

type Snapshot = UserAnalyticsSnapshot;

let snapshots: Record<string, Snapshot> = {};
let history: Record<string, Snapshot[]> = {};
const loadAnalyticsSnapshots = mock.fn(() => snapshots);
const loadAnalyticsHistory = mock.fn(() => history);
const saveAnalyticsDocument = mock.fn((doc: { snapshots: Record<string, Snapshot>; history: Record<string, Snapshot[]> }) => {
  snapshots = doc.snapshots;
  history = doc.history;
});
mock.module('@/lib/sqlite/tables', {
  namedExports: { loadAnalyticsSnapshots, loadAnalyticsHistory, saveAnalyticsDocument },
});

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    userId: 'u1',
    username: 'alice',
    capturedAt: 100,
    historyTotal: 0,
    historyRated: 0,
    historyFavorites: 0,
    galleryTotal: 0,
    galleryCompleted: 0,
    galleryRated: 0,
    galleryFavorites: 0,
    ratingTokenStats: [],
    topPositiveTokens: [],
    topNegativeTokens: [],
    ...overrides,
  };
}

afterEach(() => {
  snapshots = {};
  history = {};
  loadAnalyticsSnapshots.mock.resetCalls();
  loadAnalyticsHistory.mock.resetCalls();
  saveAnalyticsDocument.mock.resetCalls();
});

describe('auth/analytics-store', async () => {
  const {
    getUserAnalyticsSnapshot,
    listAllAnalyticsHistory,
    listUserAnalyticsHistory,
    listUserAnalyticsSnapshots,
    saveUserAnalyticsSnapshot,
  } = await import('./analytics-store');

  describe('saveUserAnalyticsSnapshot', () => {
    it('stores the snapshot under its userId and prepends it to that user history', () => {
      saveUserAnalyticsSnapshot(snapshot({ capturedAt: 100 }));
      assert.equal(snapshots.u1!.capturedAt, 100);
      assert.equal(history.u1!.length, 1);
      assert.equal(saveAnalyticsDocument.mock.calls.length, 1);
    });

    it('prepends a new history entry when capturedAt differs from the most recent one', () => {
      saveUserAnalyticsSnapshot(snapshot({ capturedAt: 100 }));
      saveUserAnalyticsSnapshot(snapshot({ capturedAt: 200 }));
      assert.equal(history.u1!.length, 2);
      assert.equal(history.u1![0]!.capturedAt, 200);
    });

    it('does not add a duplicate history entry when capturedAt matches the most recent one', () => {
      saveUserAnalyticsSnapshot(snapshot({ capturedAt: 100 }));
      saveUserAnalyticsSnapshot(snapshot({ capturedAt: 100 }));
      assert.equal(history.u1!.length, 1);
    });

    it('caps history at 120 entries per user', () => {
      for (let i = 0; i < 130; i += 1) {
        saveUserAnalyticsSnapshot(snapshot({ capturedAt: i }));
      }
      assert.equal(history.u1!.length, 120);
      assert.equal(history.u1![0]!.capturedAt, 129);
    });

    it('keeps separate history per user', () => {
      saveUserAnalyticsSnapshot(snapshot({ userId: 'u1', capturedAt: 1 }));
      saveUserAnalyticsSnapshot(snapshot({ userId: 'u2', capturedAt: 2 }));
      assert.equal(history.u1!.length, 1);
      assert.equal(history.u2!.length, 1);
    });
  });

  describe('listUserAnalyticsSnapshots', () => {
    it('returns all snapshots sorted by username', () => {
      snapshots = {
        u1: snapshot({ userId: 'u1', username: 'zeta' }),
        u2: snapshot({ userId: 'u2', username: 'alpha' }),
      };
      const result = listUserAnalyticsSnapshots();
      assert.deepEqual(
        result.map(s => s.username),
        ['alpha', 'zeta']
      );
    });

    it('returns an empty array when there are no snapshots', () => {
      assert.deepEqual(listUserAnalyticsSnapshots(), []);
    });
  });

  describe('getUserAnalyticsSnapshot', () => {
    it('returns the snapshot for a known userId', () => {
      snapshots = { u1: snapshot() };
      const result = getUserAnalyticsSnapshot('u1');
      assert.equal(result?.userId, 'u1');
    });

    it('returns null for an unknown userId', () => {
      assert.equal(getUserAnalyticsSnapshot('missing'), null);
    });
  });

  describe('listUserAnalyticsHistory', () => {
    it('returns the history for a user, limited to the given count', () => {
      history = { u1: [snapshot({ capturedAt: 3 }), snapshot({ capturedAt: 2 }), snapshot({ capturedAt: 1 })] };
      const result = listUserAnalyticsHistory('u1', 2);
      assert.equal(result.length, 2);
      assert.equal(result[0]!.capturedAt, 3);
    });

    it('defaults the limit to 60', () => {
      history = { u1: Array.from({ length: 70 }, (_, i) => snapshot({ capturedAt: i })) };
      const result = listUserAnalyticsHistory('u1');
      assert.equal(result.length, 60);
    });

    it('returns an empty array for a user with no history', () => {
      assert.deepEqual(listUserAnalyticsHistory('missing'), []);
    });
  });

  describe('listAllAnalyticsHistory', () => {
    it('limits each user history to limitPerUser (default 30)', () => {
      history = {
        u1: Array.from({ length: 40 }, (_, i) => snapshot({ userId: 'u1', capturedAt: i })),
        u2: Array.from({ length: 5 }, (_, i) => snapshot({ userId: 'u2', capturedAt: i })),
      };
      const result = listAllAnalyticsHistory();
      assert.equal(result.u1!.length, 30);
      assert.equal(result.u2!.length, 5);
    });

    it('uses a custom limitPerUser when given', () => {
      history = { u1: Array.from({ length: 10 }, (_, i) => snapshot({ capturedAt: i })) };
      const result = listAllAnalyticsHistory(3);
      assert.equal(result.u1!.length, 3);
    });

    it('returns an empty object when there is no history at all', () => {
      assert.deepEqual(listAllAnalyticsHistory(), {});
    });
  });
});
