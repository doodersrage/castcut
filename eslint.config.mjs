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
              name: '@/lib/storage/export-encryption',
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
  {
    // New buttons go through <Button variant=…> (src/components/ui/Button: primary, secondary,
    // ghost, danger, pill, overlay, icon, link …) instead of a hand-styled class string. Warns on
    // a raw <button> whose className is a string / template with no design-system class in it.
    // Menu items using an exported class constant (ACTION_MENU_ITEM_CLASS) are not flagged.
    files: ['src/**/*.tsx'],
    ignores: ['src/components/ui/**'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            "JSXOpeningElement[name.name='button'] > JSXAttribute[name.name='className'] > Literal:not([value=/ui-(btn|chip|tab|segmented|text-link)/])",
          message:
            'Hand-styled <button>: use <Button variant=…> from @/components/ui/Button (add a variant there if none fits).',
        },
        {
          selector:
            "JSXOpeningElement[name.name='button'] > JSXAttribute[name.name='className'] > JSXExpressionContainer > TemplateLiteral:not(:has(TemplateElement[value.raw=/ui-(btn|chip|tab|segmented|text-link)/]))",
          message:
            'Hand-styled <button>: use <Button variant=…> from @/components/ui/Button (add a variant there if none fits).',
        },
      ],
    },
  },
]);

export default eslintConfig;
