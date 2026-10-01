/**
 * .71 (1 Oct 2026): the member's own copy, consolidation batch 7 of Codex's adapter map (the donor's src/rights.ts, made
 * the keeper's way). GET /api/me/export answers, to the signed-in account alone, everything this Worker holds about it:
 * the site account, their application, votes, board votes, friends and reserved names; the bot's view (whether they are
 * banned from verifying, whether a Battle.net link is current, the characters bound to them, their code requests, and
 * the dated actions that name them); and every community feature's rows through the registry (community-context.ts
 * registerCommunityData), so a feature that stores a member's data without an exporter cannot exist.
 *
 * Minimization: the copy is about the member, never about others. Another member's Discord id never appears (a vote or
 * a friend shows the label the member chose, a board vote shows the role and the vote, not the candidate; a case or a
 * trial shows dates and outcomes, not the staff); the ban reason and the staff's review notes are the staff's words and
 * are not copied; codes are never stored, so none can be copied. Actions are the fixed action names with their time.
 *
 * The keeper's own statements AND every community section's statements (the registry's plans, .74) run in ONE batch
 * behind the reader boundary (`admittedRead`, capability authenticatedIdentity: the live row and the session alone, so a
 * denied or departed member can still read their copy): one transaction, one instant. A version invalidated, an erasure
 * or the database cookie deadline before that batch refuses the whole copy; after it nothing is queried again, so the
 * body is never a partial "everything" (Codex's review of .71, 1 Oct 04:24 UTC: the .71 exporters ran after the batch
 * on their own, and one read after the reader lost standing returned a case). Five copies an hour per account; each is
 * audited as `site.copy_exported` with no details. The answer is a JSON attachment.
 *
 * .74, Codex's complementary review of .71 (1 Oct 04:36 UTC): the copy carries no STRUCTURAL reference to another Discord
 * account (a vote's nominee and a friend are the label the member chose, without the `kind` that said "a Discord
 * account"; the member's own free text may still mention people); it includes the member's own invite-queue state
 * (character, status, attempts, dates, the fixed refusal reason; never the officer, the watcher's claim or the note); the
 * dated actions are those naming the account as their subject OR their actor, the earliest 1000 from the point asked
 * for, with `actions.nextCursor` and `?actions=<cursor>` continuing them in bounded pages; and the `about` text says how
 * the copy was captured rather than promising more.
 *
 * .76 (Codex's complementary .71/.74 findings, 1 Oct 05:05 UTC): `generatedAt` is the database's own clock read INSIDE the
 * copy's batch (its first statement), so "read together at generatedAt" is literally the capture instant and not the
 * body's later preparation time; and the application's parsed answers carry their references as kind and label only in
 * the OWN copy (the structural account key is another member's id; appOut, the forms and the member's free text are
 * untouched everywhere else).
 */
import type { Env } from "./env";
import { audit } from "./db";
import { bnetFresh } from "./bnet-retention";
import { apiJson, appOut, rateLimited, type AppRow, type SiteUser } from "./site-core";
import { admittedRead, communityContext, communityExportPlan, FENCE_REFUSED } from "./community-context";
import { secondsToIso } from "./community-time";

const ACTIONS_LIMIT = 1000;
/** `?actions=<ts>.<id>`: continue the dated actions after that row (the previous page's `nextCursor`). */
const ACTION_CURSOR = /^(\d{1,12})\.(\d{1,12})$/;
const iso = (s: number | null | undefined) => (typeof s === "number" ? secondsToIso(s) : null);

/** .76: the member's application for their OWN copy: the parsed answers' references carry kind and label only (the key is another member's id). */
function ownApplication(a: ReturnType<typeof appOut>) {
  const answers: Record<string, unknown> = { ...a.answers };
  if (Array.isArray(answers.references)) answers.references = (answers.references as Record<string, unknown>[]).map((r) => ({ kind: r.kind, label: r.label }));
  return { ...a, answers };
}

