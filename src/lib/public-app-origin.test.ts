import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

const kv = new Map<string, unknown>();
mock.module('@/lib/sqlite/kv', {
  namedExports: {
    readKv: (scope: string, key: string) => kv.get(`${scope}/${key}`) ?? null,
    writeKv: (scope: string, key: string, data: unknown) => kv.set(`${scope}/${key}`, data),
  },
});

const login = (origin?: string) =>
  new Request('http://127.0.0.1:47832/api/auth/login', {
    method: 'POST',
    headers: origin ? { origin } : {},
  });

afterEach(() => {
  kv.clear();
  delete process.env.PROMPT_API_URL;
  delete process.env.PROMPT_TRUSTED_HOSTS;
});

const visit = (headers: Record<string, string>) =>
  new Request('http://127.0.0.1:47832/api/auth/session', { headers });

describe('publicAppOrigin', async () => {
  const { publicAppOrigin, rememberPublicAppOrigin } = await import('./public-app-origin');

  it('is localhost until an admin signs in, then the address they used', () => {
    assert.equal(publicAppOrigin(), 'http://127.0.0.1:47832');
    rememberPublicAppOrigin(login('https://castcut.example.com'), 'admin');
    assert.equal(publicAppOrigin(), 'https://castcut.example.com');
  });

  it('ignores sign-ins by non-admins and pages with no or odd Origin', () => {
    rememberPublicAppOrigin(login('https://evil.example'), 'user');
    rememberPublicAppOrigin(login(), 'admin');
    rememberPublicAppOrigin(login('javascript:alert(1)'), 'admin');
    assert.equal(publicAppOrigin(), 'http://127.0.0.1:47832');
  });

  it('PROMPT_API_URL wins and is never overwritten', () => {
    process.env.PROMPT_API_URL = 'https://pinned.example.com/';
    rememberPublicAppOrigin(login('https://castcut.example.com'), 'admin');
    assert.equal(publicAppOrigin(), 'https://pinned.example.com');
    delete process.env.PROMPT_API_URL;
    assert.equal(publicAppOrigin(), 'http://127.0.0.1:47832');
  });

  it('remembers the page a signed-in admin is on (Referer, or the forwarded host from the proxy)', () => {
    rememberPublicAppOrigin(visit({ referer: 'https://castcut.example.com/gallery' }), 'admin');
    assert.equal(publicAppOrigin(), 'https://castcut.example.com');
    kv.clear();
    rememberPublicAppOrigin(
      visit({ 'x-forwarded-host': 'castcut.example.com', 'x-forwarded-proto': 'https' }),
      'admin'
    );
    assert.equal(publicAppOrigin(), 'https://castcut.example.com');
  });

  it('a localhost or LAN visit never replaces a public name', () => {
    rememberPublicAppOrigin(visit({ referer: 'https://castcut.example.com/' }), 'admin');
    rememberPublicAppOrigin(visit({ referer: 'http://192.168.12.8:47832/day' }), 'admin');
    rememberPublicAppOrigin(visit({ referer: 'http://localhost:47832/' }), 'admin');
    assert.equal(publicAppOrigin(), 'https://castcut.example.com');
  });

  it('falls back to the first public trusted host before localhost', () => {
    process.env.PROMPT_TRUSTED_HOSTS = '192.168.12.8, castcut.example.com';
    assert.equal(publicAppOrigin(), 'https://castcut.example.com');
  });
});
