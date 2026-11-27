// Derive the additive schema from the two maintained SQL migrations using SQLite's actual stored DDL.
const fs = require('node:fs');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
const dir = path.resolve(__dirname, '..');
const files = ['2026-11-27-raid-teams.sql','2026-11-27-raid-team-calendar.sql'];
const source = files.map(file => fs.readFileSync(path.join(dir,'migrations',file),'utf8').trimEnd()).join('\n\n')+'\n';
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE characters(guid TEXT, discord_id TEXT); CREATE TABLE community_events(id TEXT PRIMARY KEY)');
const initial = new Set(db.prepare('SELECT name FROM sqlite_schema').all().map(r=>r.name));
for (const sql of files) db.exec(fs.readFileSync(path.join(dir,'migrations',sql),'utf8'));
const tables = db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='table' ORDER BY name").all()
  .filter(t=>!initial.has(t.name)).map(t=>({...t,columns:db.prepare('SELECT name FROM pragma_table_info(?) ORDER BY name').all(t.name).map(x=>x.name)}));
if(tables.length!==5)throw Error('Unexpected number of raid tables');
const guards=tables.flatMap(({name})=>['INSERT','UPDATE','DELETE'].map(operation=>
  'CREATE TRIGGER "privacy_admit_'+name+'_'+operation.toLowerCase()+'" BEFORE '+operation+' ON "'+name+'" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol=\'olympus-write-admission-epoch-2\' AND mode=\'serving\' AND length(epoch)=32 AND epoch NOT GLOB \'*[^0-9a-f]*\' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB \'*[^0-9a-f]*\' AND purpose IN(\'writer\',\'lifecycle\')) THEN 1 ELSE RAISE(ABORT,\'privacy_write_admission_required\') END; END'
));
for(const trigger of guards) db.exec(trigger);
const rows = db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name').all().filter(r=>!initial.has(r.name));
const indexes=rows.filter(r=>r.type==='index' && r.sql!==null).map(({name,sql,tbl_name})=>({name,sql,tbl_name}));
const triggers=rows.filter(r=>r.type==='trigger').map(({name,sql})=>({name,sql}));
const objects=rows.map(r=>[r.type,r.name,r.tbl_name,r.sql]);
const extension={tables,indexes,triggers,objects};
const comment='// Generated from the two raid-team migrations by scripts/build-raid-team-schema.cjs.\n';
const freeze='function freeze<T extends object>(value:T):T {\n  for(const child of Object.values(value)) if(child && typeof child===\'object\') freeze(child);\n  return Object.freeze(value);\n}\n';
const marker='-- Raid team schema, generated from the two 2026-11-27 migrations.\n';
const schema=fs.readFileSync(path.join(dir,'schema.sql'),'utf8').split(marker)[0].trimEnd()+'\n\n'+marker+source;
const outputs = {
  'schema.sql':schema,
  'src/raid-schema-data316.ts':comment+freeze+'export const RAID_SCHEMA_DATA316=freeze('+JSON.stringify(extension,null,2)+');\n',
  'migrations/2026-11-27-raid-team-write-guards.sql':'-- Install atomically with both table migrations in an admitted production epoch.\n'+guards.map(s=>s+';').join('\n')+'\n',
};
for(const [file,contents] of Object.entries(outputs)) {
  const target=path.join(dir,file);
  if(process.argv.includes('--check')) {
    if(fs.readFileSync(target,'utf8')!==contents) throw Error('Out of date: '+file);
  } else fs.writeFileSync(target,contents);
}
console.log('Raid team schema: '+tables.length+' tables, '+indexes.length+' indexes, '+guards.length+' guards, '+objects.length+' physical rows.');
db.close();
