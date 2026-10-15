/** Exact, attended beta exception. No generic Officer eligibility, secret or game-origin claim. */
import type {Env} from './env';
import {assertOriginalSiteSessionRead,type OriginalSiteSession} from './privacy-site-session-incarnation';
import {privacyAccountIncarnationLiteralFenceSql,privacyGenerationLiteralFenceSql} from './privacy-serving-authority';
import {DB_NOW,snapshotDataFields} from './account-generation-contracts';
import {guildMember} from './discord';
import {linksNotBefore as sourceLinksNotBefore} from './db';
import {membershipTargets,membershipTargetsCurrent,type MembershipTargets} from './membership-role-transition';
import {parseNativeRoleMap} from './native-rank-adapter';

export const BETA_FERN=Object.freeze({
 mode:'B1',wire:'OLG2',domain:'OLY-P1-BETA-FERN1',profile:'beta-five',
 requester:'102204162531430400',requesterName:'Stavros Heuto',actor:'472099715253796864',guildId:'236932545793490944',applicationId:'1550176895671341076',
 name:'Fern Melder',guid:'Player-4613-005A70D8',guild:'OLYMPUS',
 realm:'Classic Beta PvP 2',guildRealm:'ClassicBetaPvP',build:70338,interface:16001,
 rank:'Officer',rankIndex:1,rankCount:5,windowSeconds:86400,challengeSeconds:300,
 ranks:Object.freeze(['Guild Master','Officer','Veteran','Member','Initiate'] as const),
});
export type BetaFernEnv=Env&{QR_BETA_FERN_EXCEPTION_ENABLED?:string;QR_BETA_FERN_WINDOW_ID?:string};
export class BetaFernHeld extends Error{constructor(public code:string){super(code);}}
const fail=(code='beta_fern_held'):never=>{throw new BetaFernHeld(code);};
function hex(v:unknown,length=32):v is string{if(typeof v!=='string'||v.length!==length)return false;for(let i=0;i<length;i++){const c=v.charCodeAt(i);if(!(c>=48&&c<=57||c>=97&&c<=102))return false;}return true;}
function sameDescriptor(a:PropertyDescriptor|undefined,b:PropertyDescriptor|undefined):boolean{return !a||!b?a===b:a.value===b.value&&a.get===b.get&&a.set===b.set&&a.writable===b.writable&&a.configurable===b.configurable&&a.enumerable===b.enumerable;}
function slot(env:object,key:string):PropertyDescriptor|undefined{
 const d=Object.getOwnPropertyDescriptor(env,key);if(d&&!Object.hasOwn(d,'value'))return fail('beta_configuration_held');
 if(!d&&key in env)return fail('beta_configuration_held');return d?Object.freeze({...d}):undefined;
}
function roleId(v:unknown):v is string{if(typeof v!=='string'||v.length<17||v.length>20)return false;for(let i=0;i<v.length;i++){const c=v.charCodeAt(i);if(c<48||c>57)return false;}return true;}
/** The actual source normalizer consumes only the captured original primitive. No invalid-date fallback or renewal. */
function betaLinks(raw:unknown):number{
 if(raw===undefined||raw==='')return 0;if(typeof raw!=='string'||raw!==raw.trim())return fail('beta_links_configuration_held');
 let seconds=raw.length>=9&&raw.length<=11;for(let i=0;seconds&&i<raw.length;i++){const c=raw.charCodeAt(i);seconds=c>=48&&c<=57;}
 const date=raw.length===10&&raw[4]==='-'&&raw[7]==='-'&&[0,1,2,3,5,6,8,9].every(i=>{const c=raw.charCodeAt(i);return c>=48&&c<=57;});
 if(!seconds&&!date)return fail('beta_links_configuration_held');
 const at=sourceLinksNotBefore(Object.freeze({LINKS_NOT_BEFORE:raw}) as Env);
 if(!Number.isSafeInteger(at)||at<0||date&&new Date(at*1000).toISOString().slice(0,10)!==raw)return fail('beta_links_configuration_held');return at;
}
export type BetaConfiguration=Readonly<{enabled:boolean;windowId:string|null;membershipRole:string|null;linksNotBefore:number;check:()=>void}>;
const configurationOriginals=new WeakMap<BetaConfiguration,()=>void>();
export function assertBetaConfiguration(config:BetaConfiguration):void{const check=configurationOriginals.get(config);if(!check)return fail('beta_configuration_not_original');check();}
/** All beta configuration is captured before its caller's first await. OFF never becomes an Officer fallback. */
export function captureBetaConfiguration(env:BetaFernEnv):BetaConfiguration{
 const names=['QR_BETA_FERN_EXCEPTION_ENABLED','QR_BETA_FERN_WINDOW_ID','GUILD_ID','SITE_GUILD_ID','DISCORD_APP_ID','DISCORD_BOT_TOKEN','BLOCKING_ROLE_IDS','LINKS_NOT_BEFORE','ROLE_GUILD_MEMBER','MEMBERSHIP_ROLE_SETTLEMENT_ENABLED','MEMBERSHIP_RETIRED_ROLE_ID','ROLE_OFFICER','ROLE_MODERATOR','ROLE_GUILD_LEADER','ROLE_GUILD_MASTER','ROLE_RAID_LEADER','QR_NATIVE_ROLE_MAP'] as const;
 const fields=names.map(k=>slot(env,k)),flag=fields[0]?.value,id=fields[1]?.value;
 if(flag!==undefined&&flag!=='false'&&flag!=='true')return fail('beta_configuration_held');
 if(flag!=='true'&&id!==undefined&&id!=='')return fail('beta_configuration_held');
 const enabled=flag==='true';if(enabled&&(!hex(id)||fields[2]?.value!==BETA_FERN.guildId||fields[3]?.value!==BETA_FERN.guildId||fields[4]?.value!==BETA_FERN.applicationId||typeof fields[5]?.value!=='string'||!fields[5]?.value||fields[6]&&typeof fields[6].value!=='string'||fields[7]&&typeof fields[7].value!=='string'||fields.slice(8).some(d=>d&&typeof d.value!=='string')))return fail('beta_configuration_held');
 let membership:MembershipTargets|null=null,links=0;
 if(enabled){
  if(fields[9]&&fields[9].value!=='true'&&fields[9].value!=='false'&&fields[9].value!=='')return fail('beta_membership_configuration_held');
  try{membership=membershipTargets(env);links=betaLinks(fields[7]?.value);}catch{return fail('beta_membership_configuration_held');}
  const reserved=[fields[2]?.value,fields[4]?.value,...fields.slice(11,16).map(d=>d?.value),...(fields[6]?.value as string|undefined??'').split(',').map(s=>s.trim())];
  const rawMap=fields[16]?.value;if(rawMap!==undefined&&rawMap!==''){try{reserved.push(...parseNativeRoleMap(rawMap as string).roles);}catch{return fail('beta_membership_configuration_held');}}
  if(membership.guild!==BETA_FERN.guildId||!roleId(membership.current)||membership.retired!==null&&!roleId(membership.retired)||reserved.includes(membership.current))return fail('beta_membership_configuration_held');
 }
 const check=()=>{for(let i=0;i<names.length;i++)if(!sameDescriptor(slot(env,names[i]!),fields[i]))fail('beta_configuration_changed');if(membership&&!membershipTargetsCurrent(env,membership))fail('beta_membership_configuration_changed');};check();
 const config=Object.freeze({enabled,windowId:enabled?id as string:null,membershipRole:membership?.current??null,linksNotBefore:links,check});configurationOriginals.set(config,check);return config;
}

