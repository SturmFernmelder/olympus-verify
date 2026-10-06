/** Composition ABI only. This shipped candidate cannot open it with settings, credentials or an environment boolean. */
import type { Env } from "./env";
import type { PrivacyPurpose, PrivacyCapture } from './account-privacy-generations';
export { PRIVACY_PURPOSES, snapshotPrivacyCapture as snapshotCapture } from './account-privacy-generations';
export type { PrivacyPurpose, PrivacyCapture } from './account-privacy-generations';
export interface PrivacyAuthority {
  readonly implementation: "reviewed-generation-successor" | "unadopted";
  /** Existing account lookup only. No account creation, no NULL-current fallback, no membership admission. */
  capture(env: Env, subject: string, purpose: PrivacyPurpose): Promise<PrivacyCapture | null>;
  current(env: Env, capture: PrivacyCapture): Promise<boolean>;
  exportOwn(env: Env, capture: PrivacyCapture): Promise<Response>;
  control(env: Env, capture: PrivacyCapture, action: "site-erase" | "full-erase" | "bnet-unlink", operation: string): Promise<Response>;
}
export const CLOSED_PRIVACY_AUTHORITY: PrivacyAuthority = Object.freeze({
  implementation: "unadopted" as const,
  async capture() { return null; }, async current() { return false; },
  async exportOwn() { throw new Error("privacy_generation_not_adopted"); },
  async control() { throw new Error("privacy_generation_not_adopted"); },
});
