/** Closed beta grant policy. No arming writes, role effects, or website appointment changes. */
import type { Env } from './env';

export const BETA_RESET_POLICY_KEY = 'betaResetPolicyV1';
export const BETA_RESET_DISPATCH_SEAL_KEY = 'betaResetDispatchSealV1';
const DISPATCH_MODE_KEY = 'BETA_RESET_DISPATCH_SEAL_MODE';
export const BETA_RESET_SOURCE_EPOCH_KEY = 'BETA_RESET_SOURCE_EPOCH';
const SOURCE_EPOCH = /^olympus-full-release-[a-z0-9-]{1,32}$/;
export const BETA_RESET_EPOCH = 'olympus-beta-2026-10-22';
export const BETA_RESET_CUTOFF = 1792688400;
export const BETA_RESET_GUILD_ID = '236932545793490944';
/** Membership roles, then native GM/HC/Officer/Officer Alt/Raid Leader/Veteran/Raider/Member/Alt/Initiate. */
export const BETA_RESET_ROLE_IDS: readonly string[] = Object.freeze([
  '1552077551839617104', '1558657538960916490',
  '1557496182966587453', '1557495772453281853', '1557496796949909575',
  '1557496812196208640', '1557498239656136764', '1557498252994285568',
  '1557498673926242385', '1557498969310101576', '1557499139099590747', '1557499286965719050',
]);
const DB_NOW = "CAST(strftime('%s','now') AS INTEGER)";
const ID = /^\d{17,20}$/;
const KEYS = ['version', 'epoch', 'cutoff', 'guildId', 'roleIds', 'armedAt'];
type GuardEnv = Env & { BETA_RESET_REMOVALS_ENABLED?: string };
export type BetaResetPolicy = Readonly<{
  version: 2; epoch: typeof BETA_RESET_EPOCH; cutoff: typeof BETA_RESET_CUTOFF;
  guildId: typeof BETA_RESET_GUILD_ID; roleIds: readonly string[]; armedAt: number;
}>;
export type BetaGrantCapture = Readonly<{
  mode: 'off' | 'open' | 'held'; raw: string | null; reason: string; guildId: string; roleId: string;
}>;
type Slot = PropertyDescriptor | undefined;
const CONFIG = ['BETA_RESET_REMOVALS_ENABLED', 'GUILD_ID', 'DISCORD_APP_ID', 'SITE_ADMINS',
  'ROLE_GUILD_MEMBER', 'ROLE_GUILD_LEADER', 'ROLE_OFFICER', 'ROLE_RAID_LEADER',
  'ROLE_GUILD_MASTER', 'ROLE_MODERATOR', 'QR_NATIVE_ROLE_MAP', 'DB'] as const;
function slot(value: object, key: string): Slot {
  const own = Object.getOwnPropertyDescriptor(value, key);
  if (own && !Object.hasOwn(own, 'value') || !own && key in value) throw Error('beta_configuration_held');
  return own ? Object.freeze({ ...own }) : undefined;
}
function same(a: Slot, b: Slot): boolean {
  return !a || !b ? a === b : a.value === b.value && a.writable === b.writable
    && a.enumerable === b.enumerable && a.configurable === b.configurable;
}
function value(env: object, key: string): unknown { return slot(env, key)?.value; }
/** Unshipped V2 format removes immutable actor data. Authorization lives in the original arming CAS;
 * normal updated_by metadata can later be erased without deauthorizing this fixed source policy.
 * Old actor-bearing V1 rows hold; they are never silently migrated or treated as absent.
 * Closed JSON data only; duplicate/escaped duplicate keys cannot override an earlier field. */
