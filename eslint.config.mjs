import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@lobehub/eslint-config';
import { overlayPlugin } from './packages/build-overlay/eslint/plugin.mjs';

const publicRoot = path.dirname(fileURLToPath(import.meta.url));
const overlayOptions = {
  manifestPath: path.join(publicRoot, 'apps', 'pro', 'overlay.private-only.json'),
  overlayRoot: path.join(publicRoot, 'apps', 'pro', 'overlays'),
  publicRoot,
};

export default defineConfig(
  {
    ignores: ['.agents/**', 'apps/pro/**', '**/dist-*/**', '**/release/**'],
    react: 'vite',
    regexp: false,
    sortImports: false,
    sortKeys: false,
    yml: false,
  },
  {
    rules: {
      '@typescript-eslint/method-signature-style': 'off',
      'unicorn/prefer-at': 'off',
    },
  },
  {
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'],
    plugins: { overlay: overlayPlugin },
    rules: {
      'overlay/no-apps-pro-import': ['error', overlayOptions],
      'overlay/no-escaping-import': ['error', overlayOptions],
      'overlay/no-explicit-pro-import': ['error', overlayOptions],
      'overlay/no-pro-only-resolution': ['error', overlayOptions],
    },
  },
  {
    files: ['apps/desktop/scripts/afterPack.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['apps/desktop/src/boot/proRelaunch.ts'],
    rules: {
      'no-console': [
        'error',
        {
          allow: [
            'warn',
            'error',
            'info',
            'table',
            'group',
            'groupCollapsed',
            'groupEnd',
            'assert',
            'clear',
            'log',
          ],
        },
      ],
    },
  },
);