/** Original DB receiver/methods only. This witness grants no additional database or recovery authority. */
function originalDatabase(env:Env){
 const d=slot(env,'DB');if(!d||!d.value||typeof d.value!=='object')return fail('beta_database_held');const db=d.value as Env['DB'];
 const method=(key:'prepare'|'batch')=>{let owner:object|null=db;for(let depth=0;owner&&depth<4;depth++,owner=Object.getPrototypeOf(owner)){const descriptor=Object.getOwnPropertyDescriptor(owner,key);if(descriptor){if(!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='function')return fail('beta_database_held');return {owner,descriptor:Object.freeze({...descriptor})};}}return fail('beta_database_held');};
 const prepare=method('prepare'),batch=method('batch');const check=()=>{if(!sameDescriptor(slot(env,'DB'),d))return fail('beta_database_changed');for(const [key,original] of [['prepare',prepare],['batch',batch]] as const){const now=method(key);if(now.owner!==original.owner||!sameDescriptor(now.descriptor,original.descriptor))return fail('beta_database_changed');}};check();return {db,check};
}

export const BETA_WINDOW_FIELDS=['id','actor','account_incarnation','subject_generation','session_version','session_expires','guild_id','application_id','signer_guid','signer_name','guild_name','realm_name','guild_realm','game_build','game_interface','native_rank','native_rank_index','native_rank_count','roster_id','links_not_before','created_at','expires_at','review_digest','revoked_at','requester_id','requester_name','requester_guid','requester_generation','requester_account_incarnation','request_code','request_created_at','request_expires_at','membership_role'] as const;
export type BetaWindow=Readonly<{id:string;actor:string;account_incarnation:string;subject_generation:string;session_version:number;session_expires:number;guild_id:string;application_id:string;signer_guid:string;signer_name:string;guild_name:string;realm_name:string;guild_realm:string;game_build:number;game_interface:number;native_rank:string;native_rank_index:number;native_rank_count:number;roster_id:number;links_not_before:number;created_at:number;expires_at:number;review_digest:string;revoked_at:number|null;requester_id:string;requester_name:string;requester_guid:string;requester_generation:string;requester_account_incarnation:string;request_code:string;request_created_at:number;request_expires_at:number;membership_role:string}>;
const windowOriginals=new WeakMap<BetaWindow,Readonly<{check:()=>void;original:string}>>();
export const BETA_WINDOW_TUPLE_SQL=`json_insert(json_array(${BETA_WINDOW_FIELDS.slice(0,32).map(k=>'bw.'+k).join(',')}),'$[#]',bw.${BETA_WINDOW_FIELDS[32]})`;
/** Fixed physical contract. A window never renews and a revocation never reopens. */
export const BETA_WINDOW_VALID_SQL=`typeof(bw.id)='text' AND length(bw.id)=32 AND length(CAST(bw.id AS BLOB))=32 AND bw.id NOT GLOB '*[^0-9a-f]*'
 AND bw.actor='472099715253796864' AND bw.guild_id='236932545793490944' AND bw.application_id='1550176895671341076'
 AND bw.signer_guid='Player-4613-005A70D8' AND bw.signer_name='Fern Melder' AND bw.guild_name='OLYMPUS' AND bw.realm_name='Classic Beta PvP 2' AND bw.guild_realm='ClassicBetaPvP'
 AND bw.game_build=70338 AND typeof(bw.game_build)='integer' AND bw.game_interface=16001 AND typeof(bw.game_interface)='integer'
 AND bw.native_rank='Officer' AND bw.native_rank_index=1 AND typeof(bw.native_rank_index)='integer' AND bw.native_rank_count=5 AND typeof(bw.native_rank_count)='integer'
 AND typeof(bw.account_incarnation)='text' AND length(bw.account_incarnation)=32 AND length(CAST(bw.account_incarnation AS BLOB))=32 AND bw.account_incarnation NOT GLOB '*[^0-9a-f]*'
 AND typeof(bw.subject_generation)='text' AND length(bw.subject_generation)=32 AND length(CAST(bw.subject_generation AS BLOB))=32 AND bw.subject_generation NOT GLOB '*[^0-9a-f]*'
 AND typeof(bw.session_version)='integer' AND bw.session_version BETWEEN 1 AND 9007199254740991 AND typeof(bw.session_expires)='integer' AND bw.session_expires BETWEEN 1 AND 9007199254740991
 AND typeof(bw.roster_id)='integer' AND bw.roster_id BETWEEN 1 AND 9007199254740991
 AND typeof(bw.links_not_before)='integer' AND bw.links_not_before BETWEEN 0 AND 9007199254740991
 AND typeof(bw.created_at)='integer' AND bw.created_at BETWEEN 1 AND 9007199168340991 AND typeof(bw.expires_at)='integer' AND bw.expires_at>bw.created_at AND bw.expires_at<=bw.created_at+86400 AND bw.expires_at<=bw.session_expires
 AND typeof(bw.review_digest)='text' AND length(bw.review_digest)=64 AND length(CAST(bw.review_digest AS BLOB))=64 AND bw.review_digest NOT GLOB '*[^0-9a-f]*'
 AND bw.requester_id='102204162531430400' AND bw.requester_name='Stavros Heuto' AND typeof(bw.requester_guid)='text' AND length(bw.requester_guid) BETWEEN 17 AND 24 AND length(CAST(bw.requester_guid AS BLOB))=length(bw.requester_guid) AND instr(bw.requester_guid,char(0))=0 AND bw.requester_guid<>bw.signer_guid
 AND typeof(bw.requester_generation)='text' AND length(bw.requester_generation)=32 AND length(CAST(bw.requester_generation AS BLOB))=32 AND instr(bw.requester_generation,char(0))=0 AND bw.requester_generation NOT GLOB '*[^0-9a-f]*' AND typeof(bw.requester_account_incarnation)='text' AND length(bw.requester_account_incarnation)=32 AND length(CAST(bw.requester_account_incarnation AS BLOB))=32 AND instr(bw.requester_account_incarnation,char(0))=0 AND bw.requester_account_incarnation NOT GLOB '*[^0-9a-f]*' AND typeof(bw.request_code)='text' AND length(bw.request_code)=32 AND length(CAST(bw.request_code AS BLOB))=32 AND instr(bw.request_code,char(0))=0 AND bw.request_code NOT GLOB '*[^0-9a-f]*'
 AND typeof(bw.request_created_at)='integer' AND bw.request_created_at BETWEEN 1 AND 9007199254740991 AND typeof(bw.request_expires_at)='integer' AND bw.request_expires_at>bw.request_created_at AND bw.request_expires_at<=bw.request_created_at+600 AND bw.expires_at<=bw.request_expires_at
 AND typeof(bw.membership_role)='text' AND length(bw.membership_role) BETWEEN 17 AND 20 AND length(CAST(bw.membership_role AS BLOB))=length(bw.membership_role) AND instr(bw.membership_role,char(0))=0 AND bw.membership_role NOT GLOB '*[^0-9]*'
 AND (bw.revoked_at IS NULL OR (typeof(bw.revoked_at)='integer' AND bw.revoked_at BETWEEN bw.created_at AND 9007199254740991))`;
