import type { Env } from './env';
import { officerRoles } from './env';
import { rest } from './discord';
import { admittedRead, FENCE_REFUSED, refusal, type CommunityContext } from './community-context';
import { apiJson } from './site-core';
import { captureLaunchVerification } from './launch-verification227';
import { nativeMembershipSourceMatches } from './native-rank-schemes';
import { canonicalOlympusGuildName, FLAGSHIP_GUILD_NAME, OLYMPUS_GUILD_NAMES } from './guild-affiliation229';
import { directoryOptOutsSql } from './community-discord-directory';
import { normalizeCharacter } from './codes';
import { likeArg, now } from './db';

type Snapshot = {exported_at:number; source:string; complete:number; trusted:number; member_count:number; stored:number};
type RosterRow = {name:string; rank:string|null; level?:number|null; class?:string|null};
export const ROSTER_PAGE_SIZE = 50;
const latest = 'SELECT MAX(id) FROM roster_snapshots';
const disallowed = (subject:string) => `
  EXISTS(SELECT 1 FROM members m WHERE m.discord_id=${subject} AND m.banned=1)
  OR EXISTS(SELECT 1 FROM site_users u WHERE u.discord_id=${subject} AND u.denied=1)
  OR EXISTS(SELECT 1 FROM privacy_subjects p WHERE p.subject_id=${subject} AND p.state<>'active')
  OR EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.subject_id=${subject} AND j.state<>'complete' AND j.state IN ('held','erasing','waiting_role'))`;

export function rosterReaderProbe(env:Env, viewer:string) {
  return env.DB.prepare(`SELECT NOT (${disallowed('?1')}) AS allowed`).bind(viewer);
}

export function rosterReaderAllowed(result:D1Result|undefined):boolean {
  return (result?.results[0] as {allowed?:number} | undefined)?.allowed===1;
}

/** Project permitted columns at the database boundary. A hidden account follows its
 * native character GUID across a rename, including while the name link catches up. */
export function guildRosterRowsSql(officer:boolean,account:boolean):string {
  const fields = officer ? 'r.name,r.rank,r.level,r.class' : 'r.name,r.rank';
  const condition = account
    ? "EXISTS(SELECT 1 FROM characters c WHERE c.discord_id=?1 AND c.name_key=r.name_key AND c.guid=r.guid AND c.status='member')"
    : "r.name_key LIKE ?1 ESCAPE '\\'";
  return `WITH hidden AS MATERIALIZED (${directoryOptOutsSql()}),
      withheld AS MATERIALIZED (
        SELECT c.name_key,c.guid FROM characters c WHERE ${disallowed('c.discord_id')}
          OR json_extract((SELECT value FROM hidden),'$."'||c.discord_id||'"') IN
             ('discord-only-optout-v1',(SELECT u.account_incarnation FROM site_users u WHERE u.discord_id=c.discord_id)))
      SELECT ${fields} FROM roster_members r WHERE r.snapshot_id=(${latest})
        AND r.name_key NOT IN (SELECT name_key FROM withheld WHERE name_key IS NOT NULL)
        AND (r.guid IS NULL OR r.guid NOT IN (SELECT guid FROM withheld WHERE guid IS NOT NULL))
        AND ${condition} ORDER BY r.name_key LIMIT ?2 OFFSET ?3`;
}

function rosterSnapshotStatement(env:Env) {
  return env.DB.prepare(`SELECT exported_at,source,complete,trusted,member_count,
    (SELECT COUNT(*) FROM roster_members WHERE snapshot_id=s.id) AS stored FROM roster_snapshots s WHERE s.id=(${latest})`);
}

export function guildRosterStatements(env:Env, options:{officer:boolean; search?:string; offset?:number; account?:string}) {
  return [rosterSnapshotStatement(env),
    env.DB.prepare(guildRosterRowsSql(options.officer,options.account!==undefined))
      .bind(options.account ?? likeArg(normalizeCharacter(options.search ?? ''), true), ROSTER_PAGE_SIZE+1, options.offset ?? 0),
  ];
}

function readRosterSource(launch:ReturnType<typeof captureLaunchVerification>, result:D1Result|undefined) {
  const snapshot=result?.results[0] as Snapshot|undefined;
  if (launch.mode!=='members-only'||!launch.scope||!launch.current()||!snapshot||snapshot.complete!==1||snapshot.trusted!==1||
      !Number.isSafeInteger(snapshot.exported_at)||snapshot.exported_at<=0||snapshot.exported_at>now()+5||
      !Number.isSafeInteger(snapshot.stored)||snapshot.stored<1||snapshot.stored!==snapshot.member_count||
      !nativeMembershipSourceMatches(snapshot.source,launch.scope.guild,launch.scope.realm)) return null;
  return {guild:canonicalOlympusGuildName(launch.scope.guild), realm:launch.scope.realm, asOf:snapshot.exported_at};
}

