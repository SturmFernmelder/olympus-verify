/** Independent real ordinary writers -> genuine identify-only copy size regressions.
 * PRODUCER_ONLY validates immutable current writers while successor export source is unfinished.
 */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const worker=process.env.PRIVACY_REVIEW_WORKER||path.resolve(__dirname,'..');
const original=path.join(worker,'tests/privacy_access_test.cjs'),source=fs.readFileSync(original,'utf8'),boundary='async function main(){';
if(source.split(boundary).length!==2)throw Error('canonical genuine OAuth fixture boundary changed');
async function review(){
 const index=load('index').default,site=load('site-data'),news=load('site-news');
 const bytes=value=>new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value)).byteLength;
 async function producer(){
  const f=fixture();Object.assign(f.env,{PUBLIC_BASE_URL:'https://verify.example',SITE_ADMINS:A});
  f.db.prepare('INSERT INTO site_users(discord_id,username,first_login,last_login,session_version,in_server,denied,checked_at)VALUES(?,?,?,?,7,1,0,?)').run(A,'Original writer',f.time(),f.time(),f.time());
  f.db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('newsOn','1',?)").run(f.time());
  const cookie=(await core.sessionCookie(f.env,A,7)).split(';')[0];
  async function api(route,method,body){
   provider=null;const before=calls.length;
   const response=await index.fetch(new Request(BASE+route,{method,headers:{Cookie:cookie,Origin:BASE,'X-Olympus':core.PAGE_VERSION,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),f.env,{waitUntil(){}});
   const result=await response.json();if(response.status!==200)console.log('WRITER_DIAGNOSTIC',route,response.status,result);
   eq(route+' genuine ordinary writer admitted',response.status,200);eq(route+' performs no provider call',calls.length,before);return result;
  }
  return {f,api};
 }
 async function own(f,collection='copy',cursor=''){
  const connection=await connect(f),frm=await form(f,connection);provider=null;const before=calls.length;
  const r=await copy.exportPrivacyAccess(frm.request({collection,cursor}),f.env);eq(collection+' genuine fresh own copy admitted',r.status,200);
  eq(collection+' no provider dispatch after identity',calls.length,before);eq(collection+' normal version preserved',f.db.prepare('SELECT session_version FROM site_users WHERE discord_id=?').get(A).session_version,7);
  eq(collection+' no role intent',count(f,'role_settlements'),0);return r.json();
 }
 for(const [label,character] of[['ASCII','X'],['Unicode','😀'],['escaped ASCII','"']]){
  const {f,api}=await producer(),answers={};
  for(const q of site.QUESTIONS)answers[q.key]=q.key==='logs'?'https://example.test/'+('x'.repeat(200-'https://example.test/'.length)):character.repeat(q.max);
  answers.hours='gt20';answers.voice='yes';
  answers.professions=['alchemy','blacksmithing','cooking','first_aid','fishing'];
  answers.references=[{kind:'discord',key:B,label:'Chosen reference'},{kind:'name',key:'other reference',label:'Other reference'}];
  const saved=await api('/api/application','PUT',{position:'officer',class:'undecided',role:'tank',region:'na_east',avail:'f'.repeat(42),availTz:'UTC',answers,board:true,ack:true});
  const row=f.db.prepare('SELECT answers FROM site_applications WHERE discord_id=?').get(A),stored=JSON.parse(row.answers);
  for(const q of site.QUESTIONS){eq(label+' actual writer preserves max '+q.key,stored[q.key],answers[q.key]);eq(label+' max '+q.key+' codepoint count',Array.from(stored[q.key]).length,q.max);}
  eq(label+' actual writer response matches stored answer lengths',saved.application.answers.experience,stored.experience);
  console.log('LEGITIMATE_APPLICATION_SIZE '+JSON.stringify({label,storedAnswerBytes:bytes(row.answers),storedAnswerCodepoints:Array.from(row.answers).length,utf16:row.answers.length}));
  if(!producerOnly){const data=await own(f);for(const q of site.QUESTIONS)eq(label+' whole own application preserves valid max '+q.key,data.site.application.answers[q.key],stored[q.key]);
   eq(label+' own reference structural key withheld',data.site.application.answers.references,[{kind:'discord',label:'Chosen reference'},{kind:'name',label:'Other reference'}]);
   ok(label+' application conservative allowance still bounded',bytes(data.site.application)<131072);
  }
  f.db.close();
 }
 for(const [label,character] of[['ASCII','N'],['Unicode','😀'],['escaped ASCII','"']]){
  const {f,api}=await producer(),form=await api('/api/admin/news','GET');
  const title=character.repeat(news.NEWS_LIMITS.titleMax),body=character.repeat(news.NEWS_LIMITS.bodyMax);
  const saved=await api('/api/admin/news','POST',{id:form.opId,title,body,days:90});
  const retained=f.db.prepare('SELECT * FROM site_news_notices WHERE id=?').get(form.opId);
  eq(label+' news real writer preserves max title',retained.title,title);eq(label+' news real writer preserves max body',retained.body,body);
  eq(label+' news real writer response preserves max body',saved.notice.body,body);
  console.log('LEGITIMATE_NEWS_SIZE '+JSON.stringify({label,titleBytes:bytes(title),bodyBytes:bytes(body),bodyCodepoints:Array.from(body).length}));
  if(!producerOnly){
   const data=await own(f),preview=data.community.news.notices;eq(label+' news max own preview is readable',preview.length,1);eq(label+' news max own preview preserves title',preview[0].title,title);
   eq(label+' news own shape intentionally omits body',Object.keys(preview[0]).sort(),['id','title','postedAt','editedAt','keptUntil'].sort());
   const selected=await own(f,'community.news.notices',data.coverage.histories['community.news.notices'].currentCursor);
   eq(label+' news max own selected equals preview',selected.history.entries,preview);
   // An omitted legacy body is not a projected row and cannot make an own title-only copy fail.
   f.db.prepare('UPDATE site_news_notices SET body=? WHERE id=?').run(character.repeat(200000),form.opId);
   const restored=await own(f,'community.news.notices',data.coverage.histories['community.news.notices'].currentCursor);
   eq(label+' omitted oversized legacy body cannot refuse retained projection',restored.history.entries,preview);
  }
  f.db.close();
 }
 provider=null;console.log('privacy_history_legitimate_size_review_test: '+checks+' checks PASS'+(producerOnly?'; unfinished successor NOT executed':''));
}
const mod=new Module(original);mod.filename=original;mod.paths=Module._nodeModulePaths(path.dirname(original));
mod._compile(source.slice(0,source.indexOf(boundary))+'\nconst producerOnly='+JSON.stringify(process.env.PRIVACY_HISTORY_PRODUCER_ONLY==='1')+';\n('+review.toString()+')().catch(e=>{console.error(e.stack);process.exitCode=1;});',original);
