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
 * .197: a separate explicit account association may replace a typed label for one exact branch and seat. Its private
 * proof binds the current account birth and privacy generation; current member display is paged and read-fenced.
 * Typed labels remain unverified. These records still confer no website, Discord, bot or game authority.
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
import { cleanAppointed, cleanText } from "./site-data";
import { apiJson, b64u, isSiteAdmin, rateLimited, sign, verify } from "./site-core";
import { admittedCommunityRead, communityContext, communityReadRefusal, fenceSql, FENCE_REFUSED, type CommunityContext } from './community-context';
import { appointmentPublicationTargetsCurrentSql, freshAppointmentMember, leadershipIdentitySnapshotStatement, readAppointmentAccounts, type AppointmentAccount, type PublicationTarget } from './site-appointed-identities';
import { GUILD_NAMES, LEADERSHIP_SCHEMA, LEADERSHIP_POSITIONS, LEADERSHIP_POSITION_KEYS, LEADERSHIP_PROOF_PURPOSE, leadershipAccountId, leadershipEnvelope, leadershipPointer, leadershipProofPayload, type GuildLeadership, type LeadershipEnvelope, type LeadershipPublication } from './site-leadership-data';
export { GUILD_NAMES } from './site-leadership-data';
export type { GuildLeadership } from './site-leadership-data';

export const LEADERSHIP_KEY = "leadership";
/**
 * .115 (Viktor's item C, 2 Oct 2026): what an administrator types in place of a name removed on request. In the appointed
 * roles it keeps the role appointed (its board and applications stay closed, where clearing the name would reopen it); in
 * the directory it keeps the place filled. Typing it, or clearing a name, needs no consent check: it adds no one.
 */
export const NAME_WITHHELD = "Name withheld";
export const GUILD_COUNT = 10;
export const OFFICERS_MAX = 12;
/** The Council's information channel in Asmongold's server (Codex, log 17:57 and 18:26 UTC). A link only; the page grants no access to it. */
export const COUNCIL_INFO_URL = "https://discord.com/channels/236932545793490944/1555636857621188669";

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

/** Native erasure preserves a seat by replacing its pointer with NAME_WITHHELD.
 * Qualified saves keep repeated removal markers at their original positions;
 * ordinary names retain the legacy cleaning, truncation and deduplication rules.
 * Call only after cleanLeadership has admitted the original input bounds. */
function qualifiedGuilds(raw:unknown,cleaned:GuildLeadership[]):GuildLeadership[]{
  return cleaned.map((g,i)=>{
    const input=(raw as {officers?:unknown}[])[i]!.officers;
    const officers=Array.isArray(input)?input.map(o=>cleanText(o,40)).filter(Boolean):[];
    const seen=new Set<string>();
    return {...g,officers:officers.filter(name=>{
      if(name===NAME_WITHHELD)return true;
      if(seen.has(name))return false;
      seen.add(name);return true;
    })};
  });
}

