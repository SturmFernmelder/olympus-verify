/** Local-only future control seam, usable independently of the sign-in switch once its purpose successor is integrated. */
import type { Env } from "./env";
import { BNET_AUDIT_ACTIONS } from "./bnet-retention";
import { PRIVACY_SESSION_FENCE } from "./privacy-identity";
import { snapshotCapture, type PrivacyCapture, type PrivacyAuthority } from "./privacy-rights-hooks";
import { apiJson } from "./site-core";
export async function localBattleNetUnlink(env: Env, authority: PrivacyAuthority, input: PrivacyCapture): Promise<Response> {
  if (authority.implementation !== "reviewed-generation-successor") return apiJson({ status: "not_performed", reason: "privacy_generation_not_adopted", remoteConnectionRemoved: false }, 503);
  const c = snapshotCapture(input);
  if (c.purpose !== "privacy_bnet_unlink") return apiJson({ status: "not_performed", reason: "wrong_purpose" }, 403);
  const v = [c.subject,c.accountGeneration,c.purpose,c.purposeGeneration,c.epoch,c.lifecycle];
  // This batch neither needs nor turns on BNET_RELEASE/adminOn; every mutation independently carries the current tuple.
  const result = await env.DB.batch([
    env.DB.prepare(`SELECT 1 AS admitted WHERE ${PRIVACY_SESSION_FENCE}`).bind(...v),
    env.DB.prepare(`UPDATE members SET battletag=NULL,bnet_conn_id=NULL,linked_at=NULL,bnet_account_id=NULL,bnet_linked_at=NULL WHERE discord_id=?1 AND ${PRIVACY_SESSION_FENCE}`).bind(...v),
    env.DB.prepare(`DELETE FROM bnet_characters WHERE discord_id=?1 AND ${PRIVACY_SESSION_FENCE}`).bind(...v),
    env.DB.prepare(`UPDATE audit SET subject='[unlinked]',details=NULL WHERE actor=?1 AND action IN (${BNET_AUDIT_ACTIONS.map((_,i)=>`?${i+7}`).join(',')}) AND ${PRIVACY_SESSION_FENCE}`).bind(...v,...BNET_AUDIT_ACTIONS),
  ]);
  if (!result[0]?.results.length) return apiJson({ status: "not_performed", reason: "generation_changed", remoteConnectionRemoved: false }, 409);
  return apiJson({ status: "local_unlink_completed", localRows: { members: result[1]?.meta.changes ?? 0, characters: result[2]?.meta.changes ?? 0, auditReferences: result[3]?.meta.changes ?? 0 }, remoteConnectionRemoved: false, completeErasure: false, remainingCopies: ["Discord connection must be removed in Discord Settings → Connections", "provider/private recovery/local copies require separate handling"], rolesChanged: false });
}
