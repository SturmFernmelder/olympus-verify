// Private NativeSQLite fixture installer. Default invocation is held; no D1/provider API.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),manifestBytes=fs.readFileSync(path.join(root,'schema/rejection-provenance-next-profile-v1.json'));
const h=b=>crypto.createHash('sha256').update(b).digest('hex');if(h(manifestBytes)!=='86eab09d98b993ca8864d521cf240a930525c6ee0e8d8c5d8ddc172b1e3458e5')throw Error('private next manifest pin changed');
const manifest=JSON.parse(manifestBytes);
const semanticBytes=fs.readFileSync(path.join(root,'schema/rejection-provenance-next-epoch.sql'));
const SEMANTIC_NAMES=["privacy_rejection_decisions_expire_before_delete","privacy_rejection_expiry_control_no_insert","privacy_rejection_expiry_control_no_delete","privacy_rejection_expiry_control_guard","privacy_rejection_expiry_control_page","privacy_rejection_decisions_immutable","site_users_account_incarnation_immutable","site_users_rejection_owner_delete","qr_beta_fern_window_immutable","qr_beta_key_window_immutable","qr_beta_challenge_window_immutable","qr_beta_proof_window_immutable","qr_beta_request_window_immutable","beta_dispatch_seal_no_replace","beta_dispatch_seal_no_update","beta_dispatch_seal_no_delete"];
const SEMANTIC_PREFIX="-- Closed source semantic input; routes never install this file.\n";
const sameSemantic=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const preSealBytes=fs.readFileSync(path.join(root,'schema/dispatch-seal-predecessor-160.json'));
if(h(preSealBytes)!=='287668140aff83df1fc0ae757e77d87f733a6e67dc8365eb7db2e31ae6a7533e')throw Error('exact pre-seal source pin changed');
const preSeal=JSON.parse(preSealBytes),sealBodies=[{"name":"beta_dispatch_seal_no_replace","sql":"CREATE TRIGGER beta_dispatch_seal_no_replace BEFORE INSERT ON site_settings WHEN (NEW.key IN('betaResetDispatchSealV1','betaResetPolicyV1') AND EXISTS(SELECT 1 FROM site_settings WHERE key='betaResetDispatchSealV1')) OR EXISTS(SELECT 1 FROM site_settings AS protected WHERE protected.rowid=NEW.rowid AND (protected.key='betaResetDispatchSealV1' OR (protected.key='betaResetPolicyV1' AND EXISTS(SELECT 1 FROM site_settings WHERE key='betaResetDispatchSealV1')))) BEGIN SELECT RAISE(ABORT,'beta_dispatch_seal_immutable'); END"},{"name":"beta_dispatch_seal_no_update","sql":"CREATE TRIGGER beta_dispatch_seal_no_update BEFORE UPDATE ON site_settings WHEN ((OLD.key='betaResetDispatchSealV1' OR NEW.key='betaResetDispatchSealV1' OR ((OLD.key='betaResetPolicyV1' OR NEW.key='betaResetPolicyV1') AND EXISTS(SELECT 1 FROM site_settings WHERE key='betaResetDispatchSealV1'))) OR EXISTS(SELECT 1 FROM site_settings AS protected WHERE protected.rowid=NEW.rowid AND (protected.key='betaResetDispatchSealV1' OR (protected.key='betaResetPolicyV1' AND EXISTS(SELECT 1 FROM site_settings WHERE key='betaResetDispatchSealV1'))))) AND NOT (NEW.rowid IS OLD.rowid AND NEW.key IS OLD.key AND typeof(NEW.key)=typeof(OLD.key) AND NEW.value IS OLD.value AND typeof(NEW.value)=typeof(OLD.value) AND NEW.updated_at IS OLD.updated_at AND typeof(NEW.updated_at)=typeof(OLD.updated_at) AND OLD.updated_by IS NOT NULL AND NEW.updated_by IS NULL) BEGIN SELECT RAISE(ABORT,'beta_dispatch_seal_immutable'); END"},{"name":"beta_dispatch_seal_no_delete","sql":"CREATE TRIGGER beta_dispatch_seal_no_delete BEFORE DELETE ON site_settings WHEN OLD.key='betaResetDispatchSealV1' OR (OLD.key='betaResetPolicyV1' AND EXISTS(SELECT 1 FROM site_settings WHERE key='betaResetDispatchSealV1')) BEGIN SELECT RAISE(ABORT,'beta_dispatch_seal_immutable'); END"}];
if(!sameSemantic(manifest.semanticBodies.slice(0,13),preSeal.semanticBodies)||!sameSemantic(manifest.semanticBodies.slice(13),sealBodies))throw Error('pre-seal semantic preservation differs');
for(const [key,objects]of [['canonical','canonicalObjects'],['recordedLive','recordedLiveObjects']]){
 const source=manifest.cookieMigrationSources['current-cookie-pre-seal'][key],next=manifest[key],prior=preSeal[key];
 if(!sameSemantic(source,{profile:prior,objects:preSeal[objects]})||!sameSemantic(next,{...prior,triggers:[...prior.triggers,...sealBodies]}))throw Error('closed pre-seal transition differs');
}

