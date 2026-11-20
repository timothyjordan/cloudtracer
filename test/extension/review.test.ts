import { describe, it, expect, afterEach } from "vitest";
import {
  REVIEW_SCAN_THRESHOLD,
  SCAN_COUNT_KEY,
  getCompletedScanCount,
  getReviewUrl,
  incrementCompletedScanCount,
  shouldShowReviewLink,
} from "../../extension/src/review.js";

type Store = Record<string, unknown>;

function installChrome(opts: { store?: Store; throwOnGet?: boolean; throwOnSet?: boolean } = {}) {
  const store: Store = opts.store ?? {};
  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      local: {
        get(keys: string[], cb: (items: Store) => void) {
          if (opts.throwOnGet) throw new Error("storage unavailable");
          const out: Store = {};
          for (const k of keys) if (k in store) out[k] = store[k];
          cb(out);
        },
        set(items: Store, cb: () => void) {
          if (opts.throwOnSet) throw new Error("storage unavailable");
          Object.assign(store, items);
          cb();
        },
      },
    },
  };
  return store;
}

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe("extension review link helpers", () => {
  it("builds the Chrome Web Store reviews URL from the extension ID", () => {
    expect(getReviewUrl("klfokgmnbefiicclofmegijlcdahmafk")).toBe(
      "https://chromewebstore.google.com/detail/klfokgmnbefiicclofmegijlcdahmafk/reviews",
    );
  });

  it("returns null when extension ID is missing or blank", () => {
    expect(getReviewUrl(undefined)).toBeNull();
    expect(getReviewUrl("")).toBeNull();
    expect(getReviewUrl("   ")).toBeNull();
  });

  it("shows the review link only at or above the threshold of 5 completed scans", () => {
    expect(REVIEW_SCAN_THRESHOLD).toBe(5);
    expect(shouldShowReviewLink(0)).toBe(false);
    expect(shouldShowReviewLink(4)).toBe(false);
    expect(shouldShowReviewLink(5)).toBe(true);
    expect(shouldShowReviewLink(12)).toBe(true);
  });

  it("reads 0 when storage is empty, corrupt, or unavailable", async () => {
    installChrome();
    expect(await getCompletedScanCount()).toBe(0);

    installChrome({ store: { [SCAN_COUNT_KEY]: "bad" } });
    expect(await getCompletedScanCount()).toBe(0);

    installChrome({ store: { [SCAN_COUNT_KEY]: -3 } });
    expect(await getCompletedScanCount()).toBe(0);

    installChrome({ throwOnGet: true });
    expect(await getCompletedScanCount()).toBe(0);

    delete (globalThis as { chrome?: unknown }).chrome;
    expect(await getCompletedScanCount()).toBe(0);
  });

  it("increments the local scan count without storing any domains", async () => {
    const store = installChrome();

    for (let i = 1; i <= 5; i++) {
      expect(await incrementCompletedScanCount()).toBe(i);
    }

    expect(store).toEqual({ [SCAN_COUNT_KEY]: 5 });
    expect(await getCompletedScanCount()).toBe(5);
  });

  it("never throws when storage set fails", async () => {
    installChrome({ store: { [SCAN_COUNT_KEY]: 4 }, throwOnSet: true });
    expect(await incrementCompletedScanCount()).toBe(5);
  });
});
