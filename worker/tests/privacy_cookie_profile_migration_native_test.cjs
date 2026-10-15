// Genuine local Native migration of exact source profiles; no provider, app handler, token or reopened epoch.
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const installer=require('../scripts/install-rejection-provenance-epoch.cjs');
const T=1800000000,OLD='a'.repeat(32),NEXT='b'.repeat(32),G='c'.repeat(32),ACTOR='12345678901234567',TARGET='22345678901234567',EVENT='E'.repeat(22),OP='O'.repeat(22),JOB='d'.repeat(32);
let checks=0;const measures=[];
function eq(label,a,b){assert.deepEqual(a,b,label);checks++;console.log('PASS '+label);}
function yes(label,v){assert.ok(v,label);checks++;console.log('PASS '+label);}
function refusal(label,fn){assert.throws(fn,undefined,label);checks++;console.log('PASS '+label);}
const q=n=>'"'+n+'"',scalar=v=>typeof v==='bigint'?['integer',v.toString()]:v instanceof Uint8Array?['blob',Buffer.from(v).toString('hex')]:[typeof v,v];
function select(db,sql,values=[],big=false){const s=DatabaseSync.prototype.prepare.call(db,sql);if(big)s.setReadBigInts(true);return s.all(...values);}
function objects(db){return select(db,'SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').map(r=>[r.type,r.name,r.tbl_name,r.sql]);}
function data(db,p){return [...p.tables.map(t=>[t.name,select(db,`SELECT _rowid_ AS __r,${t.columns.map(q).join(',')} FROM ${q(t.name)} ORDER BY _rowid_`,[],true).map(r=>[scalar(r.__r),...t.columns.map(c=>scalar(r[c]))])]),['sqlite_sequence',select(db,'SELECT _rowid_ AS __r,name,seq FROM sqlite_sequence ORDER BY _rowid_',[],true).map(r=>[scalar(r.__r),scalar(r.name),scalar(r.seq)])]];}
function fixture(layout,kind,options={}){
 const db=new DatabaseSync(':memory:',{defensive:true,enableForeignKeyConstraints:true});
 const k=layout==='canonical'?'canonical':'recordedLive',source=installer.manifest.cookieMigrationSources[kind][k],p=source.profile;
 for(const table of p.tables)db.exec(table.sql);db.exec(p.slotSQL);for(const index of p.indexes)db.exec(index.sql);
 for(const object of source.objects)if(object[0]==='table'&&object[1]==='_cf_KV')db.exec(object[3]);
 if(kind==='public-predecessor')db.prepare("INSERT INTO privacy_write_admission(singleton,protocol,active,nonce,purpose,entry_changes,logical_changes)VALUES(1,'olympus-write-admission-experiment-1',0,'','',1,1)").run();
 else db.prepare("INSERT INTO privacy_write_admission(singleton,protocol,epoch,mode,active,nonce,purpose,entry_changes,logical_changes)VALUES(1,'olympus-write-admission-epoch-2',?,'serving',0,'','',0,0)").run(OLD);
 db.prepare('INSERT INTO site_users(_rowid_,discord_id,username,global_name,first_login,last_login,checked_at,session_version,denied,denied_reason,denied_at,denied_by)VALUES(91,?,?,?,?,?,?,?,?,?,?,?)').run(ACTOR,'original actor','old display',T-20,T-10,T+0.25,9007199254740993n,1,'original legacy decision',T-50,TARGET);
 db.prepare('INSERT INTO site_users(_rowid_,discord_id,username,first_login,last_login)VALUES(117,?,?,?,?)').run(TARGET,'original target',T-30,T-15);
 db.prepare("INSERT INTO site_applications(_rowid_,discord_id,position,answers,status,created_at,updated_at)VALUES(29,?,'member','{\"original\":true}','declined',?,?)").run(ACTOR,T-60,T-40);
 db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('migrationOriginalBlob',?,?)").run(new Uint8Array([0,255,1,0,128]),T-90);
 db.prepare("INSERT INTO audit(id,ts,actor,action,subject,details)VALUES(21,?,'fixture','migration_original',?,?)").run(T-100,ACTOR,'{"original":true}');
 // A deleted high AUTOINCREMENT row leaves a sequence above the remaining maximum; migration must retain it.
 db.prepare("INSERT INTO audit(id,ts,actor,action)VALUES(1000,?,'fixture','deleted')").run(T-1);db.prepare('DELETE FROM audit WHERE id=1000').run();
 db.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?,?,'active',9,?,?)").run(ACTOR,G,T-70,T-65);
 db.prepare("INSERT INTO community_events(id,op_id,title,starts_at,duration_min,ends_at,created_at,updated_at,retain_until)VALUES(?,?,'Original event',?,60,?,?,?,?)").run(EVENT,OP,T+4000,T+7600,T-300,T-200,T+7600+2592000);
 for(const [rowid,member,status,name,key,role,revision] of [[211,TARGET,'yes','Originalname','originalname','tank',7],[212,ACTOR,'tentative',null,null,'healer',3],[213,'32345678901234567','no',null,null,null,2]])db.prepare("INSERT INTO community_event_signups(_rowid_,event_id,discord_id,status,character_name,character_key,raid_role,revision,rsvp_starts_at,updated_at,write_nonce)VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(rowid,EVENT,member,status,name,key,role,revision,T+4000,T-210,'S'.repeat(22));
 db.prepare("INSERT INTO community_event_deliveries(event_id,purpose,event_revision,starts_at,guild_id,channel_id,message_id,op_id,claim_nonce,state,actor,session_version,session_expires,created_at,updated_at,retain_until)VALUES(?,'publication',1,?,'guild','channel','old-message',?,?,'unknown',?,1,?,?,?,?)").run(EVENT,T+4000,OP,OP,ACTOR,T+600,T-300,T-200,T+9000);
 db.prepare("INSERT INTO community_event_reminders(event_id,event_revision,starts_at,actor,consent_version,guild_id,channel_id,host,op_id,state,created_at,updated_at,last_attempt_at,retain_until)VALUES(?,1,?,?,1,'guild','channel','original.invalid',?,'armed',?,?,?,?)").run(EVENT,T+4000,ACTOR,OP,T-300,T-200,T-180,T+9000);
 db.prepare('INSERT INTO councillor_keys(id,signer,signer_guid,public_key,subject_generation,roster_id,created_at,expires_at)VALUES(?,?,?,?,?,1,?,?)').run('old-key',ACTOR,'Player-original','original-public-key',G,T-300,T+600);
 db.prepare("INSERT INTO councillor_challenges(nonce,key_id,signer,session_version,session_expires,created_at,expires_at,mode,max_proofs)VALUES('old-challenge','old-key',?,1,?,?,?,'single',1)").run(ACTOR,T+600,T-280,T+20);
 db.prepare("INSERT INTO verification_requests(code,requester,subject_generation,created_at,expires_at,state,session_version,session_expires)VALUES('old-code',?,?,?,?,'proved',1,?)").run(TARGET,G,T-260,T+600,T+600);
 db.prepare("INSERT INTO verification_proofs(id,code,challenge,signer,key_id,requester,requester_guid,requester_name,native_rank,rank_name,native_profile,signer_guid,snapshot_id,subject_generation,digest,created_at,expires_at)VALUES('old-proof','old-code','old-challenge',?,'old-key',?,'Player-target','Original target',1,'Officer','original-profile','Player-original',1,?,'original-digest',?,?)").run(ACTOR,TARGET,G,T-250,T+600);
 db.prepare("INSERT INTO privacy_serving_jobs(operation_id,subject_id,subject_generation,request_digest,original_session_version,original_session_expires,state,created_at,retain_until)VALUES(?,?,?, ?,1,?,'held',?,?)").run(JOB,ACTOR,G,'e'.repeat(64),T+600,T-120,T-120+31622400);
 db.prepare("INSERT INTO ruleset_publications(guild_id,publication_id,target_key,selection_revision,profile_revision,plan_hash,actor,actor_generation,session_version,session_expires,stage,state,created_at,updated_at,actor_retain_until)VALUES('guild','original-publication','guide',2,'original-profile','original-plan',?,?,1,?,'create','unknown',?,?,?)").run(ACTOR,G,T+600,T-100,T-90,T+9000);
 if(kind==='marker'){
  const birth=db.prepare('SELECT account_incarnation FROM site_users WHERE discord_id=?').get(ACTOR).account_incarnation;
  db.prepare("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',?,2)").run(T-40);
  db.prepare("INSERT INTO privacy_rejection_decisions(decision_id,subject_key,target_account_incarnation,target_generation,protocol,source,scope,rejected_at,retain_until)VALUES(?,?,?,?, 'original-guild-membership-rejection-v1','explicit_membership_deny','pure_member_including_fallback1',?,?)").run('f'.repeat(32),'A'.repeat(43),birth,G,T-50,T-50+31536000);
  for(const table of ['site_users','site_applications'])db.prepare(`UPDATE ${table} SET rejection_event_id=?,rejection_subject_key=?,rejection_scope='pure_member_including_fallback1' WHERE discord_id=?`).run('f'.repeat(32),'A'.repeat(43),ACTOR);
 }
 if(options.large){const insert=db.prepare('INSERT INTO site_users(_rowid_,discord_id,username,first_login,last_login)VALUES(?,?,?,?,?)');for(let i=0;i<1050;i++)insert.run(1000+i,String(32345678901234567n+BigInt(i)),('original page '+i+' ').padEnd(4096,'x'),T-i,T-i+1);}
 for(const trigger of p.triggers)db.exec(trigger.sql);
 if(options.collision)db.function('randomblob',n=>new Uint8Array(n).fill(7));
 eq(layout+' '+kind+' genuine original whole schema',objects(db),source.objects);
 eq(layout+' '+kind+' original FK graph valid',select(db,'PRAGMA foreign_key_check'),[]);
 return {db,p,layout,kind,k,oldObjects:objects(db),oldData:data(db,p)};
}
function prepare(f){installer.closeFixtureEpochForWholeMigration(f.db,f.layout,f.kind,OLD);return installer.prepareWholeFixtureMigration(f.db,f.layout,f.kind,OLD,NEXT);}
function main(){
for(const layout of ['canonical','recorded-live-20261010'])for(const kind of ['pre-marker','marker']){
 const f=fixture(layout,kind),receipt=prepare(f),plan=installer.inspectWholeFixtureMigrationPlan(receipt),births=kind==='marker'?select(f.db,'SELECT discord_id,account_incarnation FROM site_users ORDER BY discord_id'):null;
 const raidDeclarations=[["community_event_signups","remind_mention","remind_mention INTEGER NOT NULL DEFAULT 0 CHECK (remind_mention IN (0, 1))",0],["community_event_signups","decision","decision TEXT CHECK (decision IS NULL OR decision IN ('accepted', 'bench', 'declined'))",null],["community_event_signups","decided_by","decided_by TEXT",null],["community_event_signups","decided_at","decided_at INTEGER",null],["community_event_signups","decision_revision","decision_revision INTEGER NOT NULL DEFAULT 0 CHECK (decision_revision >= 0)",0],["community_event_reminders","mention_ids","mention_ids TEXT CHECK(mention_ids IS NULL OR (json_valid(mention_ids) AND json_type(mention_ids)='array'))",null]];
 const alters=plan.filter(x=>x.sql.startsWith('ALTER TABLE '));
 const originalAlters=[...installer.manifest.cookieIncarnationFields,...installer.manifest.betaWindowMigrationFields].map(({table,column})=>'ALTER TABLE '+q(table)+' ADD COLUMN '+installer.manifest.cookieMigrationColumnDeclarations[column]);
 eq(layout+' '+kind+' exactly eleven original in-place nullable ALTERs retained in order',alters.slice(0,11).map(x=>x.sql),originalAlters);
 eq(layout+' '+kind+' exactly six reviewed raid ALTERs appended in order',alters.slice(11).map(x=>x.sql),raidDeclarations.map(([table,,declaration])=>'ALTER TABLE '+q(table)+' ADD COLUMN '+declaration));
 eq(layout+' '+kind+' seventeen exact ALTERs with no bindings',[alters.length,alters.every(x=>x.binds.length===0)],[17,true]);
 yes(layout+' '+kind+' no FK-off temporary rename or provider transaction plan',plan.every(x=>!/^PRAGMA|\bTEMP\b|\bRENAME\b|^(?:BEGIN|COMMIT|ROLLBACK)\b/i.test(x.sql)));
 let result;try{result=installer.migrateWholeFixtureProfile(receipt);}catch(error){
  const d=error&&typeof error==='object'?Object.getOwnPropertyDescriptor(error,'schemaMismatchDiff'):undefined;
  if(d&&Object.hasOwn(d,'value'))console.error('ORIGINAL_SCHEMA_MISMATCH '+JSON.stringify(d.value));
  throw error; // Same original failure: no catch-and-pass, normalization or retry.
 }
 eq(layout+' '+kind+' all original values types rowids sequences and clocks retained',data(f.db,f.p),f.oldData);
 eq(layout+' '+kind+' exact complete target schema',objects(f.db),installer.manifest[f.k+'Objects']);
 eq(layout+' '+kind+' old signup gains only zero consent/revision and NULL decision metadata',select(f.db,'SELECT remind_mention,typeof(remind_mention) consent_type,decision,decided_by,decided_at,decision_revision,typeof(decision_revision) revision_type FROM community_event_signups').map(r=>[r.remind_mention,r.consent_type,r.decision,r.decided_by,r.decided_at,r.decision_revision,r.revision_type]),[[0,'integer',null,null,null,0,'integer'],[0,'integer',null,null,null,0,'integer'],[0,'integer',null,null,null,0,'integer']]);
 eq(layout+' '+kind+' old reminder gains NULL mention vector',select(f.db,'SELECT mention_ids,typeof(mention_ids) kind FROM community_event_reminders').map(r=>[r.mention_ids,r.kind]),[[null,'null']]);
 eq(layout+' '+kind+' original QR proof and event children retained',[select(f.db,'SELECT COUNT(*) n FROM verification_proofs')[0].n,select(f.db,'SELECT COUNT(*) n FROM community_event_deliveries')[0].n,select(f.db,'SELECT COUNT(*) n FROM community_event_reminders')[0].n],[1,1,1]);
 for(const field of [...installer.manifest.cookieIncarnationFields,...installer.manifest.betaWindowMigrationFields])eq(layout+' '+kind+' legacy '+field.table+' birth remains NULL',select(f.db,`SELECT ${q(field.column)} AS n FROM ${q(field.table)}`).map(r=>r.n),[null]);
 if(kind==='marker')eq(layout+' '+kind+' existing Native birth identities retained',select(f.db,'SELECT discord_id,account_incarnation FROM site_users ORDER BY discord_id'),births);
 else {const n=select(f.db,'SELECT account_incarnation n FROM site_users').map(r=>r.n);yes(layout+' absent old birth uses two distinct Native defaults',n.length===2&&new Set(n).size===2&&n.every(x=>typeof x==='string'&&x.length===32&&[...x].every(c=>'0123456789abcdef'.includes(c))));eq(layout+' old denial does not invent historical rejection events',select(f.db,'SELECT COUNT(*) n FROM privacy_rejection_decisions')[0].n,0);}
 eq(layout+' '+kind+' foreign keys remain enabled and valid',[select(f.db,'PRAGMA foreign_keys')[0].foreign_keys,select(f.db,'PRAGMA foreign_key_check')],[1,[]]);
 eq(layout+' '+kind+' new epoch remains closed',select(f.db,'SELECT epoch,mode,active,nonce,purpose FROM privacy_write_admission').map(r=>[r.epoch,r.mode,r.active,r.nonce,r.purpose]),[[NEXT,'closed',0,'','']]);
 eq(layout+' '+kind+' local result grants no provider drain reopen or activation',[result.providerInstalled,result.providerDrainQualified,result.reopenQualified,result.erasureActivationQualified],[false,false,false,false]);
 refusal(layout+' '+kind+' same original preparation cannot replay',()=>installer.migrateWholeFixtureProfile(receipt));
 refusal(layout+' '+kind+' generic shaped preparation cannot migrate',()=>installer.migrateWholeFixtureProfile({...receipt}));
 refusal(layout+' '+kind+' ordinary fixture install cannot reopen migration',()=>installer.installFixtureEpoch(f.db,layout,NEXT));
 measures.push({layout,sourceKind:kind,statementCount:result.statementCount,nativeBirthsInitialized:result.nativeBirthsInitialized,closed:result.closed,providerInstalled:false,providerDrainQualified:false,reopenQualified:false,erasureActivationQualified:false});f.db.close();
}
for(const layout of ['canonical','recorded-live-20261010']){
 const f=fixture(layout,'pre-marker',{collision:true}),receipt=prepare(f),before=objects(f.db),d=data(f.db,f.p);
 refusal(layout+' Native birth collision rolls back original whole migration',()=>installer.migrateWholeFixtureProfile(receipt));eq(layout+' failed migration preserves all original schema',objects(f.db),before);eq(layout+' failed migration preserves all original data',data(f.db,f.p),d);eq(layout+' failed migration leaves foreign keys ON',select(f.db,'PRAGMA foreign_keys')[0].foreign_keys,1);refusal(layout+' failed original cannot retry',()=>installer.migrateWholeFixtureProfile(receipt));f.db.close();
 const x=fixture(layout,'marker');x.db.exec('CREATE TABLE unexpected_migration_input(id INTEGER)');const schema=objects(x.db),extraOldData=data(x.db,x.p);refusal(layout+' extra original schema holds before close',()=>installer.closeFixtureEpochForWholeMigration(x.db,layout,'marker',OLD));eq(layout+' extra schema refusal leaves original schema/data', [objects(x.db),data(x.db,x.p)],[schema,extraOldData]);x.db.close();
 const h=fixture(layout,'marker');let calls=0;Object.defineProperty(h.db,'prepare',{configurable:true,get(){calls++;throw Error('shadow getter must not execute');}});refusal(layout+' shadowed original Native prepare refused without getter',()=>installer.closeFixtureEpochForWholeMigration(h.db,layout,'marker',OLD));eq(layout+' original Native prepare getter never reached',calls,0);delete h.db.prepare;h.db.close();
 // Each case uses real Native handles; fake accessors are never used as a transaction-state oracle.
 {const z=fixture(layout,'marker'),d=Object.getOwnPropertyDescriptor(z.db,'isTransaction');
  eq(layout+' genuine OWN transaction accessor has exact native attributes',[typeof d.get,d.set,d.enumerable,d.configurable,Object.hasOwn(d,'value'),Object.hasOwn(d,'writable')],['function',undefined,true,false,false,false]);
  eq(layout+' transaction getter absent on native prototype',Object.getOwnPropertyDescriptor(DatabaseSync.prototype,'isTransaction'),undefined);
  const nativeProbe=new DatabaseSync(':memory:',{defensive:true,enableForeignKeyConstraints:true}),g=Object.getOwnPropertyDescriptor(nativeProbe,'isTransaction').get;nativeProbe.close();
  eq(layout+' closed-probe and original-instance getter identity',g,d.get);eq(layout+' closed-probe intrinsic on genuine target outside transaction',Reflect.apply(g,z.db,[]),false);
  DatabaseSync.prototype.exec.call(z.db,'BEGIN IMMEDIATE');eq(layout+' genuine intrinsic observes original native transaction',Reflect.apply(g,z.db,[]),true);DatabaseSync.prototype.exec.call(z.db,'ROLLBACK');eq(layout+' genuine intrinsic observes original rollback',Reflect.apply(g,z.db,[]),false);
  let replacements=0;refusal(layout+' native OWN transaction descriptor cannot be substituted',()=>Object.defineProperty(z.db,'isTransaction',{get(){replacements++;return false;}}));eq(layout+' refused native OWN substitution getter0',replacements,0);
  installer.closeFixtureEpochForWholeMigration(z.db,layout,'marker',OLD);eq(layout+' genuine original OWN accessor admits actual close',select(z.db,'SELECT mode FROM privacy_write_admission').map(r=>r.mode),['closed']);z.db.close();}
 {const z=fixture(layout,'marker'),fake=Object.create(DatabaseSync.prototype),d=Object.getOwnPropertyDescriptor(z.db,'isTransaction');Object.defineProperty(fake,'isTransaction',d);
  refusal(layout+' copied genuine OWN descriptor cannot manufacture Native receiver',()=>installer.closeFixtureEpochForWholeMigration(fake,layout,'marker',OLD));
  eq(layout+' forged native receiver leaves actual target state unchanged',select(z.db,'SELECT mode FROM privacy_write_admission').map(r=>r.mode),['serving']);z.db.close();}
 {const fake=Object.create(DatabaseSync.prototype);let getters=0;Object.defineProperty(fake,'isTransaction',{get(){getters++;return false;},set:undefined,enumerable:true,configurable:false});
  refusal(layout+' caller OWN transaction getter refused before invocation',()=>installer.closeFixtureEpochForWholeMigration(fake,layout,'marker',OLD));eq(layout+' forged OWN transaction getter0',getters,0);}
 {const z=fixture(layout,'marker');let reads=0;const proxy=new Proxy(z.db,{get(target,key,receiver){reads++;return Reflect.get(target,key,receiver);}});
  refusal(layout+' Native Proxy cannot borrow original transaction brand',()=>installer.closeFixtureEpochForWholeMigration(proxy,layout,'marker',OLD));eq(layout+' Native Proxy property getters never read',reads,0);
  eq(layout+' refused Proxy leaves actual target state unchanged',select(z.db,'SELECT mode FROM privacy_write_admission').map(r=>r.mode),['serving']);z.db.close();}
 {const z=fixture(layout,'marker');let getters=0;Object.defineProperty(DatabaseSync.prototype,'isTransaction',{get(){getters++;throw Error('prototype accessor forbidden');},configurable:true});
  try{refusal(layout+' new prototype transaction accessor refused despite original OWN slot',()=>installer.closeFixtureEpochForWholeMigration(z.db,layout,'marker',OLD));eq(layout+' prototype transaction accessor getter0',getters,0);}
  finally{delete DatabaseSync.prototype.isTransaction;}
  eq(layout+' refused prototype drift leaves target state unchanged',select(z.db,'SELECT mode FROM privacy_write_admission').map(r=>r.mode),['serving']);z.db.close();}
 {const z=fixture(layout,'marker');Object.setPrototypeOf(z.db,Object.prototype);try{refusal(layout+' original Native prototype replacement held',()=>installer.closeFixtureEpochForWholeMigration(z.db,layout,'marker',OLD));}finally{Object.setPrototypeOf(z.db,DatabaseSync.prototype);}
  eq(layout+' restored prototype retains original Native OWN descriptor',typeof Object.getOwnPropertyDescriptor(z.db,'isTransaction').get,'function');eq(layout+' prototype replacement never closes target',select(z.db,'SELECT mode FROM privacy_write_admission').map(r=>r.mode),['serving']);z.db.close();}
 const busy=fixture(layout,'marker');busy.db.prepare("UPDATE privacy_write_admission SET active=1,nonce=?,purpose='writer',entry_changes=1 WHERE singleton=1").run('1'.repeat(32));refusal(layout+' unresolved active writer cannot close or migrate',()=>installer.closeFixtureEpochForWholeMigration(busy.db,layout,'marker',OLD));eq(layout+' busy original writer remains unchanged',select(busy.db,'SELECT active,nonce,purpose,entry_changes FROM privacy_write_admission').map(r=>[r.active,r.nonce,r.purpose,r.entry_changes]),[[1,'1'.repeat(32),'writer',1]]);busy.db.close();
 const old=fixture(layout,'pre-marker');refusal(layout+' historical two-table migration remains separately held',()=>installer.migrateFixtureProfile(old.db,layout));eq(layout+' old held installer retains exact schema and values',[objects(old.db),data(old.db,old.p)],[old.oldObjects,old.oldData]);old.db.close();
}
console.log('MEASURED_COOKIE_PROFILE_MIGRATION '+JSON.stringify({cases:measures,providerActions:0,providerInstalled:false,reopenQualified:false,erasureActivationQualified:false}));
console.log(`cookie profile migration native: ${checks}/${checks} passed`);
}
module.exports=Object.freeze({fixture,data,objects,select,checks:()=>checks});
if(require.main===module)main();
