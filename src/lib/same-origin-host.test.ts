import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { acceptedRequestOrigins, isIpLiteral, isTrustedOriginHost } from './same-origin-host';

const server = { serverOrigin: 'http://localhost:47832', protocol: 'http:' };

describe('same-origin hosts', () => {
  it('accepts the page opened at the LAN address, 127.0.0.1 or localhost', () => {
    for (const host of ['192.168.12.43:47832', '127.0.0.1:47832', 'localhost:47832', '[::1]:47832']) {
      assert.ok(
        acceptedRequestOrigins({ ...server, host }).includes(`http://${host}`),
        host
      );
    }
  });

  it('does not trust a hostname a page could rebind to this machine', () => {
    assert.deepEqual(acceptedRequestOrigins({ ...server, host: 'evil.example:47832' }), [
      'http://localhost:47832',
    ]);
    // Unless the operator names it.
    assert.ok(
      acceptedRequestOrigins({ ...server, host: 'castcut.lan:47832', trustedHosts: 'castcut.lan' }).includes(
        'http://castcut.lan:47832'
      )
    );
  });

  it('follows X-Forwarded-Proto behind a TLS proxy', () => {
    assert.ok(
      acceptedRequestOrigins({ ...server, host: '10.0.0.5', forwardedProto: 'https' }).includes('https://10.0.0.5')
    );
  });

  it('accepts the public name a proxy forwards in X-Forwarded-Host (no PROMPT_TRUSTED_HOSTS)', () => {
    const accepted = acceptedRequestOrigins({
      ...server,
      host: '127.0.0.1:47832',
      forwardedProto: 'https',
      forwardedHost: 'castcut.example.com',
    });
    assert.ok(accepted.includes('https://castcut.example.com'));
    // A page's own Host alone still isn't enough for a name.
    assert.ok(!acceptedRequestOrigins({ ...server, host: 'castcut.example.com' }).includes('http://castcut.example.com'));
  });

  it('tells IP literals from names', () => {
    assert.equal(isIpLiteral('192.168.12.43'), true);
    assert.equal(isIpLiteral('::1'), true);
    assert.equal(isIpLiteral('[fe80::1]'), true);
    assert.equal(isIpLiteral('999.1.1.1'), false);
    assert.equal(isIpLiteral('localhost'), false);
    assert.equal(isIpLiteral('cafe.example'), false);
  });

  it('accepts a listed public name behind a reverse proxy, whatever Host it forwards', () => {
    assert.equal(isTrustedOriginHost('https://castcut.example.com', 'castcut.example.com'), true);
    assert.equal(isTrustedOriginHost('https://castcut.example.com:8443/x', 'other.lan, castcut.example.com'), true);
    assert.equal(isTrustedOriginHost('https://evil.example', 'castcut.example.com'), false);
    assert.equal(isTrustedOriginHost('https://castcut.example.com', ''), false);
    assert.equal(isTrustedOriginHost('not a url', 'castcut.example.com'), false);
  });
});