const freshRosterSql=`EXISTS(SELECT 1 FROM roster_snapshots rs JOIN roster_members rm ON rm.snapshot_id=rs.id
 WHERE rs.id=(SELECT MAX(id) FROM roster_snapshots) AND rs.id>=bw.roster_id AND rs.complete=1 AND rs.trusted=1 AND rs.exported_at<=${DB_NOW} AND rs.exported_at>${DB_NOW}-600 AND rs.exported_at>=bw.links_not_before
 AND rs.member_count=(SELECT COUNT(*) FROM roster_members WHERE snapshot_id=rs.id)
 AND NOT EXISTS(SELECT 1 FROM roster_members profile WHERE profile.snapshot_id=rs.id AND (typeof(profile.rank_index)<>'integer' OR profile.rank_index NOT BETWEEN 0 AND 4 OR profile.rank IS NOT CASE profile.rank_index WHEN 0 THEN 'Guild Master' WHEN 1 THEN 'Officer' WHEN 2 THEN 'Veteran' WHEN 3 THEN 'Member' WHEN 4 THEN 'Initiate' END))
 AND rm.guid=bw.signer_guid AND rm.name=bw.signer_name AND rm.rank='Officer' AND rm.rank_index=1
 AND (SELECT COUNT(*) FROM roster_members WHERE snapshot_id=rs.id AND guid=bw.signer_guid)=1)
 AND EXISTS(SELECT 1 FROM roster_members attendee WHERE attendee.snapshot_id=(SELECT MAX(id) FROM roster_snapshots) AND attendee.guid=bw.requester_guid AND attendee.name=bw.requester_name AND (SELECT COUNT(*) FROM roster_members WHERE snapshot_id=attendee.snapshot_id AND guid=bw.requester_guid)=1)`;
