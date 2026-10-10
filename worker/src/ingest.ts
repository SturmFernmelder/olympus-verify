import { readPrivacySubject, admittedPrivacySubjectWrite, pendingPrivacyCapture,privacyBoundSubjectEnv,PrivacySiteRequestHeld,privacyCaptureFromColumns,privacyGenerationFenceSql,type PrivacySubject } from './privacy-serving-authority';
/** Endpoints for the officer-side watcher (bearer WATCHER_TOKEN). */
import { intVar, staffChannel, type Env } from "./env";
import { audit, getCharacter, getMember, linksNotBefore, now, openPendingFor, openTicket, type PendingRow,type PrivacyReference } from "./db";
import { dayBucket, isValidCode, isValidTicket, normalizeCharacter, normalizeCodeInput, TICKET_LENGTH, ticketFor, ticketNonce } from "./codes";
import { json, logLine, postMessage, staffNotice } from "./discord";
import { onVerified } from "./review";
import { flushNotices, notify, noticeBatch, type NoticeBatch } from "./dm";
import { demote, guidOf, ingestRoster, isCurrentRoster, latestRosterEntry, onLatestRoster, promote, ROSTER_PIN_WITHIN, type RosterMemberIn } from "./roster";
import { callBudget } from "./roles"; // .90 (P-20): the join events' promotions share one Discord-call budget per batch
import { guildSeats, seatsStaffLine } from "./guild-seats";
import { messageOperationId,postPrivacyMessage } from './privacy-provider-messages';

