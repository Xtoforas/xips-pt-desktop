import { defineConfig } from 'vitest/config';

// Separate config so the contract check stays out of the default `npm test`
// run: it is wired to the CI-optional `npm run contract:check` script.
export default defineConfig({
  test: {
    include: ['src/contract/**/*.contract-test.ts']
  }
});
