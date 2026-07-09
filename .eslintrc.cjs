/* ESLint 8 (eslintrc format) — matches the `eslint . --ext .ts,.tsx` script. */
module.exports = {
  root: true,
  env: { browser: true, node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true }
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended'
  ],
  settings: { react: { version: 'detect' } },
  ignorePatterns: ['node_modules/', 'out/', 'dist/', 'dist-electron/', 'resources/', '.eslintrc.cjs'],
  rules: {
    // The IPC boundary and electron-updater are genuinely untyped; `any` is deliberate there.
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    // TypeScript already checks props.
    'react/prop-types': 'off',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // `catch { /* best effort */ }` is a deliberate pattern throughout the services.
    'no-empty': ['error', { allowEmptyCatch: true }],
    '@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true, allowShortCircuit: true }],
    // Dependency arrays are hand-tuned in several hooks; surface as guidance, not failure.
    'react-hooks/exhaustive-deps': 'warn',
    // Terminal code parses OSC/ANSI sequences — control chars in regexes are the point.
    'no-control-regex': 'off',
    // Lazy `require()` in the main process is deliberate (platform-gated, optional deps).
    '@typescript-eslint/no-var-requires': 'off',
    // The codebase writes defensive leading semicolons (`;(expr).method()`).
    'no-extra-semi': 'off',
    // guacamole-lite's types come from shims.d.ts; `@ts-expect-error` would be "unused"
    // there and break typecheck. Allow a described `@ts-ignore` instead.
    '@typescript-eslint/ban-ts-comment': ['error', { 'ts-ignore': 'allow-with-description' }]
  }
}
