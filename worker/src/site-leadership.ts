/**
 * .114 (2 Oct 2026, Viktor's items 8 and 10): the leadership of every Olympus guild, and the end-of-beta reset.
 *
 * The I-X leadership directory. Ten entries, Olympus I to Olympus X, each a Guild Master and up to twelve officers, as the
 * names the site's administrators type (free text, like the appointed roles). All ten start empty (Viktor, relayed by
 * Codex, log 17:57 UTC); confirmed Olympus members read it (the confirmedGuildData capability). A listing is a record
 * and nothing else: no code reads it for any permission (the bot's officer roles, SITE_ADMINS, COMMUNITY_ORGANIZERS and
 * Guild Member are all decided elsewhere and never from here). It is separate from the Olympus I staff channels, from the
 * site's appointed ballot roles (Admin -> Settings) and from Discord: the private "Olympus I-X Council" category is
 * Codex's, made with Viktor's approval, and this page only links its #council-info channel. One site_settings row,
 * `leadership`, outside SiteSettings (GET /api/public returns SiteSettings to anyone; this is for members).
 *
 * The beta reset. Viktor: every guild role is reconsidered from scratch for the full release; scope, as he confirmed it
 * through Codex (log 17:42 and 17:57 UTC): Olympus guild ranks and guild leadership assignments only, never Asmongold's
 * general roles, applications, votes or private records, and disabled until the beta has really closed. Blizzard gives
 * 21 October 2026 as the last full day and no hour, so nothing here runs on a timer: an administrator first records the
 * moment the beta closed (betaClosedAt, which must be in the past), then confirms the reset with a typed word. One batch:
 * the appointed roles become an explicit empty map (deleting that row would bring back the default Treasurer, site-data.ts
 * DEFAULT_APPOINTED), the I-X directory empties, the reset is stamped, and optionally a site notice is set. Running it
 * twice changes nothing more. In-game ranks and the Discord leadership roles are changed by people (docs/launch-runbook.md,
 * "Beta end"): the website cannot change game ranks, and the bot's role sits below those Discord roles.
 */
import type { Env } from "./env";
import { audit, now } from "./db";
import { cleanText } from "./site-data";
import { b64u } from "./site-core";

export const LEADERSHIP_KEY = "leadership";
export const GUILD_COUNT = 10;
export const OFFICERS_MAX = 12;
export const GUILD_NAMES = ["Olympus I", "Olympus II", "Olympus III", "Olympus IV", "Olympus V", "Olympus VI", "Olympus VII", "Olympus VIII", "Olympus IX", "Olympus X"] as const;
/** The Council's information channel in Asmongold's server (Codex, log 17:57 and 18:26 UTC). A link only; the page grants no access to it. */
export const COUNCIL_INFO_URL = "https://discord.com/channels/236932545793490944/1555636857621188669";

export interface GuildLeadership {
  name: string;
  gm: string;
  officers: string[];
}

const empty = (): GuildLeadership[] => GUILD_NAMES.map((name) => ({ name, gm: "", officers: [] }));

/** An administrator's directory, cleaned: exactly ten entries in order, names up to 40 characters, at most twelve officers each; null when unreadable. */
export function cleanLeadership(v: unknown): GuildLeadership[] | null {
  if (!Array.isArray(v) || v.length !== GUILD_COUNT) return null;
  const out: GuildLeadership[] = [];
  for (let i = 0; i < GUILD_COUNT; i++) {
    const g = v[i] as { gm?: unknown; officers?: unknown } | null;
    if (!g || typeof g !== "object") return null;
    const officers = Array.isArray(g.officers) ? g.officers.map((o) => cleanText(o, 40)).filter(Boolean) : [];
    if (officers.length > OFFICERS_MAX) return null;
    out.push({ name: GUILD_NAMES[i]!, gm: cleanText(g.gm, 40), officers: [...new Set(officers)] });
  }
  return out;
}

export function parseLeadership(raw: string | undefined | null): GuildLeadership[] {
  if (!raw) return empty();
  try {
    return cleanLeadership(JSON.parse(raw)) ?? empty();
  } catch {
    return empty();
  }
}

