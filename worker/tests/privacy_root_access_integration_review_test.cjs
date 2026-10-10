/** Independent Root routing/schema/custody seam checks. Not acceptance of purpose-source internals. */
const fs=require('fs'),path=require('path'),Module=require('module');
const worker=process.env.PRIVACY_REVIEW_WORKER||path.join(__dirname,'..');
const original=path.join(worker,'tests/privacy_serving_integration_test.cjs'),source=fs.readFileSync(original,'utf8'),marker='(async()=>{';
if(source.split(marker).length!==2)throw Error('canonical setup boundary changed');
async function review(){
 const t=reset(),forms=load('policy-forms'),site=load('site'),data=load('privacy-access-data'),accessSchema=load('privacy-access-schema'),context=load('community-context');
 const enabled={...env(),PRIVACY_ACCESS_ENABLED:'true',DISCORD_CLIENT_SECRET:'synthetic-never-exchanged'};
 const call=(path,method='GET',over=enabled,ready=true)=>site.handleSite(new Request('https://guild.example'+path,{method}),over,new URL('https://guild.example'+path).pathname,ready,'fixture',()=>{});
 for(const[route,method,status]of[['/privacy/access','POST',405],['/privacy/access/export','GET',405],['/privacy/access/erasure','GET',405],['/privacy/signin','POST',405],['/privacy/callback?state=x&code=y','POST',405],['/privacy/access?privateCode=forbidden','GET',400]]){
  const before=attempts,r=await call(route,method);check('Root dispatch '+method+' '+route+' refuses before grant/OAuth work',r?.status===status&&attempts===before&&calls.length===0);
 }
 {const before=attempts,r=await call('/privacy/access','GET',enabled,false);check('Root schema-ready hold precedes all access operations',r?.status===503&&attempts===before&&calls.length===0);}
 {const before=attempts,r=await call('/privacy/access','GET',{...enabled,PRIVACY_ACCESS_ENABLED:'false'});check('Root access feature OFF closes added route without work',r?.status===503&&attempts===before&&calls.length===0);}
 {const before=attempts,r=await call('/privacy/signin','GET',{...enabled,PRIVACY_ACCESS_ENABLED:'false'});check('Root feature OFF retains inert historical identify route',r?.status===503&&attempts===before&&calls.length===0);}
 {const r=await call('/privacy/access','HEAD');check('Root access HEAD has empty no-store body and no provider dispatch',r?.status===200&&(await r.text())===''&&/no-store/.test(r.headers.get('Cache-Control'))&&calls.length===0);}
 {const r=await call('/privacy/access'),body=await r.text();check('Root signed-out access page is script-free with operative identify entry',r?.status===200&&body.includes('/privacy/signin')&&!/<script\b/i.test(body)&&/no-store/.test(r.headers.get('Cache-Control')));}
 {const before=snapshot(),r=await call('/privacy/callback?state=invalid&code=invalid');check('Root callback reaches privacy refusal with zero OAuth exchanges for missing browser proof',r?.status>=400&&snapshot()===before&&calls.length===0);}
 {const r=await call('/privacy/signin'),u=new URL(r.headers.get('Location'));check('Root operative signin uses existing callback URI and identify scope',r?.status===303&&u.searchParams.get('redirect_uri')==='https://guild.example/privacy/callback'&&u.searchParams.get('scope')==='identify'&&calls.length===0);check('Root signin routes do not mint normal session or create membership',!r.headers.get('Set-Cookie').split(';')[0].startsWith(core.SESSION_COOKIE+'=')&&rows('SELECT * FROM site_users').length===1&&!raw('SELECT * FROM members'));}
 check('Root catalog and registry include finite privacy credential custody',context.communityDataNames().includes('privacy_access')&&await catalog.servingPrivacyCatalogCurrent(enabled));
 const tuple=()=>JSON.stringify(rows("SELECT name,sql FROM sqlite_master WHERE name LIKE 'privacy_access_%' ORDER BY name"));
 const canonical=tuple();check('Root canonical purpose schema contains exact two tables plus expiry indexes',rows("SELECT name FROM sqlite_master WHERE name LIKE 'privacy_access_%'").length===4&&accessSchema.PRIVACY_ACCESS_SCHEMA.length===4);
 accessSchema.PRIVACY_ACCESS_SCHEMA.forEach(sql=>db.exec(sql));accessSchema.PRIVACY_ACCESS_SCHEMA.forEach(sql=>db.exec(sql));check('Root runtime finite DDL is idempotent twice and agrees with canonical schema',tuple()===canonical);
 db.exec(fs.readFileSync(path.join(root,'migrations/2026-10-10-privacy-access.sql'),'utf8'));db.exec(fs.readFileSync(path.join(root,'migrations/2026-10-10-privacy-access.sql'),'utf8'));check('Root dated migration is idempotent twice and agrees with canonical/runtime DDL',tuple()===canonical);
 const insert=(id,purpose,char)=>db.prepare('INSERT INTO privacy_access_grants(session_hash,purpose,grant_id,csrf_hash,subject_id,created_at,expires_at)VALUES(?,?,?,?,?,?,?)').run(char.repeat(64),purpose,char.repeat(32),'f'.repeat(64),id,t,t+720);
 insert(ID,'own_export','a');insert(ID,'own_erasure','b');insert(OTHER,'own_export','c');
 const plan=data.privacyAccessExportPlan(enabled,ID),out=await enabled.DB.batch(plan.statements),copy=plan.shape(out);
 check('Root grant copy is own only with explicit bounded count',copy.connections.rows.length===2&&copy.connections.total===2&&copy.connections.limit===1000&&copy.connections.complete===true);
 check('Root grant copy omits all secret/hash/identifier/opinion fields',copy.connections.rows.every(r=>Object.keys(r).sort().join(',')==='consumed_at,created_at,expires_at,purpose')&&!JSON.stringify(copy).includes(OTHER)&&!JSON.stringify(copy).includes('a'.repeat(32)));
 await enabled.DB.batch(data.privacyAccessEraseStatements(enabled,ID));check('Root grant eraser removes only retiring own credentials and preserves another subject',!raw('SELECT * FROM privacy_access_grants WHERE subject_id=?',ID)&&rows('SELECT * FROM privacy_access_grants WHERE subject_id=?',OTHER).length===1);
 const retention=load('privacy-retention');check('Root retention includes exact two credential purges in fixed20 statement envelope',retention.servingRetentionStatements(enabled).length===20&&retention.SERVING_RETENTION_STATEMENTS===20);
 for(const[file,bytes]of pins)check('review source pin stable '+path.basename(file),fs.readFileSync(file).equals(bytes));
 console.log(`${passes}/${checks} independent Root privacy access seam checks passed`);db.close();if(passes!==checks)process.exitCode=1;
}
const mod=new Module(original);mod.filename=original;mod.paths=Module._nodeModulePaths(path.dirname(original));mod._compile(source.slice(0,source.indexOf(marker))+`\n(${review.toString()})().catch(e=>{console.error(e.stack);process.exitCode=1;});`,original);