export function readRosterResult(launch:ReturnType<typeof captureLaunchVerification>, results:D1Result[]) {
  const source=readRosterSource(launch,results[0]);
  if (!source) return null;
  const rows=results[1]!.results as RosterRow[];
  return {...source,members:rows.slice(0,ROSTER_PAGE_SIZE),more:rows.length>ROSTER_PAGE_SIZE};
}

/** Current membership is independently checked for Discord profiles and for any
 * elevated site response. A departed or screening-pending user has no reader role. */
export async function liveRosterReader(env:Env,viewer:string):Promise<'basic'|'officer'|null> {
  if (!/^\d{17,20}$/.test(viewer)||!env.DISCORD_BOT_TOKEN||!env.GUILD_ID||env.GUILD_ID!==env.SITE_GUILD_ID) return null;
  try {
    const member=await rest<{user?:{id?:string;bot?:boolean};pending?:boolean;roles?:unknown}>(env,'GET',`/guilds/${env.GUILD_ID}/members/${viewer}`,undefined,1);
    if (member?.user?.id!==viewer || (member.user.bot!==undefined && member.user.bot!==false) ||
      (member.pending!==undefined && member.pending!==false) || !Array.isArray(member.roles) ||
      !member.roles.every(role=>typeof role==='string' && /^\d{17,20}$/.test(role))) return null;
    return member.roles.some(role=>officerRoles(env).includes(role)) ? 'officer' : 'basic';
  } catch { return null; }
}

export async function guildRosterDirectory(request:Request,env:Env,ctx:CommunityContext):Promise<Response> {
  if (!ctx.capabilities.applicantWrite || !ctx.subject) return refusal(env,request,'applicantWrite');
  const denied=()=>apiJson({error:'roster_unavailable'},403);
  if (ctx.facts.banned) return denied();
  const params=new URL(request.url).searchParams;
  const guild=canonicalOlympusGuildName(params.get('guild') ?? 'OLYMPUS PRIME');
  const search=params.get('search') ?? '', page=params.get('page') ?? '1';
  if (!guild || search.length>80 || !/^[1-9]\d{0,2}$/.test(page)) return apiJson({error:'invalid_roster_filter'},400);
  const launch=captureLaunchVerification(env), viewer=ctx.subject.discordId;
  const wantsDetail=params.get('detail')==='officer';
  const role=wantsDetail ? await liveRosterReader(env,viewer) : 'basic';
  if (!role) return denied();
  const officer=role==='officer';
  const primeConfigured=launch.mode==='members-only' && !!launch.scope && canonicalOlympusGuildName(launch.scope.guild)===FLAGSHIP_GUILD_NAME;
  const scoped=primeConfigured && guild===FLAGSHIP_GUILD_NAME;
  // The native installation authenticates a single flagship scope. Branch
  // labels and aggregate counts cannot supply named roster rows.
  const statements=[rosterReaderProbe(env,viewer),...(scoped ? guildRosterStatements(env,{officer,search,offset:(Number(page)-1)*ROSTER_PAGE_SIZE})
    : primeConfigured ? [rosterSnapshotStatement(env)] : [])];
  const read=await admittedRead(env,ctx,'applicantWrite',statements);
  if (read===FENCE_REFUSED) return refusal(env,request,'applicantWrite');
  if (!launch.current() || !rosterReaderAllowed(read[0])) return denied();
  // Repeat the D1 read after the officer lookup to include concurrent privacy changes.
  let final=read;
  if (officer) {
    if (await liveRosterReader(env,viewer)!=='officer') return denied();
    const refreshed=await admittedRead(env,ctx,'applicantWrite',statements);
    if (refreshed===FENCE_REFUSED || !launch.current() || !rosterReaderAllowed(refreshed[0])) return denied();
    final=refreshed;
  }
  const roster=scoped ? readRosterResult(launch,final.slice(1)) : null;
  const primeAvailable=scoped ? !!roster : primeConfigured && !!readRosterSource(launch,final[1]);
  const sources=OLYMPUS_GUILD_NAMES.map(name=>({guild:name,status:name===FLAGSHIP_GUILD_NAME
    ? (primeAvailable ? 'available' : 'awaiting-roster') : 'pending-source'}));
  return apiJson({guilds:OLYMPUS_GUILD_NAMES,guild,officer,sources,roster});
}
