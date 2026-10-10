// Source-only generator/checker. Never connects to D1 or reads an installed database.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const root=path.join(__dirname,'..'),schema=fs.readFileSync(path.join(root,'schema.sql'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const db=new DatabaseSync(':memory:');db.exec(schema.toString('utf8'));
const slot='privacy_write_admission',protocol='olympus-write-admission-experiment-1';
const tables=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND substr(lower(name),1,7)<>'sqlite_' AND name<>'_cf_KV' AND name<>? ORDER BY name").all(slot).map(t=>({...t,columns:db.prepare(`PRAGMA table_info("${t.name}")`).all().map(p=>p.name).sort()}));
const indexes=db.prepare("SELECT name,sql,tbl_name FROM sqlite_master WHERE type='index' AND substr(lower(name),1,7)<>'sqlite_' ORDER BY name").all();
const slotSQL=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(slot)?.sql;
if(!slotSQL||tables.length!==66||indexes.length!==78||db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger'").get().n!==0)throw Error('closed source schema census changed');
const slotColumns=db.prepare(`PRAGMA table_info(${slot})`).all().map(p=>p.name).sort();
const triggers=tables.flatMap(t=>['INSERT','UPDATE','DELETE'].map(event=>{const name=`privacy_admit_${t.name}_${event.toLowerCase()}`;return {name,sql:`CREATE TRIGGER "${name}" BEFORE ${event} ON "${t.name}" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM ${slot} WHERE singleton=1 AND protocol='${protocol}' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END`};}));
const expected=JSON.stringify({tables,indexes,triggers,slotSQL,slotColumns});
// Exact Root read-only sqlite_master capture, 10 October 2026; no business rows were read.
const physicalBytes=fs.readFileSync(path.join(root,'schema/admission-physical-2026-10-10.json'));
if(hash(physicalBytes)!=='b118d244e513ad4241bf142f0a800e16fa46689ba216e582000d6623c9e58f64')throw Error('physical source capture pin changed');
const physicalRows=JSON.parse(physicalBytes),physical=new DatabaseSync(':memory:');
const oldTables=physicalRows.filter(r=>r.type==='table'&&!r.name.startsWith('sqlite_')&&r.name!=='_cf_KV');
if(oldTables.length!==65||physicalRows.some(r=>r.type==='trigger'))throw Error('recorded physical source census changed');
for(const t of oldTables)physical.exec(t.sql);
for(const i of physicalRows.filter(r=>r.type==='index'&&!r.name.startsWith('sqlite_')))physical.exec(i.sql);
physical.exec(tables.find(t=>t.name==='ruleset_publications').sql);physical.exec(slotSQL);
const physicalTables=physical.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND substr(lower(name),1,7)<>'sqlite_' AND name<>? ORDER BY name").all(slot).map(t=>({...t,columns:physical.prepare(`PRAGMA table_info("${t.name}")`).all().map(p=>p.name).sort()}));
const physicalIndexes=physical.prepare("SELECT name,sql,tbl_name FROM sqlite_master WHERE type='index' AND substr(lower(name),1,7)<>'sqlite_' ORDER BY name").all();
if(JSON.stringify(physicalTables.map(t=>[t.name,t.columns]))!==JSON.stringify(tables.map(t=>[t.name,t.columns]))||physicalIndexes.length!==78)throw Error('recorded physical tuple differs from reviewed source fields');
const physicalExpected=JSON.stringify({tables:physicalTables,indexes:physicalIndexes,triggers,slotSQL,slotColumns});physical.close();
const content=`/** Generated from joined .141 canonical schema and exact read-only physical metadata.\n * Baseline main16b1d083 + reviewed c274/9b9/c7cd source integration; --check binds every current byte.\n * The historical protocol identifier is retained; it grants no provider drain or activation claim. */\nexport const ADMISSION_SOURCE_COMMIT='16b1d08369fdd77af4b9cf2da057e199c099566a';\nexport const ADMISSION_SOURCE_SCHEMA_SHA256='${hash(schema)}';\nexport const ADMISSION_MANIFEST_SHA256='${hash(expected)}';\nexport const ADMISSION_CONTROL_TABLE='${slot}';\nexport const ADMISSION_PROTOCOL='${protocol}';\nexport const ADMISSION_CONTROL_DDL=${JSON.stringify(slotSQL)};\nexport const ADMISSION_EXPECTED_JSON=${JSON.stringify(expected)};\n`;
const complete=content+`/** Exact whole recorded-live layout plus only the two new source tables. No per-table mixing. */\nexport const ADMISSION_PHYSICAL_CAPTURE_SHA256='${hash(physicalBytes)}';\nexport const ADMISSION_PHYSICAL_MANIFEST_SHA256='${hash(physicalExpected)}';\nexport const ADMISSION_PHYSICAL_EXPECTED_JSON=${JSON.stringify(physicalExpected)};\n`;
const file=path.join(root,'src/privacy-write-admission-catalogue.ts');
if(process.argv.includes('--check')){if(fs.readFileSync(file,'utf8')!==complete)throw Error('source admission catalogue differs; regenerate');}
else fs.writeFileSync(file,complete);
console.log(JSON.stringify({tables:tables.length,control:1,triggers:triggers.length,indexes:indexes.length,schemaSHA256:hash(schema),manifestSHA256:hash(expected),check:process.argv.includes('--check')}));db.close();
