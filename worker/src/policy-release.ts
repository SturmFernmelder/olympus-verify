/** Immutable same-version collection profile. Credentials/settings/HTML markers cannot enable this OFF release. */
import { POLICY_SOURCE_DIGEST } from "./policy-content";
export const BNET_RELEASE = Object.freeze({
  profile: "OFF" as "OFF" | "ON",
  policyVersion: POLICY_SOURCE_DIGEST,
  onPolicyVersion: null as string | null,
  foreverOwnershipApiReviewed: false,
  recoveryPlanReviewed: false,
});
export function bnetReleasedOn(): boolean {
  return BNET_RELEASE.profile === "ON" && BNET_RELEASE.onPolicyVersion === POLICY_SOURCE_DIGEST && BNET_RELEASE.foreverOwnershipApiReviewed && BNET_RELEASE.recoveryPlanReviewed;
}
