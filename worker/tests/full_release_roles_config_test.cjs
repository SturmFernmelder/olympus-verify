// Fresh-role lanes (Revision 4, A1/Q6): the synchronous, descriptor-based configuration capture of src/full-release-roles.ts.
// Runs the REAL module (and its real pure imports), transpiled by TypeScript. Synthetic Discord IDs only; the twelve are
// the source constants of beta-reset-policy.ts. No D1, no provider access. From the worker folder:
//   node tests/full_release_roles_config_test.cjs
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript');
const root=path.join(__dirname,'..'),src=name=>fs.readFileSync(path.join(root,'src',name),'utf8');
globalThis.fetch=async()=>{throw Error('provider access forbidden');};
const cache=new Map();
function load(name){
 if(cache.has(name))return cache.get(name).exports;const m={exports:{}};cache.set(name,m);
 const js=ts.transpileModule(src(name+'.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('module','exports','require',js)(m,m.exports,p=>{if(p==='node:async_hooks')return require(p);if(!/^\.\/[a-z0-9-]+$/.test(p))throw Error('external module refused: '+p);return load(p.slice(2));});
 return m.exports;
}
const F=load('full-release-roles'),policy=load('beta-reset-policy');
let passed=0;
function check(name,value){assert.ok(value,name);passed++;console.log('PASS '+name);}
const id=n=>String(800000000000000000n+BigInt(n));
const GUILD=id(1),APP=id(2),MEMBER=id(3),OFFICER=id(4),MODERATOR=id(5),LEADER=id(6),RAID=id(8),RETIRED=id(9),BLOCK=[id(10),id(11)],INTRO=[id(12),OFFICER];
const QR_ROLES=[id(21),id(22),id(23),id(24),id(25)],FRESH_IDS=Array.from({length:11},(_,i)=>String(900000000000000100n+BigInt(i)));
const EPOCH=1793833200,LABEL='olympus-full-release-launch';
const rawOf=(o={})=>JSON.stringify({version:1,epoch:LABEL,epochStart:EPOCH,grants:true,membership:FRESH_IDS[0],native:FRESH_IDS.slice(1),...o});
function env(extra={}){
 return {GUILD_ID:GUILD,DISCORD_APP_ID:APP,DISCORD_BOT_TOKEN:'fixture-token',ROLE_GUILD_MEMBER:MEMBER,ROLE_OFFICER:OFFICER,ROLE_MODERATOR:MODERATOR,
  ROLE_GUILD_LEADER:LEADER,ROLE_GUILD_MASTER:'',ROLE_RAID_LEADER:RAID,BLOCKING_ROLE_IDS:BLOCK.join(','),INTROS_ROLES:INTRO.join(','),
  QR_NATIVE_ROLE_MAP:JSON.stringify({profile:'beta-five',roles:QR_ROLES}),QR_PRIVILEGED_RANK_MAPPING_ENABLED:'false',QR_RANK_MAPPING_ENABLED:'true', // P1-B: supported
  ROSTER_MIN_MEMBERS:'200',ROSTER_MAX_SHRINK_PCT:'10',ROLE_CALL_BUDGET:'40',LINKS_NOT_BEFORE:String(EPOCH),PRIVACY_ERASURE_ENABLED:'false',
  SITE_ADMINS:id(99),DB:{prepare(){throw Error('capture must not read D1');}},...extra};
}
const cap=e=>F.captureLaneConfig(e);
(async()=>{
 // --- absent, "" and "false": the original path
 for(const [label,e] of [['absent',env()],['""',env({FULL_RELEASE_ROLES:'',STAFF_TEN_RANK_ROLES:''})],['staff "false"',env({STAFF_TEN_RANK_ROLES:'false'})],
  ['own undefined',env({FULL_RELEASE_ROLES:undefined,STAFF_TEN_RANK_ROLES:undefined})]]){
  const c=cap(e);check('unconfigured '+label+': no lane, original path',c.configured===false&&c.fresh==='absent'&&c.staff==='absent'&&c.cfg===null&&c.raw===null&&c.current());
 }
 check('FULL_RELEASE_ROLES "false" is present and invalid, never absent',cap(env({FULL_RELEASE_ROLES:'false'})).configured&&cap(env({FULL_RELEASE_ROLES:'false'})).fresh==='held');
 {let reads=0;const e=env();for(const k of ['GUILD_ID','DISCORD_BOT_TOKEN','ROLE_OFFICER','QR_NATIVE_ROLE_MAP'])Object.defineProperty(e,k,{get(){reads++;throw Error('getter invoked');},enumerable:true,configurable:true});
  const c=cap(e);check('unconfigured capture never invokes an accessor and stays unconfigured',reads===0&&c.configured===false&&c.current());}
 // --- tier G and tier R
 {const c=cap(env({FULL_RELEASE_ROLES:rawOf()}));
  check('owner values (epochStart = LINKS_NOT_BEFORE = 1793833200, grants:true) reach tier G',c.configured&&c.fresh==='grants'&&c.freshReason==='tier_g'&&c.cfg.epochStart===EPOCH&&c.linksNotBefore===EPOCH);
  check('capture is frozen and carries the eleven fresh IDs, guild, app, floor, shrink and call limit',Object.isFrozen(c)&&Object.isFrozen(c.cfg)&&Object.isFrozen(c.cfg.native)&&c.freshIds.join()===FRESH_IDS.join()
   &&c.guild===GUILD&&c.appId===APP&&c.floor===200&&c.shrink===10&&c.callLimit===40&&c.raw===rawOf()&&c.blocking.join()===BLOCK.join());
  check('capture keeps no secret value in its fields',!JSON.stringify({...c,current:undefined}).includes('fixture-token'));}
 for(const [label,extra,reason] of [['grants:false',{FULL_RELEASE_ROLES:rawOf({grants:false})},'grants_disabled'],
  ['LINKS_NOT_BEFORE date form',{FULL_RELEASE_ROLES:rawOf(),LINKS_NOT_BEFORE:'2026-11-04'},'links_not_before_invalid'],
  ['LINKS_NOT_BEFORE with whitespace',{FULL_RELEASE_ROLES:rawOf(),LINKS_NOT_BEFORE:' 1793833200'},'links_not_before_invalid'],
  ['LINKS_NOT_BEFORE trailing newline',{FULL_RELEASE_ROLES:rawOf(),LINKS_NOT_BEFORE:'1793833200\n'},'links_not_before_invalid'],
  ['LINKS_NOT_BEFORE ""',{FULL_RELEASE_ROLES:rawOf(),LINKS_NOT_BEFORE:''},'links_not_before_invalid'],
  ['LINKS_NOT_BEFORE leading zero',{FULL_RELEASE_ROLES:rawOf(),LINKS_NOT_BEFORE:'01793833200'},'links_not_before_invalid'],
  ['epochStart before LINKS_NOT_BEFORE',{FULL_RELEASE_ROLES:rawOf(),LINKS_NOT_BEFORE:String(EPOCH+1)},'epoch_before_links_not_before'],
  ['beta Fern exception on',{FULL_RELEASE_ROLES:rawOf(),QR_BETA_FERN_EXCEPTION_ENABLED:'true'},'beta_fern_exception_enabled'],
  ['erasure on',{FULL_RELEASE_ROLES:rawOf(),PRIVACY_ERASURE_ENABLED:'true'},'erasure_enabled']]){
  const c=cap(env(extra));check('tier R only ('+label+'): removals run, grants held',c.configured&&c.fresh==='removals'&&c.freshReason===reason&&c.cfg!==null);
 }
 {const c=cap(env({FULL_RELEASE_ROLES:rawOf(),LINKS_NOT_BEFORE:String(EPOCH-86400)}));check('epochStart after LINKS_NOT_BEFORE is tier G',c.fresh==='grants');}
 // every twelve ID and every reserved role in every slot fails tier R
 const reserved=[...policy.BETA_RESET_ROLE_IDS,GUILD,APP,MEMBER,OFFICER,MODERATOR,LEADER,RAID,RETIRED,...BLOCK,INTRO[0],...QR_ROLES];
 let matrix=0;
 for(const r of reserved)for(let slot=0;slot<11;slot++){
  const ids=FRESH_IDS.slice();ids[slot]=r;const c=cap(env({MEMBERSHIP_RETIRED_ROLE_ID:RETIRED,FULL_RELEASE_ROLES:rawOf({membership:ids[0],native:ids.slice(1)})}));
  assert.equal(c.fresh,'held',r+' in slot '+slot);assert.equal(c.freshReason,'fresh_config_reserved_id');assert.equal(c.cfg,null);matrix++;
 }
 check(`tier R refuses every twelve and reserved role in every slot (${matrix} cases)`,matrix===reserved.length*11);
 {const e=env({FULL_RELEASE_ROLES:rawOf({membership:QR_ROLES[0]}),QR_NATIVE_ROLE_MAP:''});check('without a QR map its former roles are not reserved',cap(e).fresh==='grants');}
 for(const bad of ['{not json','{"profile":"beta-five","roles":["1"]}','{"profile":"ten-rank","roles":[]}','[]'])
  assert.equal(cap(env({FULL_RELEASE_ROLES:rawOf(),QR_NATIVE_ROLE_MAP:bad})).freshReason,'qr_native_map_unparsable');
 check('an unparsable QR_NATIVE_ROLE_MAP fails tier R',true);
 const big=String(18446744073709551615n),over=String(18446744073709551616n);
 check('IDs at 2^64-1 are accepted and above it refused',F.laneRoleId(big)&&!F.laneRoleId(over)&&!F.laneRoleId('0'+id(1).slice(1))&&!F.laneRoleId('1234567890123456')&&F.laneRoleId('12345678901234567'));
 const nonCanonical=[[' '+rawOf(),'fresh_config_not_canonical'],[rawOf().replace('"version":1,','"version":1, '),'fresh_config_not_canonical'],
  [JSON.stringify({epoch:LABEL,version:1,epochStart:EPOCH,grants:true,membership:FRESH_IDS[0],native:FRESH_IDS.slice(1)}),'fresh_config_keys'],
  [rawOf().replace('}',',"extra":1}'),'fresh_config_keys'],[rawOf().replace('{"version":1,','{"version":1,"version":1,'),'fresh_config_not_canonical'],
  [rawOf({version:2}),'fresh_config_version'],[rawOf({epoch:'olympus-full-release-'}),'fresh_config_epoch'],[rawOf({epoch:'olympus-full-release-UP'}),'fresh_config_epoch'],
  [rawOf({epoch:'olympus-full-release-'+'a'.repeat(33)}),'fresh_config_epoch'],[rawOf({epochStart:policy.BETA_RESET_CUTOFF-1}),'fresh_config_epoch_start'],
  [rawOf({epochStart:EPOCH+0.5}),'fresh_config_epoch_start'],[rawOf({epochStart:String(EPOCH)}),'fresh_config_epoch_start'],[rawOf({grants:'true'}),'fresh_config_grants'],
  [rawOf({native:FRESH_IDS.slice(1,10)}),'fresh_config_native'],[rawOf({native:[...FRESH_IDS.slice(1,10),FRESH_IDS[1]]}),'fresh_config_ids'],
  [rawOf({membership:FRESH_IDS[1]}),'fresh_config_ids'],[rawOf({membership:over}),'fresh_config_ids'],[rawOf({membership:Number(FRESH_IDS[0])}),'fresh_config_ids'],
  [rawOf({native:[...FRESH_IDS.slice(1,10),1]}),'fresh_config_native'],[rawOf({epoch:'olympus-full-release-'+'a'.repeat(30)}).padEnd(1025,' '),'fresh_config_size'],
  ['null','fresh_config_shape'],['[1]','fresh_config_shape'],['"x"','fresh_config_shape'],['{','fresh_config_json']];
 for(const [raw,reason] of nonCanonical){const c=cap(env({FULL_RELEASE_ROLES:raw}));assert.equal(c.fresh,'held',raw.slice(0,80));assert.equal(c.freshReason,reason,raw.slice(0,80));assert.equal(c.cfg,null);}
 check(`non-canonical, malformed or out-of-range FULL_RELEASE_ROLES is held (${nonCanonical.length} cases)`,true);
 check('epochStart floor is the beta-reset cutoff 1792688400',F.FRESH_EPOCH_FLOOR===1792688400&&cap(env({FULL_RELEASE_ROLES:rawOf({epochStart:1792688400}),LINKS_NOT_BEFORE:'1792688400'})).fresh==='grants');
 check('a non-string FULL_RELEASE_ROLES is held',cap(env({FULL_RELEASE_ROLES:1})).fresh==='held'&&cap(env({FULL_RELEASE_ROLES:{}})).configured);
 for(const [label,extra] of [['GUILD_ID invalid',{GUILD_ID:'abc'}],['DISCORD_APP_ID missing',{DISCORD_APP_ID:''}],['no bot token',{DISCORD_BOT_TOKEN:''}]])
  check('fresh held without a valid Discord configuration: '+label,cap(env({...extra,FULL_RELEASE_ROLES:rawOf()})).fresh==='held'&&cap(env({...extra,FULL_RELEASE_ROLES:rawOf()})).freshReason==='discord_configuration');
 // --- accessor and inherited descriptors are held, never invoked
 {let reads=0;const e=env();Object.defineProperty(e,'FULL_RELEASE_ROLES',{get(){reads++;return rawOf();},enumerable:true,configurable:true});
  const c=cap(e);check('an accessor FULL_RELEASE_ROLES is configured and held without being invoked',c.configured&&c.fresh==='held'&&reads===0);}
 {const e=Object.assign(Object.create({FULL_RELEASE_ROLES:rawOf()}),env());const c=cap(e);check('an inherited FULL_RELEASE_ROLES is configured and held',c.configured&&c.fresh==='held');}
 {const e=Object.assign(Object.create({STAFF_TEN_RANK_ROLES:'true'}),env());const c=cap(e);check('an inherited STAFF_TEN_RANK_ROLES is configured and held',c.configured&&c.staff==='held'&&c.fresh==='absent');}
 {let reads=0;const e=env({FULL_RELEASE_ROLES:rawOf(),STAFF_TEN_RANK_ROLES:'true'});Object.defineProperty(e,'BLOCKING_ROLE_IDS',{get(){reads++;return '';},enumerable:true,configurable:true});
  const c=cap(e);check('an accessor on any key read holds both present lanes without invoking it',c.fresh==='held'&&c.staff==='held'&&c.freshReason==='configuration_descriptor_held'&&reads===0);}
 {const e=Object.assign(Object.create({ROLE_OFFICER:OFFICER}),env({FULL_RELEASE_ROLES:rawOf()}));delete e.ROLE_OFFICER;
  check('an inherited key read holds the lane',cap(e).fresh==='held');}
 {const proxy=new Proxy(env({FULL_RELEASE_ROLES:rawOf()}),{getOwnPropertyDescriptor(t,k){if(k==='GUILD_ID')throw Error('trap');return Reflect.getOwnPropertyDescriptor(t,k);}});
  let c;assert.doesNotThrow(()=>{c=cap(proxy);});check('a throwing descriptor trap holds instead of throwing',c.fresh==='held');}
 check('a non-object env never throws',cap(null).configured===false&&cap(undefined).configured===false&&cap(42).configured===false);
 // --- current(): the descriptor witness
 {const e=env({FULL_RELEASE_ROLES:rawOf(),STAFF_TEN_RANK_ROLES:'true'}),c=cap(e);
  check('current() is true until a read key changes',c.current());
  e.SITE_ADMINS=id(98);e.CHANNEL_SERVER_LOG=id(97);check('unrelated keys do not flip current()',c.current());
  const mutations=[['FULL_RELEASE_ROLES',rawOf({grants:false})],['GUILD_ID',id(77)],['DISCORD_BOT_TOKEN','rotated'],['BLOCKING_ROLE_IDS',''],['LINKS_NOT_BEFORE','1793833201'],['LINKS_NOT_BEFORE_CLOCK_GATED','true'],
   ['ROLE_CALL_BUDGET','30'],['QR_NATIVE_ROLE_MAP',''],['PRIVACY_ERASURE_ENABLED','true'],['ROLE_RAID_LEADER',id(78)],['STAFF_TEN_RANK_ROLES','raid-leader']];
  for(const [k,v] of mutations){const f=env({FULL_RELEASE_ROLES:rawOf(),STAFF_TEN_RANK_ROLES:'true'}),original=Object.getOwnPropertyDescriptor(f,k),w=cap(f);f[k]=v;assert.equal(w.current(),false,k);if(original)Object.defineProperty(f,k,original);else delete f[k];assert.equal(w.current(),true,k+' restored');}
  check(`current() flips on every read key (${mutations.length} keys) and recovers when restored`,true);
  {const f=env({FULL_RELEASE_ROLES:rawOf()}),w=cap(f);f.QR_BETA_FERN_EXCEPTION_ENABLED='false';check('adding a previously absent read key flips current()',!w.current());}
  {const f=env({FULL_RELEASE_ROLES:rawOf()}),w=cap(f);delete f.ROLE_GUILD_MASTER;check('deleting a read key flips current()',!w.current());}
  {const f=env({FULL_RELEASE_ROLES:rawOf()}),w=cap(f);let reads=0;const v=f.GUILD_ID;Object.defineProperty(f,'GUILD_ID',{get(){reads++;return v;},configurable:true,enumerable:true});
   check('redefining a key as an accessor flips current() without invoking it',!w.current()&&reads===0);}
  {const f=env({FULL_RELEASE_ROLES:rawOf()}),w=cap(f);Object.defineProperty(f,'GUILD_ID',{value:GUILD,writable:false,enumerable:true,configurable:true});check('a changed descriptor attribute flips current()',!w.current());}
  {const f=env({FULL_RELEASE_ROLES:rawOf()}),w=cap(f);let trap=false;const p=new Proxy(f,{getOwnPropertyDescriptor(t,k){if(trap)throw Error('trap');return Reflect.getOwnPropertyDescriptor(t,k);},has(t,k){if(trap)throw Error('trap');return Reflect.has(t,k);}});
   const w2=cap(p);trap=true;let r;assert.doesNotThrow(()=>{r=w2.current();});check('current() never throws (a throwing trap reads as changed)',r===false&&w.current());}
 }
 // --- capture before await: env mutated while an awaited sweep runs is neither re-read nor adopted
 {const e=env({FULL_RELEASE_ROLES:rawOf(),STAFF_TEN_RANK_ROLES:'true'}),c=cap(e),before=JSON.stringify({...c,current:undefined});
  const sweepMemberRoles=async()=>{await new Promise(r=>setImmediate(r));e.FULL_RELEASE_ROLES=rawOf({grants:false,membership:id(55)});e.STAFF_TEN_RANK_ROLES='false';e.GUILD_ID=id(56);};
  await sweepMemberRoles();
  check('a capture taken before an await keeps its values and its witness reports the change',JSON.stringify({...c,current:undefined})===before&&c.fresh==='grants'&&c.staff==='all'&&c.guild===GUILD&&!c.current());
  const later=cap(e);check('only a new entry capture would see the new values',later.fresh==='removals'&&later.staff==='absent'&&later.guild===id(56));}
 // --- staff values
 {const c=cap(env({STAFF_TEN_RANK_ROLES:'true'}));
  check('staff "true": all three staff roles, independent of FULL_RELEASE_ROLES',c.configured&&c.fresh==='absent'&&c.staff==='all'&&c.managedStaff.join()===[LEADER,OFFICER,RAID].join()&&c.staffIds.join()===[LEADER,OFFICER,RAID].join());
  check('staff map is privilegedNativeMap(ten-rank): Guild Master 0, Officer 2, Raid Leader 4',JSON.stringify(c.staffMap)===JSON.stringify([{idx:0,name:'Guild Master',role:LEADER},{idx:2,name:'Officer',role:OFFICER},{idx:4,name:'Raid Leader',role:RAID}])
   &&F.laneStaffMapJson(c)===JSON.stringify(c.staffMap)&&F.laneFamilyJson(c,'staff')===JSON.stringify([LEADER,OFFICER,RAID])&&F.laneManagedJson(c)===JSON.stringify([LEADER,OFFICER,RAID]));}
 {const c=cap(env({STAFF_TEN_RANK_ROLES:'raid-leader'}));check('staff "raid-leader": Raid Leader only; Officer and Guild Leader stay in the family fence',c.staff==='raid-leader'&&c.managedStaff.join()===RAID&&c.staffMap.length===1&&c.staffMap[0].idx===4&&c.staffIds.length===3);}
 for(const junk of ['TRUE','yes','1',' true','true ','raid_leader','False','on'])assert.equal(cap(env({STAFF_TEN_RANK_ROLES:junk})).staff,'held',junk);
 check('any other staff value is configured and held',cap(env({STAFF_TEN_RANK_ROLES:'yes'})).configured&&cap(env({STAFF_TEN_RANK_ROLES:'yes'})).staffReason==='staff_switch_invalid');
 for(const [label,extra,reason] of [['legacy privileged producer reachable (P1-B)',{QR_PRIVILEGED_RANK_MAPPING_ENABLED:'true'},'legacy_privileged_producer_reachable'],
  ['legacy privileged producer reachable, cosmetic mapping off (P1-B, Codex 22:44)',{QR_PRIVILEGED_RANK_MAPPING_ENABLED:'true',QR_RANK_MAPPING_ENABLED:'false',QR_NATIVE_ROLE_MAP:''},'legacy_privileged_producer_reachable'],
  ['LINKS_NOT_BEFORE date form',{LINKS_NOT_BEFORE:'2026-11-04'},'links_not_before_invalid'],['LINKS_NOT_BEFORE unset',{LINKS_NOT_BEFORE:''},'links_not_before_invalid'],
  ['Officer among the twelve',{ROLE_OFFICER:policy.BETA_RESET_ROLE_IDS[3]},'staff_role_configuration'],['duplicate staff IDs',{ROLE_RAID_LEADER:OFFICER},'staff_role_configuration'],
  ['Raid Leader unset',{ROLE_RAID_LEADER:''},'staff_role_configuration'],['staff role is Guild Member',{ROLE_GUILD_LEADER:MEMBER},'staff_role_configuration'],
  ['staff role in the QR map',{ROLE_RAID_LEADER:QR_ROLES[1]},'staff_role_configuration'],['staff role is the guild',{ROLE_OFFICER:GUILD},'staff_role_configuration'],
  ['no bot token',{DISCORD_BOT_TOKEN:''},'discord_configuration']]){
  const c=cap(env({STAFF_TEN_RANK_ROLES:'true',...extra}));check('staff held: '+label,c.configured&&c.staff==='held'&&c.staffReason===reason&&c.managedStaff.length===0&&c.staffMap.length===0);
 }
 // P1-B: the legacy producer reads the exact value "true" (role-settlements.ts :136, :269); any other value leaves it off and staff open
 for(const v of [undefined,'','false','TRUE','yes'])assert.equal(cap(env({STAFF_TEN_RANK_ROLES:'true',QR_PRIVILEGED_RANK_MAPPING_ENABLED:v})).staff,'all',String(v));
 {const e=env({STAFF_TEN_RANK_ROLES:'true'});Object.defineProperty(e,'QR_PRIVILEGED_RANK_MAPPING_ENABLED',{get(){throw Error('getter invoked');},enumerable:true,configurable:true});
  check('P1-B: staff is open only while the legacy privileged switch is not exactly "true"; an accessor on it holds staff without invoking it',cap(e).staff==='held'
   &&cap(e).staffReason==='configuration_descriptor_held'&&cap(env({STAFF_TEN_RANK_ROLES:'raid-leader',QR_PRIVILEGED_RANK_MAPPING_ENABLED:'true'})).staffReason==='legacy_privileged_producer_reachable');}
 {const c=cap(env({STAFF_TEN_RANK_ROLES:'true',FULL_RELEASE_ROLES:rawOf({native:[...FRESH_IDS.slice(1,10),RAID]})}));check('a fresh ID equal to a staff role fails tier R; staff stays independent',c.fresh==='held'&&c.staff==='all');}
 // --- numbers read like the legacy code
 const settlementsSource=src('roles.ts');
 check('callLimit uses the roles.ts:90 formula',/callBudget = \(env: Env\): CallBudget => \(\{ limit: Math\.min\(50, Math\.max\(4, intVar\(env\.ROLE_CALL_BUDGET, CALL_BUDGET_DEFAULT\)\)\)/.test(settlementsSource)&&/CALL_BUDGET_DEFAULT = 40;/.test(settlementsSource)
  &&[['',40],['60',50],['2',4],['25',25],['x',40]].every(([v,want])=>cap(env({FULL_RELEASE_ROLES:rawOf(),ROLE_CALL_BUDGET:v})).callLimit===want));
 check('floor and shrink use intVar with the roster.ts:566-567 defaults',[['',0,'',10],['800',800,'15',15],['abc',0,'x',10]].every(([f,fw,s,sw])=>{const c=cap(env({FULL_RELEASE_ROLES:rawOf(),ROSTER_MIN_MEMBERS:f,ROSTER_MAX_SHRINK_PCT:s}));return c.floor===fw&&c.shrink===sw;}));
 // --- D and clock gates
 {const raw=rawOf(),d=await F.laneDigest(raw);check('D is sha256(raw) as lowercase hex',d===crypto.createHash('sha256').update(raw).digest('hex')&&d!==await F.laneDigest(rawOf({grants:false})));}
 {const c=cap(env({FULL_RELEASE_ROLES:rawOf(),STAFF_TEN_RANK_ROLES:'true'}));const a=F.laneClock(c,EPOCH-1),b=F.laneClock(c,EPOCH);
  check('clock gates: nothing before the launch hour, fresh and staff from 1793833200',!a.fresh&&!a.grants&&!a.staff&&b.fresh&&b.grants&&b.staff);
  const r=cap(env({FULL_RELEASE_ROLES:rawOf({grants:false})}));check('tier R opens removals but not grants at the epoch',F.laneClock(r,EPOCH).fresh&&!F.laneClock(r,EPOCH).grants);
  const h=cap(env({FULL_RELEASE_ROLES:'{'}));check('a held lane never opens',!F.laneClock(h,EPOCH+86400).fresh&&!F.laneClock(h,EPOCH+86400).staff&&!F.laneClock(c,NaN).fresh);}
 // --- pinned constants and module purity
 check('purposes pinned',F.LANE_PURPOSES.join()==='fresh_roster_membership,fresh_roster_rank,staff_roster_rank,fresh_removal_ban,fresh_removal_departure,fresh_removal_rename_hold,fresh_removal_blocking_role,staff_removal_ban,staff_removal_departure'
  &&F.STAFF_GRANT_FAMILY.join()==='verified_privileged_rank,roster_privileged_rank,staff_roster_rank'&&F.STAFF_FAMILY.length===5&&Object.isFrozen(F.LANE_PURPOSES));
 check('no lane purpose is an existing .160 purpose',F.LANE_PURPOSES.every(p=>!['verified_membership','roster_membership','verified_native_rank','verified_privileged_rank','roster_native_rank','roster_privileged_rank','grant_compensation','ban','rename_hold','blocking_role','guild_departure','account_erasure','beta_reset'].includes(p)));
 check('timings and caps pinned',F.FRESH_INTERVAL_SECONDS===300&&F.FRESH_LEASE_SECONDS===300&&F.FRESH_ACK_WINDOW_SECONDS===300&&F.FRESH_BACKOFF_SECONDS===3600&&F.LANE_INTENT_SECONDS===300
  &&F.LANE_ROSTER_FRESH_SECONDS===600&&F.FRESH_EFFECT_SPACING_MS===250&&F.FRESH_CAUSE_ROTATION_PER_PASS===3&&F.FRESH_DEPARTURE_SUBJECTS_PER_PASS===1&&F.FRESH_GRANT_SUBJECTS_PER_PASS===2
  &&F.STAFF_SUBJECTS_PER_PASS===1&&F.FRESH_PRESENCE_PER_PASS===3&&F.FRESH_EFFECTS_PER_SUBJECT===2&&F.FRESH_WALK_WINDOW===50&&F.FRESH_REMOVAL_MIN_ENTRY===6&&F.FRESH_CAUSE_MIN_ENTRY===7
  &&F.FRESH_EFFECT_MIN_LEFT===8&&F.FRESH_RECONCILE_MIN_LEFT===4&&F.FRESH_CLAIM_MIN_LEFT===2&&F.STAFF_MIN_ENTRY===20&&F.LEGACY_BAN_ALLOWANCE===16&&F.FRESH_CONFIG_MAX_BYTES===1024
  &&F.LANE_OBSERVED_PRESENT_ENABLED===false&&F.FRESH_LEASE_KEY==='fullReleaseRolesPass');
 {const s=src('full-release-roles.ts');const imports=Array.from(s.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm),m=>m[1]).sort();
  check('full-release-roles.ts imports only pure modules',imports.join()==='./account-generation-contracts,./beta-reset-policy,./env,./native-rank-adapter,./privacy-serving-authority,./qr-phase1');
  const code=ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,removeComments:true}}).outputText;
  check('full-release-roles.ts makes no D1, HTTP or async call',!/\.prepare\(|\.batch\(|fetch\(|\bawait\b|\basync\b|\.DB\b/.test(code));
  check('the capture reads every key it documents',F.LANE_CONFIG_KEYS.length===23&&['FULL_RELEASE_ROLES','STAFF_TEN_RANK_ROLES','DISCORD_BOT_TOKEN','MEMBERSHIP_RETIRED_ROLE_ID','INTROS_ROLES','QR_BETA_FERN_EXCEPTION_ENABLED','PRIVACY_ERASURE_ENABLED','LINKS_NOT_BEFORE_CLOCK_GATED'].every(k=>F.LANE_CONFIG_KEYS.includes(k)));}
 {const e=src('env.ts');check('env.ts gains the two type-only optional fields',/^  FULL_RELEASE_ROLES\?: string;/m.test(e)&&/^  STAFF_TEN_RANK_ROLES\?: string;/m.test(e)&&!/FULL_RELEASE_ROLES[^?]*=/.test(e.split('\n').filter(l=>!l.includes('//')).join('\n')));}
 console.log(`\n${passed} checks passed`);
})().catch(e=>{console.error('FAIL',e);process.exit(1);});
