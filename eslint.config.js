import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import chaiFriendly from 'eslint-plugin-chai-friendly';
import importPlugin from 'eslint-plugin-import';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import airbnbBase from 'airbnb-eslint9';
import stylistic from '@stylistic/eslint-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default defineConfig([
  ...airbnbBase,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.mocha,
      },

      sourceType: 'module',
      ecmaVersion: 'latest',
    },

    rules: {
      'import/no-unresolved': 'off',
      'import/no-cycle': 'off',

      'no-param-reassign': [2, { props: false }],

      'linebreak-style': ['error', 'unix'],

      'import/extensions': ['error', { js: 'always' }],

      'object-curly-newline': 'off', // Using @stylistic/object-curly-newline instead
      '@stylistic/object-curly-newline': ['error', {
        ObjectExpression: {
          multiline: true,
          minProperties: 6,
        },

        ObjectPattern: {
          multiline: true,
          minProperties: 6,
        },

        ImportDeclaration: {
          multiline: true,
          minProperties: 6,
        },

        ExportDeclaration: {
          multiline: true,
          minProperties: 6,
        },
      }],

      'no-await-in-loop': 0,
      'class-methods-use-this': 0,
      'no-return-assign': ['error', 'except-parens'],
      'no-unused-expressions': 0,
      'chai-friendly/no-unused-expressions': 2,
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^_$|^e$',
        argsIgnorePattern: '^_$|^e$',
        caughtErrorsIgnorePattern: '^_$|^e$',
      }],

      'no-underscore-dangle': ['error', { allowAfterThis: true }],

      'no-restricted-syntax': ['error', {
        selector: 'ForInStatement',
        message: 'for..in loops iterate over the entire prototype chain, which is virtually never what you want. Use Object.{keys,values,entries}, and iterate over the resulting array.',
      }, {
        selector: 'LabeledStatement',
        message: 'Labels are a form of GOTO; using them makes code confusing and hard to maintain and understand.',
      }, {
        selector: 'WithStatement',
        message: '`with` is disallowed in strict mode because it makes code impossible to predict and optimize.',
      }],

      indent: 'off', // Using @stylistic/indent instead
      '@stylistic/indent': ['error', 2, {
        ignoredNodes: ['TemplateLiteral *'],
        SwitchCase: 1,
      }],
    },

    plugins: {
      'chai-friendly': chaiFriendly,
      '@stylistic': stylistic,
      import: importPlugin,
    },
  }, {
    files: ['test/**/*.js'],

    rules: { 'no-console': 'off' },
  }, globalIgnores(['eslint.config.js', '**/deps', 'test/e2e/playwright.config.js'])]);
