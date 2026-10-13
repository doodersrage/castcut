import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isPhoneUserAgent, phoneViewRedirect } from './phone-view';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID_PHONE =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const ANDROID_TABLET =
  'Mozilla/5.0 (Linux; Android 15; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const IPAD =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

const redirect = (pathname: string, userAgent = IPHONE, viewCookie?: string, search = '') =>
  phoneViewRedirect({ pathname, search, userAgent, viewCookie });

describe('phone view', () => {
  it('knows phones from tablets and desktops', () => {
    assert.equal(isPhoneUserAgent(IPHONE), true);
    assert.equal(isPhoneUserAgent(ANDROID_PHONE), true);
    assert.equal(isPhoneUserAgent(ANDROID_TABLET), false);
    assert.equal(isPhoneUserAgent(IPAD), false);
    assert.equal(isPhoneUserAgent(undefined), false);
  });

  it('sends a phone from a desk page to its /m twin, keeping the query', () => {
    assert.equal(redirect('/'), '/m/film');
    assert.equal(redirect('/day', IPHONE, undefined, '?character=lana'), '/m/day?character=lana');
    assert.equal(redirect('/play', ANDROID_PHONE), '/m/film');
    assert.equal(redirect('/gallery'), '/m/gallery');
  });

  it('leaves /m pages, pages without a twin, desktops and a chosen desk alone', () => {
    assert.equal(redirect('/m/day'), null);
    assert.equal(redirect('/m'), null);
    assert.equal(redirect('/login'), null);
    assert.equal(redirect('/settings'), null);
    assert.equal(redirect('/day', IPAD), null);
    assert.equal(redirect('/day', IPHONE, 'desk'), null);
  });
});
