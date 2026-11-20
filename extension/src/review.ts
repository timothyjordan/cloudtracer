/**
 * Local scan counter and review-link helpers for the Chrome extension popup.
 *
 * Only stores a single integer (`completedScanCount`) in `chrome.storage.local`.
 * No domains or scan results are stored, and the count is never sent in telemetry.
 */

export const SCAN_COUNT_KEY = "completedScanCount";
export const REVIEW_SCAN_THRESHOLD = 5;

export function getReviewUrl(extensionId?: string): string | null {
  if (typeof extensionId !== "string" || extensionId.trim().length === 0) {
    return null;
  }
  return `https://chromewebstore.google.com/detail/${extensionId.trim()}/reviews`;
}

export function shouldShowReviewLink(completedScans: number): boolean {
  return completedScans >= REVIEW_SCAN_THRESHOLD;
}

function readStorage(keys: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (items) => resolve(items ?? {}));
    } catch {
      resolve({});
    }
  });
}

function writeStorage(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set(items, () => resolve());
    } catch {
      resolve();
    }
  });
}

export async function getCompletedScanCount(): Promise<number> {
  const items = await readStorage([SCAN_COUNT_KEY]);
  const raw = items[SCAN_COUNT_KEY];
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return Math.floor(raw);
  }
  return 0;
}

export async function incrementCompletedScanCount(): Promise<number> {
  const next = (await getCompletedScanCount()) + 1;
  await writeStorage({ [SCAN_COUNT_KEY]: next });
  return next;
}