async function setting(env: Env, key: string): Promise<{ value: string; updated_at: number; updated_by: string | null } | null> {
  return env.DB.prepare("SELECT value, updated_at, updated_by FROM site_settings WHERE key = ?1").bind(key).first<{ value: string; updated_at: number; updated_by: string | null }>();
}

const put = (env: Env, key: string, value: string, t: number, actor: string) =>
  env.DB.prepare(
    "INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3, updated_by = ?4",
  ).bind(key, value, t, actor);

export async function loadLeadership(env: Env): Promise<{ guilds: GuildLeadership[]; updatedAt: number | null }> {
  const row = await setting(env, LEADERSHIP_KEY);
  return { guilds: parseLeadership(row?.value), updatedAt: row?.updated_at ?? null };
}

const namesIn = (guilds: GuildLeadership[]) => guilds.reduce((n, g) => n + (g.gm ? 1 : 0) + g.officers.length, 0);

/** Admin save. Audited with counts only: the names are in the row, and the dated log outlives an erasure. */
export async function saveLeadership(env: Env, actor: string, body: Record<string, unknown>): Promise<{ ok: true; guilds: GuildLeadership[] } | { ok: false; message: string }> {
  const guilds = cleanLeadership(body.guilds);
  if (!guilds) return { ok: false, message: `The directory could not be read: it needs ${GUILD_COUNT} guilds, each with at most ${OFFICERS_MAX} officers.` };
  await put(env, LEADERSHIP_KEY, JSON.stringify(guilds), now(), actor).run();
  await audit(env, actor, "site.leadership", undefined, { names: namesIn(guilds) });
  return { ok: true, guilds };
}

// ---------- the beta reset ----------

export const BETA_CLOSED_KEY = "betaClosedAt";
export const BETA_RESET_KEY = "betaResetAt";
/** Once-only (Codex, log 19:17 UTC): the reset records the closing moment it ran for, with a nonce; one reset per beta. */
export const BETA_RESET_FOR_KEY = "betaResetFor";
/** The beta began on 17 Sep 2026; a closing moment before that is a typing mistake. */
const BETA_START = Date.UTC(2026, 8, 17) / 1000;
export const RESET_WORD = "RESET";

export interface BetaResetState {
  betaClosedAt: number | null;
  closedRecordedBy: string | null;
  lastResetAt: number | null;
  lastResetBy: string | null;
  /** the reset already ran (it runs once) */
  resetDone: boolean;
  /** what a reset would clear now, as counts (no names) */
  preview: { appointed: number; directoryNames: number };
  /** a reset is allowed: a recorded closing moment in the past, and no reset yet */
  armed: boolean;
}

export async function betaResetState(env: Env): Promise<BetaResetState> {
  const [closed, reset, resetFor, appointed, leadership] = await Promise.all([
    setting(env, BETA_CLOSED_KEY),
    setting(env, BETA_RESET_KEY),
    setting(env, BETA_RESET_FOR_KEY),
    setting(env, "appointed"),
    loadLeadership(env),
  ]);
  const closedAt = closed && /^\d{9,11}$/.test(closed.value) ? Number(closed.value) : null;
  let appointedCount = 0;
  if (appointed === null) appointedCount = 1; // the default Treasurer appointment stands until the list is first saved
  else {
    try {
      const v = JSON.parse(appointed.value) as unknown;
      appointedCount = v && typeof v === "object" && !Array.isArray(v) ? Object.keys(v).length : 0;
    } catch {
      appointedCount = 0;
    }
  }
  const resetDone = resetFor !== null;
  return {
    betaClosedAt: closedAt,
    closedRecordedBy: closed?.updated_by ?? null,
    lastResetAt: reset && /^\d{9,11}$/.test(reset.value) ? Number(reset.value) : null,
    lastResetBy: reset?.updated_by ?? null,
    resetDone,
    preview: { appointed: appointedCount, directoryNames: namesIn(leadership.guilds) },
    armed: closedAt !== null && closedAt <= now() && !resetDone,
  };
}