export function parseBetaResetPolicy(raw: unknown, _env: Pick<Env, 'SITE_ADMINS'>): BetaResetPolicy | null {
  try {
    if (typeof raw !== 'string' || raw.length > 4096) return null;
    const p: unknown = JSON.parse(raw);
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    const r = p as Record<string, unknown>;
    const names = Array.from(raw.matchAll(/"((?:\\.|[^"\\])*)"\s*:/g), m => JSON.parse('"' + m[1] + '"') as string);
    if (names.length !== KEYS.length || new Set(names).size !== KEYS.length
      || Object.keys(r).sort().join(',') !== [...KEYS].sort().join(',')) return null;
    if (r.version !== 2 || r.epoch !== BETA_RESET_EPOCH || r.cutoff !== BETA_RESET_CUTOFF
      || r.guildId !== BETA_RESET_GUILD_ID || !Array.isArray(r.roleIds)
      || r.roleIds.length !== BETA_RESET_ROLE_IDS.length || r.roleIds.some((id, i) => id !== BETA_RESET_ROLE_IDS[i])
      || typeof r.armedAt !== 'number' || !Number.isSafeInteger(r.armedAt) || r.armedAt <= 0 || r.armedAt > BETA_RESET_CUTOFF) return null;
    return Object.freeze({ version: 2, epoch: BETA_RESET_EPOCH, cutoff: BETA_RESET_CUTOFF,
      guildId: BETA_RESET_GUILD_ID, roleIds: BETA_RESET_ROLE_IDS, armedAt: r.armedAt });
  } catch { return null; }
}
/** .159: retained denial of this epoch's mandate, never a replacement removal/grant policy.
 * The original raw policy is inventory data only; its exact digest still names existing debt. */
export type BetaResetRetirement = Readonly<{version:3;state:'retired';originalPolicy:string;retiredAt:number}>;
export function parseBetaResetRetirement(raw:unknown,env:Pick<Env,'SITE_ADMINS'>):BetaResetRetirement|null{
 try{
  if(typeof raw!=='string'||raw.length>8192)return null;
  const r=JSON.parse(raw);
  if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).sort().join(',')!=='originalPolicy,retiredAt,state,version'
   ||JSON.stringify(r)!==raw||r.version!==3||r.state!=='retired'||typeof r.originalPolicy!=='string'
   ||!Number.isSafeInteger(r.retiredAt)||r.retiredAt<BETA_RESET_CUTOFF||r.retiredAt>253402300799)return null;
  const original=parseBetaResetPolicy(r.originalPolicy,env);
  if(!original||r.retiredAt<original.armedAt)return null;
  return Object.freeze({version:3,state:'retired',originalPolicy:r.originalPolicy,retiredAt:r.retiredAt});
 }catch{return null;}
}
/** Selects removal work only. The source-defined grant cutoff applies even when removal is inactive. */
export function resetGuardEnabled(env: GuardEnv): boolean {
  try { return value(env, 'BETA_RESET_REMOVALS_ENABLED') === 'true'; }
  catch { return false; }
}
function configured(env: GuardEnv): boolean {
  try {
    if (value(env, 'GUILD_ID') !== BETA_RESET_GUILD_ID || typeof value(env, 'DISCORD_APP_ID') !== 'string'
      || !ID.test(value(env, 'DISCORD_APP_ID') as string)) return false;
    const member = value(env, 'ROLE_GUILD_MEMBER');
    if (member !== undefined && member !== '' && !BETA_RESET_ROLE_IDS.slice(0, 2).includes(member as string)) return false;
    for (const key of ['ROLE_GUILD_LEADER', 'ROLE_OFFICER', 'ROLE_RAID_LEADER', 'ROLE_GUILD_MASTER', 'ROLE_MODERATOR']) {
      const protectedRole = value(env, key);
      if (protectedRole !== undefined && typeof protectedRole !== 'string' || BETA_RESET_ROLE_IDS.includes(protectedRole as string)) return false;
    }
    const raw = value(env, 'QR_NATIVE_ROLE_MAP');
    if (raw === undefined || raw === '') return true;
    if (typeof raw !== 'string' || raw.length > 1024) return false;
    const map = JSON.parse(raw);
    if (!map || typeof map !== 'object' || Array.isArray(map) || Object.keys(map).sort().join(',') !== 'profile,roles') return false;
    const count = map.profile === 'beta-five' ? 5 : map.profile === 'ten-rank' ? 10 : 0;
    return !!count && Array.isArray(map.roles) && map.roles.length === count && new Set(map.roles).size === count
      && map.roles.every((id: unknown) => typeof id === 'string' && BETA_RESET_ROLE_IDS.slice(2).includes(id));
  } catch { return false; }
}
type Method = { owner: object; descriptor: PropertyDescriptor };
function prepareMethod(db: object): Method {
  let owner: object | null = db;
  for (let i = 0; owner && i < 6; i++, owner = Object.getPrototypeOf(owner)) {
    const descriptor = Object.getOwnPropertyDescriptor(owner, 'prepare');
    if (descriptor) {
      if (!Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'function') break;
      return { owner, descriptor: Object.freeze({ ...descriptor }) };
    }
  }
  throw Error('beta_database_held');
}
type DispatchMode = Readonly<{ mode: 'legacy' | 'v1' | 'held'; slot: Slot; source: Slot;sourceValid:boolean }>;
function dispatchMode(env:GuardEnv):DispatchMode {
 let source:Slot;try{source=slot(env,BETA_RESET_SOURCE_EPOCH_KEY);}catch{return Object.freeze({mode:'held',slot:undefined,source:undefined,sourceValid:false});}
 let captured:Slot;try{captured=slot(env,DISPATCH_MODE_KEY);}catch{return Object.freeze({mode:'held',slot:undefined,source,sourceValid:true});}
 return Object.freeze({mode:captured===undefined?'legacy':captured.value==='v1'?'v1':'held',slot:captured,source,sourceValid:true});
}
/** Restriction-only witness for old role removers which have no beta-policy read. It is
 * captured at the public entry, not reconstructed after a provider/database await. */