type WatcherCapture = { references: PrivacyReference[] };
type CapturedQueue = {id:number;discord_id:string;name_key:string;name:string;created_at:number;status:string;attempts:number|null;retry_after:number|null;last_reason:string|null;claimed_by:string|null;claimed_at:number|null;last_reason_at:number|null;note:string|null;written_at:number|null;invited_at:number|null;joined_at:number|null;approved_by:string|null;priority:number;privacy_generation:string|null;privacy_state:string|null;privacy_revision:number|null};
const queueSelect = "SELECT q.*,p.generation AS privacy_generation,p.state AS privacy_state,p.revision AS privacy_revision FROM invite_queue q LEFT JOIN privacy_subjects p ON p.subject_id=q.discord_id ";
/** The event consumes the physical row it originally observed, never a replacement under its name/id. */
function queueMutation(env:Env,row:CapturedQueue,set:string,values:unknown[]):D1PreparedStatement {
  const at=values.length+1;
  return env.DB.prepare(`UPDATE invite_queue SET ${set} WHERE id=?${at} AND discord_id=?${at+1}
    AND name_key=?${at+2} AND name=?${at+3} AND created_at=?${at+4} AND status=?${at+5}
    AND attempts IS ?${at+6} AND retry_after IS ?${at+7} AND last_reason IS ?${at+8}
    AND claimed_by IS ?${at+9} AND claimed_at IS ?${at+10} AND last_reason_at IS ?${at+11}
    AND note IS ?${at+12} AND written_at IS ?${at+13} AND invited_at IS ?${at+14}
    AND joined_at IS ?${at+15} AND approved_by IS ?${at+16} AND priority=?${at+17}`)
    .bind(...values,row.id,row.discord_id,row.name_key,row.name,row.created_at,row.status,row.attempts,row.retry_after,row.last_reason,
      row.claimed_by,row.claimed_at,row.last_reason_at,row.note,row.written_at,row.invited_at,row.joined_at,row.approved_by,row.priority);
}
function pendingFingerprintFence(env:Env,p:PendingRow):D1PreparedStatement {
  return env.DB.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM pending WHERE id=?1 AND discord_id=?2
    AND created_at=?3 AND name_key=?4 AND name=?5 AND expires_at=?6 AND nonce IS ?7 AND consumed_at IS NULL
    AND expires_at>CAST(strftime('%s','now') AS INTEGER)) THEN 1 ELSE json_extract('privacy_pending_proof_refused','$') END AS admitted`)
    .bind(p.id,p.discord_id,p.created_at,p.name_key,p.name,p.expires_at,p.nonce??null);
}
function bindWatcher(env:Env,subject:string,capture:PrivacySubject|null,context:WatcherCapture):Env {
  context.references.push({subject,capture});
  return privacyBoundSubjectEnv(env,subject,capture);
}
/** Logging/notification helpers deliberately swallow delivery failures; recheck the original
 * authority before reporting ordinary success, without changing or retrying any payload. */
async function assertWatcherCurrent(env:Env,context:WatcherCapture):Promise<void>{
  const seen=new Set<string>();
  for(const reference of context.references){
    const key=`${reference.subject}:${reference.capture?.subjectGeneration??'absent'}`;
    if(seen.has(key))continue;seen.add(key);
    await privacyBoundSubjectEnv(env,reference.subject,reference.capture).DB.prepare('SELECT 1 AS watcher_current').first();
  }
}
/** A failed native result never proves rollback. Only an observed retired/replaced original generation proves a hold. */
async function watcherHeldResult(env:Env,context:WatcherCapture):Promise<Response> {
  for(const reference of context.references) {
    try {
      const current=await readPrivacySubject(env,reference.subject);
      if(current?.subjectGeneration!==reference.capture?.subjectGeneration||current&&current.state!=='active')
        return json({result:'privacy_held'},409);
    }catch { /* An unavailable read proves no outcome. */ }
  }
  return json({result:'outcome_unknown'},503);
}
/** Identifiable staff posts use the same late-pointer custody as guild-log messages. */
async function watcherStaffNotice(env:Env,payload:unknown,kind:string,references:PrivacyReference[],operationKey:string):Promise<boolean> {
  const channel=staffChannel(env);if(!channel)return false;
  try {
    const operation=await messageOperationId('guild_log',JSON.stringify([kind,operationKey,payload,references.map(r=>[r.subject,r.capture?.subjectGeneration??null])]));
    return !!await postPrivacyMessage(env,'guild_log',channel,payload,references,operation);
  }catch {
    await audit(env,'system','staff_notice.failed',kind,{channel,reason:'privacy_message_not_confirmed'},references);
    return false;
  }
}

/** The shortest WATCHER_TOKEN accepted: README asks for 32+ random characters, and an empty secret must never be a key. */
export const WATCHER_TOKEN_MIN = 32;

/**
 * Build .49: an unset or short WATCHER_TOKEN refuses everyone (before, an empty secret accepted "Bearer " with nothing
 * after it), and both sides are hashed before the constant-time compare so the token's length is not observable.
 */
export async function watcherAuthorized(env: Env, request: Request): Promise<boolean> {
  const token = env.WATCHER_TOKEN ?? "";
  if (token.length < WATCHER_TOKEN_MIN) return false;
  const h = request.headers.get("Authorization") ?? "";
  if (!h.startsWith("Bearer ")) return false;
  const [given, expected] = await Promise.all([sha256(h.slice(7)), sha256(token)]);
  return timingSafeEqual(given, expected);
}

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i]! ^ b[i]!;
  return r === 0;
}

interface VerifyIn {
  character: string;
  code: string;
  source: "whisper" | "mail";
  ts?: number;
  officer?: string;
  /** The whisperer's character ID, from the whisper event itself (the addon signs it; watcher 0.6.0+). Optional. */
  guid?: string;
}

/** A player GUID as the client writes it ("Player-4613-0ABCDEF0"), or null. */
export function playerGuid(v: unknown): string | null {
  const g = guidOf(v);
  return g && /^Player-\d{1,6}-[0-9A-Fa-f]{4,16}$/.test(g) ? g : null;
}

export async function postVerify(env: Env, body: VerifyIn): Promise<Response> {
  const context:WatcherCapture={references:[]};
  try {
    const result=await postVerifyInner(env,body,context);
    if(result.status<400)await assertWatcherCurrent(env,context);
    return result;
  }
  catch(error) { if(error instanceof PrivacySiteRequestHeld)return watcherHeldResult(env,context);throw error; }
}

async function postVerifyInner(env: Env, body: VerifyIn,context:WatcherCapture): Promise<Response> {
  const originalEnv=env;
  const name = (body.character ?? "").trim();
  const nameKey = normalizeCharacter(name);
  if (!nameKey || !body.code) return json({ error: "character and code required" }, 400);

  // Two kinds of code, told apart by length (codes.ts). A character code names its character up front; a request code
  // ("ticket") names nobody, and the character is the whisper's sender -- which the game server vouches for.
  const code = normalizeCodeInput(body.code);
  const ticket = code.length === TICKET_LENGTH;
  const valid = ticket ? await isValidTicket(env.VERIFY_SECRET, code) : await isValidCode(env.VERIFY_SECRET, name, code);
  if (!valid) {
    await audit(env, "watcher", "verify.invalid_code", name, { source: body.source, ticket });
    return json({ result: "invalid" });
  }
  let pending: PendingRow | null = ticket ? await openTicket(env, ticketNonce(code)!) : await openPendingFor(env, nameKey);
  if(pending?.privacy_state&&pending.privacy_state!=='active')return json({result:'privacy_held'},409);
  // Bind immediately after the joint pending/generation read, before ticket crypto or any later await.
  const privacyCapture=pending?pendingPrivacyCapture(pending):null;
  const reference=pending?{subject:pending.discord_id,capture:privacyCapture}:undefined;
  if(pending)env=bindWatcher(env,pending.discord_id,privacyCapture,context);
  // A request code is good for the one request that showed it, and no other. issueTicket never hands out a nonce while
  // an older code for it could still pass, and this makes that a rule rather than a timing argument: an old code whose
  // nonce has since been given to somebody else's request does not match that request's code, so it cannot claim it.
  if (pending && ticket && code !== (await ticketFor(env.VERIFY_SECRET, pending.nonce ?? "", dayBucket(new Date(pending.created_at * 1000))))) {
    await audit(env, "watcher", "verify.ticket_mismatch", name, { source: body.source, pendingId: pending.id },reference);
    pending = null;
  }
  if (!pending) {
    // A valid code with no open request is usually an expired request or a replay. There is one case where it is
    // deliberate: we refused this character's invite because they were in another guild, told them to leave and
    // whisper the code back, and they have now done it. Whispering it again is how they say "done".
    const resumed = await resumeAfterGuildLeave(env, nameKey, name, body.source,context);
    if(resumed&&'refused'in resumed)return json({result:'no_pending'});
    if (resumed) return json({ result: "resumed", ...resumed });
    await audit(env, "watcher", "verify.no_pending", name, { source: body.source, ticket },reference);
    if (ticket) await noteTicketReuse(env, code, nameKey, name,context);
    return json({ result: "no_pending" });
  }
  if(privacyCapture && privacyCapture.state!=='active')return json({result:'privacy_held'},409);
  // A ban closes the account's open requests (/olympus-admin ban), but a code whispered in the moment before the ban,
  // or a request opened by an older build, must not link anything either.
  const account = await getMember(env, pending.discord_id);
  if (account?.banned) {
    await closeRequest(env, pending, "banned");
    await audit(env, "watcher", "verify.banned", name, { discordId: pending.discord_id, source: body.source, ticket },reference);
    await logLine(env, `⛔ verify: **${name}** whispered a valid code for <@${pending.discord_id}>, who is banned from verifying. Nothing was linked.`,[reference!]);
    return json({ result: "banned" });
  }
  const existing = await getCharacter(env, nameKey);
  if (existing && existing.discord_id !== pending.discord_id && !["unbound", "denied", "left"].includes(existing.status)) {
    const references=[reference!,{subject:existing.discord_id,capture:privacyCaptureFromColumns(existing.discord_id,existing)}];
    await audit(env, "watcher", "verify.bound_elsewhere", name, { pendingFor: pending.discord_id, boundTo: existing.discord_id, ticket },references);
    // A request code is closed here: the addon and the watcher have already tied it to this sender, so left open it
    // would sit unusable for a day while Get my code kept showing it. The next press issues a fresh one.
    if (ticket) await closeRequest(env, pending, "refused");
    await logLine(env, `⚠️ verify: **${name}** whispered a valid code but the name is bound to <@${existing.discord_id}> (request from <@${pending.discord_id}>). Not re-linked — an officer must /olympus-admin unbind first.`,references);
    return json({ result: "bound_elsewhere" });
  }
  // The name may be free while the CHARACTER is not: a linked member renamed since the last export, and the link has
  // not followed yet (a rename waits one export when the old holder of the new name must be released first). The
  // whisper's own GUID says which character this is (the addon reads it from the whisper event); failing that, a
  // current roster says which character has this name. If a live link is pinned to it, that link is the character's.
  const whisperGuid = playerGuid(body.guid);
  const onRoster = await latestRosterEntry(env, nameKey);
  const current = !!onRoster && isCurrentRoster(env, onRoster);
  const rosterGuid = current ? guidOf(onRoster!.guid) : null;
  const who = whisperGuid ?? rosterGuid;
  const holder = who
    ? await env.DB.prepare(
        "SELECT c.name,c.discord_id,s.generation AS privacy_generation,s.state AS privacy_state,s.revision AS privacy_revision FROM characters c LEFT JOIN privacy_subjects s ON s.subject_id=c.discord_id WHERE c.guid = ?1 AND c.name_key <> ?2 AND c.status IN ('verified','queued','member','left','left_pending') LIMIT 1",
      )
        .bind(who, nameKey)
        .first<{ name: string; discord_id: string;privacy_generation:string|null;privacy_state:string|null;privacy_revision:number|null }>()
    : null;
  if (holder && holder.discord_id !== pending.discord_id) {
    const references=[reference!,{subject:holder.discord_id,capture:privacyCaptureFromColumns(holder.discord_id,holder)}];
    await audit(env, "watcher", "verify.bound_elsewhere", name, { pendingFor: pending.discord_id, boundTo: holder.discord_id, as: holder.name, ticket },references);
    if (ticket) await closeRequest(env, pending, "refused");
    await logLine(env, `⚠️ verify: **${name}** whispered a valid code, but this character is linked to <@${holder.discord_id}> as **${holder.name}** (renamed since). Not re-linked — an officer decides.`,references);
    return json({ result: "bound_elsewhere" });
  }
  const t = now();
  // A request code whispered from a character that is already this account's member: nothing to link or admit. The same
  // goes for this account's own character under its new name: the next export carries the link there.
  const alreadyLinked = (!!existing && existing.discord_id === pending.discord_id && existing.status === "member") || !!holder;
  // One batch, so the request is never used up without the link being made (D1 runs a batch as one transaction).
  //  1. characters.discord_id REFERENCES members(discord_id), and D1 enforces foreign keys: the account row first.
  //  2. Claim the request. The guard makes a second whisper of the same code (from another character, at the same
  //     moment) lose cleanly instead of linking a second character, and re-checks, inside the transaction, that nobody
  //     else has bound the name since it was read above. A ticket learns its character here.
  //  3. Link the character -- only if step 2 claimed the request for this very name at this very second, and never
  //     over this account's own member row (a duplicate relay of the same whisper landing after the promotion).
  // A new binding starts with the whisper's own GUID when the addon supplied it, else without one even if the name had
  // one: the next roster export then pins the character actually on the roster, so a recreated or namesake character
  // never inherits an old pin.
  const stmts = [
    env.DB.prepare("INSERT INTO members (discord_id) VALUES (?1) ON CONFLICT(discord_id) DO NOTHING").bind(pending.discord_id),
    env.DB.prepare(
      `UPDATE pending SET consumed_at = ?2, consumed_source = ?3, name_key = ?4, name = ?5
        WHERE id = ?1 AND consumed_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM characters WHERE name_key = ?4 AND discord_id <> ?6 AND status NOT IN ('unbound', 'denied', 'left'))`,
    ).bind(pending.id, t, body.source, nameKey, name, pending.discord_id),
  ];
  if (!alreadyLinked) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO characters (name_key, name, discord_id, status, bound_at, verified_at, source, guid)
         SELECT ?1, ?2, ?3, 'verified', ?4, ?4, ?5, ?7
          WHERE EXISTS (SELECT 1 FROM pending WHERE id = ?6 AND consumed_at = ?4 AND name_key = ?1)
         ON CONFLICT(name_key) DO UPDATE SET name = ?2, discord_id = ?3, status = 'verified', bound_at = ?4, verified_at = ?4, left_at = NULL, source = ?5, guid = ?7
          WHERE NOT (characters.discord_id = ?3 AND characters.status = 'member')`,
      ).bind(nameKey, name, pending.discord_id, t, body.source, pending.id, whisperGuid),
    );
  } else if (whisperGuid && !holder) {
    // This account's member, whispering from the character that has the name now: if that is a new character (the old
    // one deleted and the name made again), the pin moves to it, so the next export does not see a namesake.
    stmts.push(
      env.DB.prepare(
        `UPDATE characters SET guid = ?2 WHERE name_key = ?1 AND discord_id = ?3 AND (guid IS NULL OR guid <> ?2)
           AND EXISTS (SELECT 1 FROM pending WHERE id = ?4 AND consumed_at = ?5 AND name_key = ?1)`,
      ).bind(nameKey, whisperGuid, pending.discord_id, pending.id, t),
    );
  }
  let allDone:D1Result[];
  try {
    allDone = await admittedPrivacySubjectWrite(env,pending.discord_id,privacyCapture,[pendingFingerprintFence(env,pending),...stmts]);
  } catch {
    // A competing relay or account closure can refuse the original consuming proof. Read only
    // to classify the outcome: never adopt a replacement pending row/generation or retry a write.
    try {
      const subject=await readPrivacySubject(originalEnv,pending.discord_id);
      if (subject?.subjectGeneration !== privacyCapture?.subjectGeneration || subject && subject.state !== 'active')
        return json({result:'privacy_held'},409);
      const after=await originalEnv.DB.prepare('SELECT discord_id,created_at,name_key,nonce,expires_at,consumed_at FROM pending WHERE id=?1')
        .bind(pending.id).first<{discord_id:string;created_at:number;name_key:string;nonce:string|null;expires_at:number;consumed_at:number|null}>();
      // Only a *different* named consumer proves that this relay did not land. A same-name
      // consumed proof can be our own committed batch with a lost reply; do not restart it.
      if(after&&after.discord_id===pending.discord_id&&after.created_at===pending.created_at&&after.expires_at===pending.expires_at&&
          after.nonce===(pending.nonce??null)&&after.consumed_at!==null&&after.name_key!==nameKey)
        return json({result:'no_pending'});
    } catch { /* An unavailable observation cannot prove refusal or rollback. */ }
    return json({result:'outcome_unknown'},503);
  }
  const done=allDone.slice(1);
  if (!done[1]?.meta?.changes) {
    // Lost a race: the request was used a moment ago, or the name was linked to another account a moment ago.
    const after = await env.DB.prepare("SELECT consumed_at, name FROM pending WHERE id = ?1").bind(pending.id).first<{ consumed_at: number | null; name: string }>();
    if (!after?.consumed_at) {
      await audit(env, "watcher", "verify.bound_elsewhere", name, { pendingFor: pending.discord_id, ticket, race: true },reference);
      if (ticket) await closeRequest(env, pending, "refused");
      return json({ result: "bound_elsewhere" });
    }
    await audit(env, "watcher", "verify.already_used", name, { source: body.source, ticket, usedBy: after.name },reference);
    if (ticket && after.name && normalizeCharacter(after.name) !== nameKey) {
      // Another character got there first with the same request code: it was shared or leaked. Worth a line, because
      // the owner of the request is about to find a character linked that may not be theirs.
      await logLine(env, `⚠️ verify: **${name}** whispered the request code of <@${pending.discord_id}> that **${after.name}** had just used. Not linked.`,[reference!]);
    }
    return json({ result: "no_pending" });
  }
  const resolved: PendingRow = { ...pending, name_key: nameKey, name, consumed_at: t };
  if (alreadyLinked) {
    await audit(env, "watcher", "verify.already_linked", name, { discordId: pending.discord_id, source: body.source },reference);
    return json({ result: "member", discordId: pending.discord_id, name });
  }
  await audit(env, "watcher", "verify.confirmed", name, { discordId: pending.discord_id, source: body.source, officer: body.officer, ticket, guid: whisperGuid },reference);
  await logLine(env, `✅ verify: **${name}** confirmed in game (${body.source}${ticket ? ", request code" : ""}) for <@${pending.discord_id}>.`,[reference!]);
  // ... and only when the roster's character under this name is the one that whispered, where that is known.
  if (onRoster && current && (!whisperGuid || !rosterGuid || whisperGuid === rosterGuid)) {
    // Already in the guild (an existing member linking their Discord, or someone an officer invited by hand):
    // nothing to admit, so no review card — the role follows now. The roster export stays the source of truth
    // for keeping it (a newer snapshot without the name still strips it). Only a current roster says so: the beta's
    // last export, read on launch day, would grant the role to whoever took the name on live and pin the wrong
    // character to them. The GUID is taken only from a very fresh export; otherwise the next export pins it.
    await audit(env, "watcher", "verify.already_member", name, { discordId: pending.discord_id, source: body.source },reference);
    await promote(env, pending.discord_id, nameKey, name, undefined, whisperGuid ?? (now() - onRoster.exportedAt <= ROSTER_PIN_WITHIN ? onRoster.guid : null),undefined,privacyCapture);
    return json({ result: "member", discordId: pending.discord_id, name });
  }
  if (onRoster) await audit(env, "watcher", "verify.roster_not_current", name, { exportedAt: onRoster.exportedAt },reference);
  await onVerified(env, resolved, body.source,privacyCapture);
  return json({ result: "verified", discordId: pending.discord_id, name });
}

