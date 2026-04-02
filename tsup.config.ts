import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const { version } = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: "esm",
    dts: true,
    clean: true,
    target: "node20",
  },
  {
    entry: { cli: "src/cli.ts" },
    format: "esm",
    clean: false,
    target: "node20",
    banner: {
      js: "#!/usr/bin/env node",
    },
    define: {
      __PACKAGE_VERSION__: JSON.stringify(version),
    },
  },
]);