export type BetaRemovalDispatchCapture = Readonly<{ kind: 'beta-removal-dispatch' }>;
const removalDispatches = new WeakMap<BetaRemovalDispatchCapture, { env: GuardEnv; dispatch: DispatchMode }>();
export function captureBetaRemovalDispatch(env: GuardEnv): BetaRemovalDispatchCapture {
  let dispatch: DispatchMode;
  try {
    dispatch = dispatchMode(env);
  } catch { dispatch = Object.freeze({ mode: 'held', slot: undefined,source:undefined,sourceValid:false }); }
  const out = Object.freeze({ kind: 'beta-removal-dispatch' as const });
  removalDispatches.set(out, { env, dispatch });
  return out;
}
/** Until the central removal consumers carry their own durable seal fence, these old
 * entry points may dispatch fixed beta targets only in unchanged absent mode. No SQL,
 * seal observation, receipt, provider-drain proof or new removal authority is produced. */
export function betaRemovalDispatchLegacy(env: GuardEnv, captured: BetaRemovalDispatchCapture, guildId: string, roleId: string): boolean {
  const original = removalDispatches.get(captured);
  if (!original || original.env !== env) return false;
  if (guildId !== BETA_RESET_GUILD_ID || !BETA_RESET_ROLE_IDS.includes(roleId)) return true;
  try { return original.dispatch.mode === 'legacy' && original.dispatch.source===undefined
    && same(slot(env, DISPATCH_MODE_KEY), original.dispatch.slot)&&same(slot(env,BETA_RESET_SOURCE_EPOCH_KEY),original.dispatch.source); }
  catch { return false; }
}
/** Opaque originating capture, threaded across facade environments and awaits. It restricts old physical targets only. */
export type BetaRoleDispatch=Readonly<{env:Env;capture:BetaRemovalDispatchCapture}>;
export const captureBetaRoleDispatch=(env:Env):BetaRoleDispatch=>Object.freeze({env,capture:captureBetaRemovalDispatch(env)});
export function betaSourceEpochState(env:Env,captured:BetaRemovalDispatchCapture):Readonly<{mode:'absent'|'active'|'held';epoch:string|null}>{
 const original=removalDispatches.get(captured);if(!original||original.env!==env)return {mode:'held',epoch:null};
 try{const s=original.dispatch.source;if(!original.dispatch.sourceValid||!same(slot(env,BETA_RESET_SOURCE_EPOCH_KEY),s))return {mode:'held',epoch:null};
  return s===undefined?{mode:'absent',epoch:null}:typeof s.value==='string'&&SOURCE_EPOCH.test(s.value)?{mode:'active',epoch:s.value}:{mode:'held',epoch:null};
 }catch{return {mode:'held',epoch:null};}
}
function dispatchPair(pair:BetaRoleDispatch):BetaRoleDispatch|null{
 if(!pair||typeof pair!=='object')return null;const env=Object.getOwnPropertyDescriptor(pair,'env'),capture=Object.getOwnPropertyDescriptor(pair,'capture');
 return env&&capture&&Object.hasOwn(env,'value')&&Object.hasOwn(capture,'value')?{env:env.value,capture:capture.value}:null;
}
export function betaRoleDispatchHeld(effect:Env,pair:BetaRoleDispatch,guild:string,role:string):boolean{
 if(guild!==BETA_RESET_GUILD_ID||!BETA_RESET_ROLE_IDS.includes(role))return false;
 try{const d=dispatchPair(pair);return !d||!betaRemovalDispatchLegacy(d.env,d.capture,guild,role)
   ||DISPATCH_MODE_KEY in effect||BETA_RESET_SOURCE_EPOCH_KEY in effect;}catch{return true;}
}
/** Correlated restriction over source-owned target expressions. No statements/binds or changed absent SQL. */
export function betaRoleDispatchSql(effect:Env,pair:BetaRoleDispatch,guild:string,role:string,originalSql:string):string{
 if(!betaRoleDispatchHeld(effect,pair,BETA_RESET_GUILD_ID,BETA_RESET_ROLE_IDS[0]!))return originalSql;
 return `(${originalSql}) AND NOT ((${guild})='${BETA_RESET_GUILD_ID}' AND (${role}) IN(${BETA_RESET_ROLE_IDS.map(id=>`'${id}'`).join(',')}))`;
}
/** Additive grant restriction. Without the new closure profile, historical v1 grant semantics stay unchanged. */
export function betaGrantDispatchHeld(effect:Env,pair:BetaRoleDispatch,guild:string,role:string):boolean{
 if(guild!==BETA_RESET_GUILD_ID||!BETA_RESET_ROLE_IDS.includes(role))return false;
 try{const d=dispatchPair(pair);return !d||betaSourceEpochState(d.env,d.capture).mode!=='absent'||BETA_RESET_SOURCE_EPOCH_KEY in effect;}catch{return true;}
}
export function betaGrantDispatchSql(effect:Env,pair:BetaRoleDispatch,guild:string,role:string,originalSql:string):string{
 if(!betaGrantDispatchHeld(effect,pair,BETA_RESET_GUILD_ID,BETA_RESET_ROLE_IDS[0]!))return originalSql;
 return `(${originalSql}) AND NOT ((${guild})='${BETA_RESET_GUILD_ID}' AND (${role}) IN(${BETA_RESET_ROLE_IDS.map(id=>`'${id}'`).join(',')}))`;
}
type Original = { env: GuardEnv; scoped: boolean; keys: readonly string[]; slots: Slot[]; db?: D1Database; prepare?: Method; armedAt?: number; dispatch?: DispatchMode; dispatchOrigin?:{env:GuardEnv;dispatch:DispatchMode} };
const originals = new WeakMap<BetaGrantCapture, Original>();
function unchanged(original: Original): boolean {
  try {
    if (!original.scoped) return true;
    if (!original.keys.every((key, i) => same(slot(original.env, key), original.slots[i]))) return false;
    if (original.db && original.prepare) {
      const method = prepareMethod(original.db);
      if (method.owner !== original.prepare.owner || !same(method.descriptor, original.prepare.descriptor)) return false;
    }
    return true;
  } catch { return false; }
}
function capture(original: Original, guildId: string, roleId: string, mode: BetaGrantCapture['mode'], raw: string | null, reason: string): BetaGrantCapture {
  const out = Object.freeze({ mode, raw, reason, guildId, roleId }); originals.set(out, original); return out;
}
async function read(original: Original): Promise<{ raw: unknown; matches: number; at: number } | null> {
  if (!original.db || !original.prepare || !unchanged(original)) return null;
  const statement = Reflect.apply(original.prepare.descriptor.value, original.db,
    [`SELECT (SELECT value FROM site_settings WHERE key=?1) AS raw, (SELECT COUNT(*) FROM site_settings WHERE key=?1) AS matches, ${DB_NOW} AS at`]) as D1PreparedStatement;
  const row = await statement.bind(BETA_RESET_POLICY_KEY).first<{ raw: unknown; matches: number; at: number }>();
  return unchanged(original) ? row : null;
}
export async function captureBetaGrant(env: GuardEnv, guildId: string, roleId: string,originalDispatch?:BetaRoleDispatch): Promise<BetaGrantCapture> {
  const scoped = guildId === BETA_RESET_GUILD_ID && BETA_RESET_ROLE_IDS.includes(roleId);
  const original: Original = { env, scoped, keys: ['BETA_RESET_REMOVALS_ENABLED'], slots: [] };
  if (!scoped) return capture(original, guildId, roleId, 'off', null, 'outside_beta_scope');
  try {
    // Capture the optional dispatch mode before the first await. It is deliberately separate
    // from CONFIG/unchanged: an already admitted operation must still record its ACK or unknown.
    original.dispatch = dispatchMode(env);
    if(originalDispatch){
      const pair=dispatchPair(originalDispatch),origin=pair&&removalDispatches.get(pair.capture);
      if(!origin||origin.env!==pair!.env)throw Error('original_beta_dispatch_required');
      original.dispatchOrigin=origin;original.dispatch=origin.dispatch;
    }
  } catch { original.dispatch = Object.freeze({ mode: 'held', slot: undefined,source:undefined,sourceValid:false }); }
  // A malformed dispatch mode must not hide the original policy from retirement/status or
  // invalidate its response predicates. Only the separate dispatch restriction consumes it.
  try {
    original.slots = [slot(env, 'BETA_RESET_REMOVALS_ENABLED')];
    const flag = original.slots[0]?.value;
    if (flag !== undefined && flag !== 'false' && flag !== 'true') return capture(original, guildId, roleId, 'held', null, 'beta_guard_flag_invalid');
    original.keys = CONFIG; original.slots = CONFIG.map(key => slot(env, key));
    const db = value(env, 'DB');
    if (!db || typeof db !== 'object') return capture(original, guildId, roleId, 'held', null, 'beta_database_held');
    original.db = db as D1Database; original.prepare = prepareMethod(db);
    const row = await read(original), raw = typeof row?.raw === 'string' ? row.raw : null;
    if (!row || !Number.isSafeInteger(row.at) || row.at <= 0) return capture(original, guildId, roleId, 'held', raw, 'beta_policy_read_held');
    if (!configured(env) || !unchanged(original)) return capture(original, guildId, roleId, 'held', raw, 'beta_configuration_held');
    // Grant expiry belongs to the source epoch. Disabling removal or deleting its policy cannot reopen grants.
    if (row.matches === 0) return capture(original, guildId, roleId, row.at < BETA_RESET_CUTOFF ? 'open' : 'held', null,
      row.at < BETA_RESET_CUTOFF ? 'beta_source_epoch_open' : 'beta_source_epoch_closed');
    if (row.matches !== 1 || raw === null) return capture(original, guildId, roleId, 'held', raw, 'beta_policy_invalid');
    const retirement=parseBetaResetRetirement(raw,env);
    if(retirement){
      original.armedAt=parseBetaResetPolicy(retirement.originalPolicy,env)!.armedAt;
      return capture(original,guildId,roleId,'held',raw,row.at>=retirement.retiredAt?'beta_reset_retired':'beta_policy_not_yet_retired');
    }
    const policy = parseBetaResetPolicy(raw, env);
    if (!policy) return capture(original, guildId, roleId, 'held', raw, 'beta_policy_invalid');
    original.armedAt = policy.armedAt;
    if (!configured(env) || !unchanged(original)) return capture(original, guildId, roleId, 'held', raw, 'beta_configuration_held');
    if (row.at < policy.armedAt) return capture(original, guildId, roleId, 'held', raw, 'beta_policy_not_yet_armed');
    return capture(original, guildId, roleId, row.at < BETA_RESET_CUTOFF ? 'open' : 'held', raw,
      row.at < BETA_RESET_CUTOFF ? 'beta_epoch_open' : 'beta_cutoff_reached');
  } catch { return capture(original, guildId, roleId, 'held', null, 'beta_policy_read_held'); }
}
/** Dispatch restriction only, not a seal issuer, policy replacement or proof of provider drain.
 * An absent setting mode preserves the original SQL. Any present mode except own-data 'v1'
 * holds scoped new work, as does changing the original mode during an await. */