async function closeRequest(env: Env, p:PendingRow, why: "refused" | "banned") {
  await env.DB.prepare(`UPDATE pending SET consumed_at=?8,consumed_source=?9 WHERE id=?1 AND discord_id=?2
    AND created_at=?3 AND name_key=?4 AND name=?5 AND expires_at=?6 AND nonce IS ?7 AND consumed_at IS NULL`)
    .bind(p.id,p.discord_id,p.created_at,p.name_key,p.name,p.expires_at,p.nonce??null,now(),why).run();
}

/**
 * A request code that another character has already used, whispered again by a different one: the code was shared or
 * leaked. The addon and the watcher refuse the second character on the officer's own PC; this is what the staff log
 * shows when it reaches the Worker anyway (a second officer's watcher, say).
 */
async function noteTicketReuse(env: Env, code: string, nameKey: string, name: string,context:WatcherCapture) {
  const nonce = ticketNonce(code);
  if (!nonce) return;
  const used = await env.DB.prepare(
    "SELECT p.*,s.generation AS privacy_generation,s.state AS privacy_state,s.revision AS privacy_revision FROM pending p LEFT JOIN privacy_subjects s ON s.subject_id=p.discord_id WHERE p.nonce = ?1 AND p.consumed_at IS NOT NULL AND p.created_at > ?2 ORDER BY p.id DESC LIMIT 1",
  )
    .bind(nonce, now() - 48 * 3600)
    .first<PendingRow>();
  if (!used?.name || normalizeCharacter(used.name) === nameKey) return;
  const capture=pendingPrivacyCapture(used),reference={subject:used.discord_id,capture};
  env=bindWatcher(env,used.discord_id,capture,context);
  if (code !== (await ticketFor(env.VERIFY_SECRET, nonce, dayBucket(new Date(used.created_at * 1000))))) return;
  await audit(env, "watcher", "verify.ticket_reused", name, { discordId: used.discord_id, usedBy: used.name },reference);
  await logLine(env, `⚠️ verify: **${name}** whispered the request code of <@${used.discord_id}> that **${used.name}** already used. Not linked.`,[reference]);
}

