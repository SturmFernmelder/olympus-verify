import { exactDiscordNames, refreshVerifiedNames, refreshNames } from '../src/names';
import { ADMISSION_EXPECTED_JSON, ADMISSION_PROTOCOL } from '../src/privacy-write-admission-catalogue';
import { createPrivacyWriteAdmissionDatabase } from '../src/privacy-write-admission';

const epoch = 'a'.repeat(32);
const guild = '900000000000000001';
const subject = suffix => String(800000000000000000n + BigInt(suffix));
const target = n => ({ subject:subject(n), nameKey:'fixture '+n, guid:'Player-99-'+String(n).padStart(8,'0'), privacy:null });
const checks = [];
function check(label, condition) {
  if (!condition) throw Error(label);
  checks.push(label);
}

export default {async fetch(request, bindings) {
  const db=bindings.DB;
  const catalogue=JSON.parse(ADMISSION_EXPECTED_JSON);
  const schema=[...catalogue.tables,...catalogue.indexes].map(row=>db.prepare(row.sql));
  schema.push(db.prepare(catalogue.slotSQL));
  while(schema.length) await db.batch(schema.splice(0,40));
  await db.prepare("INSERT INTO privacy_write_admission VALUES(1,?1,0,'','',0,0,?2,'serving')").bind(ADMISSION_PROTOCOL,epoch).run();
  await db.prepare("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)").run();
  await db.prepare("INSERT INTO site_settings(key,value,updated_at) VALUES('auditTypedNames','115',1)").run();
  for(let n=1;n<=8;n++) {
    const t=target(n);
    await db.prepare('INSERT INTO members(discord_id) VALUES(?1)').bind(t.subject).run();
    if(n!==5) await db.prepare("INSERT INTO characters(name_key,name,guid,discord_id,status,bound_at) VALUES(?1,?1,?2,?3,'member',1)").bind(t.nameKey,t.guid,t.subject).run();
  }
  const triggers=catalogue.triggers.map(row=>db.prepare(row.sql));
  while(triggers.length)await db.batch(triggers.splice(0,40));
  const env={DB:createPrivacyWriteAdmissionDatabase(db,'writer','canonical',epoch),DISCORD_BOT_TOKEN:'fixture',GUILD_ID:guild};
  check('real D1 privacy admission permits the active fixture',!!(await env.DB.prepare('SELECT banned FROM members WHERE discord_id=?1').bind(subject(1)).first()));
  const read=n=>db.prepare('SELECT username,global_name,names_at FROM members WHERE discord_id=?1').bind(subject(n)).first();
  const observed=async(n,names)=>{const r=await read(n);return r.username===names && (names?Number.isInteger(r.names_at):r.names_at===null);};
  // The driver returns valid, wrong-account, unavailable, blank and pending member responses respectively.
  for(const n of [1,2,3,4,5,6])await refreshVerifiedNames(env,target(n));
  check('exact provider account was cached with global display name',await observed(1,'valid_account')&&(await read(1)).global_name==='Valid Account');
  check('reply from another Discord account cannot write its handle',await observed(2,null));
  check('provider unavailability leaves the original verified identity and empty cache',await observed(3,null));
  check('empty provider username leaves a verified record without a fabricated handle',await observed(4,null));
  check('unlinked account never reached the provider',await observed(5,null));
  check('pending guild member cannot supply a handle',await observed(6,null));
  await refreshVerifiedNames(env,target(1));
  await env.DB.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?1,?2,'active',1,1,1)").bind(subject(7),'b'.repeat(32)).run();
  await refreshVerifiedNames(env,target(7));
  check('new privacy generation blocks a deferred task captured during absence',await observed(7,null));
  await refreshVerifiedNames(env,{...target(8),guid:target(3).guid});
  check('original name and GUID must identify the same current member',await observed(8,null));
  check('invalid Unicode cannot poison the display file',exactDiscordNames(subject(1),{id:subject(1),username:'bad\uD800'})===null
    &&exactDiscordNames(subject(1),{id:subject(1),username:'valid',global_name:'bad\uDC00'}).global_name===null);
  // Two missing handles and a stale populated handle compete for a one-request budget.
  await env.DB.prepare("UPDATE members SET banned=1 WHERE discord_id NOT IN(?1,?2,?3)").bind(subject(1),subject(2),subject(4)).run();
  await env.DB.prepare('UPDATE members SET names_at=1 WHERE discord_id=?1').bind(subject(1)).run();
  const before=await db.prepare('SELECT COUNT(*) AS n FROM characters').first();
  // Move only the test Worker's scheduling clock; D1 retains its genuine native clock.
  const realClock=Date.now;
  let tick=Math.floor(realClock()/7_200_000)*8+1;
  let cronSelection;
  const cronEnv={...env,DB:{prepare(sql) {
    if(sql.startsWith('WITH due AS')) cronSelection=sql;
    return env.DB.prepare(sql);
  }}};
  try {
    Date.now=()=>tick*900_000;
    const refused=await refreshNames(cronEnv,5);
    check('provider refusal never records a successful fetch',refused.refreshed===0&&await observed(4,null));
    tick++;
    const fallback=await refreshNames(env,5);
    check('next cron reaches another missing member without touching the stale handle',fallback.refreshed===1&&await observed(2,'fallback_handle')&&(await read(1)).names_at===1);
    tick+=2;
    const stale=await refreshNames(env,5);
    check('periodic stale-handle refresh also progresses despite a refused blank',stale.refreshed===1&&await observed(1,'fallback_handle'));
    const plan=await db.prepare('EXPLAIN QUERY PLAN '+cronSelection).bind(tick*900-604800,1,tick).all();
    check('scheduled selection uses the partial privacy job index for each subject',
      plan.results.some(r=>/SEARCH j USING (?:COVERING )?INDEX privacy_serving_jobs_open/.test(r.detail))
      &&!plan.results.some(r=>/\bSCAN j\b/.test(r.detail)));
  } finally { Date.now=realClock; }
  const after=await db.prepare('SELECT COUNT(*) AS n FROM characters').first();
  check('metadata lookups never create or remove linked characters',before.n===after.n);
  return Response.json({checks});
}};
