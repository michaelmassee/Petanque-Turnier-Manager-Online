import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  {
    ignores: ['dist/', 'coverage/', 'node_modules/', '.wrangler/'],
  },
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-constant-binary-expression': 'error',
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
      'no-unsafe-finally': 'error',
    },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The app intentionally exports form constants and testable helpers next to components.
      'react-refresh/only-export-components': 'off',
      // Existing request handlers are recreated during render; converting them here would
      // change request timing. Keep the Rules-of-Hooks gate and address dependencies with
      // a dedicated React lifecycle refactor.
      'react-hooks/exhaustive-deps': 'off',
    },
  },
];