if(!sameSemantic(manifest.semanticTriggerNames,SEMANTIC_NAMES)||manifest.semanticSourcePrefix!==SEMANTIC_PREFIX||!Array.isArray(manifest.semanticBodies)||manifest.semanticBodies.length!==16||!sameSemantic(manifest.semanticBodies.map(t=>t.name),SEMANTIC_NAMES))throw Error('closed sixteen semantic identities differ');
for(const layout of [manifest.canonical,manifest.recordedLive]){
 if(!sameSemantic(layout.triggers.filter(t=>SEMANTIC_NAMES.includes(t.name)),manifest.semanticBodies)||new Set(layout.triggers.map(t=>t.name)).size!==layout.triggers.length)throw Error('complete semantic layout linkage differs');
}
if(semanticBytes.toString('utf8')!==SEMANTIC_PREFIX+manifest.semanticBodies.map(t=>t.sql+';').join('\n\n')+'\n'||h(semanticBytes)!==manifest.semanticSQLSHA256)throw Error('complete semantic source bodies differ');

const schemas=new WeakSet();
function installFixtureEpoch(db,layout,epoch){
 if(!db||typeof db.exec!=='function'||typeof db.prepare!=='function'||!['canonical','recorded-live-20261010'].includes(layout)||!(/^[0-9a-f]{32}$/).test(epoch))throw Error('private source epoch input held');
 if(schemas.has(db))throw Error('private source epoch already installed');
 const p=layout==='canonical'?manifest.canonical:manifest.recordedLive;
 const tables=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND substr(lower(name),1,7)<>'sqlite_' AND name<>'_cf_KV' AND name<>'privacy_write_admission' ORDER BY name").all().map(t=>({...t,columns:db.prepare(`PRAGMA table_info("${t.name}")`).all().map(p=>p.name).sort()}));
 const indexes=db.prepare("SELECT name,sql,tbl_name FROM sqlite_master WHERE type='index' AND substr(lower(name),1,7)<>'sqlite_' ORDER BY name").all();
 if(JSON.stringify(tables)!==JSON.stringify(p.tables)||JSON.stringify(indexes)!==JSON.stringify(p.indexes)||db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger'").get().n!==0)throw Error('private original whole source precondition');
 if(db.prepare("SELECT COUNT(*) n FROM privacy_rejection_expiry_control WHERE singleton=1 AND protocol='original-guild-rejection-expiry-v1' AND observed_at=0 AND selected_count=0").get().n!==1||db.prepare('SELECT COUNT(*) n FROM privacy_rejection_expiry_control').get().n!==1)throw Error('private singleton seed held');
 db.exec('BEGIN');try{
  if(db.prepare('SELECT COUNT(*) n FROM privacy_write_admission').get().n!==0)throw Error('private source control not empty');
  db.prepare("INSERT INTO privacy_write_admission(singleton,protocol,epoch,mode,active,nonce,purpose,entry_changes,logical_changes) VALUES(1,'olympus-write-admission-epoch-2',?,'serving',0,'','',0,0)").run(epoch);
  db.exec(semanticBytes.toString('utf8'));
  for(const t of p.triggers)if(!SEMANTIC_NAMES.includes(t.name))db.exec(t.sql);
  const actual=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name").all().map(r=>[r.type,r.name,r.tbl_name,r.sql]);
  const expected=layout==='canonical'?manifest.canonicalObjects:manifest.recordedLiveObjects;
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('private whole source postcondition');db.exec('COMMIT');schemas.add(db);
 }catch(e){db.exec('ROLLBACK');throw e;}
 return Object.freeze({layout,epoch,triggerCount:p.triggers.length,providerInstalled:false});
}
function migrateFixtureProfile(db,layout){
 if(manifest.cookieIncarnationProfileOnly===true)throw Error('ORIGINAL_COOKIE_BIRTH_MIGRATION_HELD: full legacy-value preserving reconstruction not qualified');
 if(!['canonical','recorded-live-20261010'].includes(layout)||schemas.has(db))throw Error('private migration scope held');
 const old=layout==='canonical'?manifest.predecessorCanonical:manifest.predecessorRecordedLive,next=layout==='canonical'?manifest.canonical:manifest.recordedLive;
 const actual=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND substr(lower(name),1,7)<>'sqlite_' AND name<>'_cf_KV' AND name<>'privacy_write_admission' ORDER BY name").all().map(t=>({...t,columns:db.prepare(`PRAGMA table_info("${t.name}")`).all().map(p=>p.name).sort()}));
 if(JSON.stringify(actual)!==JSON.stringify(old.tables)||db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger'").get().n!==0||db.prepare('SELECT COUNT(*) n FROM privacy_write_admission').get().n!==0)throw Error('private exact predecessor migration held');
 db.exec('BEGIN');try{
  for(const name of ['site_users','site_applications']){
   const original=old.tables.find(t=>t.name===name),target=next.tables.find(t=>t.name===name),backup='rejection_original_'+name;
   db.exec(`ALTER TABLE "${name}" RENAME TO "${backup}"`);db.exec(target.sql);
   const columns=original.columns.map(c=>'"'+c+'"').join(',');db.exec(`INSERT INTO "${name}"(${columns})SELECT ${columns} FROM "${backup}"`);db.exec(`DROP TABLE "${backup}"`);
   for(const i of next.indexes.filter(i=>i.tbl_name===name))db.exec(i.sql);
  }
  for(const name of ['privacy_rejection_decisions','privacy_rejection_expiry_control'])db.exec(next.tables.find(t=>t.name===name).sql);
  for(const i of next.indexes.filter(i=>i.tbl_name==='privacy_rejection_decisions'))db.exec(i.sql);
  db.exec("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)");
  const current=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND substr(lower(name),1,7)<>'sqlite_' AND name<>'_cf_KV' AND name<>'privacy_write_admission' ORDER BY name").all().map(t=>({...t,columns:db.prepare(`PRAGMA table_info("${t.name}")`).all().map(p=>p.name).sort()}));
  const indexes=db.prepare("SELECT name,sql,tbl_name FROM sqlite_master WHERE type='index' AND substr(lower(name),1,7)<>'sqlite_' ORDER BY name").all();
  if(JSON.stringify(current)!==JSON.stringify(next.tables)||JSON.stringify(indexes)!==JSON.stringify(next.indexes))throw Error('private migrated whole profile differs');db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
 return Object.freeze({nativeBirthIdentityInitialized:true,historicalRejectionClockBackfilled:false,providerInstalled:false});
}
// Private synchronous Native qualification seam. This does not execute a D1/provider migration.
// The inert statement plan contains no FK disabling, TEMP table, rename or provider transaction command.
const {DatabaseSync:WholeNativeDatabase,StatementSync:WholeNativeStatement}=require('node:sqlite');
const wholeDbProto=WholeNativeDatabase.prototype,wholeStmtProto=WholeNativeStatement.prototype;
const wholeNativeDescriptors=Object.freeze(Object.fromEntries(['prepare','exec'].map(k=>[k,Object.getOwnPropertyDescriptor(wholeDbProto,k)])));
// The locked runtime installs isTransaction as a nonconfigurable OWN native accessor, not a prototype getter.
// This isolated probe is closed before any target capture. Its getter remains a genuine native brand intrinsic.
const wholeTransactionDescriptor=(()=>{
 const probe=new WholeNativeDatabase(':memory:',{defensive:true,enableForeignKeyConstraints:true});
 try{const d=Object.getOwnPropertyDescriptor(probe,'isTransaction');
  if(!d||typeof d.get!=='function'||d.set!==undefined||d.enumerable!==true||d.configurable!==false||Object.hasOwn(d,'value')||Object.hasOwn(d,'writable')||Object.getOwnPropertyDescriptor(wholeDbProto,'isTransaction')!==undefined)throw Error('private whole Native transaction descriptor held');
  return Object.freeze(d);
 }finally{const close=Object.getOwnPropertyDescriptor(wholeDbProto,'close');if(!close||!Object.hasOwn(close,'value')||typeof close.value!=='function')throw Error('private whole Native probe close held');Reflect.apply(close.value,probe,[]);}
})();
const wholeOriginalOwnTransactions=new WeakMap();
const wholeStatementDescriptors=Object.freeze(Object.fromEntries(['all','get','run','setReadBigInts'].map(k=>[k,Object.getOwnPropertyDescriptor(wholeStmtProto,k)])));
const wholePreparations=new WeakMap(),wholeAttempted=new WeakSet();
const privateWholeManifest=JSON.parse(manifestBytes.toString('utf8'));
const wholeFields=Object.freeze([
 ['community_event_deliveries','actor_account_incarnation'],['community_event_reminders','consent_account_incarnation'],
 ['ruleset_publications','actor_account_incarnation'],['councillor_keys','signer_account_incarnation'],
 ['councillor_challenges','signer_account_incarnation'],['verification_requests','requester_account_incarnation'],
 ['privacy_serving_jobs','original_account_incarnation'],['councillor_keys','beta_window_id'],['councillor_challenges','beta_window_id'],['verification_requests','beta_window_id'],['verification_proofs','beta_window_id']].map(x=>Object.freeze(x)));
function wholeLower32(s){if(typeof s!=='string'||s.length!==32)return false;for(let i=0;i<32;i++){const c=s.charCodeAt(i);if(!(c>=48&&c<=57||c>=97&&c<=102))return false;}return true;}
function wholeIdentifier(s){if(typeof s!=='string'||!s.length)throw Error('private whole identifier held');for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);if(!(c>=48&&c<=57||c>=65&&c<=90||c>=97&&c<=122||c===95))throw Error('private whole identifier held');}return '"'+s+'"';}
function wholeDescriptor(a,b){return !!a&&!!b&&['value','get','set','writable','enumerable','configurable'].every(k=>a[k]===b[k]);}
function wholeNativeWitness(db){
 if(!db||Object.getPrototypeOf(db)!==wholeDbProto)throw Error('private whole original Native handle held');
 for(const k of ['prepare','exec'])if(Object.getOwnPropertyDescriptor(db,k)||!wholeDescriptor(Object.getOwnPropertyDescriptor(wholeDbProto,k),wholeNativeDescriptors[k]))throw Error('private whole Native method drift');
 if(Object.getOwnPropertyDescriptor(wholeDbProto,'isTransaction')!==undefined)throw Error('private whole Native transaction prototype drift');
 const own=Object.getOwnPropertyDescriptor(db,'isTransaction'),saved=wholeOriginalOwnTransactions.get(db);
 if(!wholeDescriptor(own,wholeTransactionDescriptor)||saved&&!wholeDescriptor(own,saved))throw Error('private whole original OWN transaction descriptor drift');
 for(const k of ['all','get','run','setReadBigInts'])if(!wholeDescriptor(Object.getOwnPropertyDescriptor(wholeStmtProto,k),wholeStatementDescriptors[k]))throw Error('private whole Native statement drift');
 // A copied descriptor, inherited prototype or Proxy cannot supply the underlying Native receiver brand.
 // No ordinary db.isTransaction read or caller getter is invoked.
 const value=Reflect.apply(wholeTransactionDescriptor.get,db,[]);if(typeof value!=='boolean')throw Error('private whole Native transaction value held');
 if(Object.getPrototypeOf(db)!==wholeDbProto||!wholeDescriptor(Object.getOwnPropertyDescriptor(db,'isTransaction'),own))throw Error('private whole original OWN transaction descriptor drift');
 if(!saved)wholeOriginalOwnTransactions.set(db,Object.freeze({...own}));return value;
}
function wholeStatement(db,sql,big=false){wholeNativeWitness(db);const s=wholeNativeDescriptors.prepare.value.call(db,sql);if(big)wholeStatementDescriptors.setReadBigInts.value.call(s,true);wholeNativeWitness(db);return s;}
function wholeAll(db,sql,binds=[],big=false){const s=wholeStatement(db,sql,big),r=wholeStatementDescriptors.all.value.call(s,...binds);wholeNativeWitness(db);return r;}
function wholeRun(db,sql,binds=[]){const s=wholeStatement(db,sql),r=wholeStatementDescriptors.run.value.call(s,...binds);wholeNativeWitness(db);return r;}
function wholeExec(db,sql){wholeNativeWitness(db);wholeNativeDescriptors.exec.value.call(db,sql);wholeNativeWitness(db);}
function wholeObjects(db){return wholeAll(db,'SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').map(r=>[r.type,r.name,r.tbl_name,r.sql]);}
function wholeEqual(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function wholeSource(layout,kind){
 if(!['canonical','recorded-live-20261010'].includes(layout)||!['pre-marker','marker'].includes(kind))throw Error('private whole source selection held');
 const key=layout==='canonical'?'canonical':'recordedLive',source=privateWholeManifest.cookieMigrationSources?.[kind]?.[key];
 if(!source||!Array.isArray(source.objects)||!source.profile)throw Error('private whole source input absent');
 return {old:source.profile,oldObjects:source.objects,target:privateWholeManifest[key],targetObjects:privateWholeManifest[key+'Objects'],kind,layout};
}
function wholeClosedRow(db,epoch){
 const rows=wholeAll(db,'SELECT singleton,protocol,epoch,mode,active,nonce,purpose,entry_changes,logical_changes FROM privacy_write_admission ORDER BY singleton');
 if(!wholeEqual(rows.map(r=>[r.singleton,r.protocol,r.epoch,r.mode,r.active,r.nonce,r.purpose,r.entry_changes,r.logical_changes]),[[1,'olympus-write-admission-epoch-2',epoch,'closed',0,'','',0,0]]))throw Error('private whole original closed epoch held');
}
function wholeProfile(db,p){
 const actual=wholeObjects(db);
 if(!wholeEqual(actual,p)){
  // Schema-only diagnostics from the SAME original read before rollback. Exact refusal is retained.
  // No normalization, ignored objects, extra Native query, business values or retry.
  const identity=r=>JSON.stringify([r[0],r[1]]),expectedMap=new Map(p.map(r=>[identity(r),r])),actualMap=new Map(actual.map(r=>[identity(r),r]));
  const copied=r=>Object.freeze(r.slice()),missing=p.filter(r=>!actualMap.has(identity(r))).map(copied),extra=actual.filter(r=>!expectedMap.has(identity(r))).map(copied);
  const changed=p.filter(r=>actualMap.has(identity(r))&&!wholeEqual(r,actualMap.get(identity(r)))).map(r=>Object.freeze({expected:copied(r),actual:copied(actualMap.get(identity(r)))}));
  const error=Error('private whole exact installed profile held');
  Object.defineProperty(error,'schemaMismatchDiff',{value:Object.freeze({schema:'original-whole-schema-mismatch-v1',expectedCount:p.length,actualCount:actual.length,missing:Object.freeze(missing),extra:Object.freeze(extra),changed:Object.freeze(changed)}),enumerable:true,writable:false,configurable:false});
  throw error;
 }
 if(wholeAll(db,'PRAGMA foreign_key_check').length)throw Error('private whole original foreign key held');
}
function wholeScalar(v){if(v===null)return ['null'];if(typeof v==='bigint')return ['integer',v.toString()];if(typeof v==='number')return ['real',Object.is(v,-0)?'-0':String(v)];if(typeof v==='string')return ['text',v];if(v instanceof Uint8Array)return ['blob',Buffer.from(v).toString('hex')];throw Error('private whole Native value held');}
function wholeData(db,profile){
 const rows=profile.tables.map(t=>({name:t.name,columns:t.columns.slice(),rows:wholeAll(db,`SELECT _rowid_ AS __whole_rowid,${t.columns.map(wholeIdentifier).join(',')} FROM ${wholeIdentifier(t.name)} ORDER BY _rowid_`,[],true).map(r=>[wholeScalar(r.__whole_rowid),...t.columns.map(c=>wholeScalar(r[c]))])}));
 rows.push({name:'sqlite_sequence',columns:['name','seq'],rows:wholeAll(db,'SELECT _rowid_ AS __whole_rowid,name,seq FROM sqlite_sequence ORDER BY _rowid_',[],true).map(r=>[wholeScalar(r.__whole_rowid),wholeScalar(r.name),wholeScalar(r.seq)])});return rows;
}
function wholeEnvironment(db){
 if(wholeNativeWitness(db))throw Error('private whole existing transaction held');
 if(wholeAll(db,'PRAGMA database_list').some(r=>!['main','temp'].includes(r.name))||wholeAll(db,'SELECT name FROM sqlite_temp_master').length)throw Error('private whole attached or temporary schema held');
 if(wholeAll(db,'PRAGMA foreign_keys')[0]?.foreign_keys!==1)throw Error('private whole Native foreign keys must remain on');
}
function closeFixtureEpochForWholeMigration(db,layout,kind,originalEpoch){
 if(!wholeLower32(originalEpoch)||wholeAttempted.has(db))throw Error('private whole close input held');wholeEnvironment(db);const p=wholeSource(layout,kind);wholeProfile(db,p.oldObjects);
 const rows=wholeAll(db,'SELECT singleton,protocol,epoch,mode,active,nonce,purpose,entry_changes,logical_changes FROM privacy_write_admission ORDER BY singleton');
 if(!wholeEqual(rows.map(r=>[r.singleton,r.protocol,r.epoch,r.active,r.nonce,r.purpose,r.entry_changes,r.logical_changes]),[[1,'olympus-write-admission-epoch-2',originalEpoch,0,'','',0,0]])||!['closed','serving'].includes(rows[0]?.mode))throw Error('private whole close original active or epoch held');
 const result=wholeRun(db,"UPDATE privacy_write_admission SET mode='closed' WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND epoch=? AND mode IN('serving','closed') AND active=0 AND nonce='' AND purpose='' AND entry_changes=0 AND logical_changes=0",[originalEpoch]);
 if(result.changes!==1)throw Error('private whole close original ACK held');wholeClosedRow(db,originalEpoch);
 return Object.freeze({layout,sourceKind:kind,originalEpoch,localClosed:true,providerDrainQualified:false});
}
// Exact same six dated declarations/postconditions as the source-owned Native planner.
const wholeRaidFields=Object.freeze([["community_event_signups","remind_mention","remind_mention INTEGER NOT NULL DEFAULT 0 CHECK (remind_mention IN (0, 1))",0],["community_event_signups","decision","decision TEXT CHECK (decision IS NULL OR decision IN ('accepted', 'bench', 'declined'))",null],["community_event_signups","decided_by","decided_by TEXT",null],["community_event_signups","decided_at","decided_at INTEGER",null],["community_event_signups","decision_revision","decision_revision INTEGER NOT NULL DEFAULT 0 CHECK (decision_revision >= 0)",0],["community_event_reminders","mention_ids","mention_ids TEXT CHECK(mention_ids IS NULL OR (json_valid(mention_ids) AND json_type(mention_ids)='array'))",null]].map(x=>Object.freeze(x)));
const wholeRaidTargetLayouts=Object.freeze([{"sourceSignupSQL":"CREATE TABLE community_event_signups (               -- one effective answer per member and event\n  event_id       TEXT NOT NULL,\n  discord_id     TEXT NOT NULL,\n  status         TEXT NOT NULL CHECK (status IN ('yes', 'tentative', 'no')),\n  character_name TEXT CHECK (character_name IS NULL OR length(character_name) BETWEEN 2 AND 40),\n  character_key  TEXT,                                             -- communityKey(character_name)\n  raid_role      TEXT CHECK (raid_role IS NULL OR raid_role IN ('tank', 'healer', 'damage')),\n  revision       INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),\n  rsvp_starts_at INTEGER NOT NULL,                                 -- the start the member answered for (changedSinceRsvp)\n  updated_at     INTEGER NOT NULL,\n  write_nonce    TEXT,\n  PRIMARY KEY (event_id, discord_id),\n  CHECK ((character_name IS NULL) = (character_key IS NULL))\n)","signupSQL":"CREATE TABLE community_event_signups (               -- one effective answer per member and event\n  event_id       TEXT NOT NULL,\n  discord_id     TEXT NOT NULL,\n  status         TEXT NOT NULL CHECK (status IN ('yes', 'tentative', 'no')),\n  character_name TEXT CHECK (character_name IS NULL OR length(character_name) BETWEEN 2 AND 40),\n  character_key  TEXT,                                             -- communityKey(character_name)\n  raid_role      TEXT CHECK (raid_role IS NULL OR raid_role IN ('tank', 'healer', 'damage')),\n  revision       INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),\n  rsvp_starts_at INTEGER NOT NULL,                                 -- the start the member answered for (changedSinceRsvp)\n  updated_at     INTEGER NOT NULL,\n  write_nonce    TEXT, remind_mention INTEGER NOT NULL DEFAULT 0 CHECK (remind_mention IN (0, 1)), decision TEXT CHECK (decision IS NULL OR decision IN ('accepted', 'bench', 'declined')), decided_by TEXT, decided_at INTEGER, decision_revision INTEGER NOT NULL DEFAULT 0 CHECK (decision_revision >= 0),\n  PRIMARY KEY (event_id, discord_id),\n  CHECK ((character_name IS NULL) = (character_key IS NULL))\n)","reminderSQL":"CREATE TABLE community_event_reminders (\n  event_id TEXT PRIMARY KEY REFERENCES community_events(id) ON DELETE CASCADE,\n  event_revision INTEGER NOT NULL CHECK (event_revision >= 1),\n  starts_at INTEGER NOT NULL,\n  actor TEXT,\n  consent_version INTEGER,\n  guild_id TEXT NOT NULL,\n  channel_id TEXT NOT NULL,\n  host TEXT NOT NULL,\n  op_id TEXT NOT NULL CHECK (length(op_id) = 22),\n  claim_nonce TEXT,\n  state TEXT NOT NULL CHECK (state IN ('armed','claimed','posted','refused','unknown','cancelled','removed')),\n  message_id TEXT,\n  frozen_content TEXT CHECK (frozen_content IS NULL OR length(frozen_content) <= 1024),\n  cleanup_requested INTEGER NOT NULL DEFAULT 0 CHECK (cleanup_requested IN (0,1)),\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL,\n  last_attempt_at INTEGER NOT NULL DEFAULT 0,\n  retain_until INTEGER NOT NULL\n, consent_account_incarnation TEXT CHECK(consent_account_incarnation IS NULL OR (typeof(consent_account_incarnation)='text' AND length(consent_account_incarnation)=32 AND length(CAST(consent_account_incarnation AS BLOB))=32 AND instr(consent_account_incarnation,char(0))=0 AND consent_account_incarnation NOT GLOB '*[^0-9a-f]*')), mention_ids TEXT CHECK(mention_ids IS NULL OR (json_valid(mention_ids) AND json_type(mention_ids)='array')))"},{"sourceSignupSQL":"CREATE TABLE community_event_signups (\n     event_id       TEXT NOT NULL,\n     discord_id     TEXT NOT NULL,\n     status         TEXT NOT NULL CHECK (status IN ('yes', 'tentative', 'no')),\n     character_name TEXT CHECK (character_name IS NULL OR length(character_name) BETWEEN 2 AND 40),\n     character_key  TEXT,\n     raid_role      TEXT CHECK (raid_role IS NULL OR raid_role IN ('tank', 'healer', 'damage')),\n     revision       INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),\n     rsvp_starts_at INTEGER NOT NULL,\n     updated_at     INTEGER NOT NULL,\n     write_nonce    TEXT,\n     PRIMARY KEY (event_id, discord_id),\n     CHECK ((character_name IS NULL) = (character_key IS NULL))\n   )","signupSQL":"CREATE TABLE community_event_signups (\n     event_id       TEXT NOT NULL,\n     discord_id     TEXT NOT NULL,\n     status         TEXT NOT NULL CHECK (status IN ('yes', 'tentative', 'no')),\n     character_name TEXT CHECK (character_name IS NULL OR length(character_name) BETWEEN 2 AND 40),\n     character_key  TEXT,\n     raid_role      TEXT CHECK (raid_role IS NULL OR raid_role IN ('tank', 'healer', 'damage')),\n     revision       INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),\n     rsvp_starts_at INTEGER NOT NULL,\n     updated_at     INTEGER NOT NULL,\n     write_nonce    TEXT, remind_mention INTEGER NOT NULL DEFAULT 0 CHECK (remind_mention IN (0, 1)), decision TEXT CHECK (decision IS NULL OR decision IN ('accepted', 'bench', 'declined')), decided_by TEXT, decided_at INTEGER, decision_revision INTEGER NOT NULL DEFAULT 0 CHECK (decision_revision >= 0),\n     PRIMARY KEY (event_id, discord_id),\n     CHECK ((character_name IS NULL) = (character_key IS NULL))\n   )","reminderSQL":"CREATE TABLE community_event_reminders (\n  event_id TEXT PRIMARY KEY REFERENCES community_events(id) ON DELETE CASCADE,\n  event_revision INTEGER NOT NULL CHECK (event_revision >= 1),\n  starts_at INTEGER NOT NULL,\n  actor TEXT,\n  consent_version INTEGER,\n  guild_id TEXT NOT NULL,\n  channel_id TEXT NOT NULL,\n  host TEXT NOT NULL,\n  op_id TEXT NOT NULL CHECK (length(op_id) = 22),\n  claim_nonce TEXT,\n  state TEXT NOT NULL CHECK (state IN ('armed','claimed','posted','refused','unknown','cancelled','removed')),\n  message_id TEXT,\n  frozen_content TEXT CHECK (frozen_content IS NULL OR length(frozen_content) <= 1024),\n  cleanup_requested INTEGER NOT NULL DEFAULT 0 CHECK (cleanup_requested IN (0,1)),\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL,\n  last_attempt_at INTEGER NOT NULL DEFAULT 0,\n  retain_until INTEGER NOT NULL\n, consent_account_incarnation TEXT CHECK(consent_account_incarnation IS NULL OR (typeof(consent_account_incarnation)='text' AND length(consent_account_incarnation)=32 AND length(CAST(consent_account_incarnation AS BLOB))=32 AND instr(consent_account_incarnation,char(0))=0 AND consent_account_incarnation NOT GLOB '*[^0-9a-f]*')), mention_ids TEXT CHECK(mention_ids IS NULL OR (json_valid(mention_ids) AND json_type(mention_ids)='array')))"}].map(x=>Object.freeze(x)));
function wholeRaidUninitializedSQL(){return wholeRaidFields.map(([table,column,,value])=>`NOT EXISTS(SELECT 1 FROM ${wholeIdentifier(table)} WHERE ${value===null?`${wholeIdentifier(column)} IS NOT NULL`:`typeof(${wholeIdentifier(column)})<>'integer' OR ${wholeIdentifier(column)}<>0`})`).join(' AND ');}
function wholeClosedMigrationPlan(p,kind){
 const layout=wholeRaidTargetLayouts.find(x=>x.sourceSignupSQL===p.old.tables.find(t=>t.name==='community_event_signups')?.sql);
 if(!layout||p.target.tables.find(t=>t.name==='community_event_signups')?.sql!==layout.signupSQL||p.target.tables.find(t=>t.name==='community_event_reminders')?.sql!==layout.reminderSQL)throw Error('private whole exact raid table source held');
 const before=p.old.tables.map(t=>t.name),after=p.target.tables.map(t=>t.name);
 const changed=p.old.tables.filter(t=>p.target.tables.find(n=>n.name===t.name)?.sql!==t.sql).map(t=>t.name).sort();
 const allowed=[...new Set([...wholeFields.map(x=>x[0]),...wholeRaidFields.map(x=>x[0]),...(kind==='pre-marker'?['site_users','site_applications']:[])])].sort();
 const added=after.filter(name=>!before.includes(name)).sort(),removed=before.filter(name=>!after.includes(name));
 const additions=['qr_beta_fern_windows',...(kind==='pre-marker'?['privacy_rejection_decisions','privacy_rejection_expiry_control']:[])].sort();
 if(new Set(before).size!==before.length||new Set(after).size!==after.length||!wholeEqual(changed,allowed)||!wholeEqual(added,additions)||removed.length)throw Error('private whole closed changed-table set held');
 for(const [table,column,declaration] of wholeRaidFields){
  const old=p.old.tables.find(t=>t.name===table),target=p.target.tables.find(t=>t.name===table);
  if(!old||!target||old.columns.includes(column)||target.columns.filter(c=>c===column).length!==1||target.sql.split(declaration).length!==2)throw Error('private whole exact raid column source held');
 }
 for(const table of ['community_event_signups','community_event_reminders']){
  const old=p.old.tables.find(t=>t.name===table),target=p.target.tables.find(t=>t.name===table);
  const columns=[...old.columns,...wholeFields.filter(x=>x[0]===table).map(x=>x[1]),...wholeRaidFields.filter(x=>x[0]===table).map(x=>x[1])].sort();
  if(!wholeEqual(target.columns.slice().sort(),columns))throw Error('private whole exact raid column source held');
 }
}
function prepareWholeFixtureMigration(db,layout,kind,originalEpoch,nextEpoch){
 if(!wholeLower32(originalEpoch)||!wholeLower32(nextEpoch)||nextEpoch===originalEpoch||wholeAttempted.has(db))throw Error('private whole migration input held');wholeEnvironment(db);const p=wholeSource(layout,kind);wholeProfile(db,p.oldObjects);wholeClosedRow(db,originalEpoch);
 wholeClosedMigrationPlan(p,kind);
 // Rebuild only the two non-FK-parent site tables when the old profile lacks Native birth/rejection columns.
 // The seven referenced delayed stores are ALTERed in place; no parent DROP, cascade or renamed reference.
 if(kind==='pre-marker')for(const t of p.old.tables)for(const fk of wholeAll(db,`PRAGMA foreign_key_list(${wholeIdentifier(t.name)})`))if(['site_users','site_applications'].includes(fk.table))throw Error('private whole unexpected site foreign key held');
 const plan=[];const add=(sql,binds=[])=>plan.push(Object.freeze({sql,binds:Object.freeze(binds.slice())}));
 for(const t of p.old.triggers)add('DROP TRIGGER '+wholeIdentifier(t.name));
 if(kind==='pre-marker'){
  for(const name of ['site_users','site_applications']){
   const old=p.old.tables.find(t=>t.name===name),target=p.target.tables.find(t=>t.name===name),backup='cookie_original_'+name+'_v1',cols=old.columns.map(wholeIdentifier).join(',');
   if(/\bAUTOINCREMENT\b|\bWITHOUT\s+ROWID\b/i.test(old.sql)||old.columns.some(c=>['rowid','_rowid_','oid','__cookie_original_rowid'].includes(c.toLowerCase())))throw Error('private whole original site rowid shape held');
   add(`CREATE TABLE ${wholeIdentifier(backup)} AS SELECT _rowid_ AS __cookie_original_rowid,${cols} FROM ${wholeIdentifier(name)}`);
   add('DROP TABLE '+wholeIdentifier(name));add(target.sql);
   add(`INSERT INTO ${wholeIdentifier(name)}(_rowid_,${cols}) SELECT __cookie_original_rowid,${cols} FROM ${wholeIdentifier(backup)} ORDER BY __cookie_original_rowid`);
   add('DROP TABLE '+wholeIdentifier(backup));
  }
  for(const name of ['privacy_rejection_decisions','privacy_rejection_expiry_control'])add(p.target.tables.find(t=>t.name===name).sql);
  add("INSERT INTO privacy_rejection_expiry_control(singleton,protocol,observed_at,selected_count)VALUES(1,'original-guild-rejection-expiry-v1',0,0)");
 }
 add(p.target.tables.find(t=>t.name==='qr_beta_fern_windows').sql);
 for(const [table,column] of wholeFields){const declaration=privateWholeManifest.cookieMigrationColumnDeclarations?.[column];if(typeof declaration!=='string'||(column==='beta_window_id'?declaration!=="beta_window_id TEXT REFERENCES qr_beta_fern_windows(id)":!declaration.startsWith(column+' TEXT CHECK(')))throw Error('private whole nullable column source absent');add(`ALTER TABLE ${wholeIdentifier(table)} ADD COLUMN ${declaration}`);}
 for(const [table,,declaration] of wholeRaidFields)add(`ALTER TABLE ${wholeIdentifier(table)} ADD COLUMN ${declaration}`);
 for(const index of p.target.indexes){const old=p.old.indexes.find(i=>i.name===index.name),recreatedSite=kind==='pre-marker'&&['site_users','site_applications'].includes(index.tbl_name);if(!old||recreatedSite)add(index.sql);else if(!wholeEqual(old,index))throw Error('private whole unchanged index drift');}
 for(const t of p.target.triggers)add(t.sql);
 add("UPDATE privacy_write_admission SET epoch=? WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND epoch=? AND mode='closed' AND active=0 AND nonce='' AND purpose='' AND entry_changes=0 AND logical_changes=0",[nextEpoch,originalEpoch]);
 const originalData=wholeData(db,p.old),receipt=Object.freeze({layout,sourceKind:kind,originalEpoch,nextEpoch,statementCount:plan.length,sourceOnly:true});
 wholePreparations.set(receipt,{db,p,originalEpoch,nextEpoch,plan:Object.freeze(plan),originalData,spent:false});return receipt;
}
function inspectWholeFixtureMigrationPlan(receipt){const a=wholePreparations.get(receipt);if(!a||a.spent)throw Error('private whole preparation receipt held');return a.plan;}
function migrateWholeFixtureProfile(receipt){
 const a=wholePreparations.get(receipt);if(!a||a.spent||wholeAttempted.has(a.db))throw Error('private whole original preparation spent or foreign');a.spent=true;wholeAttempted.add(a.db);
 const {db,p,originalEpoch,nextEpoch}=a;wholeEnvironment(db);wholeProfile(db,p.oldObjects);wholeClosedRow(db,originalEpoch);if(!wholeEqual(wholeData(db,p.old),a.originalData))throw Error('private whole original data drift');
 wholeExec(db,'BEGIN IMMEDIATE');let committed=false;
 try{
  for(const entry of a.plan){if(entry.binds.length){const result=wholeRun(db,entry.sql,entry.binds);if(result.changes!==1)throw Error('private whole original epoch CAS held');}else wholeExec(db,entry.sql);}
  wholeProfile(db,p.targetObjects);wholeClosedRow(db,nextEpoch);
  if(!wholeEqual(wholeData(db,p.old),a.originalData))throw Error('private whole legacy values clocks rowids or sequence drift');
  for(const [table,column] of wholeFields)if(wholeAll(db,`SELECT COUNT(*) n FROM ${wholeIdentifier(table)} WHERE ${wholeIdentifier(column)} IS NOT NULL`)[0]?.n!==0)throw Error('private whole legacy delayed birth adopted');
  if(wholeAll(db,`SELECT CASE WHEN ${wholeRaidUninitializedSQL()} THEN 1 ELSE 0 END AS preserved`)[0]?.preserved!==1)throw Error('private whole legacy raid defaults adopted');
  const births=wholeAll(db,'SELECT discord_id,account_incarnation FROM site_users ORDER BY discord_id');
  if(births.some(r=>!wholeLower32(r.account_incarnation))||new Set(births.map(r=>r.account_incarnation)).size!==births.length)throw Error('private whole Native birth shape or collision held');
  if(p.kind==='pre-marker'){
   if(wholeAll(db,'SELECT COUNT(*) n FROM privacy_rejection_decisions')[0]?.n!==0||!wholeEqual(wholeAll(db,'SELECT singleton,protocol,observed_at,selected_count FROM privacy_rejection_expiry_control').map(r=>[r.singleton,r.protocol,r.observed_at,r.selected_count]),[[1,'original-guild-rejection-expiry-v1',0,0]]))throw Error('private whole historical rejection clock backfilled');
  }
  if(wholeAll(db,'PRAGMA foreign_keys')[0]?.foreign_keys!==1)throw Error('private whole foreign key enforcement drift');wholeExec(db,'COMMIT');committed=true;schemas.add(db);
  return Object.freeze({layout:p.layout,sourceKind:p.kind,originalEpoch,nextEpoch,closed:true,legacyValuesPreserved:true,legacyDelayedFieldsNull:true,nativeBirthsInitialized:p.kind==='pre-marker'?births.length:0,statementCount:a.plan.length,providerInstalled:false,providerDrainQualified:false,reopenQualified:false,erasureActivationQualified:false});
 }catch(e){
  // Known original Native transaction is rolled back even if an exposed method was changed. No retry.
  if(!committed&&Reflect.apply(wholeTransactionDescriptor.get,db,[]))wholeNativeDescriptors.exec.value.call(db,'ROLLBACK');throw e;
 }
}

module.exports=Object.freeze({installFixtureEpoch,migrateFixtureProfile,closeFixtureEpochForWholeMigration,prepareWholeFixtureMigration,inspectWholeFixtureMigrationPlan,migrateWholeFixtureProfile,manifest});
if(require.main===module){throw Error('REJECTION_PROVENANCE_INSTALL_HELD: private fixture export only');}
