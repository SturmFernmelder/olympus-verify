// Exercise the same SQL statements exported for D1 against SQLite, including atomic failure exits.
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {migration,render,baseline,delta}=require('../scripts/raid-schema-migration316.cjs');
const epoch='1'.repeat(32);
function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  const p=baseline.profile;
  for(const t of p.tables)db.exec(t.sql);
  db.exec(p.slotSQL);
  for(const t of p.indexes)db.exec(t.sql);
  db.prepare('INSERT INTO privacy_write_admission VALUES(1,?,0,?,?,0,0,?,?)').run('olympus-write-admission-epoch-2','','',epoch,'serving');
  db.exec("INSERT INTO site_settings(key,value,updated_at) VALUES('auditTypedNames','115',1)");
  for(const t of p.triggers)db.exec(t.sql);
  return db;
}
function atomic(db,script){
  db.exec('BEGIN IMMEDIATE');
  try{db.exec(script);db.exec('COMMIT');}
  catch(e){db.exec('ROLLBACK');throw e;}
}
const exists=(db,name)=>!!db.prepare('SELECT 1 FROM sqlite_schema WHERE name=?').get(name);
const script=render(epoch);
{
  const db=fixture();atomic(db,script);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_schema WHERE type='trigger' AND name LIKE 'privacy_admit_raid_%316_%'").get().n,15);
  assert.throws(()=>db.exec("INSERT INTO raid_teams316(id) VALUES('test')"),/privacy_write_admission_required/);
  assert.throws(()=>atomic(db,script));assert(exists(db,'raid_teams316'));
  assert.equal(db.prepare('SELECT count(*) n FROM pragma_foreign_key_check').get().n,0);db.close();
}
for(const changed of ['CREATE TABLE unexpected(x)','DROP TRIGGER privacy_admit_audit_insert',
  "UPDATE privacy_write_admission SET mode='closed'", "UPDATE privacy_write_admission SET epoch='"+'a'.repeat(32)+"'"]){
  const db=fixture();db.exec(changed);assert.throws(()=>atomic(db,script));assert(!exists(db,'raid_teams316'));db.close();
}
{
  const db=fixture(),statements=migration(epoch);
  const index=statements.findIndex(s=>s.startsWith('CREATE TRIGGER "privacy_admit_raid_'));
  assert(index>0);
  statements.splice(index,1);assert.throws(()=>atomic(db,statements.join(';\n')+';'));assert(!exists(db,'raid_teams316'));db.close();
}
{
  const db=fixture();db.exec('CREATE INDEX audit_reconcile266 ON audit(action, actor, subject, ts DESC, id DESC)');
  atomic(db,script);assert(exists(db,'audit_reconcile266'));db.close();
}
{
  const db=fixture();db.exec('CREATE INDEX audit_reconcile266 ON audit(action)');assert.throws(()=>atomic(db,script));assert(!exists(db,'raid_teams316'));db.close();
}
console.log('Raid schema migration passed positive and negative transactions ('+delta.objects.length+' exact physical additions).');
