import { defineConfig } from "vitest/config";

// Explicit, self-contained config so vitest's upward directory search
// stops here rather than picking up an unrelated project's vite/vitest
// config from a parent directory (this repo lives several levels under
// a shared workspace root shared with other, unrelated projects).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