const linkedSql=`EXISTS(SELECT 1 FROM characters c JOIN members m ON m.discord_id=c.discord_id WHERE c.discord_id=bw.actor AND c.guid=bw.signer_guid AND c.name=bw.signer_name AND c.status='member' AND m.banned=0)
 AND (SELECT COUNT(*) FROM characters WHERE guid=bw.signer_guid AND status IN('member','left_pending'))=1
 AND NOT EXISTS(SELECT 1 FROM rename_holds WHERE discord_id=bw.actor AND state='reapply')`;
export const BETA_WINDOW_CURRENT_SQL=`${BETA_WINDOW_VALID_SQL} AND bw.revoked_at IS NULL AND bw.created_at<=${DB_NOW} AND bw.expires_at>${DB_NOW}
 AND EXISTS(SELECT 1 FROM privacy_subjects ps WHERE ps.subject_id=bw.actor AND ps.generation=bw.subject_generation AND ps.state='active')
 AND EXISTS(SELECT 1 FROM site_users su WHERE su.discord_id=bw.actor AND su.account_incarnation=bw.account_incarnation AND su.session_version=bw.session_version AND su.in_server=1 AND su.denied=0 AND bw.session_expires>${DB_NOW})
 AND ${linkedSql} AND ${freshRosterSql}
 AND EXISTS(SELECT 1 FROM verification_requests v JOIN site_users u ON u.discord_id=v.requester JOIN privacy_subjects ps ON ps.subject_id=v.requester WHERE v.code=bw.request_code AND v.requester=bw.requester_id AND v.subject_generation=bw.requester_generation AND v.requester_account_incarnation=bw.requester_account_incarnation AND v.created_at=bw.request_created_at AND v.expires_at=bw.request_expires_at AND u.account_incarnation=bw.requester_account_incarnation AND u.session_version=v.session_version AND v.session_expires>${DB_NOW} AND v.expires_at>${DB_NOW} AND u.in_server=1 AND u.denied=0 AND ps.generation=bw.requester_generation AND ps.state='active' AND NOT EXISTS(SELECT 1 FROM members WHERE discord_id=v.requester AND banned=1) AND NOT EXISTS(SELECT 1 FROM rename_holds WHERE discord_id=v.requester AND state='reapply'))`;
/** Closed source aliases only; never caller text or a current nonce repair. */
export function betaKeyWindowSql(alias:'k'|'ak'='k'):string{
 if(alias!=='k'&&alias!=='ak')return fail('beta_sql_alias_held');
 return `EXISTS(SELECT 1 FROM qr_beta_fern_windows bw WHERE bw.id=${alias}.beta_window_id AND bw.actor=${alias}.signer AND bw.account_incarnation=${alias}.signer_account_incarnation AND bw.subject_generation=${alias}.subject_generation
 AND ${alias}.signer_guid=bw.signer_guid AND ${alias}.created_at>=bw.created_at AND ${alias}.created_at<bw.expires_at AND ${alias}.roster_id>=bw.roster_id AND ${BETA_WINDOW_CURRENT_SQL})`;
}
export const BETA_SIGNER_CURRENT=`EXISTS(SELECT 1 FROM councillor_keys k WHERE k.id=?1 AND k.signer=?2 AND k.revoked_at IS NULL AND k.created_at<=${DB_NOW} AND k.expires_at>${DB_NOW}
 AND typeof(k.created_at)='integer' AND typeof(k.expires_at)='integer' AND k.expires_at=k.created_at+86400 AND k.signer='472099715253796864' AND k.signer_guid='Player-4613-005A70D8' AND ${betaKeyWindowSql('k')})`;
export function betaKeyConfigurationSql(config:BetaConfiguration):string{
 assertBetaConfiguration(config);return config.enabled?`(beta_window_id IS NULL OR beta_window_id='${config.windowId}')`:'beta_window_id IS NULL';
}