interface EventIn {
  type: "invite" | "joined" | "left" | "removed" | "guild_full" | "note" | "queue_loaded" | "flush" | "identity";
  /** identity: the character ID the addon read from a whisper that carried a valid code. */
  guid?: string;
  name?: string;
  ts?: number;
  ok?: boolean;
  detail?: string;
  /**
   * Where the watcher got this. Only "addon" (the addon's own SavedVariables, written after C_GuildInfo.MemberExistsByName
   * or a real CHAT_MSG_SYSTEM) and "token" (an outgoing officer whisper carrying an HMAC the addon computed) are
   * authoritative. "chatlog" is the plain text of a guild system line, which a player can reproduce exactly with
   * /emote — the client writes "<Name> has joined the guild." for both, and nothing in the text distinguishes them.
   * An untrusted join therefore never grants a role and an untrusted departure never removes one.
   */
  origin?: "addon" | "token" | "chatlog";
  reason?: string;
  /** guild_full: the addon's ranked shortlist of who could be removed, with the evidence it ranked on. */
  candidates?: Array<{ name?: string; level?: number; rank?: string; days?: number }>;
}

const isAuthoritative = (e: EventIn) => e.origin === "addon" || e.origin === "token";

/**
 * Events relayed by the watcher — from the addon's SavedVariables (invites fired, joins noticed, notes), from an
 * officer's outgoing confirmation whisper (HMAC-signed by the addon), and from guild system lines in the chat log.
 * Idempotent.
 *
 * Trust matters here. An authoritative join grants the role immediately. An unauthenticated one only marks the
 * invite queue and waits for a roster export to confirm it, because the chat-log text is forgeable with /emote.
 * Symmetrically, an authoritative departure removes the role now, while an unauthenticated one only arms the
 * removal (status left_pending) so the next roster export completes or cancels it.
 */
/**
 * How long a refused invite waits before it is offered again.
 *
 * The three cases are genuinely different and treating them alike is what produced the 19 September mess: 91 people
 * parked in `invited`, roughly 50 of them simply still in another guild, nobody retried and nobody told. A full
 * guild is our problem and clears on its own, so it retries soon and does not count against the applicant. Being in
 * another guild is theirs to fix and clears only when they act, so it backs off hard rather than burning one of the
 * officer's protected invite key presses every poll. Anything else — offline, declined, mistyped — sits in between.
 */
const INVITE_RETRY_FULL = 15 * 60;
const INVITE_RETRY_GUILDED = 6 * 3600;
const INVITE_RETRY_OTHER = 30 * 60;
/** An invite that fired but was never accepted comes back into play after this, so `invited` is no longer terminal. */
const INVITE_RECHECK = 30 * 60;

/**
 * The server's refusal text, reduced to something worth storing and worth showing a person.
 *
 * Matching happens once, here, so the backoff, the stored reason and the sentence the applicant eventually reads can
 * never disagree about what went wrong.
 */
export function refusalCode(detail: string | null | undefined): string {
  const why = (detail || "").toLowerCase();
  if (why.includes("guild is full")) return "guild_full";
  if (why.includes("already in a guild")) return "in_another_guild";
  if (why.includes("not found")) return "offline";
  if (why.includes("declin")) return "declined";
  return "other";
}

/**
 * The same thing in the second person, for /verify-status.
 *
 * This is the channel that has to carry it. The addon whispers a refusal the moment it happens, but only reaches
 * whoever is online at that moment; the people parked in another guild since 19 September mostly are not, and DMs
 * are barred while the app is flagged. A slash command works regardless. It has to include what to do about it,
 * because "your invite was refused" without the fix is a politer way of telling someone nothing.
 */
export function explainRefusal(code: string | null | undefined): string {
  switch (code) {
    case "in_another_guild":
      return (
        "**we cannot invite you while you are in another guild** \u2014 a character can only be in one at a time, and this " +
        "verification is for Olympus and no other guild. Type `/gquit` in game to leave your current guild, then " +
        "whisper your code back to the officer who messaged you: that returns you to the exact place in line you " +
        "already held, instead of waiting for the queue to come round again. If you would rather not whisper, the " +
        "invite still retries on its own"
      );
    case "ready_after_gquit":
      return (
        "**you are back in line at your original place** \u2014 you told us you left your old guild, so the hold on " +
        "your invite is lifted and an officer will send it shortly. Stay logged in on that character"
      );
    case "guild_full":
      return "the guild is at its 1000-member cap, so no invite can go out yet \u2014 you keep your place in the queue";
    case "offline":
      return "the last invite went out while that character was offline \u2014 be logged in on it and the next one will land";
    case "declined":
      return (
        "**you declined the guild invite in game**, so no more are sent \u2014 that is deliberate, not a fault. If it " +
        "was a mis-click, press **Get my code** in the pinned guide (or run `/verify`) and whisper the new code, and you go back in the queue"
      );
    default:
      return "the last invite did not go through \u2014 it retries automatically";
  }
}

/** A batch of game events can decline, refuse, admit and remove several people; their notices go out as one post. */
export async function postEvents(env: Env, body: { events: EventIn[] }): Promise<Response> {
  const notices = noticeBatch();
  const context:WatcherCapture={references:[]};
  let result:Response;
  try {
    result=await postEventsInner(env, body, notices,context);
  } catch(error) {
    if(error instanceof PrivacySiteRequestHeld)result=await watcherHeldResult(env,context);
    else throw error;
  } finally {
    await flushNotices(env, notices);
  }
  try {if(result.status<400)await assertWatcherCurrent(env,context);}
  catch(error){if(error instanceof PrivacySiteRequestHeld)return watcherHeldResult(env,context);throw error;}
  return result;
}

