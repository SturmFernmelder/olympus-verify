// Source-only complete-profile checker/generator. Never opens an installed database or provider.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const root=path.join(__dirname,'..'),schema=fs.readFileSync(path.join(root,'schema.sql'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifestBytes=fs.readFileSync(path.join(root,'schema/rejection-provenance-next-profile-v1.json'));
if(hash(manifestBytes)!=='287668140aff83df1fc0ae757e77d87f733a6e67dc8365eb7db2e31ae6a7533e')throw Error('next source manifest raw pin changed');
const manifest=JSON.parse(manifestBytes),semanticBytes=fs.readFileSync(path.join(root,'schema/rejection-provenance-next-epoch.sql'));
if(manifest.schema!=='privacy-rejection-next-whole-source-profile-v1'||manifest.sourceOnly!==true||manifest.nativeQualified!==false||hash(schema)!==manifest.schemaSHA256||hash(semanticBytes)!==manifest.semanticSQLSHA256)throw Error('closed next source manifest differs');
const SEMANTIC_NAMES=["privacy_rejection_decisions_expire_before_delete","privacy_rejection_expiry_control_no_insert","privacy_rejection_expiry_control_no_delete","privacy_rejection_expiry_control_guard","privacy_rejection_expiry_control_page","privacy_rejection_decisions_immutable","site_users_account_incarnation_immutable","site_users_rejection_owner_delete","qr_beta_fern_window_immutable","qr_beta_key_window_immutable","qr_beta_challenge_window_immutable","qr_beta_proof_window_immutable","qr_beta_request_window_immutable"];
const SEMANTIC_PREFIX="-- Closed source semantic input; routes never install this file.\n";
const sameSemantic=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
if(!sameSemantic(manifest.semanticTriggerNames,SEMANTIC_NAMES)||manifest.semanticSourcePrefix!==SEMANTIC_PREFIX||!Array.isArray(manifest.semanticBodies)||manifest.semanticBodies.length!==13||!sameSemantic(manifest.semanticBodies.map(t=>t.name),SEMANTIC_NAMES))throw Error('closed thirteen semantic identities differ');
for(const layout of [manifest.canonical,manifest.recordedLive]){
 if(!sameSemantic(layout.triggers.filter(t=>SEMANTIC_NAMES.includes(t.name)),manifest.semanticBodies)||new Set(layout.triggers.map(t=>t.name)).size!==layout.triggers.length)throw Error('complete semantic layout linkage differs');
}
if(semanticBytes.toString('utf8')!==SEMANTIC_PREFIX+manifest.semanticBodies.map(t=>t.sql+';').join('\n\n')+'\n'||hash(semanticBytes)!==manifest.semanticSQLSHA256)throw Error('complete semantic source bodies differ');
const slot='privacy_write_admission',protocol='olympus-write-admission-epoch-2';
const predecessorBytes=fs.readFileSync(path.join(root,'schema/admission-epoch-predecessor-153.json'));
if(hash(predecessorBytes)!=='40d14b9ea7394d43ea9c243c0d2d0292d381611061be1d62107cc8681dd80b2e')throw Error('epoch predecessor source pin changed');
const predecessor=JSON.parse(predecessorBytes),physicalBytes=fs.readFileSync(path.join(root,'schema/admission-physical-2026-10-10.json'));
if(hash(physicalBytes)!=='b118d244e513ad4241bf142f0a800e16fa46689ba216e582000d6623c9e58f64')throw Error('physical source capture pin changed');
const db=new DatabaseSync(':memory:');db.exec(schema.toString('utf8'));
const RAW_CANONICAL_BETA_NAMES=SEMANTIC_NAMES.slice(8);
if(RAW_CANONICAL_BETA_NAMES.length!==5)throw Error('canonical raw B1 trigger identities differ');
const rawCanonicalTriggers=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all();
const expectedRawCanonicalTriggers=manifest.semanticBodies.filter(t=>RAW_CANONICAL_BETA_NAMES.includes(t.name)).map(t=>({name:t.name,sql:t.sql})).sort((a,b)=>a.name.localeCompare(b.name));
if(rawCanonicalTriggers.length!==5||!sameSemantic(rawCanonicalTriggers,expectedRawCanonicalTriggers))throw Error('canonical raw exact B1 triggers differ');
const getTables=d=>d.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND substr(lower(name),1,7)<>'sqlite_' AND name<>'_cf_KV' AND name<>? ORDER BY name").all(slot).map(t=>({...t,columns:d.prepare(`PRAGMA table_info("${t.name}")`).all().map(p=>p.name).sort()}));
const getIndexes=d=>d.prepare("SELECT name,sql,tbl_name FROM sqlite_master WHERE type='index' AND substr(lower(name),1,7)<>'sqlite_' ORDER BY name").all();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
if(!same(getTables(db),manifest.canonical.tables)||!same(getIndexes(db),manifest.canonical.indexes))throw Error('canonical native whole profile differs');
const physical=new DatabaseSync(':memory:');for(const t of manifest.recordedLive.tables)physical.exec(t.sql);physical.exec(manifest.recordedLive.slotSQL);for(const i of manifest.recordedLive.indexes)physical.exec(i.sql);
if(!same(getTables(physical),manifest.recordedLive.tables)||!same(getIndexes(physical),manifest.recordedLive.indexes))throw Error('recorded complete next profile differs');
const triggers=manifest.canonical.triggers,slotSQL=manifest.canonical.slotSQL,slotColumns=manifest.canonical.slotColumns;
if(!same(triggers,manifest.recordedLive.triggers)||new Set(triggers.map(t=>t.name)).size!==triggers.length)throw Error('semantic collision/whole profile differs');
for(const target of [db,physical]){
 const installed=target.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger'").all();
 for(const t of manifest.semanticBodies){const existing=installed.find(x=>x.name===t.name);if(existing){if(existing.sql!==t.sql)throw Error('original installed semantic body differs');}else target.exec(t.sql+';');}
 for(const t of triggers)if(!SEMANTIC_NAMES.includes(t.name))target.exec(t.sql);
}
const nativeTriggers=d=>d.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger'").all();
const set=x=>x.slice().sort((a,b)=>a.name.localeCompare(b.name));
if(!same(set(nativeTriggers(db)),set(triggers))||!same(set(nativeTriggers(physical)),set(triggers)))throw Error('native exact semantic set differs');
const objectRows=d=>d.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name").all().map(r=>[r.type,r.name,r.tbl_name,r.sql]);
if(!same(objectRows(db),manifest.canonicalObjects)||!same(objectRows(physical),manifest.recordedLiveObjects))throw Error('complete BINARY object profile differs');
const tables=manifest.canonical.tables,indexes=manifest.canonical.indexes,expected=JSON.stringify(manifest.canonical),physicalExpected=JSON.stringify(manifest.recordedLive);
physical.close();
const content=`/** Generated from joined .141 canonical schema and exact read-only physical metadata.\n * Baseline main16b1d083 + reviewed c274/9b9/c7cd source integration; --check binds every current byte.\n * The historical protocol identifier is retained; it grants no provider drain or activation claim. */\nexport const ADMISSION_SOURCE_COMMIT='16b1d08369fdd77af4b9cf2da057e199c099566a';\nexport const ADMISSION_SOURCE_SCHEMA_SHA256='${hash(schema)}';\nexport const ADMISSION_MANIFEST_SHA256='${hash(expected)}';\nexport const ADMISSION_CONTROL_TABLE='${slot}';\nexport const ADMISSION_PROTOCOL='${protocol}';\nexport const ADMISSION_CONTROL_DDL=${JSON.stringify(slotSQL)};\nexport const ADMISSION_EXPECTED_JSON=${JSON.stringify(expected)};\n`;
const complete=content+`/** Exact whole recorded-live layout plus only the two new source tables. No per-table mixing. */\nexport const ADMISSION_PHYSICAL_CAPTURE_SHA256='${hash(physicalBytes)}';\nexport const ADMISSION_PHYSICAL_MANIFEST_SHA256='${hash(physicalExpected)}';\nexport const ADMISSION_PHYSICAL_EXPECTED_JSON=${JSON.stringify(physicalExpected)};\n`;
const epochComplete=complete+`/** Exact public .153 N5 SOURCE predecessor only; no installed or provider-authenticated claim. */\nexport const ADMISSION_PREDECESSOR_VECTOR='${predecessor.sourceVector}';\nexport const ADMISSION_PREDECESSOR_TREE='${predecessor.sourceTree}';\nexport const ADMISSION_PREDECESSOR_JSON=${JSON.stringify(JSON.stringify(predecessor))};\n`;
const cookieComplete=epochComplete+`export const ADMISSION_COOKIE_MIGRATION_SOURCES_JSON=${JSON.stringify(JSON.stringify(manifest.cookieMigrationSources))};\nexport const ADMISSION_COOKIE_MIGRATION_DECLARATIONS_JSON=${JSON.stringify(JSON.stringify(manifest.cookieMigrationColumnDeclarations))};\nexport const ADMISSION_COOKIE_MIGRATION_OBJECTS_JSON=${JSON.stringify(JSON.stringify({canonical:manifest.canonicalObjects,recordedLive:manifest.recordedLiveObjects}))};\n`;
const file=path.join(root,'src/privacy-write-admission-catalogue.ts');
if(process.argv.includes('--check')){if(fs.readFileSync(file,'utf8')!==cookieComplete)throw Error('source admission catalogue differs; regenerate');}
else fs.writeFileSync(file,cookieComplete);
console.log(JSON.stringify({tables:tables.length,control:1,triggers:triggers.length,indexes:indexes.length,schemaSHA256:hash(schema),manifestSHA256:hash(expected),check:process.argv.includes('--check')}));db.close();
