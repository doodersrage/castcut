import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

let stored: unknown = null;
const readBrowserValue = mock.fn(<T>(): T | null => stored as T | null);
const writeBrowserValue = mock.fn((_key: string, value: unknown) => {
  stored = value;
});
mock.module('../storage/browser-storage', { namedExports: { readBrowserValue, writeBrowserValue } });

function installWindowStub(matches: boolean): { calls: string[] } {
  const calls: string[] = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      matchMedia(query: string) {
        calls.push(query);
        return { matches };
      },
    },
  });
  return { calls };
}

afterEach(() => {
  stored = null;
  delete (globalThis as { window?: unknown }).window;
});

describe('mobile-studio-offer', async () => {
  const {
    MOBILE_STUDIO_OFFER_DISMISS_KEY,
    MOBILE_STUDIO_OFFER_MQ,
    MOBILE_STUDIO_HOME,
    isMobileStudioOfferDismissed,
    dismissMobileStudioOffer,
    shouldOfferMobileStudio,
  } = await import('./mobile-studio-offer');

  describe('isMobileStudioOfferDismissed', () => {
    it('returns true (already dismissed) when window is undefined (SSR guard)', () => {
      assert.equal(isMobileStudioOfferDismissed(), true);
    });

    it('returns false when nothing is stored', () => {
      installWindowStub(false);
      stored = null;
      assert.equal(isMobileStudioOfferDismissed(), false);
    });

    it('returns true only when the stored value is exactly true', () => {
      installWindowStub(false);
      stored = 'true';
      assert.equal(isMobileStudioOfferDismissed(), false);
      stored = true;
      assert.equal(isMobileStudioOfferDismissed(), true);
    });
  });

  describe('dismissMobileStudioOffer', () => {
    it('is a no-op when window is undefined (SSR guard)', () => {
      dismissMobileStudioOffer();
      assert.equal(writeBrowserValue.mock.calls.length, 0);
    });

    it('persists true under the dismiss key', () => {
      installWindowStub(false);
      dismissMobileStudioOffer();
      assert.equal(writeBrowserValue.mock.calls[0]!.arguments[0], MOBILE_STUDIO_OFFER_DISMISS_KEY);
      assert.equal(isMobileStudioOfferDismissed(), true);
    });
  });

  describe('shouldOfferMobileStudio', () => {
    it('returns false when window is undefined (SSR guard)', () => {
      assert.equal(shouldOfferMobileStudio('/studio'), false);
    });

    it('returns false when already on the mobile studio path', () => {
      installWindowStub(true);
      assert.equal(shouldOfferMobileStudio(MOBILE_STUDIO_HOME), false);
      assert.equal(shouldOfferMobileStudio(`${MOBILE_STUDIO_HOME}/generate`), false);
    });

    it('returns false when the offer was already dismissed', () => {
      installWindowStub(true);
      stored = true;
      assert.equal(shouldOfferMobileStudio('/studio'), false);
    });

    it('returns the matchMedia result (using the expected media query) otherwise', () => {
      const { calls } = installWindowStub(true);
      stored = false;
      assert.equal(shouldOfferMobileStudio('/studio'), true);
      assert.deepEqual(calls, [MOBILE_STUDIO_OFFER_MQ]);
    });

    it('returns false when matchMedia does not match', () => {
      installWindowStub(false);
      stored = false;
      assert.equal(shouldOfferMobileStudio('/studio'), false);
    });
  });
});
