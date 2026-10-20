import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DESKTOP_SHELL_ENV,
  DESKTOP_SHELL_PUBLIC_ENV,
  isDesktopShellClient,
  isDesktopShellServer,
} from './desktop-shell';

describe('desktop-shell', () => {
  it('reads PROMPT_DESKTOP on the server', () => {
    const previous = process.env[DESKTOP_SHELL_ENV];
    process.env[DESKTOP_SHELL_ENV] = '1';
    try {
      assert.equal(isDesktopShellServer(), true);
    } finally {
      if (previous == null) {
        delete process.env[DESKTOP_SHELL_ENV];
      } else {
        process.env[DESKTOP_SHELL_ENV] = previous;
      }
    }
  });

  it('reads NEXT_PUBLIC_PROMPT_DESKTOP on the client', () => {
    const previous = process.env[DESKTOP_SHELL_PUBLIC_ENV];
    process.env[DESKTOP_SHELL_PUBLIC_ENV] = 'true';
    try {
      assert.equal(isDesktopShellClient(), true);
    } finally {
      if (previous == null) {
        delete process.env[DESKTOP_SHELL_PUBLIC_ENV];
      } else {
        process.env[DESKTOP_SHELL_PUBLIC_ENV] = previous;
      }
    }
  });
});