async function postEventsInner(env: Env, body: { events: EventIn[] }, notices: NoticeBatch,context:WatcherCapture): Promise<Response> {
  const calls = callBudget(env); // .90 (P-20)
  const originalEnv=env;
  let applied = 0;
  for (const e of body.events ?? []) {
    let env=originalEnv;
    if (e.type === "invite" && e.name) {
      const key = normalizeCharacter(e.name);
      if (e.ok === false) {
        const code = refusalCode(e.detail);
        const full = code === "guild_full";
        const guilded = code === "in_another_guild";
        const backoff = full ? INVITE_RETRY_FULL : guilded ? INVITE_RETRY_GUILDED : INVITE_RETRY_OTHER;
        const row = await env.DB.prepare(
          queueSelect+"WHERE q.name_key = ?1 AND q.status IN ('queued','written','invited') ORDER BY id DESC LIMIT 1",
        )
          .bind(key)
          .first<CapturedQueue>();
        if(!row){await audit(env,"watcher","invite.failed",e.name,{detail:e.detail,code});applied++;continue;}
        const capture=privacyCaptureFromColumns(row.discord_id,row),reference={subject:row.discord_id,capture};
        env=bindWatcher(env,row.discord_id,capture,context);

        // Neither a full guild nor an offline applicant is something the person can act on, so neither counts
        // towards giving up on them. Offline mattered more than it looked: an invite fires at a moment nobody can
        // predict, so "not logged in just then" was costing an attempt, and six of those -- spread over a few hours
        // by the backoff -- retired the row entirely. People were being dropped from the queue for being asleep.
        const freeMiss = full || code === "offline";
        const attempts = (row.attempts ?? 0) + (freeMiss ? 0 : 1);
        // A decline is a person saying no. It is the only refusal in this pipeline that is a decision rather than
        // a condition, and retrying it argues with them -- six popups over three hours to someone who already
        // clicked "no". While the guild is at its cap it is also a seat: 91 people are waiting, and holding one
        // open for somebody who passed costs the next person their turn. So it stops here, and the whole value of
        // stopping is that they are told how to come back. Re-running /verify makes a new row, which is the back
        // of the queue -- the price of the turn they passed on, and cheap next to losing their place silently.
        if (code === "declined") {
          const result=await queueMutation(env,row,
            "status='declined',attempts=?1,last_reason=?2,last_reason_at=?3,retry_after=NULL,claimed_by=NULL,claimed_at=NULL",
            [attempts,code,now()]).run();
          if(!result.meta.changes)continue;
          await audit(env,"watcher","invite.failed",e.name,{detail:e.detail,code},reference);applied++;
          await audit(env, "system", "invite.declined", e.name, { attempts },reference);
          await notify(
            env,
            row.discord_id,
            `Your guild invite for **${e.name}** was declined, so we will not send another. If that was a ` +
              `mis-click, press **Get my code** in the pinned guide (or run \`/verify\`) and whisper the new code, and you go back in the queue.`,
            "invite declined",
            notices,
            capture,
          );
          continue;
        }

        const max = Math.max(1, intVar(env.INVITE_MAX_ATTEMPTS, 6));
        if (attempts >= max) {
          const result=await queueMutation(env,row,"status='expired',attempts=?1,last_reason=?2,last_reason_at=?3",[attempts,code,now()]).run();
          if(!result.meta.changes)continue;
          await audit(env,"watcher","invite.failed",e.name,{detail:e.detail,code},reference);applied++;
          await audit(env, "system", "invite.expired", e.name, { attempts, detail: e.detail },reference);
          await watcherStaffNotice(
            env,
            {
              content:
                `\u23f3 **${e.name}** has been given up on after ${attempts} refused invites \u2014 last reason: ${e.detail || "unknown"}. ` +
                `They are still verified, so re-running \`/verify\` puts them back in the queue.`,
              allowed_mentions: { parse: [] },
            },
            "invite expired",
            [reference],`${row.id}:${row.created_at}:${attempts}:${code}`,
          );
          continue;
        }

        const result=await queueMutation(env,row,
          "status='queued',attempts=?1,retry_after=?2,last_reason=?3,last_reason_at=?4,claimed_by=NULL,claimed_at=NULL",
          [attempts,now()+backoff,code,now()]).run();
        if(!result.meta.changes)continue;
        await audit(env,"watcher","invite.failed",e.name,{detail:e.detail,code},reference);applied++;

        // Tell staff once, the first time, that someone is waiting on themselves rather than on us.
        if (guilded && attempts === 1) {
          await watcherStaffNotice(
            env,
            {
              content:
                `\u26d4 **${e.name}** cannot be invited: they are still in another guild. The invite will keep retrying every ` +
                `${Math.round(INVITE_RETRY_GUILDED / 3600)}h, but it only succeeds once they leave it themselves.`,
              allowed_mentions: { parse: [] },
            },
            "applicant in another guild",
            [reference],`${row.id}:${row.created_at}:${attempts}:${code}`,
          );
          // And tell the applicant, who is the only person who can act on it. While the anti-spam flag is up this
          // costs nothing and sends nothing -- notify() drops it without calling Discord -- and it starts working
          // the day the appeal is granted. Until then the same sentence is waiting for them in /verify-status.
          await notify(
            env,
            row.discord_id,
            `Your guild invite for **${e.name}** could not be sent: ${explainRefusal("in_another_guild")}.`,
            "invite refused: in another guild",
            notices,
            capture,
          );
        }
        continue;
      }
      const rows=await env.DB.prepare(queueSelect+"WHERE q.name_key=?1 AND q.status IN ('queued','written') ORDER BY id").bind(key).all<CapturedQueue>();
      const references:PrivacyReference[]=[];
      for(const row of rows.results){
        const capture=privacyCaptureFromColumns(row.discord_id,row),reference={subject:row.discord_id,capture};
        const scoped=bindWatcher(originalEnv,row.discord_id,capture,context);
        const r=await queueMutation(scoped,row,"status='invited',invited_at=?1,retry_after=?2,last_reason=NULL,last_reason_at=NULL",[e.ts??now(),now()+INVITE_RECHECK]).run();
        if(r.meta.changes)references.push(reference);
      }
      if (references.length) {
        applied++;
        await audit(env, "watcher", "invite.fired", e.name, { detail: e.detail },references);
      }
    } else if (e.type === "joined" && e.name) {
      // the addon saw the character on the roster (MemberExistsByName), or an officer's signed confirmation whisper
      // went out, or the chat log merely said "has joined the guild" — only the first two are trusted
      const key = normalizeCharacter(e.name);
      const c = await getCharacter(env, key);
      if(c?.privacy_state&&c.privacy_state!=='active')continue;
      const reference=c?{subject:c.discord_id,capture:privacyCaptureFromColumns(c.discord_id,c)}:undefined;
      if(reference)env=bindWatcher(env,reference.subject,reference.capture,context);
      // Capture fallback queue ownership before the roster/provider await. A no-character
      // event still cannot adopt a freshly recreated request under the same character name.
      const queueRows=await env.DB.prepare(queueSelect+"WHERE q.name_key=?1 AND q.status IN ('queued','written','invited') ORDER BY id").bind(key).all<CapturedQueue>();
      const queueReferences=queueRows.results.map(row=>({subject:row.discord_id,capture:privacyCaptureFromColumns(row.discord_id,row)}));
      const trusted = isAuthoritative(e) || (await onLatestRoster(env, key));
      const cutoff = linksNotBefore(env);
      if (c && trusted && !c.guid && cutoff && c.bound_at < cutoff && ["verified", "queued", "left_pending"].includes(c.status)) {
        // A link from before LINKS_NOT_BEFORE with no GUID pinned: this join may be a namesake of the character that
        // was linked. The next roster export (which carries GUIDs) releases or confirms it; a join line never does.
        await audit(env, "watcher", "invite.joined_stale_link", e.name, { origin: e.origin, discordId: c.discord_id, boundAt: c.bound_at },reference);
        applied++;
        continue;
      }
      if (c && ["verified", "queued", "left_pending"].includes(c.status)) {
        if (trusted) {
          await promote(env, c.discord_id, key, c.name, notices, undefined, calls,privacyCaptureFromColumns(c.discord_id,c));
          applied++;
          await audit(env, "watcher", "invite.joined", e.name, { detail: e.detail, origin: e.origin, promoted: true },reference);
          continue;
        }
        // Unverified claim: record it, grant nothing. The roster export decides.
        await audit(env, "watcher", "invite.joined_unconfirmed", e.name, { detail: e.detail, origin: e.origin, discordId: c.discord_id },reference);
        applied++;
      }
      const joinedReferences:PrivacyReference[]=[];
      for(let i=0;i<queueRows.results.length;i++){
        const row=queueRows.results[i]!,queueReference=queueReferences[i]!;
        if(reference&&queueReference.subject!==reference.subject)continue;
        const scoped=bindWatcher(env,row.discord_id,queueReference.capture,context);
        const r=await queueMutation(scoped,row,"status='joined',joined_at=?1",[e.ts??now()]).run();
        if(r.meta.changes)joinedReferences.push(queueReference);
      }
      if (joinedReferences.length) {
        applied++;
        await audit(env, "watcher", "invite.joined", e.name, { detail: e.detail },joinedReferences);
      }
    } else if (e.type === "left" && e.name) {
      // "has left the guild" / "has been kicked out of the guild by X"
      const key = normalizeCharacter(e.name);
      const c = await getCharacter(env, key);
      if(c?.privacy_state&&c.privacy_state!=='active')continue;
      const reference=c?{subject:c.discord_id,capture:privacyCaptureFromColumns(c.discord_id,c)}:undefined;
      if(reference)env=bindWatcher(env,reference.subject,reference.capture,context);
      if (c && (c.status === "member" || c.status === "left_pending")) {
        if (isAuthoritative(e)) {
          await demote(env, c.discord_id, key, c.name, e.detail || "in game", { batch: notices,capture:reference!.capture });
          applied++;
        } else if (c.status === "member") {
          // Forgeable text: arm the removal instead of performing it. The next roster export either confirms the
          // departure (and the role goes) or shows them still on the roster (and the flag is cleared).
          await env.DB.prepare(`UPDATE characters SET status = 'left_pending' WHERE name_key = ?1 AND discord_id=?2 AND ${privacyGenerationFenceSql(2,3)}`).bind(key,c.discord_id,reference!.capture?.subjectGeneration??null).run();
          await audit(env, "watcher", "roster.left_pending", e.name, { detail: e.detail, origin: e.origin, discordId: c.discord_id },reference);
          await logLine(
            env,
            `\u23f3 roster: **${c.name}** (<@${c.discord_id}>) looks like they left the guild (${e.detail || "chat log"}). ` +
              `The role stays until a roster export confirms it.`,
            [reference!],
          );
          applied++;
        }
      }
    } else if (e.type === "removed" && e.name) {
      // An officer freed a seat from the panel. Authoritative by construction — only their own client writes this —
      // and deliberately distinguished from an ordinary departure so the person is told why and keeps their binding.
      const key = normalizeCharacter(e.name);
      const c = await getCharacter(env, key);
      if(c?.privacy_state&&c.privacy_state!=='active')continue;
      const reference=c?{subject:c.discord_id,capture:privacyCaptureFromColumns(c.discord_id,c)}:undefined;
      if(reference)env=bindWatcher(env,reference.subject,reference.capture,context);
      if (e.ok === false) {
        await audit(env, "watcher", "roster.remove_failed", e.name, { detail: e.detail },reference);
        applied++;
      } else if (c && (c.status === "member" || c.status === "left_pending")) {
        await demote(env, c.discord_id, key, c.name, e.detail || "removed to free a seat", { space: e.reason === "space", batch: notices,capture:privacyCaptureFromColumns(c.discord_id,c) });
        applied++;
      } else {
        await audit(env, "watcher", "roster.removed_unlinked", e.name, { detail: e.detail, reason: e.reason },reference);
        // A removal for being unverified has no Discord side to undo (there is no binding), so the log line is the
        // only place staff see it happened, and who did it.
        if (e.reason === "unverified") {
          await logLine(env, `\u{1F6AA} removed in game for not verifying: **${e.name}**${e.detail ? ` \u2014 ${e.detail}` : ""}.`,reference?[reference]:undefined);
        }
        applied++;
      }
    } else if (e.type === "identity" && e.name) {
      // The addon's signed note naming the character behind a confirmed code. Normally its GUID arrived with the
      // verification itself; this pins a link that was made without it (a note in a later chat-log write, say). Only a
      // fresh, unpinned link, and never a GUID another live link already holds.
      const g = playerGuid(e.guid);
      if (g && isAuthoritative(e)) {
        const key=normalizeCharacter(e.name),c=await getCharacter(env,key);
        if(!c||c.privacy_state&&c.privacy_state!=='active')continue;
        const capture=privacyCaptureFromColumns(c.discord_id,c);
        env=bindWatcher(env,c.discord_id,capture,context);
        const r = await env.DB.prepare(
          `UPDATE characters SET guid = ?2
            WHERE name_key = ?1 AND discord_id=?4 AND ${privacyGenerationFenceSql(4,5)} AND guid IS NULL AND bound_at >= ?3 AND status IN ('verified','queued','member','left_pending')
              AND NOT EXISTS (SELECT 1 FROM characters c2 WHERE c2.guid = ?2 AND c2.name_key <> ?1 AND c2.status IN ('verified','queued','member','left','left_pending'))`,
        )
          .bind(key, g, now() - 6 * 3600,c.discord_id,capture?.subjectGeneration??null)
          .run();
        if (r.meta.changes) await audit(env, "watcher", "verify.guid_pinned", e.name, { guid: g },{subject:c.discord_id,capture});
      }
      applied++;
    } else if (e.type === "guild_full") {
      await audit(env, "watcher", "guild.full", undefined, { detail: e.detail, candidates: e.candidates?.length ?? 0 });
      applied++;
      await noticeGuildFull(env, e);
    } else if (e.type === "note" && e.name) {
      const c=await getCharacter(env,normalizeCharacter(e.name));
      if(c?.privacy_state&&c.privacy_state!=='active')continue;
      const reference=c?{subject:c.discord_id,capture:privacyCaptureFromColumns(c.discord_id,c)}:undefined;
      if(reference)env=bindWatcher(env,reference.subject,reference.capture,context);
      await audit(env, "watcher", e.ok === false ? "note.failed" : "note.set", e.name, { detail: e.detail },reference);
      applied++;
    }
  }
  return json({ applied });
}