export function betaResetDispatchMode(env: GuardEnv, captured: BetaGrantCapture): 'legacy' | 'v1' | 'held' {
  const original = originals.get(captured);
  if (!original || original.env !== env) return 'held';
  if (!original.scoped) return 'legacy';
  try {
    const d = original.dispatch;
    const origin=original.dispatchOrigin;
    if(origin&&(!same(slot(origin.env,DISPATCH_MODE_KEY),origin.dispatch.slot)
      ||!same(slot(origin.env,BETA_RESET_SOURCE_EPOCH_KEY),origin.dispatch.source)))return 'held';
    return d && d.source===undefined && same(slot(env,BETA_RESET_SOURCE_EPOCH_KEY),d.source)
      && d.mode !== 'held' && same(slot(env, DISPATCH_MODE_KEY), d.slot) ? d.mode : 'held';
  } catch { return 'held'; }
}
/** Restrict an existing source-owned creation/claim/pre-effect predicate, preserving all binds.
 * Never use this in shared receipt/unknown predicates. Seal presence, including malformed data,
 * is a fence; parsing its value is neither necessary nor sufficient to authorize an effect. */
export function betaResetDispatchSql(env: GuardEnv, captured: BetaGrantCapture, originalSql: string): string {
  const mode = betaResetDispatchMode(env, captured);
  return mode === 'legacy' ? originalSql : `(${originalSql}) AND ${mode === 'v1'
    ? `NOT EXISTS(SELECT 1 FROM site_settings WHERE key='${BETA_RESET_DISPATCH_SEAL_KEY}')` : '0=1'}`;
}
export async function betaGrantCurrent(env: GuardEnv, captured: BetaGrantCapture): Promise<boolean> {
  const original = originals.get(captured);
  if (!original || captured.mode === 'held' || !unchanged(original)) return false;
  if (captured.mode === 'off') return !original.scoped || original.env === env;
  if (original.env !== env) return false;
  try {
    const row = await read(original);
    return !!row && (captured.raw === null ? row.matches === 0 && captured.reason === 'beta_source_epoch_open'
      : row.matches === 1 && row.raw === captured.raw && row.at >= original.armedAt!) && Number.isSafeInteger(row.at)
      && row.at > 0 && row.at < BETA_RESET_CUTOFF && configured(env) && unchanged(original);
  } catch { return false; }
}
/** Embed in the caller's claim/receipt statement: the actual row and database clock decide together. */
export function betaGrantSql(captured: BetaGrantCapture, startIndex: number): { sql: string; values: (string | number | null)[] } {
  const original = originals.get(captured);
  if (!original || captured.mode === 'held' || !unchanged(original) || !Number.isSafeInteger(startIndex) || startIndex < 1 || startIndex > 98)
    return { sql: '0=1', values: [] };
  if (captured.mode === 'off') return { sql: '1=1', values: [] };
  if (captured.raw === null) return { sql: `NOT EXISTS(SELECT 1 FROM site_settings WHERE key='${BETA_RESET_POLICY_KEY}')
    AND ${DB_NOW}>0 AND ${DB_NOW}<?${startIndex}`, values: [BETA_RESET_CUTOFF] };
  return { sql: `EXISTS(SELECT 1 FROM site_settings WHERE key='${BETA_RESET_POLICY_KEY}' AND value=?${startIndex} COLLATE BINARY)
    AND ${DB_NOW}>0 AND ${DB_NOW}<?${startIndex + 1} AND ${DB_NOW}>=?${startIndex + 2}`,
    values: [captured.raw, BETA_RESET_CUTOFF, original.armedAt!] };
}
function resetOriginal(captured: BetaGrantCapture): Original | null {
  const original = originals.get(captured);
  return original && original.scoped && captured.mode === 'held' && captured.reason === 'beta_cutoff_reached'
    && original.slots[0]?.value === 'true' && typeof captured.raw === 'string'
    && Number.isSafeInteger(original.armedAt) && unchanged(original) ? original : null;
}
/** Removal-phase policy check only. A fresh genuine cutoff capture is required; an old grant capture cannot upgrade. */
export async function betaResetCurrent(env: GuardEnv, captured: BetaGrantCapture): Promise<boolean> {
  const original = resetOriginal(captured);
  if (!original || original.env !== env) return false;
  try {
    const row = await read(original);
    return !!row && row.matches === 1 && row.raw === captured.raw && Number.isSafeInteger(row.at)
      && row.at >= BETA_RESET_CUTOFF && row.at >= original.armedAt! && configured(env) && unchanged(original);
  } catch { return false; }
}
/** Embed in a removal claim/receipt; this supplies policy currentness, not per-subject effect custody. */
export function betaResetSql(captured: BetaGrantCapture, startIndex: number): { sql: string; values: (string | number | null)[] } {
  const original = resetOriginal(captured);
  if (!original || !Number.isSafeInteger(startIndex) || startIndex < 1 || startIndex > 98)
    return { sql: '0=1', values: [] };
  return { sql: `EXISTS(SELECT 1 FROM site_settings WHERE key='${BETA_RESET_POLICY_KEY}' AND value=?${startIndex} COLLATE BINARY)
    AND ${DB_NOW}>=?${startIndex + 1} AND ${DB_NOW}>=?${startIndex + 2}`,
    values: [captured.raw, BETA_RESET_CUTOFF, original.armedAt!] };
}