/** Record the moment Blizzard closed the beta. It must be in the past (the reset cannot be armed ahead of time) and can be
 *  corrected only until the reset has run. */
export async function recordBetaClosed(env: Env, actor: string, raw: unknown): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const t = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : NaN;
  if (!(t >= BETA_START)) return { ok: false, status: 400, message: "That closing time could not be read." };
  if (t > now()) return { ok: false, status: 400, message: "The beta's closing moment must be in the past. Record it once Blizzard has actually closed the beta." };
  const r = await env.DB.prepare(
    `INSERT INTO site_settings (key, value, updated_at, updated_by) SELECT ?1, ?2, ?3, ?4 WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE key = ?5)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  )
    .bind(BETA_CLOSED_KEY, String(t), now(), actor, BETA_RESET_FOR_KEY)
    .run();
  if (!r.meta.changes) return { ok: false, status: 409, message: "The reset has already run for this beta, so its closing moment stays as recorded." };
  await audit(env, actor, "site.beta_closed", undefined, { at: t });
  return { ok: true };
}

/**
 * The reset itself: refused unless armed, confirmed with RESET_WORD and naming the closing moment the administrator saw
 * (body.closedAt). One batch. Its first statement admits it in SQL: the recorded closing moment is the one named and in
 * the past, and no reset ran before; it stores the once-only marker with a nonce, and every other statement requires that
 * nonce, so a replayed or stale request changes nothing (later appointments survive) and is told so.
 */
export async function runBetaReset(env: Env, actor: string, body: Record<string, unknown>): Promise<{ ok: true; cleared: { appointed: number; directoryNames: number } } | { ok: false; status: number; message: string }> {
  if (body.confirm !== RESET_WORD) return { ok: false, status: 400, message: `Type ${RESET_WORD} to confirm.` };
  const st = await betaResetState(env);
  if (st.resetDone) return { ok: false, status: 409, message: "The reset has already run for this beta; nothing was changed." };
  if (!st.armed) return { ok: false, status: 409, message: "Record the moment the beta closed first; the reset stays locked until then." };
  if (body.closedAt !== st.betaClosedAt) return { ok: false, status: 409, message: "The recorded closing moment changed since this page was opened. Reload and check it." };
  const t = now();
  const nonce = b64u(crypto.getRandomValues(new Uint8Array(16)));
  const notice = typeof body.notice === "string" ? cleanText(body.notice, 300) : "";
  const marker = JSON.stringify({ closedAt: st.betaClosedAt, nonce });
  const after = (key: string, value: string) =>
    env.DB.prepare(
      `INSERT INTO site_settings (key, value, updated_at, updated_by) SELECT ?1, ?2, ?3, ?4
        WHERE EXISTS (SELECT 1 FROM site_settings WHERE key = ?5 AND json_extract(value, '$.nonce') = ?6)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    ).bind(key, value, t, actor, BETA_RESET_FOR_KEY, nonce);
  const done = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO site_settings (key, value, updated_at, updated_by) SELECT ?1, ?2, ?3, ?4
        WHERE EXISTS (SELECT 1 FROM site_settings WHERE key = ?5 AND value = ?6 AND CAST(value AS INTEGER) <= ?3)
          AND NOT EXISTS (SELECT 1 FROM site_settings WHERE key = ?1)`,
    ).bind(BETA_RESET_FOR_KEY, marker, t, actor, BETA_CLOSED_KEY, String(st.betaClosedAt)),
    after("appointed", "{}"), // explicit and empty: a missing row would bring back the default Treasurer
    after(LEADERSHIP_KEY, JSON.stringify(empty())),
    after(BETA_RESET_KEY, String(t)),
    ...(notice ? [after("notice", notice)] : []),
  ]);
  if (!Number(done[0]?.meta?.changes ?? 0)) return { ok: false, status: 409, message: "The reset has already run, or the closing moment changed meanwhile; nothing was changed. Reload." };
  await audit(env, actor, "site.beta_reset", undefined, { appointed: st.preview.appointed, directoryNames: st.preview.directoryNames, notice: !!notice });
  return { ok: true, cleared: st.preview };
}
