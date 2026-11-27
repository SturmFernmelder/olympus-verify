// Offline generator for a single atomic D1 file import. It never connects to a provider.
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {RAID_SCHEMA_DATA316:delta}=require('../src/raid-schema-data316.ts');
const {D1_PERFORMANCE_INDEX_DDL,D1_PERFORMANCE_INDEX_NAME}=require('../src/d1-performance-index.ts');
const frozen=require('../schema/rejection-provenance-next-profile-v1.json');
const baseline=frozen.cookieMigrationSources['current-cookie-pre-seal'].recordedLive;
const publicRows=frozen.cookieMigrationSources['public-predecessor'].recordedLive.objects;
const providerTable='CREATE TABLE _cf_METADATA (\n        key INTEGER PRIMARY KEY,\n        value BLOB\n      )';
const companions=[
  ...publicRows.filter(r=>r[1]==='_cf_KV'||r[2]==='_cf_KV'),
  ['table','_cf_METADATA','_cf_METADATA',providerTable],
  ['index',D1_PERFORMANCE_INDEX_NAME,'audit',D1_PERFORMANCE_INDEX_DDL]
];
// Hex literals preserve stored UTF-8 byte identity, also on hosts which split quoted newlines.
// SQL null is distinct from an empty DDL for SQLite's internal autoindexes.
const lit=s=>s===null?'NULL':"CAST(X'"+Buffer.from(s,'utf8').toString('hex')+"' AS TEXT)";
const tuple=r=>'('+r.map(lit).join(',')+')';
const columns='type COLLATE BINARY,name COLLATE BINARY,tbl_name COLLATE BINARY,sql COLLATE BINARY';
const actual='SELECT '+columns+' FROM main.sqlite_master';
const assert=(predicate,label)=>"SELECT CASE WHEN ("+predicate+") THEN 1 ELSE json_extract('"+label+"','$') END AS checked";
function checkObjects(rows,label) {
  const checks=[];
  const values=companions.map(tuple).join(',');
  checks.push(assert('(SELECT count(*) FROM main.sqlite_master)='+rows.length+'+(SELECT count(*) FROM ('+actual+' INTERSECT SELECT * FROM (VALUES '+values+'))) ',label+'_unexpected_object'));
  let chunk=[],size=0;
  function flush() {
    if(chunk.length)checks.push(assert('NOT EXISTS(SELECT * FROM (VALUES '+chunk.join(',')+') EXCEPT '+actual+')',label+'_missing_or_changed'));
    chunk=[];size=0;
  }
  for(const row of rows) {
    const value=tuple(row);
    if(size+value.length>24000)flush();
    chunk.push(value);size+=value.length+1;
  }
  flush();
  return checks;
}
function preflight(epoch) {
  if(!/^[0-9a-f]{32}$/.test(epoch))throw Error('Expected the exact 32-hex installed epoch.');
  const sql="(SELECT count(*) FROM privacy_write_admission)=1 AND EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND typeof(singleton)='integer' AND protocol='olympus-write-admission-epoch-2' AND epoch="+lit(epoch)+" AND mode='serving' AND active=0 AND typeof(active)='integer' AND nonce='' AND purpose='' AND typeof(entry_changes)='integer' AND entry_changes>=0 AND typeof(logical_changes)='integer' AND logical_changes>=0)"
    +" AND (SELECT foreign_keys FROM pragma_foreign_keys)=1 AND NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check) AND NOT EXISTS(SELECT 1 FROM temp.sqlite_master)"
    +" AND EXISTS(SELECT 1 FROM site_settings WHERE key='auditTypedNames' AND value='115') AND NOT EXISTS(SELECT 1 FROM site_applications WHERE position IN('raid_leader','raid_assist')) AND NOT EXISTS(SELECT 1 FROM site_votes WHERE ballot='raid_leader')"
    +" AND NOT EXISTS(SELECT 1 FROM audit WHERE action='site.settings' AND CASE WHEN json_valid(details) THEN json_type(details,'$.appointed') IS NOT NULL OR json_type(details,'$.notice')='text' ELSE 1 END)";
  return assert(sql,'raid_epoch_or_standing_refused');
}
function migration(epoch) {
  const neutral=preflight(epoch);
  const order=['raid_teams316','raid_raider_profiles316','raid_team_seats316','raid_team_events316','raid_team_invites316'];
  const create=[...order.map(name=>delta.tables.find(t=>t.name===name).sql),...delta.indexes.map(t=>t.sql),...delta.triggers.map(t=>t.sql)];
  return [neutral,...checkObjects(baseline.objects,'raid316_predecessor'),...create,
    ...checkObjects([...baseline.objects,...delta.objects],'raid316_successor'),neutral];
}
function render(epoch) {return migration(epoch).map(sql=>sql+';').join('\n')+'\n';}
function readEpoch(file) {
  const db=new DatabaseSync(file,{readOnly:true});
  try {const row=db.prepare('SELECT epoch FROM privacy_write_admission WHERE singleton=1').get();return row?.epoch;}
  finally {db.close();}
}
if(require.main===module) {
  const args=process.argv.slice(2),flag=(name)=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
  const out=flag('--output'),epochFile=flag('--epoch-file'),backup=flag('--from-db');
  if(!out||(!epochFile===!backup))throw Error('Usage: node scripts/raid-schema-migration316.cjs (--from-db RESTORED.sqlite | --epoch-file PRIVATE-FILE) --output PRIVATE.sql');
  const sql=render(backup?readEpoch(backup):fs.readFileSync(epochFile,'utf8').trim());
  fs.writeFileSync(path.resolve(out),sql,{flag:'wx',mode:0o600});
  console.log('Wrote one transaction input with predecessor and successor proofs. No provider was contacted.');
}
module.exports={migration,render,baseline,delta};
