import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Each test file gets its own module context so vi.resetModules() works
    isolate: true,
    // Extend timeout for CIBA poll tests
    testTimeout: 15_000,
  },
});
