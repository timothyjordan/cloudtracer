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
      // Injected from the environment at build time. Absent in local dev, in
      // forks, and in contributor builds, which resolve to "" so the telemetry
      // core selects its noop adapter and sends nothing. Only official release
      // builds, where CI supplies these, carry the key.
      __POSTHOG_KEY__: JSON.stringify(process.env.POSTHOG_KEY ?? ""),
      __POSTHOG_HOST__: JSON.stringify(process.env.POSTHOG_HOST ?? ""),
    },
  },
]);
