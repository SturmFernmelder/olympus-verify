/** Independent character-only audit erasure: original writers, native SQLite and real role closure. */
const fs=require('fs'),path=require('path'),Module=require('module');
const worker=process.env.PRIVACY_REVIEW_WORKER||path.join(__dirname,'..');
const original=path.join(worker,'tests/privacy_serving_integration_test.cjs'),source=fs.readFileSync(original,'utf8'),marker='(async()=>{';
if(source.split(marker).length!==2)throw Error('canonical setup boundary changed');
async function review(){
 const ingest=load('ingest'),writer=load('db'),name='Probe Name',key='probe name';
 function setup(){const t=reset();db.prepare('INSERT INTO members(discord_id,banned)VALUES(?,0)').run(ID);db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,source)VALUES(?,?,?,'verified',?,'fixture')").run(key,name,ID,t-10);return t;}
 const actionPairs=[...['note.set','note.failed','invite.failed','invite.fired','invite.joined','verify.roster_not_current','verify.guid_pinned','roster.remove_failed','roster.removed_unlinked'].map(a=>['watcher',a]),...['invite.declined','invite.expired','role.remove_held','role.remove_failed','nick.failed'].map(a=>['system',a])];
 async function finish(){const proof=await admission(),out=await eraser.continueServingErasure(env(),proof);check('genuine original-role closure completes serving erasure',out.state==='complete'&&out.servingAccountErased&&!raw('SELECT * FROM characters WHERE discord_id=?',ID));return out;}
 let t=setup();const result=await ingest.postEvents(env(),{events:[{type:'note',name,ok:true,detail:'Own private officer note'}]});
 const actualNote=raw("SELECT * FROM audit WHERE action='note.set' AND subject=?",name);
 check('actual character-only watcher writer committed its original note',result.status===200&&actualNote?.details.includes('Own private officer note'));
 const eraseIds=[],preserveIds=[];function insert(ts,actor,action,subject,details,erase){const id=Number(db.prepare('INSERT INTO audit(ts,actor,action,subject,details)VALUES(?,?,?,?,?)').run(ts,actor,action,subject,JSON.stringify(details)).lastInsertRowid);(erase?eraseIds:preserveIds).push(id);}
 for(const[actor,action]of actionPairs){insert(t-10,actor,action,name,{result:'after current proven binding'},true);insert(t-9,actor,action,key,{result:'exact normalized key'},true);insert(t-11,actor,action,name,{result:'before current owner binding'},false);insert(t,actor,action,'Other Name',{result:'another character owner'},false);}
 insert(t,OTHER,'note.set',name,{detail:'Different named staff actor is not this source action'},false);
 insert(t,'watcher','guild.full',name,{detail:'Unknown action attribution'},false);
 insert(t,'watcher','note.set','Prefix '+name,{detail:'A larger subject is not the exact character'},false);
 insert(t,'watcher','guild.full',null,{detail:'An arbitrary mention of '+name+' must survive'},false);
 insert(t,'watcher','guild.full',null,{detail:'The typed marker is not fabricated from user text',_privacySubjectIds:[OTHER]},false);
 const preserved=JSON.stringify(preserveIds.map(id=>raw('SELECT * FROM audit WHERE id=?',id)));
 await finish();check('actual note is gone while character evidence existed',!raw('SELECT * FROM audit WHERE id=?',actualNote.id));
 check('every enumerated writer and exact name/key is erasable within proven binding interval',eraseIds.every(id=>!raw('SELECT * FROM audit WHERE id=?',id)));
 check('prior-owner interval, other character, other actor, unknown action and arbitrary text are byte-preserved',JSON.stringify(preserveIds.map(id=>raw('SELECT * FROM audit WHERE id=?',id)))===preserved);
 // New references must remain attributable if the character is renamed/unlinked before eventual erasure.
 t=setup();const capture=await authority.readPrivacySubject(env(),ID);
 await writer.audit(env(),'watcher','note.set',name,{detail:'Original controlled alias note'},[{subject:ID,capture},{subject:ID,capture}]);
 const originalNote=raw("SELECT * FROM audit WHERE action='note.set' AND subject=?",name),stored=JSON.parse(originalNote.details);
 check('controlled future audit retains one deduplicated trusted subject marker and existing detail',Array.isArray(stored._privacySubjectIds)&&stored._privacySubjectIds.length===1&&stored._privacySubjectIds[0]===ID&&stored.detail==='Original controlled alias note');
 db.prepare('UPDATE characters SET name=?,name_key=? WHERE discord_id=?').run('Renamed Probe','renamed probe',ID);
 await finish();check('renamed original captured audit reference is still erased without guessing alias text',!raw('SELECT * FROM audit WHERE id=?',originalNote.id));
 t=setup();await writer.audit(env(),'watcher','note.set',name,undefined,{subject:ID,capture:null});
 const unlinkedNote=raw("SELECT * FROM audit WHERE action='note.set' AND subject=?",name),withoutDetails=JSON.parse(unlinkedNote.details);
 check('missing detail still records original trusted subject custody with no fabricated payload',withoutDetails._privacyDetail===null&&withoutDetails._privacySubjectIds?.[0]===ID);
 db.prepare('DELETE FROM characters WHERE discord_id=?').run(ID);await finish();
 check('unlinked original captured audit remains directly erasable',!raw('SELECT * FROM audit WHERE id=?',unlinkedNote.id));
 t=setup();const attemptsBefore=attempts;let invalidRejected=false;
 try{await writer.audit(env(),'watcher','note.set',name,{detail:'Invalid reference must never be saved'}, {subject:'not-an-account',capture:null});}catch{invalidRejected=true;}
 check('invalid trusted reference is refused before database insertion',invalidRejected&&attempts===attemptsBefore&&!raw("SELECT * FROM audit WHERE action='note.set' AND subject=?",name));
 await writer.audit(env(),'watcher','note.set','Other Name',{detail:'Other original account custody',_privacySubjectIds:[ID]}, {subject:OTHER,capture:null});
 const otherNote=raw("SELECT * FROM audit WHERE subject='Other Name'"),otherDetails=JSON.parse(otherNote.details);
 check('supplied reserved keys are replaced by genuine original references',otherDetails._privacySubjectIds.length===1&&otherDetails._privacySubjectIds[0]===OTHER&&otherDetails.detail==='Other original account custody');
 await finish();check('other account trusted custody survives unchanged',JSON.stringify(raw('SELECT * FROM audit WHERE id=?',otherNote.id))===JSON.stringify(otherNote));
 t=setup();db.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?,?,'active',1,?,?)").run(ID,'e'.repeat(32),t,t);
 const activeCapture=await authority.readPrivacySubject(env(),ID);await writer.audit(env(),'watcher','note.set',name,{detail:'Conflicting capture must never pass'},[{subject:ID,capture:activeCapture},{subject:ID,capture:null}]);
 check('deduplication cannot remove conflicting original-generation refusal',!raw("SELECT * FROM audit WHERE action='note.set' AND subject=?",name));
 // Genuine held original reference cannot insert after retirement, even when the old alias still matches.
 t=setup();const originalCapture=await authority.readPrivacySubject(env(),ID);await admission();
 await writer.audit(env(),'watcher','note.set',name,{detail:'Must not appear after retirement'}, {subject:ID,capture:originalCapture});
 check('expired original captured reference creates no new raw audit after retirement',!raw("SELECT * FROM audit WHERE action='note.set' AND subject=?",name));
 // The moved audit delete remains within the same final guarded native transaction.
 t=setup();await ingest.postEvents(env(),{events:[{type:'note',name,ok:true,detail:'Rollback note'}]});let proof=await admission(),receipt=await roles.settleAccountErasureMemberRole(env(),proof),before=snapshot();
 hooks.beforeStatement=sql=>{if(sql.startsWith('DELETE FROM audit'))throw Error('independent exact audit deletion failure');};
 let out=await eraser.testOnlyLocalCompletion(env(),proof,receipt,roles.accountErasureRoleSettledSql);
 check('audit-stage failure rolls every native family/terminal record back',out.state==='unknown'&&snapshot()===before);hooks.beforeStatement=null;
 t=setup();await ingest.postEvents(env(),{events:[{type:'note',name,ok:true,detail:'Lost-copy note'}]});proof=await admission();receipt=await roles.settleAccountErasureMemberRole(env(),proof);hooks.loseResponse=true;
 out=await eraser.testOnlyLocalCompletion(env(),proof,receipt,roles.accountErasureRoleSettledSql);hooks.loseResponse=false;
 check('lost committed native result recovers the real terminal proof with note erased',out.state==='complete'&&!raw("SELECT * FROM audit WHERE action='note.set' AND subject=?",name)&&raw('SELECT state FROM privacy_subjects WHERE subject_id=?',ID)?.state==='retired');
 for(const[file,bytes]of pins)check('review source pin stable '+path.basename(file),fs.readFileSync(file).equals(bytes));
 console.log(`${passes}/${checks} independent character audit erasure checks passed`);db.close();if(passes!==checks)process.exitCode=1;
}
const mod=new Module(original);mod.filename=original;mod.paths=Module._nodeModulePaths(path.dirname(original));mod._compile(source.slice(0,source.indexOf(marker))+`\n(${review.toString()})().catch(e=>{console.error(e.stack);process.exitCode=1;});`,original);
