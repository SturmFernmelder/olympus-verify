/** Independent actual production API -> genuine identify-only own history/copy review.
 * No fabricated purpose grants, SiteUser, CommunitySubject or historical producer rows.
 */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const worker=process.env.PRIVACY_REVIEW_WORKER||path.resolve(__dirname,'..');
const original=path.join(worker,'tests/privacy_access_test.cjs'),source=fs.readFileSync(original,'utf8'),boundary='async function main(){';
if(source.split(boundary).length!==2)throw Error('canonical genuine OAuth fixture boundary changed');
async function review(){
 const registry=load('community-context'),before=Array.from(registry.communityDataNames());
 const index=load('index').default,policy=load('community-contribution-policy');
 const f=fixture();Object.assign(f.env,{PUBLIC_BASE_URL:'https://verify.example',SITE_ADMINS:A,COMMUNITY_FEATURES:'contributions,restrictions',CONTRIBUTIONS_MODE:'ledger',CONTRIBUTIONS_RETENTION_DAYS:'400'});
 for(const id of[A,B])f.db.prepare('INSERT INTO site_users(discord_id,username,first_login,last_login,session_version,in_server,denied)VALUES(?,?,?,?,7,1,0)').run(id,'Native '+id,f.time(),f.time());
 const cookie=(await core.sessionCookie(f.env,A,7)).split(';')[0];
 async function staffAction(body){
  const response=await index.fetch(new Request(BASE+'/api/admin/community/contributions',{method:'POST',headers:{Cookie:cookie,Origin:BASE,'X-Olympus':core.PAGE_VERSION,'Content-Type':'application/json'},body:JSON.stringify(body)}),f.env,{waitUntil(){}});
  const data=await response.json();if(response.status!==200)console.log('PRODUCER_DIAGNOSTIC',response.status,data);
  eq('real ordinary staff mutation admitted',response.status,200);return data;
 }
 const period=policy.periodStart(f.time(),policy.DEFAULT_CONTRIBUTION_POLICY)-7*86400;
 let result=await staffAction({action:'obligation',discordId:B,periodStart:new Date(period*1000).toISOString(),eligible:true});
 eq('real target obligation created',result.result.created,true);
 result=await staffAction({action:'state',discordId:B,obligationId:result.ledger.obligations[0].id,state:'disputed',expectedRevision:result.ledger.revision});
 eq('real staff decision committed',result.result.status,'updated');
 const decision=f.db.prepare('SELECT * FROM community_contribution_decisions').get();
 eq('producer persisted original staff prefix',decision.actor,'staff:'+A);eq('producer decision concerns another member',decision.discord_id,B);
 const plan=registry.communityExportPlan(f.env,A),names=Array.from(registry.communityDataNames()),native=await f.env.DB.batch(plan.statements);
 const inventory={before,productionFamilies:names,productionStatementCount:plan.statements.length,queries:plan.statements.map((s,i)=>({index:i,tables:Array.from(new Set(Array.from(s.sql.matchAll(/\b(?:FROM|JOIN)\s+([A-Za-z_]+)/gi),x=>x[1]))),returned:native[i].results.length}))};
 console.log('ACTUAL_PRODUCTION_EXPORT_CENSUS '+JSON.stringify(inventory));
 eq('actual index imports twelve registered families',names.length,12);eq('actual index imports32 registered copy statements',plan.statements.length,32);
 ok('production census includes purpose and news families',names.includes('privacy_access')&&names.includes('news'));
 async function own(collection){const connection=await connect(f),frm=await form(f,connection);provider=null;const response=await copy.exportPrivacyAccess(frm.request({collection}),f.env);eq('genuine own '+collection+' download admitted',response.status,200);return response.json();}
 const history=await own('contributionDecisions'),aggregate=await own('copy');
 eq('paged own actor-only production decision reachable',history.history.entries.length,1);eq('paged production decision relation actor',history.history.entries[0].relation,'actor');
 ok('paged production decision withholds counterpart structural id',!JSON.stringify(history).includes(B));
 console.log('ACTUAL_PRODUCER_COPY_COUNTEREXAMPLE '+JSON.stringify({nativeDecision:{actor:decision.actor,subject:decision.discord_id,action:decision.action},history:history.history.entries,aggregate:aggregate.contributionDecisions}));
 // Required regression: selected own decision ownership is the same on both copy paths.
 eq('aggregate own actor-only production decision reachable',aggregate.contributionDecisions.rows.length,1);
 eq('aggregate production decision marks own actor',aggregate.contributionDecisions.rows[0].own_actor,1);
 eq('aggregate production decision is not own subject',aggregate.contributionDecisions.rows[0].own_subject,0);
 ok('aggregate production decision withholds counterpart structural id',!JSON.stringify(aggregate).includes(B));
 eq('copy did not alter ordinary account versions',f.db.prepare('SELECT session_version FROM site_users ORDER BY discord_id').all().map(x=>x.session_version),[7,7]);
 eq('history/copier create no role intent',count(f,'role_settlements'),0);
 provider=null;f.db.close();console.log('privacy_history_production_ownership_review_test: '+checks+' checks PASS');
}
const mod=new Module(original);mod.filename=original;mod.paths=Module._nodeModulePaths(path.dirname(original));
mod._compile(source.slice(0,source.indexOf(boundary))+'\n('+review.toString()+')().catch(e=>{console.error(e.stack);process.exitCode=1;});',original);
