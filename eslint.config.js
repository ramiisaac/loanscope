// Root ESLint flat config.
//
// Per-package ESLint configurations own their own scope. This root config
// exists solely to replace the legacy `.eslintrc.js` that was removed in
// Batch 1, and to ensure that any accidental root-level `eslint` invocation
// does not traverse into workspaces (which would double-lint or fail to
// resolve workspace-scoped plugins/parsers).
//
// If a future enhancement adds repo-wide linting, this config is the correct
// place to define shared rules.
export default [
  {
    ignores: ["apps/**", "packages/**", "dist/**", "**/dist/**", ".next/**", "coverage/**"],
  },
];
