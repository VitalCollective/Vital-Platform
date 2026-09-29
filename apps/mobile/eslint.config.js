// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      '.codex-auth-test/**',
      '.expo/**',
      'dist*/**',
      'web-build/**',
    ],
    rules: {
      // Vital's established data-loading hooks intentionally enter their loading
      // state from effects. Refactoring those lifecycles is outside lint setup.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]);