export function parseLeadership(raw: string | undefined | null): GuildLeadership[] {
  if (!raw) return empty();
  try {
    const parsed:unknown=JSON.parse(raw),guilds=leadershipEnvelope(parsed)?parsed.guilds:cleanLeadership(parsed)??empty();
    // Compatibility/export-facing reader never turns a canonical account pointer
    // or a private proof into a person's name. Qualified display is separate.
    return guilds.map(g=>({...g,gm:leadershipAccountId(g.gm)?NAME_WITHHELD:g.gm,officers:g.officers.map(n=>leadershipAccountId(n)?NAME_WITHHELD:n)}));
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

/**
 * Admin save. Audited with counts only: the names are in the row, and the dated log outlives an erasure.
 * .115 (Viktor's item C, 2 Oct 2026): a name is listed only after that person agreed, so a save that adds a name to a
 * guild (one not already listed for that same guild, other than NAME_WITHHELD) needs the administrator's namesConfirmed;
 * removing, keeping or moving a name within its guild does not. The server can check only that the box was ticked, not
 * the agreement itself. The log records that it was ticked, never the names.
 */
export async function saveLeadership(env: Env, actor: string, body: Record<string, unknown>, request?:Request): Promise<{ ok: true; guilds: GuildLeadership[] } | { ok: false; error: "invalid" | "confirm_names" | "stale_directory" | "identity_confirmation" | "identity_unavailable"; message: string }> {
  if(Object.hasOwn(body,'publications')||Object.hasOwn(body,'schema'))return {ok:false,error:'invalid',message:'Private publication proofs are server-managed and cannot be submitted.'};
  const guilds = cleanLeadership(body.guilds);
  if (!guilds) return { ok: false, error: "invalid", message: `The directory could not be read: it needs ${GUILD_COUNT} guilds, each with at most ${OFFICERS_MAX} officers.` };
  const prior = await setting(env, LEADERSHIP_KEY);
  const oldDocument=leadershipDocument(prior?.value??null),hasPointers=LEADERSHIP_POSITIONS.some(p=>leadershipAccountId(leadershipPointer(guilds,p.key)));
  if(hasPointers||oldDocument?.schema===LEADERSHIP_SCHEMA||Object.hasOwn(body,'expectedRevision'))return saveQualifiedLeadership(env,actor,body,qualifiedGuilds(body.guilds,guilds),request);
  const confirmed = body.namesConfirmed === true;
  if (!confirmed) {
    const cur = parseLeadership(prior?.value);
    const adds = guilds.some((g, i) => {
      const had = new Set([cur[i]?.gm ?? "", ...(cur[i]?.officers ?? [])].filter(Boolean));
      return [g.gm, ...g.officers].some((who) => !!who && who !== NAME_WITHHELD && !had.has(who));
    });
    if (adds) return { ok: false, error: "confirm_names", message: "Confirm that each person you list agreed to be listed." };
  }
  // Compare the exact value read, including an absent row, inside the write itself. A concurrent removal/replacement
  // wins over this stale save even when its consent box was ticked; a reload must read the latest directory first.
  const saved = await env.DB.prepare(
    `INSERT INTO site_settings (key, value, updated_at, updated_by)
     SELECT ?1, ?2, ?3, ?4 WHERE (SELECT value FROM site_settings WHERE key = ?1) IS ?5
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  ).bind(LEADERSHIP_KEY, JSON.stringify(guilds), now(), actor, prior?.value ?? null).run();
  if ((saved.meta?.changes ?? 0) === 0) {
    return { ok: false, error: "stale_directory", message: "The directory changed while this save was pending. Nothing was saved. Reload the page before editing again." };
  }
  await audit(env, actor, "site.leadership", undefined, confirmed ? { names: namesIn(guilds), namesConfirmed: true } : { names: namesIn(guilds) });
  return { ok: true, guilds };
}

type LeadershipSnapshot={value:string;updated_at:number;targets:string};
type TargetRow=AppointmentAccount&{slot:string};
function leadershipDocument(raw:string|null):LeadershipEnvelope|null{
  if(raw===null)return null;try{const d:unknown=JSON.parse(raw);return leadershipEnvelope(d)?d:null;}catch{return null;}
}
function rawGuilds(raw:string|null):GuildLeadership[]{const d=leadershipDocument(raw);return d?d.guilds:parseLeadership(raw);}
const binding=(ctx:CommunityContext,row:LeadershipSnapshot|null)=>{
  const s=ctx.subject!;return JSON.stringify([s.discordId,s.sessionVersion,s.expiresAt,s.accountIncarnation,s.privacyGeneration,row?.value??null,row?.targets??'[]']);
};
const revisionPurpose='branch-leadership-admin-view-v1',pagePurpose='branch-leadership-reader-v1';
async function snapshot(env:Env,ctx:CommunityContext):Promise<LeadershipSnapshot|null|typeof FENCE_REFUSED>{
  const out=await admittedCommunityRead(env,ctx,[leadershipIdentitySnapshotStatement(env)]);
  return out===FENCE_REFUSED?out:(out[0]?.results[0] as LeadershipSnapshot|undefined)??null;
}
function targetsOf(row:LeadershipSnapshot|null):TargetRow[]{
  const v:unknown=JSON.parse(row?.targets??'[]');
  if(!Array.isArray(v)||v.length>130||new Set(v.map(r=>r?.slot)).size!==v.length||v.some(r=>!r||!LEADERSHIP_POSITION_KEYS.includes(r.slot)||!/^\d{17,20}$/.test(r.id)||!['eligible','unavailable'].includes(r.status)))throw Error('leadership_identity_unconfirmed');
  return v;
}
/** Admin only: editable canonical pointers and an opaque view revision. Private
 * signatures/births/generations never enter this DTO or the generic settings. */
export async function loadLeadershipAdmin(request:Request,env:Env,actor:string){
  const secret=env.COOKIE_SECRET;
  const ctx=await communityContext(env,request);
  if(!ctx.subject||ctx.subject.discordId!==actor||!isSiteAdmin(env,actor))return apiJson({error:'forbidden'},403);
  const before=await snapshot(env,ctx);if(before===FENCE_REFUSED)return communityReadRefusal(env,request);
  const revision=await sign(secret,revisionPurpose,binding(ctx,before));
  const after=await snapshot(env,ctx);if(after===FENCE_REFUSED)return communityReadRefusal(env,request);
  if(JSON.stringify(before)!==JSON.stringify(after)||env.COOKIE_SECRET!==secret||!isSiteAdmin(env,actor))return apiJson({error:'stale_directory',message:'The directory changed while loading. Reload it.'},409);
  return {guilds:rawGuilds(after?.value??null),updatedAt:after?.updated_at??null,revision,identityBindingsVersion:1 as const,identityScope:'display_only_no_grants' as const,legacyNames:'staff_entered_unverified' as const};
}
async function saveQualifiedLeadership(env:Env,actor:string,body:Record<string,unknown>,guilds:GuildLeadership[],request?:Request):Promise<{ok:true;guilds:GuildLeadership[]}|{ok:false;error:'identity_confirmation'|'identity_unavailable'|'stale_directory'|'confirm_names';message:string}>{
  const fail=(error:'identity_confirmation'|'identity_unavailable'|'stale_directory'|'confirm_names',message:string)=>({ok:false as const,error,message});
  if(rateLimited('leadership-save:'+actor,30,60))return fail('identity_unavailable','Too many account-association saves. Wait before trying again.');
  if(!request||typeof body.expectedRevision!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(body.expectedRevision))return fail('stale_directory','Reload the original directory before saving account associations.');
  const ctx=await communityContext(env,request),subject=ctx.subject;
  if(!subject||subject.discordId!==actor||!isSiteAdmin(env,actor))return fail('stale_directory','The original administrator session is no longer current.');
  const before=await snapshot(env,ctx);if(before===FENCE_REFUSED)return fail('stale_directory','The original administrator session is no longer current.');
  if(!await verify(env.COOKIE_SECRET,revisionPurpose,binding(ctx,before),body.expectedRevision))return fail('stale_directory','The directory or an associated identity changed. Reload before saving.');
  const old=leadershipDocument(before?.value??null),associations=LEADERSHIP_POSITIONS.flatMap(slot=>{
    const pointer=leadershipPointer(guilds,slot.key),id=leadershipAccountId(pointer);return id?[{slot,pointer:pointer!,id}]:[];
  });
  if(associations.length&&body.leadershipIdentitiesConfirmed!==true)return fail('identity_confirmation','Confirm that each selected account agreed to this branch and position being displayed to qualified guild readers. No rank or permission is granted.');
  const prior=rawGuilds(before?.value??null);
  if(body.namesConfirmed!==true&&guilds.some((g,i)=>[g.gm,...g.officers].some(who=>who&&who!==NAME_WITHHELD&&![prior[i]?.gm,...(prior[i]?.officers??[])].includes(who))))return fail('confirm_names','Confirm that each person you list agreed to be listed.');
  const ids=[...new Set(associations.map(a=>a.id))],captured=new Map((await readAppointmentAccounts(env,ids)).map(t=>[t.id,t])),fresh=new Set<string>(),publications:Record<string,LeadershipPublication>={};
  const guild=env.SITE_GUILD_ID??'',secret=env.COOKIE_SECRET,token=env.DISCORD_BOT_TOKEN;
  for(const a of associations){
    const t=captured.get(a.id);if(!t||t.status!=='eligible')return fail('identity_unavailable','A selected account is not currently available for this publication.');
    const p=old?.publications[a.slot.key];
    if(p&&p.pointer===a.pointer&&p.birth===t.birth&&p.generation===t.generation&&await verify(secret,LEADERSHIP_PROOF_PURPOSE,leadershipProofPayload(guild,a.slot.key,p),p.mac))publications[a.slot.key]=p;
    else fresh.add(a.id);
  }
  if(fresh.size>32)return fail('identity_unavailable','At most 32 new or changed members can be checked in one save. Save a smaller reviewed batch; unchanged qualified records can remain.');
  for(const id of fresh){try{if(!await freshAppointmentMember(env,id))return fail('identity_unavailable','A selected member could not be confirmed in the current server.');}catch{return fail('identity_unavailable','Current Discord membership could not be confirmed. No directory was saved.');}}
  const current=new Map((await readAppointmentAccounts(env,ids)).map(t=>[t.id,t])),targets:PublicationTarget[]=[];
  for(const a of associations){
    const t=current.get(a.id),was=captured.get(a.id)!;
    if(!t||t.status!=='eligible'||t.birth!==was.birth||t.generation!==was.generation)return fail('identity_unavailable','A selected identity changed. Reload and review it again.');
    if(!publications[a.slot.key]){const p={pointer:a.pointer,birth:t.birth,generation:t.generation};publications[a.slot.key]={...p,mac:await sign(secret,LEADERSHIP_PROOF_PURPOSE,leadershipProofPayload(guild,a.slot.key,p))};}
    targets.push({role:a.slot.key,id:a.id,birth:t.birth,generation:t.generation});
  }
  if(env.SITE_GUILD_ID!==guild||env.COOKIE_SECRET!==secret||env.DISCORD_BOT_TOKEN!==token||!isSiteAdmin(env,actor))return fail('stale_directory','The original publication context changed. Reload.');
  const stored:LeadershipEnvelope={schema:LEADERSHIP_SCHEMA,guilds,publications};
  const saved=await env.DB.prepare(`INSERT INTO site_settings(key,value,updated_at,updated_by)
   WITH admission AS MATERIALIZED(SELECT 1 WHERE(SELECT value FROM site_settings WHERE key=?1) IS ?5
   AND ${fenceSql('applicantWrite',4,7,8,subject.privacyGeneration,subject.accountIncarnation)}
   AND NOT EXISTS(SELECT 1 FROM members WHERE discord_id=?4 AND banned=1)
   AND ${appointmentPublicationTargetsCurrentSql(6)}) SELECT ?1,?2,?3,?4 FROM admission WHERE 1
   ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
    .bind(LEADERSHIP_KEY,JSON.stringify(stored),now(),actor,before?.value??null,JSON.stringify(targets),subject.sessionVersion,subject.expiresAt).run();
  if(saved.meta.changes!==1)return fail('stale_directory','The directory, original session or a selected identity changed. Reload before saving.');
  await audit(env,actor,'site.leadership',undefined,{names:namesIn(guilds),namesConfirmed:body.namesConfirmed===true,identityAssociations:targets.length,identityPublicationConfirmed:body.leadershipIdentitiesConfirmed===true});
  return {ok:true,guilds};
}

/** Bounded current member projection. No private proof/ID/birth/generation or
 * character data leaves the server. Every page retains the original whole-row,
 * target lifecycle and reader/session witness through the final admitted read. */
export async function qualifiedLeadershipPage(request:Request,env:Env):Promise<Response>{
  const secret=env.COOKIE_SECRET,guild=env.SITE_GUILD_ID,botToken=env.DISCORD_BOT_TOKEN;
  const ctx=await communityContext(env,request,{guildRoleRead:true});if(!ctx.subject)return apiJson({error:'signed_out'},401);
  if(rateLimited('leadership-read:'+ctx.subject.discordId,20,60))return apiJson({error:'slow_down'},429);
  const q=new URL(request.url).searchParams,after=q.get('after'),revision=q.get('revision');
  if((after===null)!==(revision===null)||after!==null&&(!LEADERSHIP_POSITION_KEYS.includes(after)||!/^[A-Za-z0-9_-]{43}$/.test(revision!))||[...q.keys()].some(k=>!['after','revision'].includes(k))||[...q.keys()].length!==new Set(q.keys()).size)return apiJson({error:'invalid_leadership_cursor'},400);
  const before=await snapshot(env,ctx);if(before===FENCE_REFUSED)return communityReadRefusal(env,request);
  const payload=binding(ctx,before);
  if(revision!==null&&!await verify(secret,pagePurpose,payload,revision))return apiJson({error:'leadership_changed'},409);
  const pageRevision=revision??await sign(secret,pagePurpose,payload),doc=leadershipDocument(before?.value??null),targets=new Map(targetsOf(before).map(t=>[t.slot,t]));
  const slots=LEADERSHIP_POSITIONS.filter(p=>doc?.publications[p.key]&&p.key>(after??'')).sort((a,b)=>a.key.localeCompare(b.key)).slice(0,33),identities=[],profiles=new Map<string,Awaited<ReturnType<typeof freshAppointmentMember>>>();
  for(const slot of slots.slice(0,32)){
    const p=doc!.publications[slot.key]!,t=targets.get(slot.key),id=leadershipAccountId(p.pointer)!;
    if(!t||t.status!=='eligible'||t.birth!==p.birth||t.generation!==p.generation||!await verify(secret,LEADERSHIP_PROOF_PURPOSE,leadershipProofPayload(guild??'',slot.key,p),p.mac))continue;
    if(!profiles.has(id)){try{profiles.set(id,await freshAppointmentMember(env,id));}catch{return apiJson({error:'leadership_identity_unavailable'},503);}}
    const profile=profiles.get(id);if(!profile)continue;
    identities.push({slot:slot.key,branch:slot.branch,position:slot.position,officerIndex:slot.officerIndex,label:profile.nick||profile.displayName||profile.username,username:profile.username});
  }
  const final=await snapshot(env,ctx);if(final===FENCE_REFUSED)return communityReadRefusal(env,request);
  if(JSON.stringify(before)!==JSON.stringify(final)||env.COOKIE_SECRET!==secret||env.SITE_GUILD_ID!==guild||env.DISCORD_BOT_TOKEN!==botToken)return apiJson({error:'leadership_changed'},409);
  const nextCursor=slots.length>32?slots[31]!.key:null;
  return apiJson({guilds:parseLeadership(final?.value),identities,revision:pageRevision,nextCursor,complete:nextCursor===null,councilUrl:COUNCIL_INFO_URL,updatedAt:final?.updated_at??null,legacyNames:'staff_entered_unverified',scope:'qualified_community_readers'});
}

/** .115 (Viktor's item A, 2 Oct 2026): News shows when the directory last changed, never its names; site-news.ts runs this inside its admitted read. */
export const leadershipStampStatement = (env: Env) => env.DB.prepare("SELECT updated_at FROM site_settings WHERE key = ?1").bind(LEADERSHIP_KEY);

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
      appointedCount = Object.keys(cleanAppointed(v) ?? {}).length; // only real ballot roles, never private publication proof slots
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
