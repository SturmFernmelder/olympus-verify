// Actual candidate policy and consuming SQL against native SQLite, with a fixed database clock.
// No provider access, no private inputs, no arming endpoint or application-source rewrites.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');
const root=path.join(__dirname,'..'),mod={exports:{}};
const code=ts.transpileModule(fs.readFileSync(path.join(root,'src/beta-reset-policy.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('module','exports','require',code)(mod,mod.exports,()=>{throw Error('policy external import refused');});
const p=mod.exports,ADMIN='700000000000000001',APP='700000000000000002',MODERATOR='571363393555136512';
let passed=0;
function check(name,value){assert.ok(value,name);passed++;console.log('PASS '+name);}
globalThis.fetch=async()=>{throw Error('provider access forbidden');};
function fixture(flag='true'){
 const db=new DatabaseSync(':memory:');let at=p.BETA_RESET_CUTOFF-1,reads=0,beforeRead=null;
 db.function('strftime',(format,clock)=>{assert.equal(format,'%s');assert.equal(clock,'now');return String(at);});
 db.exec(fs.readFileSync(path.join(root,'schema.sql'),'utf8'));
 const port={prepare(sql){return {bind(...values){return {async first(){reads++;if(beforeRead)await beforeRead();return db.prepare(sql).get(...values)??null;}};}};}};
 const env={DB:port,GUILD_ID:p.BETA_RESET_GUILD_ID,DISCORD_APP_ID:APP,SITE_ADMINS:ADMIN,
  ROLE_GUILD_MEMBER:p.BETA_RESET_ROLE_IDS[0],ROLE_GUILD_LEADER:'1554261979684933742',ROLE_OFFICER:'1554262223038324840',ROLE_RAID_LEADER:'1554262510650007602',ROLE_GUILD_MASTER:'',ROLE_MODERATOR:MODERATOR,
  QR_NATIVE_ROLE_MAP:JSON.stringify({profile:'beta-five',roles:[p.BETA_RESET_ROLE_IDS[2],p.BETA_RESET_ROLE_IDS[4],p.BETA_RESET_ROLE_IDS[7],p.BETA_RESET_ROLE_IDS[9],p.BETA_RESET_ROLE_IDS[11]]})};
 if(flag!==undefined)env.BETA_RESET_REMOVALS_ENABLED=flag;
 const policy={version:2,epoch:p.BETA_RESET_EPOCH,cutoff:p.BETA_RESET_CUTOFF,guildId:p.BETA_RESET_GUILD_ID,roleIds:[...p.BETA_RESET_ROLE_IDS],armedAt:p.BETA_RESET_CUTOFF-86400};
 const save=(raw=JSON.stringify(policy))=>db.prepare('INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(p.BETA_RESET_POLICY_KEY,raw,at,ADMIN);
 const capture=(guild=p.BETA_RESET_GUILD_ID,role=p.BETA_RESET_ROLE_IDS[0])=>p.captureBetaGrant(env,guild,role);
 const sql=(capture,start=1)=>{const guard=p.betaGrantSql(capture,start),prefix=Array.from({length:start-1},(_,i)=>'?'+(i+1)+' AS prefix'+i).join(',');return db.prepare('SELECT '+(prefix?prefix+',':'')+'CASE WHEN '+guard.sql+' THEN 1 ELSE 0 END AS allowed').get(...Array(start-1).fill('bound-prefix'),...guard.values).allowed===1;};
 const resetSql=(capture,start=1)=>{const guard=p.betaResetSql(capture,start),prefix=Array.from({length:start-1},(_,i)=>'?'+(i+1)+' AS prefix'+i).join(',');return db.prepare('SELECT '+(prefix?prefix+',':'')+'CASE WHEN '+guard.sql+' THEN 1 ELSE 0 END AS allowed').get(...Array(start-1).fill('bound-prefix'),...guard.values).allowed===1;};
 return {db,env,policy,save,capture,sql,resetSql,get reads(){return reads;},set time(value){at=value;},set beforeRead(value){beforeRead=value;}};
}
(async()=>{
 check('exact owner cutoff and twelve-role scope',p.BETA_RESET_CUTOFF===1792688400&&p.BETA_RESET_ROLE_IDS.length===12&&new Set(p.BETA_RESET_ROLE_IDS).size===12);
 check('leadership and server moderator IDs excluded',[MODERATOR,'1554261979684933742','1554262223038324840','1554262510650007602'].every(id=>!p.BETA_RESET_ROLE_IDS.includes(id)));
 for(const flag of [undefined,'false']){
  const f=fixture();if(flag===undefined)delete f.env.BETA_RESET_REMOVALS_ENABLED;else f.env.BETA_RESET_REMOVALS_ENABLED=flag;
  const c=await f.capture();check('inactive removal '+String(flag)+' still checks source grant epoch',!p.resetGuardEnabled(f.env)&&c.mode==='open'&&c.reason==='beta_source_epoch_open'&&await p.betaGrantCurrent(f.env,c)&&f.reads===2&&f.sql(c));
  f.env.BETA_RESET_REMOVALS_ENABLED='true';check('original capture cannot survive activation change '+String(flag),!await p.betaGrantCurrent(f.env,c)&&!f.sql(c));
 }
 for(const flag of ['',true,'TRUE','0',null]){const f=fixture(flag),c=await f.capture();check('malformed flag held before schema '+String(flag),!p.resetGuardEnabled(f.env)&&c.mode==='held'&&!f.sql(c)&&f.reads===0);}
 {const inactive=fixture('false');Object.defineProperty(inactive.env,'DB',{get(){throw Error('database accessor must not execute');}});check('inactive removal still refuses malformed target DB configuration',(await inactive.capture()).mode==='held'&&inactive.reads===0);}
 let f=fixture('invalid');
 for(const [guild,role] of [[p.BETA_RESET_GUILD_ID,MODERATOR],['700000000000000099',p.BETA_RESET_ROLE_IDS[0]],[p.BETA_RESET_GUILD_ID,'1554262223038324840']]){const c=await f.capture(guild,role);check('unrelated tuple stays outside guard '+guild+'/'+role,c.mode==='off'&&await p.betaGrantCurrent(f.env,c)&&f.sql(c)&&f.reads===0);}
 f=fixture();let c=await f.capture();check('missing policy admits grants only inside source epoch',c.mode==='open'&&c.raw===null&&await p.betaGrantCurrent(f.env,c)&&f.sql(c)&&f.sql(c,98));
 f.save();check('arming invalidates original absence capture',!await p.betaGrantCurrent(f.env,c)&&!f.sql(c));
 c=await f.capture();check('fresh valid pre-cutoff capture opens',c.mode==='open'&&Object.isFrozen(c)&&await p.betaGrantCurrent(f.env,c)&&f.sql(c)&&f.sql(c,4));
 for(const role of p.BETA_RESET_ROLE_IDS){const target=await f.capture(p.BETA_RESET_GUILD_ID,role);check('all twelve approved target IDs guarded '+role,target.mode==='open');}
 const compiled=p.betaGrantSql(c,1);f.time=p.BETA_RESET_CUTOFF;
 check('exact database cutoff closes existing capture and compiled SQL',!await p.betaGrantCurrent(f.env,c)&&!f.sql(c)&&f.db.prepare('SELECT CASE WHEN '+compiled.sql+' THEN 1 ELSE 0 END AS allowed').get(...compiled.values).allowed===0);
 check('fresh capture at exact cutoff is held',(await f.capture()).mode==='held');f.time=p.BETA_RESET_CUTOFF+1;check('post-cutoff stays held',(await f.capture()).reason==='beta_cutoff_reached');
 f=fixture();f.save();c=await f.capture();f.time=f.policy.armedAt-1;check('database clock before original arming invalidates capture and SQL',!await p.betaGrantCurrent(f.env,c)&&!f.sql(c)&&(await f.capture()).reason==='beta_policy_not_yet_armed');f.time=f.policy.armedAt;check('exact arming time admits fresh capture',(await f.capture()).mode==='open');
 f=fixture();f.save();c=await f.capture();f.db.prepare('DELETE FROM site_settings WHERE key=?').run(p.BETA_RESET_POLICY_KEY);
 check('deletion invalidates original armed capture',!await p.betaGrantCurrent(f.env,c)&&!f.sql(c)&&(await f.capture()).reason==='beta_source_epoch_open');
 f.save();c=await f.capture();f.save(JSON.stringify(f.policy,null,2));check('even semantically equal raw replacement invalidates original',!await p.betaGrantCurrent(f.env,c)&&!f.sql(c));
 const malformed=[null,[],{},'bad-json',{...f.policy,extra:true},{...f.policy,version:1},{...f.policy,epoch:'other'},{...f.policy,cutoff:p.BETA_RESET_CUTOFF+1},{...f.policy,guildId:'700000000000000099'},
 {...f.policy,roleIds:[...f.policy.roleIds].reverse()},{...f.policy,roleIds:f.policy.roleIds.slice(1)},{...f.policy,roleIds:[...f.policy.roleIds.slice(0,-1),MODERATOR]},
 {...f.policy,armedBy:'700000000000000099'},{...f.policy,armedBy:ADMIN+' '},{...f.policy,armedAt:0},{...f.policy,armedAt:1.5},{...f.policy,armedAt:p.BETA_RESET_CUTOFF+1}];
 for(const [i,bad] of malformed.entries()){f=fixture();const raw=bad==='bad-json'?'{bad':JSON.stringify(bad);f.save(raw);c=await f.capture();check('invalid policy '+i+' never becomes inactive',p.parseBetaResetPolicy(raw,f.env)===null&&c.mode==='held'&&!f.sql(c));}
 f=fixture();const good=JSON.stringify(f.policy);
 for(const duplicate of [good.replace('{','{"version":0,'),good.replace('{','{"\\u0076ersion":0,')]){f.save(duplicate);check('duplicate JSON field refused',p.parseBetaResetPolicy(duplicate,f.env)===null&&(await f.capture()).mode==='held');}
 const changes=[['GUILD_ID','700000000000000099'],['DISCORD_APP_ID','invalid'],['ROLE_GUILD_MEMBER',MODERATOR],['ROLE_MODERATOR',p.BETA_RESET_ROLE_IDS[0]],
 ['QR_NATIVE_ROLE_MAP','{bad'],['QR_NATIVE_ROLE_MAP',JSON.stringify({profile:'beta-five',roles:Array(5).fill(p.BETA_RESET_ROLE_IDS[2])})]];
 for(const [key,bad] of changes){f=fixture();f.save();c=await f.capture();f.env[key]=bad;check('changed original configuration '+key+' holds',!await p.betaGrantCurrent(f.env,c)&&!f.sql(c)&&(await f.capture()).mode==='held');}
 f=fixture();f.save();c=await f.capture();f.env.SITE_ADMINS='700000000000000099';check('changed operator list invalidates original capture but fresh policy has no actor dependency',!await p.betaGrantCurrent(f.env,c)&&!f.sql(c)&&(await f.capture()).mode==='open');
 f=fixture();f.env.QR_NATIVE_ROLE_MAP='';f.env.ROLE_GUILD_MEMBER='';f.save();check('empty optional membership/map bindings do not enlarge fixed scope',(await f.capture()).mode==='open');
 f=fixture();f.env.QR_NATIVE_ROLE_MAP=JSON.stringify({profile:'ten-rank',roles:p.BETA_RESET_ROLE_IDS.slice(2)});f.save();check('complete approved ten-rank map accepted',(await f.capture()).mode==='open');
 f=fixture();f.save();c=await f.capture();const forged={...c};check('forged capture refused by current and SQL',!await p.betaGrantCurrent(f.env,forged)&&!f.sql(forged));
 check('invalid SQL parameter offsets fail closed',[0,-1,1.5,99,NaN].every(start=>p.betaGrantSql(c,start).sql==='0=1'));
 f.env.DB={...f.env.DB};check('database receiver replacement invalidates capture',!await p.betaGrantCurrent(f.env,c)&&!f.sql(c));
 f=fixture();f.save();c=await f.capture();f.env.DB.prepare=()=>{throw Error('replaced prepare must not run');};check('database method replacement invalidates capture',!await p.betaGrantCurrent(f.env,c)&&!f.sql(c));
 f=fixture();f.save();f.beforeRead=()=>{f.env.SITE_ADMINS='700000000000000099';};check('configuration change during database await is held',(await f.capture()).mode==='held');
 f=fixture();let invoked=0;Object.defineProperty(f.env,'BETA_RESET_REMOVALS_ENABLED',{get(){invoked++;return 'true';}});check('flag accessors refused before schema without invocation',!p.resetGuardEnabled(f.env)&&(await f.capture()).mode==='held'&&invoked===0&&f.reads===0);
 f=fixture();f.save();f.time=0;check('invalid database time is held',(await f.capture()).mode==='held');
 // The removal side needs a genuine fresh cutoff capture and the same immutable row/configuration.
 f=fixture();f.save();c=await f.capture();let before=f.reads;
 check('grant capture cannot mint removal authority',!await p.betaResetCurrent(f.env,c)&&!f.resetSql(c)&&f.reads===before);
 f.time=p.BETA_RESET_CUTOFF;check('old open capture cannot upgrade at cutoff',!await p.betaResetCurrent(f.env,c)&&!f.resetSql(c)&&f.reads===before);
 c=await f.capture();before=f.reads;
 check('fresh exact-cutoff capture permits removal policy',c.reason==='beta_cutoff_reached'&&await p.betaResetCurrent(f.env,c)&&f.resetSql(c)&&f.resetSql(c,4)&&f.resetSql(c,98));
 check('removal currentness uses one physical read; SQL composition uses none',f.reads-before===1&&p.betaResetSql(c,1).values.length===3);
 check('removal capture still cannot authorize grants',!await p.betaGrantCurrent(f.env,c)&&!f.sql(c));
 const removalCompiled=p.betaResetSql(c,1);f.time=p.BETA_RESET_CUTOFF-1;
 check('clock rollback closes removal capture and compiled SQL',!await p.betaResetCurrent(f.env,c)&&!f.resetSql(c)&&f.db.prepare('SELECT CASE WHEN '+removalCompiled.sql+' THEN 1 ELSE 0 END AS allowed').get(...removalCompiled.values).allowed===0);
 f.time=p.BETA_RESET_CUTOFF+1;check('post-cutoff removal policy remains current',await p.betaResetCurrent(f.env,c)&&f.resetSql(c));
 before=f.reads;check('removal capture cannot switch environment',!await p.betaResetCurrent({...f.env},c)&&f.reads===before);
 check('forged cutoff capture cannot authorize removal',!await p.betaResetCurrent(f.env,{...c})&&!f.resetSql({...c}));
 check('invalid removal SQL offsets fail closed',[0,-1,1.5,99,NaN].every(start=>p.betaResetSql(c,start).sql==='0=1'));
 for(const role of p.BETA_RESET_ROLE_IDS){const target=await f.capture(p.BETA_RESET_GUILD_ID,role);check('removal policy covers approved target only '+role,await p.betaResetCurrent(f.env,target)&&f.resetSql(target));}
 f=fixture();f.save();f.time=p.BETA_RESET_CUTOFF;c=await f.capture();f.save(JSON.stringify(f.policy,null,2));
 check('raw replacement invalidates original removal capture',!await p.betaResetCurrent(f.env,c)&&!f.resetSql(c));
 c=await f.capture();f.db.prepare('DELETE FROM site_settings WHERE key=?').run(p.BETA_RESET_POLICY_KEY);
 check('deleted policy closes existing and fresh removal capture',!await p.betaResetCurrent(f.env,c)&&!f.resetSql(c)&&!await p.betaResetCurrent(f.env,await f.capture()));
 for(const flag of ['false','invalid']){f=fixture(flag);f.save();f.time=p.BETA_RESET_CUTOFF;c=await f.capture();before=f.reads;check('off or malformed flag never permits removal '+flag,!await p.betaResetCurrent(f.env,c)&&!f.resetSql(c)&&f.reads===before);}
 f=fixture();f.save();f.time=p.BETA_RESET_CUTOFF;c=await f.capture(p.BETA_RESET_GUILD_ID,MODERATOR);before=f.reads;
 check('preserved role cannot acquire removal policy authority',!await p.betaResetCurrent(f.env,c)&&!f.resetSql(c)&&f.reads===before);
 f=fixture();f.save();f.time=p.BETA_RESET_CUTOFF;c=await f.capture('700000000000000099',p.BETA_RESET_ROLE_IDS[0]);
 check('unrelated guild cannot acquire removal policy authority',!await p.betaResetCurrent(f.env,c)&&!f.resetSql(c));
 for(const [key,bad] of changes){f=fixture();f.save();f.time=p.BETA_RESET_CUTOFF;c=await f.capture();f.env[key]=bad;before=f.reads;check('changed removal configuration '+key+' holds without DB',!await p.betaResetCurrent(f.env,c)&&!f.resetSql(c)&&f.reads===before);}
 f=fixture();f.save();f.time=p.BETA_RESET_CUTOFF;c=await f.capture();f.env.BETA_RESET_REMOVALS_ENABLED='false';
 check('disabling guard invalidates removal capture',!await p.betaResetCurrent(f.env,c)&&!f.resetSql(c));
 f=fixture();f.save();f.time=p.BETA_RESET_CUTOFF;c=await f.capture();f.env.DB={...f.env.DB};
 check('removal database receiver replacement refused',!await p.betaResetCurrent(f.env,c)&&!f.resetSql(c));
 f=fixture();f.save();f.time=p.BETA_RESET_CUTOFF;c=await f.capture();f.env.DB.prepare=()=>{throw Error('replaced removal prepare must not run');};
 check('removal database method replacement refused',!await p.betaResetCurrent(f.env,c)&&!f.resetSql(c));
 f=fixture();f.save();f.time=p.BETA_RESET_CUTOFF;c=await f.capture();f.beforeRead=()=>{f.env.SITE_ADMINS='700000000000000099';};
 check('removal configuration change during clock read refuses authority',!await p.betaResetCurrent(f.env,c)&&!f.resetSql(c));
 f=fixture();f.save();f.time=f.policy.armedAt-1;c=await f.capture();f.time=p.BETA_RESET_CUTOFF;
 check('not-yet-armed capture cannot later upgrade to removal',!await p.betaResetCurrent(f.env,c)&&!f.resetSql(c));
 f=fixture();f.policy.armedAt=p.BETA_RESET_CUTOFF;f.save();f.time=p.BETA_RESET_CUTOFF;c=await f.capture();
 check('exact cutoff arming admits removal only at its database time',await p.betaResetCurrent(f.env,c)&&f.resetSql(c)&&!f.sql(c));
 f=fixture();f.save('{bad');f.time=p.BETA_RESET_CUTOFF;c=await f.capture();
 check('malformed policy cannot authorize removal',!await p.betaResetCurrent(f.env,c)&&!f.resetSql(c));
 for(const flag of [undefined,'false','true']){
  f=fixture();if(flag===undefined)delete f.env.BETA_RESET_REMOVALS_ENABLED;else f.env.BETA_RESET_REMOVALS_ENABLED=flag;
  c=await f.capture();const absence=p.betaGrantSql(c,1);f.time=p.BETA_RESET_CUTOFF;
  check('original absence expires at source cutoff '+String(flag),!await p.betaGrantCurrent(f.env,c)&&!f.sql(c)&&f.db.prepare('SELECT CASE WHEN '+absence.sql+' THEN 1 ELSE 0 END AS allowed').get(...absence.values).allowed===0);
  c=await f.capture();check('missing row cannot reopen source epoch '+String(flag),c.reason==='beta_source_epoch_closed'&&!await p.betaGrantCurrent(f.env,c)&&!f.sql(c)&&!await p.betaResetCurrent(f.env,c)&&!f.resetSql(c));
  f.save();c=await f.capture();check('armed row cannot reopen source epoch '+String(flag),c.reason==='beta_cutoff_reached'&&!await p.betaGrantCurrent(f.env,c)&&!f.sql(c));
  check('armed removal requires exact true activation '+String(flag),(await p.betaResetCurrent(f.env,c))===(flag==='true')&&f.resetSql(c)===(flag==='true'));
  f.db.prepare('DELETE FROM site_settings WHERE key=?').run(p.BETA_RESET_POLICY_KEY);c=await f.capture();check('deleting armed row never reopens post-cutoff grants '+String(flag),c.reason==='beta_source_epoch_closed'&&!await p.betaGrantCurrent(f.env,c)&&!f.sql(c));
 }
 f=fixture();f.save();f.time=p.BETA_RESET_CUTOFF;c=await f.capture();f.env.BETA_RESET_REMOVALS_ENABLED='false';
 check('disabling removals neither revives old grant nor grants from fresh capture',!await p.betaGrantCurrent(f.env,c)&&!await p.betaGrantCurrent(f.env,await f.capture())&&!f.sql(await f.capture()));
 // Retirement is a retained denial; the embedded old policy only identifies inventory.
 f=fixture();f.save();const originalRaw=JSON.stringify(f.policy),open=await f.capture();f.time=p.BETA_RESET_CUTOFF;c=await f.capture();
 const tombstone=JSON.stringify({version:3,state:'retired',originalPolicy:originalRaw,retiredAt:p.BETA_RESET_CUTOFF});
 f.save(tombstone);const retired=await f.capture();
 const admits=(helper,capture)=>{const g=helper(f.env,capture,1);return f.db.prepare('SELECT CASE WHEN '+g.sql+' THEN 1 ELSE 0 END allowed').get(...g.values).allowed===1;};
 check('retirement retains exact actor-free original and old parser refuses it',p.parseBetaResetRetirement(tombstone,f.env).originalPolicy===originalRaw&&p.parseBetaResetPolicy(tombstone,f.env)===null);
 check('retirement invalidates old grant and removal captures',!await p.betaGrantCurrent(f.env,open)&&!f.sql(open)&&!await p.betaResetCurrent(f.env,c)&&!f.resetSql(c));
 check('retired capture cannot authorize grants or removals',retired.reason==='beta_reset_retired'&&!await p.betaGrantCurrent(f.env,retired)&&!f.sql(retired)&&!await p.betaResetCurrent(f.env,retired)&&!f.resetSql(retired));
 check('retired source permits only exact-current cutoff confirmation and retirement readback',admits(p.betaRetentionSourceSql,retired)&&admits(p.betaPolicyRetirementSql,retired)&&!admits(p.betaRetentionSourceSql,c));
 f.time=p.BETA_RESET_CUTOFF-1;check('clock rollback cannot confirm cutoff or retire',!admits(p.betaRetentionSourceSql,retired)&&!admits(p.betaPolicyRetirementSql,retired)&&(await f.capture()).reason==='beta_policy_not_yet_retired');
 const t=JSON.parse(tombstone);
 for(const bad of [{...t,extra:true},{...t,version:2},{...t,state:'paused'},{...t,retiredAt:p.BETA_RESET_CUTOFF-1},{...t,retiredAt:1.5},{...t,originalPolicy:tombstone},{...t,originalPolicy:JSON.stringify({...f.policy,version:1,armedBy:ADMIN})}])check('closed retirement grammar refuses '+JSON.stringify(bad).slice(0,70),p.parseBetaResetRetirement(JSON.stringify(bad),f.env)===null);
 for(const raw of [tombstone.replace('{','{"version":3,'),tombstone.replace('"version"','"\\u0076ersion"'),' '.repeat(8193),JSON.stringify(t,null,2)])check('noncanonical retirement bytes refused',p.parseBetaResetRetirement(raw,f.env)===null);
 f=fixture('false');f.save();f.time=p.BETA_RESET_CUTOFF;c=await f.capture();
 check('owner may retire with removals OFF without obtaining removal authority',admits(p.betaPolicyRetirementSql,c)&&!f.resetSql(c));
 f.env.SITE_ADMINS='700000000000000099';check('retirement capture retains original configuration fence',!admits(p.betaPolicyRetirementSql,c));
 console.log('\n'+passed+'/'+passed+' passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
