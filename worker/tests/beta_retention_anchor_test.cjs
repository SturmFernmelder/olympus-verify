// Real owner route, HMAC, admission adapter, retention SQL and inactivity fence; no providers.
const fs=require('node:fs'),path=require('node:path');
const slice=fs.readFileSync(path.join(__dirname,'beta_reset_slice_test.cjs'),'utf8'),route=fs.readFileSync(path.join(__dirname,'beta_reset_route_test.cjs'),'utf8');
const marker='(async()=>{',start='const entry=load(\'index\').default';
if(slice.split(marker).length!==2||route.split(start).length!==2)throw Error('fixture harness changed');
const helpers=route.slice(route.indexOf(start),route.indexOf(marker,route.indexOf(start)));
const cases=String.raw`
const clocks=load('privacy-retention-clocks'),retention=load('privacy-retention'),history=load('privacy-access-family-history');
const anchorRow=()=>db.prepare('SELECT * FROM site_settings WHERE key=?').get(clocks.BETA_RETENTION_ANCHOR_KEY);
const confirm=form=>request('POST','/confirm-cutoff',{form});
const retentionClock=created=>db.prepare('SELECT '+clocks.betaRetentionClockSql(String(created))+' AS at').get().at;
const inactive=()=>db.prepare('SELECT CASE WHEN '+clocks.inactiveBetaRetentionSatisfiedSql("'"+subject(0)+"'")+' THEN 1 ELSE 0 END AS ready').get().ready;
const anchor=()=>JSON.stringify({version:1,epoch:policy.BETA_RESET_EPOCH,cutoff:policy.BETA_RESET_CUTOFF,confirmedAt:policy.BETA_RESET_CUTOFF});
async function seedAnchor(raw=anchor()){await mutate('INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)',clocks.BETA_RETENTION_ANCHOR_KEY,raw,clock,actor);}
(async()=>{
 for(const installed of [false,true]){const label=installed?'admitted':'native';
  await routeReset(installed);let p=await preview();check(label+' before cutoff no retention mandate',p.data.retention.canConfirm===false&&p.data.retentionForm===null&&p.data.retention.confirmed===false);
  let r=await confirm({expiresAt:clock+100,formNonce:'a'.repeat(32),token:'A'.repeat(43)});check(label+' before cutoff confirmation cannot write anchor',r.status===409&&!anchorRow());
  await routeReset(installed,false,policy.BETA_RESET_CUTOFF);env.BETA_RESET_REMOVALS_ENABLED='false';p=await preview();check(label+' cutoff confirmation available while removals inactive and unarmed',p.data.retention.canConfirm&&p.data.retentionForm&&!p.data.policyArmed&&!p.data.removalsActive);
  const beforeRoles=JSON.stringify(jobs());r=await confirm(p.data.retentionForm);const raw=anchorRow().value;
  check(label+' genuine owner confirms exact cutoff without declaring role completion',r.status===200&&r.data.removalCompletion===false&&raw===anchor()&&JSON.stringify(jobs())===beforeRoles&&policyRow()===null&&requests.length===0);
  check(label+' attribution is normal own metadata, absent from immutable anchor',anchorRow().updated_by===actor&&!raw.includes(actor)&&history.PRIVACY_OWN_SETTING_KEYS.includes(clocks.BETA_RETENTION_ANCHOR_KEY));
  check(label+' legacy completion pair is never forged',!db.prepare("SELECT 1 FROM site_settings WHERE key IN('betaClosedAt','betaResetFor')").get());preservedWebsite(label+' cutoff');
  r=await confirm(p.data.retentionForm);check(label+' anchor replay cannot overwrite original confirmation',r.status===409&&anchorRow().value===raw);
  p=await preview();check(label+' fresh status distinguishes cutoff from role completion',p.data.retention.confirmed&&p.data.retention.confirmedCutoff===policy.BETA_RESET_CUTOFF&&p.data.retention.evidence==='cutoff_anchor'&&p.data.retentionForm===null&&p.data.finalCompletion===false);
  await routeReset(installed,false,policy.BETA_RESET_CUTOFF);p=await preview();const replies=await Promise.all([confirm(p.data.retentionForm),confirm(p.data.retentionForm)]);check(label+' concurrent genuine forms insert once',replies.filter(x=>x.status===200).length===1&&replies.filter(x=>x.status>=400).length===1);
  await routeReset(installed,false,policy.BETA_RESET_CUTOFF);p=await preview();let committed=false;
  const lose=sqls=>{if(!committed&&sqls.some(sql=>sql.startsWith('INSERT INTO site_settings(key,value,updated_at,updated_by)')&&sql.includes("key='betaClosedAt'"))){committed=true;batchAfter=null;sqlAfter=null;assert.ok(anchorRow());throw Error('synthetic confirmed anchor reply lost');}};
  batchAfter=lose;sqlAfter=sql=>{if(!db.isTransaction)lose([sql]);};r=await confirm(p.data.retentionForm);check(label+' committed reply loss stays uncertain with original durable anchor',committed&&r.status===503&&!!anchorRow());r=await confirm(p.data.retentionForm);check(label+' reply loss cannot create replacement anchor',r.status===409);
  for(const mutation of ['session','generation','legacy','expiry']){
   await routeReset(installed,false,policy.BETA_RESET_CUTOFF);p=await preview();const verify=crypto.subtle.verify.bind(crypto.subtle);let changed=false;
   crypto.subtle.verify=async(...args)=>{const ok=await verify(...args);if(!changed&&new TextDecoder().decode(args[3]).startsWith('{"purpose":"beta-retention-cutoff-confirm-v1"')){changed=true;
    if(mutation==='session')await mutate('UPDATE site_users SET session_version=2 WHERE discord_id=?',actor);
    if(mutation==='generation')await mutate('UPDATE privacy_subjects SET generation=? WHERE subject_id=?','e'.repeat(32),actor);
    if(mutation==='legacy')await mutate("INSERT INTO site_settings(key,value,updated_at) VALUES('betaClosedAt','1',?)",clock);
    if(mutation==='expiry')clock=p.data.retentionForm.expiresAt;
   }return ok;};try{r=await confirm(p.data.retentionForm);}finally{crypto.subtle.verify=verify;}
   check(label+' original confirmation authority cannot adopt '+mutation,changed&&r.status>=400&&!anchorRow());
  }
  // The site API snapshots its environment. Change configuration between preview and request;
  // mutating the caller's outer object during HMAC cannot mutate that private request snapshot.
  await routeReset(installed,false,policy.BETA_RESET_CUTOFF);p=await preview();env.GUILD_ID='900000000000000009';r=await confirm(p.data.retentionForm);check(label+' changed request configuration cannot consume prior form',r.status>=400&&!anchorRow());
  await routeReset(installed,false,policy.BETA_RESET_CUTOFF);p=await preview();let changed=false;sqlBefore=sql=>{if(!changed&&sql.startsWith('INSERT INTO site_settings(key,value,updated_at,updated_by)')&&sql.includes("key='betaClosedAt'")){changed=true;db.prepare('UPDATE site_users SET session_version=2 WHERE discord_id=?').run(actor);}};r=await confirm(p.data.retentionForm);check(label+' consuming anchor INSERT repeats original owner authority',changed&&r.status>=400&&!anchorRow());
  await routeReset(installed,false,policy.BETA_RESET_CUTOFF);p=await preview();r=await request('POST','/arm',{form:p.data.retentionForm});check(label+' retention credential cannot arm removals',r.status>=400&&policyRow()===null&&!anchorRow());
  for(const kind of ['absent','future','duplicate','extra','wrong_cutoff','wrong_epoch','conflicting_legacy','partial_legacy','valid']){
   await routeReset(installed,false,policy.BETA_RESET_CUTOFF+1);
   if(kind!=='absent'){let value=anchor();if(kind==='future')value=JSON.stringify({...JSON.parse(value),confirmedAt:clock+1});if(kind==='duplicate')value=value.replace('{','{"version":1,');if(kind==='extra')value=JSON.stringify({...JSON.parse(value),extra:1});if(kind==='wrong_cutoff')value=JSON.stringify({...JSON.parse(value),cutoff:policy.BETA_RESET_CUTOFF-1});if(kind==='wrong_epoch')value=JSON.stringify({...JSON.parse(value),epoch:'other'});await seedAnchor(value);}
   if(kind==='conflicting_legacy'||kind==='partial_legacy'){await mutate("INSERT INTO site_settings(key,value,updated_at) VALUES('betaClosedAt',?,?)",String(policy.BETA_RESET_CUTOFF-1),clock);if(kind==='conflicting_legacy')await mutate("INSERT INTO site_settings(key,value,updated_at) VALUES('betaResetFor',?,?)",JSON.stringify({closedAt:policy.BETA_RESET_CUTOFF-1}),clock);}
   check(label+' retention evidence '+kind+' closes or holds exact clock',retentionClock(policy.BETA_RESET_CUTOFF-100)===(kind==='valid'?policy.BETA_RESET_CUTOFF:null));
  }
  for(const bad of ['1792688400garbage','1792688400.5',' 1792688400','01792688400','bad-json','duplicate-key']){
   await routeReset(installed,false,policy.BETA_RESET_CUTOFF+1);
   const malformedReset=bad==='bad-json'?'{bad':bad==='duplicate-key'?'{"closedAt":1792688400,"closedAt":1}':JSON.stringify({closedAt:policy.BETA_RESET_CUTOFF});
   await mutate("INSERT INTO site_settings(key,value,updated_at) VALUES('betaClosedAt',?,?)",bad==='bad-json'||bad==='duplicate-key'?String(policy.BETA_RESET_CUTOFF):bad,clock);
   await mutate("INSERT INTO site_settings(key,value,updated_at) VALUES('betaResetFor',?,?)",malformedReset,clock);
   p=await preview();r=await confirm({expiresAt:clock+100,formNonce:'a'.repeat(32),token:'A'.repeat(43)});
   check(label+' malformed legacy '+bad+' cannot seed a new anchor or retention clock',retentionClock(clock-100)===null&&p.data.retention.evidence==='held'&&!p.data.retention.canConfirm&&p.data.retentionForm===null&&r.status===409&&!anchorRow());
  }
  await routeReset(installed,false,policy.BETA_RESET_CUTOFF+1);const legacy=policy.BETA_RESET_CUTOFF-100;
  await mutate("INSERT INTO site_settings(key,value,updated_at) VALUES('betaClosedAt',?,?)",String(legacy),clock);await mutate("INSERT INTO site_settings(key,value,updated_at) VALUES('betaResetFor',?,?)",JSON.stringify({closedAt:legacy}),clock);
  check(label+' valid legacy evidence stays recognized without new anchor',retentionClock(legacy-1)===legacy);
  await routeReset(installed,false,policy.BETA_RESET_CUTOFF);await seedAnchor();const old=clock-100,later=clock+20;
  check(label+' original maximum protects records created after cutoff',retentionClock(old)===clock&&retentionClock(later)===later);
  await mutate('INSERT INTO pending(discord_id,name_key,name,created_at,expires_at) VALUES(?,?,?,?,?)',subject(0),'anchor-old','Anchor Old',old,clock);
  await mutate('INSERT INTO roster_first_seen(name_key,first_seen) VALUES(?,?)','anchor-old',old);
  clock=policy.BETA_RESET_CUTOFF+31536000-1;check(label+' inactivity guard holds one second before 365 days',inactive()===0);
  await retention.sweepServingRetention({...env,PRIVACY_RETENTION_ENABLED:'true'});check(label+' cleanup preserves original dates before exact year',db.prepare('SELECT created_at FROM pending').get().created_at===old&&db.prepare('SELECT first_seen FROM roster_first_seen').get().first_seen===old);
  clock++;check(label+' inactivity fence admits exact 365 day boundary',inactive()===1);await retention.sweepServingRetention({...env,PRIVACY_RETENTION_ENABLED:'true'});check(label+' same exact year permits pending and first-seen cleanup',!db.prepare('SELECT 1 FROM pending').get()&&!db.prepare('SELECT 1 FROM roster_first_seen').get());
  check(label+' no cutoff confirmation or retention case called providers',requests.length===0);
 }
 console.log('BETA_RETENTION_ANCHOR_SUMMARY '+JSON.stringify({checks,maxRoutePhysical:Math.max(...requestCosts.map(x=>x.physical)),providerWrites:0}));console.log(checks+'/'+checks+' checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{Date.now=realNow;if(db)db.close();});
`;
new Function('__dirname','require',slice.slice(0,slice.indexOf(marker))+helpers+cases)(__dirname,require);