export async function exportMyData(request: Request, env: Env, user: SiteUser): Promise<Response> {
  const id = user.discord_id;
  const rawCursor = new URL(request.url).searchParams.get("actions");
  const cursor = rawCursor === null ? null : ACTION_CURSOR.exec(rawCursor);
  if (rawCursor !== null && !cursor) return apiJson({ error: "invalid_cursor" }, 400);
  if (rateLimited(`cx:${id}`, 5, 3600)) return apiJson({ error: "slow_down", message: "Five copies an hour. Try again later." }, 429);
  const ctx = await communityContext(env, request);
  const plan = communityExportPlan(env, id); // .74: every community section's statements, in this same batch
  const out = await admittedRead(env, ctx, "authenticatedIdentity", [
    env.DB.prepare("SELECT CAST(strftime('%s', 'now') AS INTEGER) AS at"), // .76: the capture instant, the database's clock inside this batch
    env.DB.prepare("SELECT discord_id, username, global_name, nick, avatar, account_created, server_joined, first_login, last_login, checked_at, in_server, denied, denied_at FROM site_users WHERE discord_id = ?1").bind(id),
    env.DB.prepare("SELECT * FROM site_applications WHERE discord_id = ?1").bind(id),
    env.DB.prepare("SELECT ballot, slot, nominee_kind, nominee_label, reason, created_at, updated_at FROM site_votes WHERE voter_id = ?1 ORDER BY ballot, slot").bind(id),
    env.DB.prepare("SELECT role_key, vote, created_at, updated_at FROM site_board_votes WHERE voter_id = ?1 ORDER BY role_key, created_at").bind(id),
    env.DB.prepare("SELECT friend_kind, friend_label, note, created_at FROM site_friends WHERE owner_id = ?1 ORDER BY created_at, friend_label").bind(id),
    env.DB.prepare("SELECT name, status, created_at, approved_at, queued_at, released_at FROM site_reserved WHERE owner_id = ?1 ORDER BY id").bind(id),
    env.DB.prepare("SELECT banned, linked_at, bnet_linked_at, username, global_name, names_at FROM members WHERE discord_id = ?1").bind(id),
    env.DB.prepare("SELECT name, status, bound_at, verified_at, member_since, left_at, source FROM characters WHERE discord_id = ?1 ORDER BY bound_at, name").bind(id),
    env.DB.prepare("SELECT name, created_at, expires_at, consumed_at, consumed_source FROM pending WHERE discord_id = ?1 ORDER BY created_at").bind(id),
    // .74: the member's own queue state, never the officer, the claim or the note; the actions naming them as subject OR actor, paged
    env.DB.prepare("SELECT name, status, attempts, created_at, written_at, invited_at, joined_at, retry_after, last_reason, last_reason_at FROM invite_queue WHERE discord_id = ?1 ORDER BY created_at, id").bind(id),
    env.DB.prepare("SELECT ts, id, action FROM audit WHERE (subject = ?1 OR actor = ?1) AND (?3 = 0 OR ts > ?4 OR (ts = ?4 AND id > ?5)) ORDER BY ts, id LIMIT ?2").bind(id, ACTIONS_LIMIT + 1, cursor ? 1 : 0, cursor ? Number(cursor[1]) : 0, cursor ? Number(cursor[2]) : 0),
    ...plan.statements,
  ]);
  if (out === FENCE_REFUSED) {
    const fresh = await communityContext(env, request);
    return fresh.subject ? apiJson({ error: "conflict", message: "Your session changed while the copy was being made. Try again." }, 409) : apiJson({ error: "signed_out", message: "You are signed out. Sign in with Discord again." }, 401);
  }
  const [clock, account, app, votes, board, friends, reserved, member, characters, requests, queue, actions] = out;
  type Rec = Record<string, unknown>;
  const a = (account!.results[0] ?? null) as Rec | null;
  const m = (member!.results[0] ?? null) as Rec | null;
  const actionRows = actions!.results as { ts: number; id: number; action: string }[];
  const actionPage = actionRows.slice(0, ACTIONS_LIMIT), lastAction = actionPage.at(-1);
  const body = {
    generatedAt: secondsToIso((clock!.results[0] as { at: number }).at),
    about: "A copy of what Olympus Verify and the Olympus guild site hold about your Discord account, curated for you (no staff notes, reasons or identities, no raw roster snapshots, no private details of recorded payments; your own labels and free text as you wrote them), read together in one database transaction at generatedAt (the database's clock inside that read). The dated actions are the earliest 1000 naming your account (as their subject or their actor) from the point you asked for, as their time and action name; when more exist, actions.nextCursor is where to continue (?actions=).",
    account: a
      ? { discordId: a.discord_id, username: a.username, displayName: a.global_name, nickname: a.nick, avatar: a.avatar, accountCreated: iso(a.account_created as number | null), joinedServer: iso(a.server_joined as number | null), firstSignIn: iso(a.first_login as number), lastSignIn: iso(a.last_login as number), lastMembershipCheck: iso(a.checked_at as number | null), inServer: a.in_server === 1, denied: a.denied === 1, deniedAt: iso(a.denied_at as number | null) }
      : null,
    site: {
      application: app!.results[0] ? ownApplication(appOut(app!.results[0] as AppRow)) : null,
      votes: (votes!.results as Rec[]).map((v) => ({ ballot: v.ballot, slot: v.slot, nominee: { label: v.nominee_label }, reason: v.reason, createdAt: iso(v.created_at as number), updatedAt: iso(v.updated_at as number) })), // .74: the label chosen, no structural account reference
      boardVotes: (board!.results as Rec[]).map((v) => ({ role: v.role_key, vote: v.vote, createdAt: iso(v.created_at as number), updatedAt: iso(v.updated_at as number) })),
      friends: (friends!.results as Rec[]).map((f) => ({ label: f.friend_label, note: f.note, createdAt: iso(f.created_at as number) })),
      reserved: (reserved!.results as Rec[]).map((r) => ({ name: r.name, status: r.status, createdAt: iso(r.created_at as number), approvedAt: iso(r.approved_at as number | null), queuedAt: iso(r.queued_at as number | null), releasedAt: iso(r.released_at as number | null) })),
    },
    verification: {
      known: m !== null,
      bannedFromVerifying: m?.banned === 1,
      battleNet: m ? { linked: bnetFresh(m.linked_at as number | null), linkedAt: bnetFresh(m.linked_at as number | null) ? iso(m.linked_at as number) : null, profileLinkedAt: bnetFresh(m.bnet_linked_at as number | null) ? iso(m.bnet_linked_at as number) : null } : null,
      discordNames: m ? { username: m.username, displayName: m.global_name, readAt: iso(m.names_at as number | null) } : null,
      characters: (characters!.results as Rec[]).map((c) => ({ name: c.name, status: c.status, boundAt: iso(c.bound_at as number), verifiedAt: iso(c.verified_at as number | null), memberSince: iso(c.member_since as number | null), leftAt: iso(c.left_at as number | null), source: c.source })),
      codeRequests: (requests!.results as Rec[]).map((p) => ({ character: p.name, createdAt: iso(p.created_at as number), expiresAt: iso(p.expires_at as number), usedAt: iso(p.consumed_at as number | null), usedThrough: p.consumed_source })),
      inviteQueue: (queue!.results as Rec[]).map((q) => ({ character: q.name, status: q.status, attempts: q.attempts, createdAt: iso(q.created_at as number), writtenAt: iso(q.written_at as number | null), invitedAt: iso(q.invited_at as number | null), joinedAt: iso(q.joined_at as number | null), retryAfter: iso(q.retry_after as number | null), lastRefusal: q.last_reason ? { reason: q.last_reason, at: iso(q.last_reason_at as number | null) } : null })),
    },
    actions: { entries: actionPage.map((r) => ({ at: secondsToIso(r.ts), action: r.action })), truncated: actionRows.length > ACTIONS_LIMIT, nextCursor: actionRows.length > ACTIONS_LIMIT && lastAction ? `${lastAction.ts}.${lastAction.id}` : null },
    community: plan.shape(out.slice(12)), // .74: read in the same transaction as everything above
  };
  await audit(env, id, "site.copy_exported", id);
  return apiJson(body, 200, { "Content-Disposition": 'attachment; filename="olympus-my-data.json"' });
}
