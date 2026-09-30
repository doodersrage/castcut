import assert from 'node:assert/strict';
import test from 'node:test';
import { userAgentLabel } from './user-agent-label';

test('userAgentLabel names browser and OS', () => {
  assert.equal(
    userAgentLabel(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'
    ),
    'Chrome 149 on Linux'
  );
  assert.equal(
    userAgentLabel(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1'
    ),
    'Safari 19 on iOS'
  );
  assert.equal(
    userAgentLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0'),
    'Firefox 140 on Windows'
  );
  assert.equal(
    userAgentLabel(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36'
    ),
    'Headless Chrome 149 on Linux'
  );
  assert.equal(userAgentLabel(undefined), 'Unknown device');
});