export async function postRoster(env: Env, body: { exportedAt: number; members: RosterMemberIn[] }): Promise<Response> {
  if (!Array.isArray(body.members) || !body.exportedAt) return json({ error: "exportedAt and members[] required" }, 400);
  const summary = await ingestRoster(env, body.exportedAt, body.members, "addon");
  // .115 (Codex's review of f975, 3 Oct 2026, 13:15 UTC, finding 2): an export refused for duplicate names is a 422, which
  // the watcher takes as final (watcher.py Worker.call: a 4xx is not retried, since sending it again changes nothing).
  // The review of 3 Oct 2026 added "unusable" (every batch committed, and the stored rows still fell short of the count):
  // final for the same reason, so it never holds the watcher's later posts behind it as a retried 500 would.
  return json(summary, "refused" in summary ? 422 : 200);
}

/**
 * Invites for one officer's client to fire.
 *
 * `officer` is that watcher's identity. Before per-officer claims this endpoint handed every waiting invite to every
 * caller, so a second officer running the addon would write the same rows into their own OlympusQueue.lua and invite
 * the same people — duplicate invites and a confusing "already in a guild" for the applicant. A claim is an exclusive
 * hold that is refreshed on every poll and lapses after QUEUE_CLAIM_TTL_MINUTES of silence, so an officer who closes
 * the game hands their rows back on their own rather than stranding them.
 *
 * With no officer given (an older watcher, or a one-officer setup) the behaviour is exactly as before.
 */
