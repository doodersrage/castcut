import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-plugin-prettier/recommended';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    // Codebase convention: prefix an intentionally-unused binding with `_` (e.g. an
    // interface-required param, or a destructured field kept for documentation).
    // Recognize that convention so it isn't flagged as dead code.
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Local Python engine envs / vendored JS must not be linted.
    'services/**/.venv/**',
    '**/node_modules/**',
  ]),
  {
    // Client UI surfaces — catch server-only imports early (script also scans 'use client').
    files: ['src/components/**/*.{ts,tsx}', 'src/hooks/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'node:crypto',
              message: 'Do not import node:crypto from client UI code.',
            },
            {
              name: 'node:fs',
              message: 'Do not import node:fs from client UI code.',
            },
            {
              name: '@/lib/comfyui/client',
              message: 'Server-only. Use /api/comfyui* routes from client code.',
            },
            {
              name: '@/lib/comfyui/server-workflows',
              message: 'Server-only. Use API routes for server workflow files.',
            },
            {
              name: '@/lib/comfyui/history-workflow',
              message:
                'Server-only value import. Use /api/comfyui/history/workflow (type-only imports OK).',
            },
            {
              name: '@/lib/export-encryption',
              message: 'Server-only encryption helpers.',
            },
            {
              name: '@/lib/auth/password',
              message: 'Server-only auth.',
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