/** Owner retirement only: exact current raw policy/configuration, including a retained tombstone for retry readback.
 * This helper grants no effect authority and works with removals OFF. No pre-cutoff retirement is admitted. */
export function betaPolicyRetirementSql(env:GuardEnv,captured:BetaGrantCapture,startIndex:number):{sql:string;values:(string|number|null)[]}{
 const original=originals.get(captured);
 if(!original||!original.scoped||original.env!==env||captured.mode!=='held'||typeof captured.raw!=='string'
  ||!['beta_cutoff_reached','beta_reset_retired'].includes(captured.reason)||!unchanged(original)||!configured(env)
  ||!Number.isSafeInteger(original.armedAt)||!Number.isSafeInteger(startIndex)||startIndex<1||startIndex>97)return {sql:'0=1',values:[]};
 const retired=parseBetaResetRetirement(captured.raw,env);
 return {sql:`EXISTS(SELECT 1 FROM site_settings WHERE key='${BETA_RESET_POLICY_KEY}' AND value=?${startIndex} COLLATE BINARY)
  AND ${DB_NOW}>=?${startIndex+1} AND ${DB_NOW}>=?${startIndex+2}`,values:[captured.raw,BETA_RESET_CUTOFF,retired?.retiredAt??original.armedAt!]};
}