function checkWindowShape(w:BetaWindow):void{
 if(!roleId(w.membership_role))return fail('beta_membership_window_held');
 if(w.requester_id!==BETA_FERN.requester||w.requester_name!==BETA_FERN.requesterName||!playerGuid(w.requester_guid)||w.requester_guid===BETA_FERN.guid||!hex(w.requester_generation)||!hex(w.requester_account_incarnation)||!hex(w.request_code))return fail('beta_target_window_held');
 if(!hex(w.id)||!hex(w.account_incarnation)||!hex(w.subject_generation)||!hex(w.review_digest,64)||w.actor!==BETA_FERN.actor||w.guild_id!==BETA_FERN.guildId||w.application_id!==BETA_FERN.applicationId||w.signer_guid!==BETA_FERN.guid||w.signer_name!==BETA_FERN.name||w.guild_name!==BETA_FERN.guild||w.realm_name!==BETA_FERN.realm||w.guild_realm!==BETA_FERN.guildRealm||w.game_build!==BETA_FERN.build||w.game_interface!==BETA_FERN.interface||w.native_rank!==BETA_FERN.rank||w.native_rank_index!==1||w.native_rank_count!==5)return fail('beta_window_held');
 if(!Number.isSafeInteger(w.request_created_at)||!Number.isSafeInteger(w.request_expires_at)||w.request_created_at<1||w.request_expires_at<=w.request_created_at||w.request_expires_at>w.request_created_at+600||w.expires_at>w.request_expires_at)return fail('beta_original_request_clock_held');
 for(const n of [w.session_version,w.session_expires,w.roster_id,w.created_at,w.expires_at])if(!Number.isSafeInteger(n)||n<1)return fail('beta_window_held');
 if(!Number.isSafeInteger(w.links_not_before)||w.links_not_before<0)return fail('beta_window_held');
 if(w.expires_at<=w.created_at||w.expires_at>w.created_at+86400||w.expires_at>w.session_expires||w.revoked_at!==null&&(!Number.isSafeInteger(w.revoked_at)||w.revoked_at<w.created_at))return fail('beta_window_held');
}
/** Snapshot the original native row before any further await; retain and check its exact descriptors. */
function originalWindow(raw:unknown,session:OriginalSiteSession,config:BetaConfiguration,allowExpired:boolean,databaseCheck:()=>void,selectedWindowId:string):BetaWindow{
 const w=snapshotDataFields(raw,BETA_WINDOW_FIELDS,'beta_window_held') as unknown as BetaWindow;checkWindowShape(w);
 if(w.id!==selectedWindowId||w.actor!==session.u||w.account_incarnation!==session.n||w.subject_generation!==session.g||!allowExpired&&(w.membership_role!==config.membershipRole||w.id!==config.windowId||w.session_version!==session.v||w.session_expires!==session.e))return fail('beta_window_changed');
 const row=raw as object,prototype=Object.getPrototypeOf(row),descriptors=BETA_WINDOW_FIELDS.map(k=>Object.freeze({...Object.getOwnPropertyDescriptor(row,k)!})),original=JSON.stringify(BETA_WINDOW_FIELDS.map(k=>w[k]));
 const initial=Date.now();if(!Number.isSafeInteger(initial)||initial<1000)return fail('beta_clock_held');let last=initial;
 const check=()=>{assertBetaConfiguration(config);databaseCheck();assertOriginalSiteSessionRead(session);const t=Date.now();if(!Number.isSafeInteger(t)||t<last||t<initial||!allowExpired&&(t>=w.expires_at*1000||w.revoked_at!==null))fail('beta_clock_or_window_held');last=t;
 if(Object.getPrototypeOf(row)!==prototype)fail('beta_window_changed');
 for(let i=0;i<BETA_WINDOW_FIELDS.length;i++)if(!sameDescriptor(Object.getOwnPropertyDescriptor(row,BETA_WINDOW_FIELDS[i]!),descriptors[i]))fail('beta_window_changed');};
 check();windowOriginals.set(w,Object.freeze({check,original}));return w;
}
export function assertBetaWindow(w:BetaWindow):void{const original=windowOriginals.get(w);if(!original)return fail('beta_window_not_original');original.check();}
export function betaWindowOriginalTuple(w:BetaWindow):string{assertBetaWindow(w);return windowOriginals.get(w)!.original;}
/** Same original signed session as QR; no generic row-to-session or historical ID authorization. */
export async function readBetaWindow(env:BetaFernEnv,session:OriginalSiteSession,config:BetaConfiguration,allowExpired=false,cleanupWindowId:string|null=null):Promise<BetaWindow>{
 assertBetaConfiguration(config);assertOriginalSiteSessionRead(session);const selectedWindowId=allowExpired?cleanupWindowId:config.windowId;if(!allowExpired&&!config.enabled||session.u!==BETA_FERN.actor||!hex(session.g)||!hex(session.n)||!hex(selectedWindowId))return fail('beta_not_authorized');const native=originalDatabase(env);
 const row=await native.db.prepare(`SELECT ${BETA_WINDOW_FIELDS.map(k=>'bw.'+k).join(',')} FROM qr_beta_fern_windows bw WHERE bw.id=?1 AND ${BETA_WINDOW_VALID_SQL}
 AND bw.actor=?2 AND ${privacyAccountIncarnationLiteralFenceSql('bw.account_incarnation',session.n)} AND ${privacyGenerationLiteralFenceSql('bw.actor',session.g)} AND EXISTS(SELECT 1 FROM site_users current_actor WHERE current_actor.discord_id=?2 AND current_actor.session_version=?3 AND ?4>${DB_NOW} AND current_actor.in_server=1 AND current_actor.denied=0 AND ${privacyAccountIncarnationLiteralFenceSql('current_actor.account_incarnation',session.n)}) ${allowExpired?'':`AND bw.session_version=?3 AND bw.session_expires=?4 AND ${BETA_WINDOW_CURRENT_SQL}`}`)
 .bind(selectedWindowId,session.u,session.v,session.e).first<BetaWindow>();native.check();assertBetaConfiguration(config);assertOriginalSiteSessionRead(session);if(!row)return fail('beta_window_not_current');return originalWindow(row,session,config,allowExpired,native.check,selectedWindowId);
}
/** Attended producer only. The Fern-only staff route invokes it; release configuration/activation remains a separate reviewed operation. */
export async function registerAttendedBetaWindow(env:BetaFernEnv,session:OriginalSiteSession,config:BetaConfiguration,duration:number,reviewDigest:string,requestCode:string):Promise<Readonly<{id:string;created_at:number;expires_at:number}>>{
 assertBetaConfiguration(config);assertOriginalSiteSessionRead(session);if(!config.enabled||session.u!==BETA_FERN.actor||!hex(session.g)||!hex(session.n)||!hex(reviewDigest,64)||!hex(requestCode)||!Number.isSafeInteger(duration)||duration<1||duration>86400)return fail('beta_registration_held');
 const native=originalDatabase(env),links=config.linksNotBefore;const targetFields=['code','requester','subject_generation','requester_account_incarnation','requester_guid','requester_name','session_version','session_expires','roster_id','request_created_at','request_expires_at'] as const;
 const targetSql=`SELECT v.code,v.requester,v.subject_generation,v.requester_account_incarnation,r.guid AS requester_guid,r.name AS requester_name,v.session_version,v.session_expires,r.snapshot_id AS roster_id,v.created_at AS request_created_at,v.expires_at AS request_expires_at FROM verification_requests v JOIN roster_members r ON r.name='Stavros Heuto' JOIN roster_snapshots rs ON rs.id=r.snapshot_id JOIN site_users u ON u.discord_id=v.requester JOIN privacy_subjects ps ON ps.subject_id=v.requester WHERE v.code=?1 AND v.requester='102204162531430400' AND v.used_at IS NULL AND v.state='pending' AND v.expires_at>${DB_NOW} AND v.session_expires>${DB_NOW} AND v.subject_generation=ps.generation AND ps.state='active' AND v.requester_account_incarnation=u.account_incarnation AND v.session_version=u.session_version AND u.in_server=1 AND u.denied=0 AND rs.id=(SELECT MAX(id) FROM roster_snapshots) AND rs.complete=1 AND rs.trusted=1 AND rs.member_count=(SELECT COUNT(*) FROM roster_members WHERE snapshot_id=rs.id) AND rs.exported_at<=${DB_NOW} AND rs.exported_at>${DB_NOW}-600 AND rs.exported_at>=?2 AND r.guid IS NOT NULL AND r.guid<>'Player-4613-005A70D8' AND (SELECT COUNT(*) FROM roster_members WHERE snapshot_id=rs.id AND guid=r.guid)=1 AND (SELECT COUNT(*) FROM roster_members WHERE snapshot_id=rs.id AND name=r.name)=1`;
 const rawTarget=await native.db.prepare(targetSql).bind(requestCode,links).first();native.check();assertBetaConfiguration(config);assertOriginalSiteSessionRead(session);if(!rawTarget)return fail('beta_original_target_required');
 const target=snapshotDataFields(rawTarget,targetFields,'beta_original_target_held') as Record<string,unknown>;if(target.code!==requestCode||target.requester!==BETA_FERN.requester||target.requester_name!==BETA_FERN.requesterName||!playerGuid(target.requester_guid as string)||!hex(target.subject_generation)||!hex(target.requester_account_incarnation)||!Number.isSafeInteger(target.roster_id)||!Number.isSafeInteger(target.session_version)||!Number.isSafeInteger(target.session_expires)||!Number.isSafeInteger(target.request_created_at)||!Number.isSafeInteger(target.request_expires_at)||(target.request_created_at as number)<1||(target.request_expires_at as number)<=(target.request_created_at as number)||(target.request_expires_at as number)>(target.request_created_at as number)+600)return fail('beta_original_target_held');
 const row=rawTarget as object,proto=Object.getPrototypeOf(row),keys=Reflect.ownKeys(row),slots=keys.map(k=>Object.freeze({...Object.getOwnPropertyDescriptor(row,k)!})),original=JSON.stringify(targetFields.map(k=>target[k]));let last=Date.now();if(!Number.isSafeInteger(last)||last<1000)return fail('beta_clock_held');
 const check=()=>{native.check();assertBetaConfiguration(config);assertOriginalSiteSessionRead(session);const at=Date.now(),nowKeys=Reflect.ownKeys(row);if(!Number.isSafeInteger(at)||at<last||at>=(target.session_expires as number)*1000||Object.getPrototypeOf(row)!==proto||nowKeys.length!==keys.length||nowKeys.some((k,i)=>k!==keys[i])||keys.some((k,i)=>!sameDescriptor(Object.getOwnPropertyDescriptor(row,k),slots[i])))fail('beta_original_target_changed');last=at;};check();
 for(const who of [BETA_FERN.actor,BETA_FERN.requester]){const member=await guildMember(env,who,{limit:1,attempts:0,retries:0});check();if(!member||member.user?.id!==who||!Array.isArray(member.roles)||(env.BLOCKING_ROLE_IDS||'').split(',').some(x=>x.trim()&&member.roles.includes(x.trim())))return fail('beta_current_server_required');}
 const targetAt=(alias:string)=>`json_array(${targetFields.map(k=>k==='requester_guid'?'attendee.guid':k==='requester_name'?'attendee.name':k==='roster_id'?'attendee.snapshot_id':k==='request_created_at'?alias+'.created_at':k==='request_expires_at'?alias+'.expires_at':alias+'.'+k).join(',')})`;
 const receiptRow=await native.db.prepare(`INSERT INTO qr_beta_fern_windows(${BETA_WINDOW_FIELDS.join(',')}) SELECT ?1,?2,'${session.n}','${session.g}',?3,?4,'236932545793490944','1550176895671341076','Player-4613-005A70D8','Fern Melder','OLYMPUS','Classic Beta PvP 2','ClassicBetaPvP',70338,16001,'Officer',1,5,rs.id,?7,${DB_NOW},${DB_NOW}+?5,?6,NULL,v.requester,attendee.name,attendee.guid,v.subject_generation,v.requester_account_incarnation,v.code,v.created_at,v.expires_at,?10
 FROM roster_snapshots rs JOIN roster_members rm ON rm.snapshot_id=rs.id JOIN roster_members attendee ON attendee.snapshot_id=rs.id JOIN verification_requests v ON v.code=?9
 WHERE ${targetAt('v')}=?8 AND rs.id=(SELECT MAX(id) FROM roster_snapshots) AND rs.complete=1 AND rs.trusted=1 AND rs.exported_at<=${DB_NOW} AND rs.exported_at>${DB_NOW}-600 AND rs.exported_at>=?7 AND rs.member_count=(SELECT COUNT(*) FROM roster_members WHERE snapshot_id=rs.id)
 AND NOT EXISTS(SELECT 1 FROM roster_members profile WHERE profile.snapshot_id=rs.id AND (typeof(profile.rank_index)<>'integer' OR profile.rank_index NOT BETWEEN 0 AND 4 OR profile.rank IS NOT CASE profile.rank_index WHEN 0 THEN 'Guild Master' WHEN 1 THEN 'Officer' WHEN 2 THEN 'Veteran' WHEN 3 THEN 'Member' WHEN 4 THEN 'Initiate' END))
 AND rm.guid='Player-4613-005A70D8' AND rm.name='Fern Melder' AND rm.rank='Officer' AND rm.rank_index=1 AND (SELECT COUNT(*) FROM roster_members WHERE snapshot_id=rs.id AND guid=rm.guid)=1 AND attendee.name='Stavros Heuto' AND attendee.guid<>'Player-4613-005A70D8' AND (SELECT COUNT(*) FROM roster_members WHERE snapshot_id=rs.id AND guid=attendee.guid)=1 AND (SELECT COUNT(*) FROM roster_members WHERE snapshot_id=rs.id AND name=attendee.name)=1
 AND v.requester='102204162531430400' AND v.expires_at>=${DB_NOW}+?5 AND v.session_expires>=${DB_NOW}+?5 AND v.state='pending' AND v.used_at IS NULL AND v.expires_at>${DB_NOW} AND v.session_expires>${DB_NOW} AND EXISTS(SELECT 1 FROM site_users u JOIN privacy_subjects ps ON ps.subject_id=u.discord_id WHERE u.discord_id=v.requester AND u.account_incarnation=v.requester_account_incarnation AND u.session_version=v.session_version AND u.in_server=1 AND u.denied=0 AND ps.generation=v.subject_generation AND ps.state='active') AND NOT EXISTS(SELECT 1 FROM members WHERE discord_id=v.requester AND banned=1) AND NOT EXISTS(SELECT 1 FROM rename_holds WHERE discord_id=v.requester AND state='reapply')
 AND EXISTS(SELECT 1 FROM site_users su WHERE su.discord_id=?2 AND su.session_version=?3 AND su.in_server=1 AND su.denied=0 AND ${privacyAccountIncarnationLiteralFenceSql('su.account_incarnation',session.n)}) AND ?4>=${DB_NOW}+?5 AND ${privacyGenerationLiteralFenceSql('?2',session.g)}
 AND EXISTS(SELECT 1 FROM characters c JOIN members m ON m.discord_id=c.discord_id WHERE c.discord_id=?2 AND c.guid=rm.guid AND c.name=rm.name AND c.status='member' AND m.banned=0) AND (SELECT COUNT(*) FROM characters WHERE guid=rm.guid AND status IN('member','left_pending'))=1 AND NOT EXISTS(SELECT 1 FROM rename_holds WHERE discord_id=?2 AND state='reapply')
 AND NOT EXISTS(SELECT 1 FROM qr_beta_fern_windows WHERE actor=?2 AND revoked_at IS NULL AND expires_at>${DB_NOW}) RETURNING id,created_at,expires_at`).bind(config.windowId,session.u,session.v,session.e,duration,reviewDigest,links,original,requestCode,config.membershipRole).first<{id:string;created_at:number;expires_at:number}>();check();if(!receiptRow)return fail('beta_registration_held');
 const receipt=snapshotDataFields(receiptRow,['id','created_at','expires_at'],'beta_registration_reply_held') as unknown as Readonly<{id:string;created_at:number;expires_at:number}>;if(receipt.id!==config.windowId||!Number.isSafeInteger(receipt.created_at)||!Number.isSafeInteger(receipt.expires_at)||receipt.created_at<1||receipt.expires_at!==receipt.created_at+duration||receipt.expires_at>session.e)return fail('beta_registration_reply_held');return receipt;
}

