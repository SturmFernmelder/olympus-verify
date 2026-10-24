// Actual full entry/API + SQLite/Native admission + original OAuth cookie issuer.
// Discord is synthetic via the unchanged site_test fixture; no real provider or deployment.
const fs196=require('node:fs'),path196=require('node:path'),{Module}=require('node:module');
const fixture196=path196.join(__dirname,'site_test.cjs'),text196=fs196.readFileSync(fixture196,'utf8');
const boundary196=/^\(async \(\) => \{\r?\n  console\.log\("== schema: ordinary serving cannot migrate historical databases =="\);/gm;
const cuts196=[...text196.matchAll(boundary196)];
if(cuts196.length!==1)throw Error('one original site fixture boundary required');
const prefix196=text196.slice(0,cuts196[0].index);
const source196=String.raw`
(async()=>{
 const schema196=JSON.stringify(db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all());
 const member196='300000000000000001',publicSQL196="SELECT value FROM site_settings WHERE key='loginAnimation' AND value='1'";
 // The original Native read admission emits its exact schema/epoch proof before
 // the one logical public-branding payload. Neither statement bypasses admission.
 const expectedProof196=load('./privacy-schema-source-plan').lowerOriginalSchemaSQL(load('./privacy-write-admission').PRIVACY_ADMISSION_SCHEMA_PROOF_SQL,Object.freeze(['','',load('./privacy-write-admission-catalogue').ADMISSION_EXPECTED_JSON,entry.ENTRY_EPOCH]));
 const exactPublicReads196=reads=>reads.length===2&&reads[0].sql===expectedProof196.sql&&JSON.stringify(reads[0].params)===JSON.stringify(expectedProof196.values)&&reads[1].sql===publicSQL196&&reads[1].params.length===0;
 const readDiagnostic196=reads=>({physicalStatements:reads.length,exactOriginalProof:reads[0]?.sql===expectedProof196.sql&&JSON.stringify(reads[0]?.params)===JSON.stringify(expectedProof196.values),exactBrandingPayload:reads[1]?.sql===publicSQL196&&reads[1]?.params.length===0,unexpectedStatements:reads.filter(row=>row.sql!==expectedProof196.sql&&row.sql!==publicSQL196).length});
 const setting196=()=>db.prepare("SELECT value,updated_by FROM site_settings WHERE key='loginAnimation'").get();
 const audit196=()=>db.prepare("SELECT actor,action,details FROM audit WHERE action='site.settings' ORDER BY id").all();
 const adminLogin196=await signIn(VIKTOR),memberLogin196=await signIn(member196);
 if(adminLogin196.status!==303||memberLogin196.status!==303||!jar.get(VIKTOR)||!jar.get(member196))throw Error('genuine original OAuth fixture setup did not issue both sessions');
 const beforeProvider196=D.calls.length;
 let res196=await call('GET','/api/admin/overview',{who:VIKTOR}),body196=await J(res196);
 check('real admitted admin overview defaults loginAnimation to strict false with no stored row',res196.status===200&&body196.settings.loginAnimation===false&&typeof body196.settings.loginAnimation==='boolean'&&!setting196());
 const unchanged196=JSON.stringify({row:setting196()??null,audit:audit196()});
 for(const [label,options,status] of [['signed out',{},401],['nonadmin member',{who:member196},403],['foreign origin',{who:VIKTOR,origin:'https://other.example'},403]]){
   res196=await call('PUT','/api/admin/settings',{...options,body:{loginAnimation:true}});
   check(label+' cannot change the actual login setting or append a settings audit',res196.status===status&&JSON.stringify({row:setting196()??null,audit:audit196()})===unchanged196);
 }
 for(const value of [0,1,'true','false','1','0',null,{},[]]){
   res196=await call('PUT','/api/admin/settings',{who:VIKTOR,body:{loginAnimation:value}});body196=await J(res196);
   check('real admin API refuses nonboolean '+JSON.stringify(value)+' without partial setting or audit',res196.status===400&&body196.error==='invalid'&&body196.field==='loginAnimation'&&JSON.stringify({row:setting196()??null,audit:audit196()})===unchanged196);
 }
 res196=await call('PUT','/api/admin/settings',{who:VIKTOR,body:{loginAnimation:true}});body196=await J(res196);
 check('real admitted true save stores exact1 and returns a strict boolean plus original actor audit',res196.status===200&&body196.ok===true&&body196.settings.loginAnimation===true&&setting196().value==='1'&&setting196().updated_by===VIKTOR&&audit196().at(-1).actor===VIKTOR&&JSON.parse(audit196().at(-1).details).loginAnimation==='1');
 res196=await call('GET','/api/admin/overview',{who:VIKTOR});body196=await J(res196);
 check('a separate original-session admin read round-trips the enabled setting from real SQLite',res196.status===200&&body196.settings.loginAnimation===true);
 const enabledAudit196=JSON.stringify(audit196());
 res196=await call('PUT','/api/admin/settings',{who:VIKTOR,body:{}});body196=await J(res196);
 check('an old client omitting the new field preserves the explicit choice and creates no fake save audit',res196.status===200&&body196.settings.loginAnimation===true&&setting196().value==='1'&&JSON.stringify(audit196())===enabledAudit196);
 async function public196(method='GET',headers={}){
   const reads=[],DB=entry.originalNativePort(db,{statement:(sql,params)=>reads.push({sql,params})});
   const response=await index.fetch(new Request('https://guild.example/',{method,headers}),{...rawEnv(),DB},ctx);await settle();
   console.log('SYNTHETIC public media Native read diagnostic',JSON.stringify({method,...readDiagnostic196(reads)}));
   return{response,body:await response.text(),reads};
 }
 let publicOut196=await public196();
 check('actual anonymous full entry retains exact original Native proof plus one nonpersonal branding payload and displays the chosen video',publicOut196.response.status===200&&/<video\b/.test(publicOut196.body)&&exactPublicReads196(publicOut196.reads)&&!publicOut196.body.includes('id="boot"')&&!publicOut196.body.includes(VIKTOR)&&publicOut196.response.headers.get('Vary')==='Cookie, Save-Data');
 const head196=await public196('HEAD');
 check('actual anonymous HEAD retains exact original proof and one-bit payload admission plus status/security without a body',head196.response.status===200&&head196.body===''&&exactPublicReads196(head196.reads)&&head196.response.headers.get('Content-Security-Policy')===publicOut196.response.headers.get('Content-Security-Policy'));
 const saved196=await public196('GET',{'Save-Data':'on'});
 check('actual full entry data saver forces approved stills with zero database statements',saved196.response.status===200&&!/<video\b/.test(saved196.body)&&saved196.body.includes('olympus-dark-portal-wide.png')&&saved196.body.includes('olympus-dark-portal-portrait.png')&&saved196.reads.length===0&&saved196.response.headers.get('Vary')==='Cookie, Save-Data');
 res196=await call('PUT','/api/admin/settings',{who:VIKTOR,body:{loginAnimation:false}});body196=await J(res196);
 check('real admitted false save stores exact0 and round-trips the approved still default',res196.status===200&&body196.settings.loginAnimation===false&&setting196().value==='0'&&JSON.parse(audit196().at(-1).details).loginAnimation==='0');
 publicOut196=await public196();
 check('the next independent anonymous full entry reflects false without any personal read',publicOut196.response.status===200&&!/<video\b/.test(publicOut196.body)&&publicOut196.body.includes('olympus-dark-portal-wide.png')&&exactPublicReads196(publicOut196.reads));
 // Fail only the public payload, after witnessing the unchanged exact Native
 // proof. A proof error or unexpected query cannot satisfy the fallback check.
 let failedReads196=0;const brokenReads196=[];
 const broken196={...rawEnv(),DB:entry.originalNativePort(db,{statement(sql,params){brokenReads196.push({sql,params});if(sql===expectedProof196.sql&&JSON.stringify(params)===JSON.stringify(expectedProof196.values))return;if(sql===publicSQL196&&params.length===0){failedReads196++;throw Error('synthetic one-bit database unavailable');}throw Error('unexpected public Native statement');}})};
 res196=await index.fetch(new Request('https://guild.example/'),broken196,ctx);await settle();body196=await res196.text();
 console.log('SYNTHETIC failed public media payload diagnostic',JSON.stringify({...readDiagnostic196(brokenReads196),failedPayloads:failedReads196}));
 check('actual full entry catches only its one-bit D1 payload failure after exact Native proof and preserves protected still sign-in',res196.status===200&&failedReads196===1&&exactPublicReads196(brokenReads196)&&!/<video\b/.test(body196)&&body196.includes('olympus-dark-portal-wide.png')&&!body196.includes('synthetic one-bit')&&/script-src 'none'/.test(res196.headers.get('Content-Security-Policy')));
 const offAudit196=JSON.stringify(audit196());
 const loggedOut196=await call('POST','/auth/logout',{who:VIKTOR});
 res196=await call('PUT','/api/admin/settings',{who:VIKTOR,body:{loginAnimation:true}});
 check('actual logout revokes the original admin cookie before another media setting write',loggedOut196.status===200&&res196.status===401&&setting196().value==='0'&&JSON.stringify(audit196())===offAudit196);
 let publicDB196=0,assetReads196=0;
 const publicOnly196={...rawEnv(),DB:entry.originalNativePort(db,{statement(){publicDB196++;throw Error('public legal/assets must not touch D1');}}),ASSETS:{async fetch(request){assetReads196++;return new Response(request.method==='HEAD'?null:'bounded-synthetic-asset',{headers:{'Content-Type':new URL(request.url).pathname.endsWith('.png')?'image/png':new URL(request.url).pathname.endsWith('.webm')?'video/webm':'image/jpeg'}});}}};
 for(const route of ['/legal/privacy','/legal/terms'])for(const method of ['GET','HEAD']){
   res196=await index.fetch(new Request('https://guild.example'+route,{method}),publicOnly196,ctx);await settle();const text=await res196.text();
   check(method+' '+route+' remains public script-free and database-free after adding the media bit',res196.status===200&&publicDB196===0&&!res196.headers.has('Set-Cookie')&&/script-src 'none'/.test(res196.headers.get('Content-Security-Policy'))&&(method!=='HEAD'||text===''));
 }
 for(const route of ['/static/wow/login/dark-portal.webm','/static/wow/login/dark-portal-poster.jpg','/static/wow/login/olympus-dark-portal-wide.png','/static/wow/login/olympus-dark-portal-portrait.png']){
   const before=assetReads196;res196=await index.fetch(new Request('https://guild.example'+route),publicOnly196,ctx);await settle();
   check('exact public media '+route+' bypasses the branding setting and every account read',res196.status===200&&publicDB196===0&&assetReads196===before+1&&/no-store/.test(res196.headers.get('Cache-Control'))&&!res196.headers.has('Set-Cookie'));
 }
 check('media setting and read paths introduced no Discord calls after genuine sign-in setup',D.calls.length===beforeProvider196);
 check('real admin setting roundtrips and public reads leave the entire installed Native schema unchanged',JSON.stringify(db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all())===schema196);
 console.log(ok+'/'+n+' login media API checks passed');db.close();process.exit(ok===n?0:1);
})().catch(error=>{console.error(error);try{db.close();}catch{}process.exit(1);});
`;
const module196=new Module(fixture196,module);module196.filename=fixture196;module196.paths=Module._nodeModulePaths(path196.dirname(fixture196));module196._compile(prefix196+source196,fixture196);
