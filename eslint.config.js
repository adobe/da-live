import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import { recommended, source, test } from '@adobe/eslint-config-helix';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig([
  globalIgnores([
    'eslint.config.js',
    '**/deps',
    'test/e2e/playwright.config.js',
  ]),
  {
    languageOptions: {
      ...recommended.languageOptions,
      globals: {
        ...globals.serviceworker,
        ...globals.browser,
        ...globals.mocha,
        ...globals.es6,
        __rootdir: true,
      },
    },
    settings: {
      'import/core-modules': [
        '@playwright/test',
        'da-lit',
        'da-y-wrapper',
      ],
    },
    rules: {
      'class-methods-use-this': 0,

      // headers not required to keep file size down
      'header/header': 0,

      // TODO: Remove this after we fix the import cycle in edit.js and prose/index.js
      'import/no-cycle': 'off',

      'import/no-unresolved': ['error', {
        ignore: ['^https?://']
      }],

      'import/prefer-default-export': 0,

      'indent': ['error', 2, {
        ignoredNodes: ['TemplateLiteral *'],
        SwitchCase: 1,
      }],

      'max-statements-per-line': ['error', { max: 2 }],

      'no-await-in-loop': 0,

      'no-param-reassign': [2, { props: false }],

      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_$|^e$',
        caughtErrorsIgnorePattern: '^_$|^e$',
        varsIgnorePattern: '^_$|^e$',
      }],

      'object-curly-newline': ['error', {
        multiline: true,
        minProperties: 6,
        consistent: true,
      }],
    },
    plugins: {
      import: recommended.plugins.import,
    },
    extends: [recommended],
  },
  source,
  test,
  {
    // Allow console in test files
    files: ['test/**/*.js'],
    rules: {
      'no-console': 'off',
      'no-unused-expressions': 0,
    },
  }
]);
