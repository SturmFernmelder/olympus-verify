/** Admission: review cards in #recruitment-review (ADMISSION_MODE=review) and the invite queue. */
import type { Env } from "./env";
import { audit, now, type PendingRow } from "./db";
import { postMessage } from "./discord";
import { notify } from "./dm";

export async function enqueueInvite(env: Env, nameKey: string, name: string, discordId: string, approvedBy: string) {
  const note = env.SET_GUILD_NOTE === "true" ? `D:${discordId}` : null; // public note ≤ 31 chars; "D:" + 17–19 digits fits
  // Build .41: a live row for this name (queued, written, or invited and not accepted yet) is taken over in place
  // rather than replaced. The applicant keeps their place in line, a reserved name the guild site put at the top keeps
  // its priority, the officer holding the row keeps it (claims are sticky, see getQueue), and refusals so far still
  // count. Only a name with no live row gets a new one, at the back.
  //
  // Until .41 the old row was cancelled and a new one inserted, and 'invited' rows were left alone: an invite that
  // went out and was not accepted came back to the queue after 30 minutes (sweepInviteQueue) next to its replacement,
  // so the same name was served twice.
  const live = await env.DB.prepare(
    "SELECT id, priority FROM invite_queue WHERE name_key = ?1 AND status IN ('queued','written','invited') ORDER BY priority DESC, id LIMIT 1",
  )
    .bind(nameKey)
    .first<{ id: number; priority: number | null }>();
  const steps = live
    ? [
        // An invite that is out goes back to 'queued' (they verified again, so it is worth sending again); a row that
        // is only waiting keeps its status. A backoff after a refusal is lifted.
        // The old refusal reason goes too: /verify-status would still tell them to leave their old guild, and the
        // officer's panel would still sort them last.
        env.DB.prepare(
          `UPDATE invite_queue SET name = ?2, discord_id = ?3, note = ?4, approved_by = ?5, retry_after = NULL,
                  last_reason = NULL, last_reason_at = NULL,
                  status = CASE WHEN status = 'invited' THEN 'queued' ELSE status END
            WHERE id = ?1`,
        ).bind(live.id, name, discordId, note, approvedBy),
        // Any other live row for the same name (left over from before .41) goes.
        env.DB.prepare("UPDATE invite_queue SET status = 'cancelled' WHERE name_key = ?1 AND status IN ('queued','written','invited') AND id <> ?2").bind(nameKey, live.id),
      ]
    : [
        // A name the guild site queued whose invite ran out of tries (or was cancelled) keeps the admin's promise:
        // it goes back in at the top. Not after a decline (the rule in postEvents: a "no" goes to the back of the
        // line, like anyone's) and not once they had joined.
        env.DB.prepare(
          `INSERT INTO invite_queue (name_key, name, discord_id, note, status, created_at, approved_by, priority)
           VALUES (?1, ?2, ?3, ?4, 'queued', ?5, ?6,
                   CASE WHEN EXISTS (SELECT 1 FROM site_reserved r JOIN invite_queue q ON q.id = r.queue_id
                                      WHERE r.name_key = ?1 AND r.status = 'queued' AND q.status IN ('expired','cancelled'))
                        THEN 1 ELSE 0 END)`,
        ).bind(nameKey, name, discordId, note, now(), approvedBy),
      ];
  await env.DB.batch([
    ...steps,
    env.DB.prepare("UPDATE characters SET status = 'queued' WHERE name_key = ?1 AND discord_id = ?2").bind(nameKey, discordId),
    env.DB.prepare(
      "UPDATE site_reserved SET queue_id = (SELECT MAX(id) FROM invite_queue WHERE name_key = ?1 AND status IN ('queued','written')) WHERE name_key = ?1 AND status = 'queued'",
    ).bind(nameKey),
  ]);
  await audit(env, approvedBy, "invite.queued", name, { discordId, ...(live ? { kept: live.id } : {}), ...(live?.priority ? { priority: live.priority } : {}) });
}

