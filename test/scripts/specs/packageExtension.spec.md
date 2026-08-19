# package-extension helpers

> Produce a Chrome Web Store-ready zip of the built extension.

The Chrome Web Store rejects or bloats on files that have no business in a
distributed extension. The helpers in `scripts/package-extension.mjs` decide
what goes in the zip and what it is called. The zip's contents are the
contract: whatever `collectFiles` returns is what a user installs.

## `shouldExclude(relPath)`

Given a path relative to the build output directory, decide whether it must be
kept out of the zip.

### Should

- Exclude sourcemaps (any path ending `.map`). This is the expensive one:
  `popup.js.map` is over 1MB, several times the size of everything else
  combined, and the store has no use for it.
- Exclude `.DS_Store`.
- Exclude any dotfile, meaning a path segment beginning with `.`.
- Keep the real extension payload: `manifest.json`, `popup.js`, `popup.html`,
  `popup.css`, and files under `icons/`.
- Treat a Windows-style separator the same as a forward slash, so the same
  decision is reached regardless of the host OS.
- Never throw, for any string input including the empty string.

### Acceptance criteria

- `shouldExclude("popup.js.map")` is `true`.
- `shouldExclude("popup.js")` is `false`.
- `shouldExclude("manifest.json")` is `false`.
- `shouldExclude("icons/icon-16.png")` is `false`.
- `shouldExclude(".DS_Store")` is `true`.

## `zipName(version)`

### Should

- Return `cloudtracer-extension-<version>.zip` for the given version string.

### Acceptance criteria

- `zipName("0.1.0")` is `"cloudtracer-extension-0.1.0.zip"`.

## `collectFiles(dir, base)`

Walk a directory and return the files that belong in the zip.

### Should

- Return one entry per file, shaped `{ abs, rel, size }`, where `rel` is the
  path relative to `base` and `size` is the file's size in bytes.
- Default `base` to `dir` when it is not supplied, so a single-argument call
  yields paths relative to the directory being walked.
- Recurse into subdirectories, returning their files rather than the directory
  itself.
- Apply the same exclusions as `shouldExclude`, including skipping the contents
  of an excluded directory.
- Use forward slashes in `rel` on every platform.
- Return the entries sorted by `rel`, so two runs over the same tree produce
  the same ordering and the zip is reproducible.

### Acceptance criteria

- Walking a directory holding `manifest.json` and `popup.js.map` returns only
  `manifest.json`.
- A nested file is returned with a `rel` of `icons/icon-16.png`, not just its
  basename.
- The returned array is in ascending `rel` order.

## `formatSize(bytes)`

### Should

- Render byte counts under 1024 as `"<n> B"`.
- Render counts under 1024 * 1024 in KB with one decimal place.
- Render anything larger in MB with two decimal places.

### Acceptance criteria

- `formatSize(512)` is `"512 B"`.
- `formatSize(2048)` is `"2.0 KB"`.
- `formatSize(1048576)` is `"1.00 MB"`.

## Notes

- These helpers are pure with respect to their inputs except `collectFiles`,
  which reads the filesystem. None of them mutate anything on disk.