export async function getQueue(env: Env, officer = ""): Promise<Response> {
  const who = officer.trim().slice(0, 64);
  const ttl = Math.max(1, intVar(env.QUEUE_CLAIM_TTL_MINUTES, 15)) * 60;
  const limit = Math.max(1, intVar(env.QUEUE_CLAIM_LIMIT, 25));
  const extra = Math.max(0, intVar(env.QUEUE_CLAIM_PRIORITY_EXTRA, 10));
  const t = now();

  if (who) {
    // A row that is backing off after a refusal is not offered again until its retry_after has passed, so a hard
    // refusal costs one invite key press rather than one per poll.
    const live = "status IN ('queued','written') AND (retry_after IS NULL OR retry_after <= ?2)";
    const free = "(claimed_by IS NULL OR claimed_at IS NULL OR claimed_at < ?3)"; // unclaimed, or its officer stopped polling
    // 1. Claims are sticky: whatever this officer already holds stays theirs while their watcher keeps polling. The
    //    game client only reads the queue file at /reload, so a row that moved to another officer would still sit in
    //    this officer's client and could be invited twice. Until 29 Sep (build .41) each poll re-claimed the top rows
    //    in queue order instead, so a burst of reserved names at the top pushed held rows out to the next officer.
    const kept = await env.DB.prepare(
      `UPDATE invite_queue SET claimed_at = ?2
        WHERE id IN (SELECT id FROM invite_queue WHERE claimed_by = ?1 AND ${live} ORDER BY priority DESC, id LIMIT ?3)`,
    )
      .bind(who, t, limit + extra)
      .run();
    let held = kept.meta?.changes ?? 0;
    // 2. The spare capacity takes new rows in queue order (reserved names first).
    if (held < limit) {
      const got = await env.DB.prepare(
        `UPDATE invite_queue SET claimed_by = ?1, claimed_at = ?2
          WHERE id IN (SELECT id FROM invite_queue WHERE ${live} AND ${free} ORDER BY priority DESC, id LIMIT ?4)`,
      )
        .bind(who, t, t - ttl, limit - held)
        .run();
      held += got.meta?.changes ?? 0;
    }
    // 3. Reserved names may go on top of a full hand, up to QUEUE_CLAIM_PRIORITY_EXTRA of them. Held rows never move,
    //    so without this a lone officer holding rows that cannot be invited yet (players offline) would never be
    //    handed the reserved names at all.
    if (held < limit + extra) {
      await env.DB.prepare(
        `UPDATE invite_queue SET claimed_by = ?1, claimed_at = ?2
          WHERE id IN (SELECT id FROM invite_queue WHERE ${live} AND priority > 0 AND ${free} ORDER BY priority DESC, id LIMIT ?4)`,
      )
        .bind(who, t, t - ttl, limit + extra - held)
        .run();
    }
  }

  const ready = "status IN ('queued','written') AND (retry_after IS NULL OR retry_after <= ?2)";
  // Build .41: reserved names the guild site queued (priority 1) come first, then everyone else in the order they
  // arrived. The same order everywhere: this claim, this list, the positions below, and waitlistPosition.
  type Row = { id: number; name: string; discord_id: string; note: string | null; status: string; last_reason: string | null; priority: number };
  // Only the rows this call claimed or kept (claimed_at = now): at most QUEUE_CLAIM_LIMIT, plus reserved names.
  const rows = who
    ? await env.DB.prepare(`SELECT id, name, discord_id, note, status, last_reason, priority FROM invite_queue WHERE ${ready} AND claimed_by = ?1 AND claimed_at = ?2 ORDER BY priority DESC, id`)
        .bind(who, t)
        .all<Row>()
    : await env.DB.prepare(`SELECT id, name, discord_id, note, status, last_reason, priority FROM invite_queue WHERE ${ready.replace("?2", "?1")} ORDER BY priority DESC, id`)
        .bind(t)
        .all<Row>();

  // Each entry's place in the global line, 1-based -- not its index in the slice this officer happens to hold.
  //
  // getQueue claims a slice (ORDER BY id LIMIT QUEUE_CLAIM_LIMIT), so with two officers running the addon the
  // second one's first row is globally somewhere past the first one's last claim. Numbering the returned array
  // would hand every officer their own "1", and /verify-status already quotes the global number straight to the
  // applicant (waitlistPosition's count; since .115 read for the account's own rows in guild-seats.ts). Two surfaces
  // disagreeing about someone's place in line is a support ticket, so both count the same rows the same way.
  //
  // That means counting WITHOUT the retry_after filter, exactly as waitlistPosition does: a row backing off after
  // a refusal is still ahead of you and still gets served first, so it still occupies a place.
  //
  // Deliberately a second SELECT of ids rather than ROW_NUMBER() OVER (ORDER BY id). The ready set is tens of rows
  // and the cost is noise, whereas a window function D1 turned out to reject at runtime would take the entire
  // invite queue down -- and this queue is the only path any applicant has into the guild.
  const ordered = await env.DB.prepare("SELECT id FROM invite_queue WHERE status IN ('queued','written') ORDER BY priority DESC, id").all<{ id: number }>();
  const positionOf = new Map<number, number>();
  ordered.results.forEach((r, i) => positionOf.set(r.id, i + 1));

  return json({
    generatedAt: t,
    officer: who,
    claimTtlSeconds: ttl,
    setGuildNote: env.SET_GUILD_NOTE === "true",
    waiting: ordered.results.length,
    entries: rows.results.map((r) => ({
      id: r.id,
      character: r.name,
      discordId: r.discord_id,
      note: r.note ?? "",
      status: r.status,
      position: positionOf.get(r.id) ?? 0,
      // Carried so the officer panel can mark the row that is actionable right now: somebody who just left their
      // old guild because we asked them to and is standing there with no guild at all.
      lastReason: r.last_reason ?? "",
      // 1 = a reserved name from the guild site: the panel marks it, and it goes before the rest.
      priority: r.priority ?? 0,
    })),
  });
}

export async function postQueueWritten(env: Env, body: { ids: number[]; officer?: string }): Promise<Response> {
  const who = (body.officer ?? "").trim().slice(0, 64);
  let n = 0;
  for (const id of body.ids ?? []) {
    // Only mark rows this officer actually holds: a stale acknowledgement must not overwrite a row that has since
    // been reclaimed by someone else.
    const r = await env.DB.prepare(
      "UPDATE invite_queue SET status = 'written', written_at = ?2 WHERE id = ?1 AND status = 'queued' AND (?3 = '' OR claimed_by IS NULL OR claimed_by = ?3)",
    )
      .bind(id, now(), who)
      .run();
    n += r.meta.changes ?? 0;
  }
  return json({ marked: n });
}

/**
 * "I have left my old guild" — the applicant whispering their code back after an in_another_guild refusal.
 *
 * Nothing here grants anything new. The row already exists and already holds its original, low id; the refusal
 * merely parked it behind a retry_after. Clearing that makes it servable again AT ITS ORIGINAL POSITION, which is
 * exactly what the refusal whisper promised them ("your place in the queue is kept"). They jump nobody: they were
 * at the front when we tried to invite them, which is why we tried.
 *
 * The attempt the refusal charged them is refunded too. Being in another guild is the one refusal the applicant
 * can actually fix, and letting it eat their INVITE_MAX_ATTEMPTS budget would mean the person who did what we
 * asked runs out of tries sooner than the person who ignored us.
 *
 * Authentication is the same as any other whispered code: the code is an HMAC over their character name, and the
 * game itself vouches for the sender of a whisper. No new trust path, and nothing here can be triggered by
 * anybody except the character it concerns.
 */
