import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // Vendored agent skills ship their own test files; keep them out of the project suite.
    exclude: [...configDefaults.exclude, ".agents/**", ".claude/**"],
    coverage: {
      provider: "v8",
    },
  },
});
