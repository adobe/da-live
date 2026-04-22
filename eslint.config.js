import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import { recommended, source, test } from '@adobe/eslint-config-helix';

export default defineConfig([
  globalIgnores([
    'eslint.config.js',
    '**/deps',
    'test/e2e',
    'coverage',
    '.claude',
  ]),
  {
    languageOptions: {
      ...recommended.languageOptions,
      ecmaVersion: 'latest',
      globals: {
        ...globals.browser,
        ...globals.mocha,
        ...globals.es6,
      },
    },
    settings: {
      'import/core-modules': ['da-lit', 'da-y-wrapper', 'da-parser'],
    },
    rules: {
      'class-methods-use-this': 0,

      // match da-nx: allow single-line if/else without braces
      curly: ['error', 'multi-line'],

      // headers not required to keep file size down
      'header/header': 0,

      'import/extensions': ['error', { js: 'always' }],

      'import/no-cycle': 'off',

      'import/no-unresolved': ['error', {
        ignore: ['^https?://'],
      }],

      'import/prefer-default-export': 0,

      indent: ['error', 2, {
        ignoredNodes: ['TemplateLiteral *'],
        SwitchCase: 1,
      }],

      'linebreak-style': ['error', 'unix'],

      'max-statements-per-line': ['error', { max: 2 }],

      'no-await-in-loop': 0,

      'no-param-reassign': [2, { props: false }],

      'no-restricted-syntax': [
        'error',
        {
          selector: 'ForInStatement',
          message: 'for..in loops iterate over the entire prototype chain, which is virtually never what you want. Use Object.{keys,values,entries}, and iterate over the resulting array.',
        },
        {
          selector: 'LabeledStatement',
          message: 'Labels are a form of GOTO; using them makes code confusing and hard to maintain and understand.',
        },
        {
          selector: 'WithStatement',
          message: '`with` is disallowed in strict mode because it makes code impossible to predict and optimize.',
        },
      ],

      'no-return-assign': ['error', 'except-parens'],

      'no-underscore-dangle': ['error', { allowAfterThis: true }],

      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_$|^e$',
        caughtErrorsIgnorePattern: '^_$|^e$',
        varsIgnorePattern: '^_$|^e$',
      }],

      'object-curly-newline': ['error', {
        ObjectExpression: { multiline: true, minProperties: 6 },
        ObjectPattern: { multiline: true, minProperties: 6 },
        ImportDeclaration: { multiline: true, minProperties: 6 },
        ExportDeclaration: { multiline: true, minProperties: 6 },
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
    // Allow console and relax a few rules in test files
    files: ['test/**/*.js'],
    rules: {
      'max-classes-per-file': 0,
      'no-console': 'off',
      'no-underscore-dangle': 0,
      'no-unused-expressions': 0,
    },
  },
]);
