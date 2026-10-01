/**
 * Every notice to a member goes through here — and since 25 September 2026 none of them is a direct message.
 * (The file keeps its old name so no import had to move. There is no longer any code in this Worker that opens a DM.)
 *
 * History. On 18 Sep Discord quarantined the app for "abusive behavior". On 25 Sep Developer Compliance lifted it and
 * named the cause: "It appears that your app sent many unsolicited DMs in a short period of time ... future instances
 * of spam may lead to further action", citing the Developer Policy: "Do not contact users on Discord without their
 * explicit permission." A rate limiter was not enough to satisfy that, so the DM path was removed rather than tuned.
 *
 * Instead a notice is posted in one channel of the server (CHANNEL_NOTICES — #bot-announcements), mentioning only the
 * member it concerns. They joined this server, a mention in one of its channels is how a community bot ordinarily
 * reaches someone, and the channel can be muted like any other (a mention still gets through).
 *
 * The channel is public, so the text is split in two:
 *   - the welcome (the character is on the guild roster) is said in full: it is public anyway;
 *   - everything else — back in the queue, a seat freed, an invite declined, a refusal, a denial — is reduced to "there
 *     is an update, run /verify-status", which answers privately. The detail never reaches the channel. (.90, Viktor's
 *     V7 for an 81,000-member server: before .90 the queue and seat lines were public too.)
 * Any kind not listed as public, including one added later, gets the private-by-default version.
 *
 * Bursts. A roster sync that promotes ten people posts ONE message with ten lines (see NoticeBatch), and a Worker-wide
 * cap on posts per minute still applies. Over the cap a notice is dropped and audited, never queued: every state it
 * would have reported is readable with /verify-status.
 */
import type { Env } from "./env";
import { audit, now } from "./db";
import { intVar } from "./env";
import { explainDiscordError, logLine, postMessage } from "./discord";

const WINDOW_SECONDS = 60;
const MAX_MENTIONS_PER_POST = 20;   // one post never pings more than this many people
const MAX_POST_CHARS = 1900;        // under Discord's 2000, with room for the header

/** Kinds whose full text may be read by the whole server. Everything else is private by default. */
const PUBLIC_KINDS = new Set(["welcome"]); // .90 (P-19): only the welcome; a return to the queue or a freed seat only says there is an update

const PRIVATE_TEXT =
  "there is an update on your Olympus verification. Run `/verify-status` to see it — only you can see the answer.";

export interface Notice {
  userId: string;
  content: string;
  kind: string;
}

/** Collects the notices of one roster sync or one batch of game events, so they go out as one post, not one each. */
export interface NoticeBatch {
  items: Notice[];
}
export const noticeBatch = (): NoticeBatch => ({ items: [] });

/**
 * Tell one member something. With a batch, it waits for the batch to be flushed; without one, it posts now.
 * Returns whether it was (or will be) posted; callers treat `false` as normal, not as an error.
 */
export async function notify(env: Env, userId: string, content: string, kind: string, batch?: NoticeBatch): Promise<boolean> {
  if (!/^\d{5,25}$/.test(userId)) return false;  // a snowflake or nothing: never let text reach the mention syntax
  if (batch) {
    batch.items.push({ userId, content, kind });
    return true;
  }
  return postNotices(env, [{ userId, content, kind }]);
}

/** Post whatever a batch collected. Never throws: it runs in `finally` blocks and must not mask the real error. */
export async function flushNotices(env: Env, batch: NoticeBatch): Promise<void> {
  const items = batch.items.splice(0);
  if (!items.length) return;
  try {
    await postNotices(env, items);
  } catch (e) {
    try {
      await audit(env, "system", "notice.flush_failed", undefined, { count: items.length, error: String(e).slice(0, 200) });
    } catch {
      /* the audit itself failed; nothing left to tell */
    }
  }
}

/** Turn notices into posts: public lines one per member, private ones as a single line of mentions. Pure, for testing. */
export function composeNotices(items: Notice[]): Array<{ content: string; users: string[] }> {
  const posts: Array<{ content: string; users: string[] }> = [];
  const pub = items.filter((i) => PUBLIC_KINDS.has(i.kind));
  const priv = [...new Set(items.filter((i) => !PUBLIC_KINDS.has(i.kind)).map((i) => i.userId))];

  let lines: string[] = [];
  let users: string[] = [];
  const push = () => {
    if (lines.length) posts.push({ content: lines.join("\n"), users: [...new Set(users)] });
    lines = [];
    users = [];
  };
  for (const i of pub) {
    const line = `<@${i.userId}> ${i.content}`.slice(0, MAX_POST_CHARS);
    if (lines.length >= MAX_MENTIONS_PER_POST || lines.join("\n").length + line.length + 1 > MAX_POST_CHARS) push();
    lines.push(line);
    users.push(i.userId);
  }
  push();
  for (let k = 0; k < priv.length; k += MAX_MENTIONS_PER_POST) {
    const chunk = priv.slice(k, k + MAX_MENTIONS_PER_POST);
    posts.push({ content: `${chunk.map((u) => `<@${u}>`).join(" ")} — ${PRIVATE_TEXT}`, users: chunk });
  }
  return posts;
}

async function postNotices(env: Env, items: Notice[]): Promise<boolean> {
  const channel = (env.CHANNEL_NOTICES ?? "").trim();
  if (!channel) {
    // Not configured: say nothing rather than fall back to anything else. Audited so the gap is visible.
    for (const i of items) await audit(env, "system", "notice.no_channel", i.userId, { kind: i.kind });
    return false;
  }
  const posts = composeNotices(items);
  const cap = Math.max(1, intVar(env.NOTICE_RATE_CAP, 10));
  const since = now() - WINDOW_SECONDS;
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'notice.posted' AND ts > ?1").bind(since).first<{ n: number }>();
  let room = cap - (recent?.n ?? 0);
  let posted = 0;
  for (const p of posts) {
    if (room <= 0) {
      for (const u of p.users) await audit(env, "system", "notice.suppressed", u, { cap });
      const already = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'notice.capped' AND ts > ?1").bind(since).first<{ n: number }>();
      if (!(already?.n ?? 0)) {
        await audit(env, "system", "notice.capped", undefined, { cap });
        await logLine(env, `\u{1F507} notice cap hit (${cap} posts per ${WINDOW_SECONDS}s) — the rest of this minute's notices are **dropped, not queued**. Everyone can still read their state with \`/verify-status\`.`);
      }
      continue;
    }
    try {
      // Only the members named in this post can be pinged: never @everyone, @here or a role, whatever the text says.
      await postMessage(env, channel, { content: p.content, allowed_mentions: { parse: [], users: p.users } });
      await audit(env, "system", "notice.posted", undefined, { users: p.users.length });
      room--;
      posted++;
    } catch (e) {
      const why = explainDiscordError(e);
      for (const u of p.users) await audit(env, "system", "notice.failed", u, { error: why });
      const already = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'notice.failed' AND ts > ?1").bind(since).first<{ n: number }>();
      if ((already?.n ?? 0) <= p.users.length) await logLine(env, `⚠️ could not post a notice in <#${channel}>: ${why}`);
    }
  }
  return posted > 0;
}