/** Called after an in-game code was validated. Returns the message shown to the applicant by DM. */
export async function onVerified(env: Env, pending: PendingRow, source: string): Promise<void> {
  if (env.ADMISSION_MODE === "auto") {
    await enqueueInvite(env, pending.name_key, pending.name, pending.discord_id, "auto");
    await safeDm(env, pending.discord_id, `**${pending.name}** is verified. Your guild invite fires from an officer's client on their next flush; your Guild Member role follows once you appear on the roster.`);
    return;
  }
  const msg = await postMessage(env, env.CHANNEL_RECRUITMENT_REVIEW, {
    content: `**Application — ${pending.name}** (<@${pending.discord_id}>), code confirmed in game via ${source} <t:${now()}:R>.`,
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 3, label: "Approve — queue invite", custom_id: `review:approve:${pending.id}` },
          { type: 2, style: 4, label: "Deny", custom_id: `review:deny:${pending.id}` },
        ],
      },
    ],
    allowed_mentions: { parse: [] },
  });
  await env.DB.prepare("UPDATE pending SET consumed_source = ?2 WHERE id = ?1").bind(pending.id, `${source}:card:${msg.id}`).run();
  await safeDm(env, pending.discord_id, `**${pending.name}** is verified and waiting for an officer's approval. You will get a DM when the invite is queued.`);
}

export async function approvePending(env: Env, pendingId: number, actor: string): Promise<{ ok: boolean; message: string }> {
  const p = await env.DB.prepare("SELECT * FROM pending WHERE id = ?1").bind(pendingId).first<PendingRow>();
  if (!p) return { ok: false, message: "That application no longer exists." };
  const ch = await env.DB.prepare("SELECT status, discord_id FROM characters WHERE name_key = ?1").bind(p.name_key).first<{ status: string; discord_id: string }>();
  if (!ch || ch.discord_id !== p.discord_id || ch.status === "unbound") return { ok: false, message: "This binding was removed; ask the applicant to run /verify again." };
  if (ch.status === "queued" || ch.status === "member") return { ok: false, message: `Already ${ch.status}.` };
  const member = await env.DB.prepare("SELECT banned FROM members WHERE discord_id = ?1").bind(p.discord_id).first<{ banned: number }>();
  if (member?.banned) return { ok: false, message: "This account is banned from verification." };
  await enqueueInvite(env, p.name_key, p.name, p.discord_id, actor);
  await safeDm(env, p.discord_id, `Approved — your invite for **${p.name}** is queued and fires from an officer's client on their next flush. Accept it in game; your Guild Member role follows automatically.`);
  return { ok: true, message: `✅ **${p.name}** (<@${p.discord_id}>) approved by <@${actor}> <t:${now()}:R> — invite queued.` };
}

export async function denyPending(env: Env, pendingId: number, actor: string): Promise<{ ok: boolean; message: string }> {
  const p = await env.DB.prepare("SELECT * FROM pending WHERE id = ?1").bind(pendingId).first<PendingRow>();
  if (!p) return { ok: false, message: "That application no longer exists." };
  await env.DB.batch([
    env.DB.prepare("UPDATE characters SET status = 'denied' WHERE name_key = ?1 AND discord_id = ?2 AND status = 'verified'").bind(p.name_key, p.discord_id),
    env.DB.prepare("UPDATE invite_queue SET status = 'cancelled' WHERE name_key = ?1 AND status IN ('queued','written')").bind(p.name_key),
  ]);
  await audit(env, actor, "review.denied", p.name, { discordId: p.discord_id });
  await safeDm(env, p.discord_id, `Your application for **${p.name}** was not approved. You can ask in #help-desk if you want to know why.`);
  return { ok: true, message: `❌ **${p.name}** (<@${p.discord_id}>) denied by <@${actor}> <t:${now()}:R>.` };
}

/** Review decisions are user-initiated and never arrive in bulk, but they share the Worker-wide rate cap anyway. */
async function safeDm(env: Env, userId: string, content: string) {
  await notify(env, userId, content, "review");
}