export type BetaGameObservation=Readonly<{challenge:string;code:string;requesterGuid:string;signerGuid:string;timestamp:number;requesterName:string;requesterRank:number;mode:'B1'}>;
const playerGuid=(v:string)=>v.length>=17&&v.length<=24&&/^Player-[0-9]{1,8}-[0-9A-Fa-f]{8}$/.test(v)&&!v.includes('\n');
export function parseBetaGameObservation(wire:unknown):BetaGameObservation{
 if(typeof wire!=='string'||new TextEncoder().encode(wire).length>512)return fail('invalid_beta_game_observation');const p=wire.split('|');
 if(p.length!==14||p[0]!=='OLG2'||!hex(p[1])||!hex(p[2])||!playerGuid(p[3]!)||p[4]!==BETA_FERN.guid||p[3]===p[4]||p[5]!.length!==10||!/^[0-9]{10}$/.test(p[5]!)||p[6]!=='70338'||p[7]!=='16001'||!p[8]||p[8]!.length>60||/[\p{C}|]/u.test(p[8]!)||p[8]!==p[8]!.normalize('NFC')||p[9]!=='OLYMPUS'||p[10]!==BETA_FERN.realm||p[11]!.length!==1||p[11]<'0'||p[11]>'4'||p[12]!=='B1'||p[13]!==BETA_FERN.ranks[Number(p[11])])return fail('invalid_beta_game_observation');
 return Object.freeze({challenge:p[1]!,code:p[2]!,requesterGuid:p[3]!,signerGuid:p[4]!,timestamp:Number(p[5]),requesterName:p[8]!,requesterRank:Number(p[11]),mode:'B1'});
}
/** Public 14-field wire contains no account nonce. Browser signatures bind the own window ID;
 * its complete private tuple is independently fenced by Native and the server-only key-context MAC. */