/** The attended retention anchor confirms only the source cutoff. It remains available with
 * removals OFF and never adopts a replacement policy/configuration after the original capture.
 */
export function betaRetentionSourceSql(env: GuardEnv, captured: BetaGrantCapture, startIndex: number): { sql: string; values: (string | number | null)[] } {
  const original=originals.get(captured);
  if(!original||!original.scoped||original.env!==env||captured.mode!=='held'||!unchanged(original)||!configured(env)
    ||!['beta_source_epoch_closed','beta_cutoff_reached','beta_reset_retired'].includes(captured.reason)
    ||!Number.isSafeInteger(startIndex)||startIndex<1||startIndex>98)return {sql:'0=1',values:[]};
  if(captured.raw===null)return {sql:`NOT EXISTS(SELECT 1 FROM site_settings WHERE key='${BETA_RESET_POLICY_KEY}')
    AND ${DB_NOW}>=?${startIndex}`,values:[BETA_RESET_CUTOFF]};
  return {sql:`EXISTS(SELECT 1 FROM site_settings WHERE key='${BETA_RESET_POLICY_KEY}' AND value=?${startIndex} COLLATE BINARY)
    AND ${DB_NOW}>=?${startIndex+1} AND ${DB_NOW}>=?${startIndex+2}`,values:[captured.raw,BETA_RESET_CUTOFF,original.armedAt!]};
}

