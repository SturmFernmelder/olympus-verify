// Same ordered statements as the operator's D1 file import, executed by native local D1.
const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');
const path=require('node:path');
const {Miniflare,Log,LogLevel,convertV4MiniflareOptions}=require('miniflare');
const {migration,baseline,delta}=require('../scripts/raid-schema-migration316.cjs');
const epoch='1'.repeat(32);
async function run() {
  const script=buildSync({stdin:{contents:`
    import {assertAdmissionCurrentSchema,createPrivacyWriteAdmissionDatabase} from './src/privacy-write-admission.ts';
    import {readOriginalCompleteSchema} from './src/privacy-schema-source-plan.ts';
    export default {async fetch(request,env) {
      const source=await readOriginalCompleteSchema(env.DB);
      let serving=false;
      try{
        const db=createPrivacyWriteAdmissionDatabase(env.DB,'writer','recorded-live-pre-seal-20261017','${epoch}');
        await assertAdmissionCurrentSchema(db);
        serving=true;
      }catch{}
      return Response.json({serving,original:source.admitted,objects:source.object_count});
    }}`,resolveDir:path.resolve(__dirname,'..'),loader:'ts'},bundle:true,format:'esm',platform:'browser',external:['node:*'],write:false}).outputFiles[0].text;
  const mf=new Miniflare(convertV4MiniflareOptions({script,
    modules:true,name:'raid-schema-rehearsal',compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],host:'127.0.0.1',port:0,
    cf:false,log:new Log(LogLevel.NONE),logRequests:false,telemetry:{enabled:false},unsafeRegisterWorker:false,
    unsafeLocalExplorer:false,unsafeObservability:false,d1Databases:{DB:'raid-schema-rehearsal'}}));
  try {
    const db=await mf.getD1Database('DB'),p=baseline.profile;
    const statements=[...p.tables,...p.indexes].map(t=>t.sql).concat(p.slotSQL,
      "INSERT INTO privacy_write_admission VALUES(1,'olympus-write-admission-epoch-2',0,'','',0,0,'"+epoch+"','serving')",
      "INSERT INTO site_settings(key,value,updated_at) VALUES('auditTypedNames','115',1)",p.triggers.map(t=>t.sql));
    for(let i=0;i<statements.length;i+=40)await db.batch(statements.slice(i,i+40).map(sql=>db.prepare(sql)));
    const readProof=async()=>{const r=await mf.dispatchFetch('http://localhost/fixture');assert.equal(r.status,200);return r.json();};
    const prior=await readProof();assert.equal(prior.serving,false);assert.equal(prior.original,0);
    const plan=migration(epoch),native=s=>db.batch(s.map(sql=>db.prepare(sql)));
    const missing=plan.findIndex(sql=>sql.startsWith('CREATE TRIGGER "privacy_admit_raid_'));
    assert(missing>=0);
    // A provider failure for an unrelated statement would otherwise make this negative pass.
    await assert.rejects(native(plan.filter((_,i)=>i!==missing)),/malformed JSON/i);
    assert.equal(await db.prepare("SELECT count(*) n FROM main.sqlite_master WHERE name='raid_teams316'").first('n'),0);
    const result=await native(plan);
    const after=await readProof();assert.equal(after.serving,true);assert.equal(after.original,1);
    assert.equal(after.objects,baseline.objects.length+delta.objects.length);
    assert.equal(result.length,plan.length);
    assert.equal(result.at(-1)?.results?.[0]?.checked,1);
    assert.equal(await db.prepare("SELECT count(*) n FROM sqlite_schema WHERE type='trigger' AND name LIKE 'privacy_admit_raid_%316_%'").first('n'),15);
    await assert.rejects(db.prepare("INSERT INTO raid_teams316(id) VALUES('fixture')").run(),/privacy_write_admission_required/);
    await assert.rejects(native(plan),/malformed JSON/i);
    assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
    console.log('Native Workerd/D1 migration passed, failed postcondition rolled back, '+plan.length+' statements, '+delta.objects.length+' exact objects.');
  } finally {await mf.dispose();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