export function betaAttestationBytes(key:string,requester:string,signer:string,wire:string,w:BetaWindow):Uint8Array{
 assertBetaWindow(w);if(signer!==BETA_FERN.actor||requester===signer||!hex(key))return fail('beta_attestation_held');const o=parseBetaGameObservation(wire);if(requester!==w.requester_id||o.code!==w.request_code||o.requesterName!==w.requester_name||o.requesterGuid!==w.requester_guid)return fail('beta_named_attendee_mismatch');
 return new TextEncoder().encode(JSON.stringify([BETA_FERN.domain,key,requester,signer,'beta-five-70338',wire,w.id]));
}
/** Consuming role guard must independently fence B1 to the current configured membership role. */
export function betaMembershipEffectSql(config:BetaConfiguration,requestedRole?:string):string{
 assertBetaConfiguration(config);const selected=config.membershipRole;
 // Normal proofs pass the no-beta arm. An optional source caller's purported membership role must equal the original selector.
 if(requestedRole!==undefined&&(!roleId(requestedRole)||requestedRole!==selected)||config.enabled&&!roleId(selected))return fail('beta_membership_configuration_held');
 const admitted=config.enabled?`p.beta_window_id='${config.windowId}' AND EXISTS(SELECT 1 FROM qr_beta_fern_windows original_window WHERE original_window.id=p.beta_window_id AND original_window.membership_role=r.role_id) AND r.purpose='verified_membership' AND r.desired=1 AND r.role_id='${selected}' AND r.guild_id='236932545793490944'`:'0';
 return `(NOT EXISTS(SELECT 1 FROM verification_proofs p WHERE p.id=?1 AND p.beta_window_id IS NOT NULL) OR EXISTS(SELECT 1 FROM verification_proofs p JOIN role_settlements r ON r.proof_id=p.id WHERE p.id=?1 AND r.id=?3 AND ${admitted}))`;
}
