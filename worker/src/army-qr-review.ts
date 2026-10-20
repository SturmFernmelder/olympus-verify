/** Owner's 20 October 2026 review stage: collection is unavailable, with no configurable activation path. */
import { apiJson } from "./site-core";

const API_ROOT = "/api/community/army/qr";

export function armyQrReviewContract() {
  return Object.freeze({ format: "olympus-army-qr-review-v1", activationEnabled: false,
    uploadsEnabled: false, storageEnabled: false } as const);
}

/** Runs before Community context or body work. This is a refusal, never an upload handler. */
export function armyQrReviewRefusal(path: string): Response | null {
  // Entry callers pass URL.pathname; retain refusal if a direct caller includes a query or fragment.
  const pathname = path.split(/[?#]/, 1)[0];
  if (pathname !== API_ROOT && !pathname.startsWith(API_ROOT + "/")) return null;
  return apiJson({ error: "not_found", ...armyQrReviewContract() }, 404);
}
