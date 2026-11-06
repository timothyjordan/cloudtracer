// Builds the Chrome extension into dist-extension/ using esbuild.
// Bundles the popup (which imports the node-free browser core) and copies the
// static assets and manifest. Run with `--watch` for iterative development.
import * as esbuild from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = resolve(root, "dist-extension");
const watch = process.argv.includes("--watch");

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

async function copyStatic() {
  await cp(resolve(root, "extension/src/popup.html"), resolve(outdir, "popup.html"));
  await cp(resolve(root, "extension/src/popup.css"), resolve(outdir, "popup.css"));
  await cp(resolve(root, "extension/manifest.json"), resolve(outdir, "manifest.json"));
  await cp(resolve(root, "extension/icons"), resolve(outdir, "icons"), {
    recursive: true,
    // Ship only the PNGs, not the generator script.
    filter: (src) => !src.endsWith(".mjs"),
  });
}

const buildOptions = {
  entryPoints: { popup: resolve(root, "extension/src/popup.ts") },
  // Injected from the environment at build time, matching tsup for the CLI.
  // Absent locally, in forks, and in contributor builds, where they resolve to
  // "" so the telemetry core selects its noop adapter and the extension sends
  // nothing. Only official release builds, where CI supplies these, carry the
  // key. The key is a PostHog project token: public and write-only by design,
  // which is why it is safe inside a store-distributed zip.
  define: {
    __POSTHOG_KEY__: JSON.stringify(process.env.POSTHOG_KEY ?? ""),
    __POSTHOG_HOST__: JSON.stringify(process.env.POSTHOG_HOST ?? ""),
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome120",
  outdir,
  sourcemap: true,
  logLevel: "info",
};

await copyStatic();

if (watch) {
  // Re-copy static assets whenever the bundle rebuilds.
  const ctx = await esbuild.context({
    ...buildOptions,
    plugins: [
      {
        name: "copy-static",
        setup(build) {
          build.onEnd(() => copyStatic());
        },
      },
    ],
  });
  await ctx.watch();
  console.log(`watching... extension output in ${outdir}`);
} else {
  await esbuild.build(buildOptions);
  console.log(`built extension into ${outdir}`);
}