/** A scan's original lease is separate from per-intent custody and never renewed by a continuation. */
export type BetaResetScanCapture = Readonly<{ raw: string }>;
type ScanOriginal = { captured: BetaGrantCapture; original: Original; lease: string; until: number };
const scans = new WeakMap<BetaResetScanCapture, ScanOriginal>();
export function captureBetaResetScan(env: GuardEnv, captured: BetaGrantCapture, raw: string, prior?: BetaResetScanCapture): BetaResetScanCapture | null {
  const original = resetOriginal(captured);
  if (!original || original.env !== env || typeof raw !== 'string' || raw.length > 2000) return null;
  try {
    const s = JSON.parse(raw), old = prior && scans.get(prior);
    if (!s || s.version !== 1 || s.epoch !== BETA_RESET_EPOCH || typeof s.lease !== 'string' || !/^[0-9a-f]{32}$/.test(s.lease)
      || !Number.isSafeInteger(s.leaseUntil) || s.leaseUntil <= 0
      || prior && (!old || old.captured !== captured || old.original !== original || old.lease !== s.lease || old.until !== s.leaseUntil)) return null;
    const out = Object.freeze({ raw }); scans.set(out, { captured, original, lease: s.lease, until: s.leaseUntil }); return out;
  } catch { return null; }
}
/** Synchronous original environment check; this alone does not admit a new effect. */
export function betaResetEnvironmentCurrent(env: GuardEnv, captured: BetaGrantCapture): boolean {
  return resetOriginal(captured)?.env === env;
}
export function betaResetScanSql(captured: BetaGrantCapture, scan: BetaResetScanCapture, startIndex: number): { sql: string; values: (string | number | null)[] } {
  const original = resetOriginal(captured), s = scans.get(scan);
  if (!original || !s || s.captured !== captured || s.original !== original || !Number.isSafeInteger(startIndex) || startIndex < 1 || startIndex > 96)
    return { sql: '0=1', values: [] };
  const g = betaResetSql(captured, startIndex);
  return { sql: `${g.sql} AND EXISTS(SELECT 1 FROM site_settings WHERE key='betaResetScanV1'
    AND value=?${startIndex + 3} COLLATE BINARY AND json_extract(value,'$.leaseUntil')>${DB_NOW})`, values: [...g.values, scan.raw] };
}
/** One SQL read repeats original policy, scan bytes and the database-clock lease deadline together. */
export async function betaResetScanCurrent(env: GuardEnv, captured: BetaGrantCapture, scan: BetaResetScanCapture): Promise<boolean> {
  const original = resetOriginal(captured), s = scans.get(scan);
  if (!original || original.env !== env || !s || s.original !== original || s.captured !== captured || !original.db || !original.prepare) return false;
  try {
    const g = betaResetScanSql(captured, scan, 1);
    const statement = Reflect.apply(original.prepare.descriptor.value, original.db, [`SELECT 1 WHERE ${g.sql}`]) as D1PreparedStatement;
    const row = await statement.bind(...g.values).first();
    return !!row && resetOriginal(captured) === original && original.env === env && scans.get(scan) === s;
  } catch { return false; }
}
/** Same original scan read, with the dispatch-only restriction in that statement. The receipt
 * variant above and betaResetScanSql remain unchanged for release and original custody. */
export async function betaResetDispatchScanCurrent(env: GuardEnv, captured: BetaGrantCapture, scan: BetaResetScanCapture): Promise<boolean> {
  const original = resetOriginal(captured), s = scans.get(scan);
  if (!original || original.env !== env || !s || s.original !== original || s.captured !== captured || !original.db || !original.prepare) return false;
  try {
    const g = betaResetScanSql(captured, scan, 1), sql = betaResetDispatchSql(env, captured, g.sql);
    const statement = Reflect.apply(original.prepare.descriptor.value, original.db, [`SELECT 1 WHERE ${sql}`]) as D1PreparedStatement;
    const row = await statement.bind(...g.values).first();
    return !!row && resetOriginal(captured) === original && original.env === env && scans.get(scan) === s
      && betaResetDispatchMode(env, captured) !== 'held';
  } catch { return false; }
}