async function resumeAfterGuildLeave(env: Env, nameKey: string, name: string, source: string,context:WatcherCapture) {
  const row = await env.DB.prepare(
    queueSelect+"WHERE q.name_key = ?1 AND q.status IN ('queued','written','invited') ORDER BY id LIMIT 1",
  )
    .bind(nameKey)
    .first<CapturedQueue>();
  if (!row) return null;
  const capture=privacyCaptureFromColumns(row.discord_id,row),reference={subject:row.discord_id,capture};
  env=bindWatcher(env,row.discord_id,capture,context);

  const t = now();
  // Only meaningful for a row actually held back by that refusal. A row already servable needs no help, and
  // re-firing on every stray whisper would refund an attempt each time.
  if (row.last_reason !== "in_another_guild" || (row.retry_after ?? 0) <= t) return null;

  const attempts = Math.max(0, (row.attempts ?? 0) - 1);
  const result=await queueMutation(env,row,
    "status='queued',retry_after=NULL,claimed_by=NULL,claimed_at=NULL,attempts=?1,last_reason='ready_after_gquit',last_reason_at=?2",
    [attempts,t]).run();
  if(!result.meta.changes)return {refused:true} as const;

  const pos = await waitlistPosition(env, nameKey);
  await audit(env, "watcher", "invite.resumed", name, { discordId: row.discord_id, source, position: pos, attempts },reference);
  await logLine(
    env,
    `\u{1F513} **${name}** (<@${row.discord_id}>) left their old guild and confirmed it — back in the queue at #${pos}, ready to invite.`,
    [reference],
  );
  await notify(
    env,
    row.discord_id,
    `Thanks — **${name}** is back in the invite queue at position ${pos}. An officer will invite you shortly.`,
    "resumed after leaving guild",
    undefined,capture,
  );
  return { name, position: pos, attempts };
}

/** Where an applicant sits in the queue while the guild is full, 1-based; 0 when they are not waiting. */
export async function waitlistPosition(env: Env, nameKey: string): Promise<number> {
  const mine = await env.DB.prepare(
    "SELECT id, priority FROM invite_queue WHERE name_key = ?1 AND status IN ('queued','written') ORDER BY priority DESC, id LIMIT 1",
  )
    .bind(nameKey)
    .first<{ id: number; priority: number | null }>();
  if (!mine) return 0;
  // Ahead: every higher-priority row, and every same-priority row that arrived first (getQueue's order).
  const ahead = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM invite_queue WHERE status IN ('queued','written') AND (priority > ?2 OR (priority = ?2 AND id < ?1))",
  )
    .bind(mine.id, mine.priority ?? 0)
    .first<{ n: number }>();
  return (ahead?.n ?? 0) + 1;
}

/**
 * Tell staff the guild is full and who the addon would suggest removing — once an hour at most. The list is posted
 * rather than acted on: the addon ranks, a human decides, and putting the shortlist in a channel means the decision
 * is visible to the other officers instead of happening quietly in one person's client.
 */
async function noticeGuildFull(env: Env, e: EventIn): Promise<void> {
  const channel = staffChannel(env);
  if (!channel) return;
  const recent = await env.DB.prepare("SELECT ts FROM audit WHERE action = 'guild.full_notified' ORDER BY id DESC LIMIT 1").first<{ ts: number }>();
  if (recent && now() - recent.ts < 3600) return;

  const waiting = await env.DB.prepare("SELECT COUNT(*) AS n FROM invite_queue WHERE status IN ('queued','written')").first<{ n: number }>();
  const lines = [
    `\u{1F6D1} **The guild is full.** Invites are being refused, and ${waiting?.n ?? 0} verified applicant(s) are waiting for a seat.`,
  ];
  // .115 (item B): the count the members are shown (guild-seats.ts), so staff read the same state they do.
  lines.push(seatsStaffLine((await guildSeats(env)).seats));
  if (e.candidates?.length) {
    lines.push("", "The addon's suggestions, longest away first \u2014 **nobody has been removed**:");
    for (const c of e.candidates.slice(0, 5)) {
      lines.push(`\u2022 **${c.name ?? "?"}** \u2014 level ${c.level ?? "?"}, ${c.rank ?? "?"}, away ${Math.floor(c.days ?? 0)} days`);
    }
    lines.push("", "Officers and anyone with a hold note are excluded. Remove from the officer panel in game; each removal takes two clicks and frees one seat.");
  } else {
    lines.push("", `Nobody currently meets the removal criteria${e.detail ? ` (${e.detail})` : ""}, so the queue will keep waiting until someone leaves.`);
  }
  const posted = await staffNotice(env, { content: lines.join("\n"), allowed_mentions: { parse: [] } }, "guild is full");
  // Written either way, for the same reason as the officer rank check: a notice that cannot be delivered must not be
  // retried on every event that triggers it.
  await audit(env, "system", "guild.full_notified", undefined, { candidates: e.candidates?.length ?? 0, posted });
}

/**
 * Half-hourly housekeeping on the invite queue, run from the scheduled handler.
 *
 * Two jobs. An invite that fired and was never accepted comes back into play once its recheck time passes, so
 * `invited` stops being the hole that swallowed 91 people on 19 September. And a row that has been refused more
 * times than we are willing to keep pressing for is retired, with staff told, instead of retrying forever.
 */
export async function sweepInviteQueue(env: Env): Promise<{ requeued: number; expired: number }> {
  const t = now();
  const max = Math.max(1, intVar(env.INVITE_MAX_ATTEMPTS, 6));

  // A NULL retry_after means "due now", not "skip forever".
  //
  // The column arrived with the .18 migration, so every row already sitting in `invited` at that moment got NULL --
  // which is precisely the 91 people this sweep was written to rescue. `retry_after IS NOT NULL` excluded all of
  // them. getQueue does not serve `invited` either, so they were invisible to both halves of the system and stayed
  // parked while the fix for them ran past every half hour reporting nothing to do.
  const re = await env.DB.prepare(
    "UPDATE invite_queue SET status = 'queued', claimed_by = NULL, claimed_at = NULL, retry_after = NULL " +
      "WHERE status = 'invited' AND (retry_after IS NULL OR retry_after <= ?1) AND attempts < ?2",
  )
    .bind(t, max)
    .run();
  const requeued = re.meta.changes ?? 0;

  const ex = await env.DB.prepare("UPDATE invite_queue SET status = 'expired' WHERE status IN ('queued','written','invited') AND attempts >= ?1")
    .bind(max)
    .run();
  const expired = ex.meta.changes ?? 0;

  // Audited every run, not only when it changed something. A sweep that reports nothing and a sweep that never ran
  // looked identical in the audit table all day, which is why a stuck queue read as a quiet one.
  await audit(env, "cron", "queue.swept", undefined, { requeued, expired, max });
  if (expired) {
    await staffNotice(
      env,
      {
        content:
          `\u23f3 ${expired} invite(s) retired after ${max} refusals each. Those people are still verified \u2014 ` +
          `re-running \`/verify\` puts them back in the queue. \`/olympus-admin queue\` lists what is still waiting.`,
        allowed_mentions: { parse: [] },
      },
      "invites retired",
    );
  }
  return { requeued, expired };
}
