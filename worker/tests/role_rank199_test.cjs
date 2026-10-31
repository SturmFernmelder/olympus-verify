// Finite .199 catalogue regression, required by the existing office-key leaf.
// No schema, browser, network, provider or game actions.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const repo=path.join(__dirname,'../..'),organization=JSON.parse(fs.readFileSync(path.join(repo,'worker/public/static/governance/organization.json'),'utf8'));
const browserModule={exports:{}};new Function('module','exports',fs.readFileSync(path.join(repo,'worker/public/static/role-rank199.js'),'utf8'))(browserModule,browserModule.exports);const browser=browserModule.exports;
const source=fs.readFileSync(path.join(repo,'worker/src/governance-offices.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};new Function('module','exports',compiled)(mod,mod.exports);const server=mod.exports;
let n=0;const check=(name,f)=>{f();n++;console.log('PASS '+name);};
const names=['Leader','High Council','Officer','Officer Alt','Raid Leader','Veteran','Raider','Member','Alt','Initiate'];
const historicalScope218='Historical application and ballot compatibility only; current institutional display and reserved-seat admission are separate.';
// Only the six explicitly preserved fields of the two reviewed institutions
// may be reversed. Every other property remains in the original digest.
function originalTerms218(terms) {
 const specs={office_26:{ordinal:26,label:'Council of Justice',applicationLabel:'Council of Justice',acquisition:'Case-designated judicial institution; chaired by the Lord High Chancellor, with accepted unconflicted members.'},office_94:{ordinal:94,label:'War Head',applicationLabel:'War Directorate (historical shared template)',acquisition:'Historical shared War Head reference; current PvE and PvP portfolios have their own separate appointments.'}};
 const keys=['label','applicationLabel','applicationAliases','applicationEligible','applicationRoleKeys','acquisition'];
 return terms.map(current=>{
  const term=JSON.parse(JSON.stringify(current)),spec=specs[term.officeKey];
  if(!spec){assert.ok(!Object.hasOwn(term,'historicalApplicationProfile')&&!Object.hasOwn(term,'applicationMetadataScope'),'unscoped historical field');return term;}
  const prior=term.historicalApplicationProfile;
  assert.ok(prior&&typeof prior==='object'&&!Array.isArray(prior),'historical profile object');
  assert.deepEqual(Object.keys(prior).sort(),[...keys].sort(),'exact six historical fields');
  assert.equal(term.ordinal,spec.ordinal);assert.equal(term.label,spec.label);assert.equal(term.applicationLabel,spec.applicationLabel);assert.equal(term.acquisition,spec.acquisition);
  assert.equal(term.applicationMetadataScope,historicalScope218);
  for(const key of keys)assert.ok(Object.hasOwn(term,key),'current historical field present');
  for(const key of ['applicationEligible','applicationAliases','applicationRoleKeys'])assert.deepEqual(term[key],prior[key],'original compatibility field');
  for(const key of keys)term[key]=prior[key];
  delete term.historicalApplicationProfile;delete term.applicationMetadataScope;return term;
 });
}
check('all three .199 rank projections agree on exact order and zero-based slots',()=>{
 for(const rows of [organization.nativeRanks,browser.ranks,server.NATIVE_RANKS_199]){assert.deepEqual(rows.map(r=>r.name),names);assert.deepEqual(rows.map(r=>r.nativeSlot),[0,1,2,3,4,5,6,7,8,9]);assert.ok(rows.every((r,i)=>r.nativeRankOrdinal===i+1&&r.mappingApplies===false));}
});
check('all 101 stable offices and all 137 assignable keys have explicit individual classifications',()=>{
 assert.equal(organization.terms.length,101);assert.equal(server.OFFICE_APPOINTMENTS.length,137);assert.equal(new Set(server.OFFICE_APPOINTMENT_KEYS).size,137);
 assert.deepEqual(server.OFFICE_APPOINTMENTS,organization.appointments);assert.deepEqual(browser.offices,organization.appointments);
 const stable=JSON.parse(fs.readFileSync(path.join(repo,'docs/governance-office-keys.json'),'utf8'));
 assert.deepEqual(server.OFFICE_APPOINTMENTS.filter(o=>o.termOrdinal).map(o=>({key:o.key,label:o.label})),stable);
 const aliases=JSON.parse(fs.readFileSync(path.join(repo,'docs/governance-office-aliases.json'),'utf8'));
 const historicalNativeKeys=['guild_master','high_council','treasurer','officer','raid_leader','veteran','raider','member','alt','initiate'].map(key=>'rank_'+key);
 assert.deepEqual([...server.OFFICE_APPOINTMENT_KEYS].sort(),[...stable.map(o=>o.key),...aliases.map(o=>o.key),...historicalNativeKeys,'rank_officer_alt'].sort());
 for(const row of server.OFFICE_APPOINTMENTS){assert.equal(row.nativeRankOrdinal,row.nativeSlot+1);assert.equal(row.nativeRankName,names[row.nativeSlot]);assert.ok(row.codexTitles.length&&row.codexTitles.every(t=>['I','II','III','IV','V'].includes(t)));assert.ok(row.tierLabel&&row.department&&row.acquisition&&row.discordPortal);assert.equal(row.mappingApplies,false);assert.ok(Object.isFrozen(row)&&Object.isFrozen(row.codexTitles)&&Object.isFrozen(row.applicationRoleKeys));assert.ok(row.applicationRoleKeys.length<=9);assert.equal(new Set(row.applicationRoleKeys).size,row.applicationRoleKeys.length);if(!row.applicationEligible)assert.deepEqual(row.applicationRoleKeys,[]);}
});
check('High Council, Officer Corps and member specialisms never share an accidental default classification',()=>{
 const find=key=>server.OFFICE_APPOINTMENTS.find(o=>o.key===key);
 for(const key of ['office_03','office_14','office_26','office_28','office_45','office_57','office_58','office_59','office_67','office_94']){assert.equal(find(key).tier,'high_council');assert.equal(find(key).applicationTrack,'high_council');assert.equal(find(key).nativeSlot,1);assert.equal(find(key).applicationEligible,true);}
 for(const key of ['office_02','office_08','office_33','office_44','office_62','office_79','class_lead:warrior']){assert.equal(find(key).tier,'officer_corps');assert.equal(find(key).applicationTrack,'officer');assert.equal(find(key).nativeSlot,2);}
 for(const key of ['office_07','office_27']){assert.equal(find(key).tier,'member_specialist');assert.equal(find(key).applicationTrack,'artisan');assert.deepEqual(find(key).codexTitles,['V']);}
 for(const key of ['office_61','office_64','office_87']){assert.equal(find(key).statusOverlay,true);assert.equal(find(key).applicationEligible,false);assert.equal(find(key).mappingApplies,false);}
});
check('reserved executive and Treasury appointments do not fabricate an open seat or a Guild Master slot',()=>{
 const find=key=>server.OFFICE_APPOINTMENTS.find(o=>o.key===key);
 for(const key of ['co_gm','treasurer','office_19','office_86','rank_treasurer']){assert.equal(find(key).nativeSlot,1);assert.equal(find(key).applicationEligible,false);assert.equal(find(key).tier,'high_council');}
 assert.equal(find('rank_treasurer').group,'office');assert.equal(find('rank_treasurer').aliasOf,'office_86');assert.equal(find('rank_treasurer').nativeIndex,undefined);
 assert.equal(find('rank_officer_alt').group,'native');assert.equal(find('rank_officer_alt').nativeIndex,3);assert.equal(find('rank_officer_alt').nativeSlot,3);
 assert.deepEqual(server.OFFICE_APPOINTMENTS.filter(o=>o.group==='native').map(o=>o.label),names);
 assert.ok(organization.roleRank199.availability.includes('not vacancies'));
});
check('aliases and six application tracks keep a single exact source contract',()=>{
 const aliases=JSON.parse(fs.readFileSync(path.join(repo,'docs/governance-office-aliases.json'),'utf8'));
 for(const a of aliases){const row=server.OFFICE_APPOINTMENTS.find(o=>o.key===a.key);assert.equal(row.label,a.label);assert.equal(row.aliasOf,a.aliasOf);if(a.aliasOf){const base=server.OFFICE_APPOINTMENTS.find(o=>o.key===a.aliasOf);assert.equal(row.nativeSlot,base.nativeSlot);assert.equal(row.tier,base.tier);assert.equal(row.applicationTrack,base.applicationTrack);}}
 assert.deepEqual(server.APPLICATION_TRACKS_199,organization.applicationTracks);assert.deepEqual(browser.tracks,organization.applicationTracks);assert.deepEqual(browser.tracks.map(t=>t.id),['member','raider','artisan','officer','high_council','patron']);
 for(const [key,alias] of [['office_03','Systems Architect'],['office_14','Intake Minister'],['office_58','Workshop Grand Master'],['office_59','Heraldry Minister']]){const row=server.OFFICE_APPOINTMENTS.find(o=>o.key===key);assert.ok(row.applicationAliases.includes(alias));assert.equal(row.applicationLabel,row.label+' · '+row.applicationAliases[0]);assert.ok(Object.isFrozen(row.applicationAliases));}
 for(const [key,alias] of [['office_26','Privy Council / Judiciary'],['office_94','PvE War Council Director']]){const row=server.OFFICE_APPOINTMENTS.find(o=>o.key===key),term=organization.terms.find(o=>o.officeKey===key);assert.equal(row.applicationEligible,true);assert.deepEqual(row.applicationAliases,term.historicalApplicationProfile.applicationAliases);assert.deepEqual(row.applicationRoleKeys,[key]);assert.ok(Object.isFrozen(row.applicationAliases));assert.ok(row.applicationAliases.includes(alias));assert.equal(row.applicationMetadataScope,historicalScope218);assert.equal(row.applicationLabel,term.applicationLabel);assert.equal(row.acquisition,term.acquisition);assert.equal(row.nativeSlot,1);assert.equal(row.mappingApplies,false);}
 for(const ordinal of [97,98,99,100,101]){const row=server.OFFICE_APPOINTMENTS.find(o=>o.key==='office_'+ordinal);assert.ok(row.nativeMappingNote.startsWith('.218 '));assert.equal(row.applicationEligible,false);assert.equal(row.mappingApplies,false);}
 for(const [key,roles] of Object.entries({office_62:['officer'],office_79:['recruitment'],office_21:['community'],office_71:['pvp_leader'],office_51:['loot_council'],office_69:['professions'],office_33:['moderator'],office_73:['raid_assist_na','raid_assist_eu'],office_74:['raid_leader_na','raid_leader_eu']}))assert.deepEqual(server.OFFICE_APPOINTMENTS.find(o=>o.key===key).applicationRoleKeys,roles);
 assert.deepEqual(server.OFFICE_APPOINTMENTS.find(o=>o.key==='office_18').applicationRoleKeys,['warrior','paladin','hunter','rogue','priest','shaman','mage','warlock','druid'].map(c=>'class_lead:'+c));
});
check('.208 adds one separately reserved Council trading office without repurposing any prior office',()=>{
 const row=server.OFFICE_APPOINTMENTS.find(o=>o.key==='office_96');
 assert.equal(row.label,'Head of Trading & Markets');assert.equal(row.nativeSlot,1);assert.equal(row.nativeRankOrdinal,2);assert.equal(row.tier,'high_council');
 assert.equal(row.applicationEligible,false);assert.deepEqual(row.applicationRoleKeys,[]);assert.equal(row.mappingApplies,false);
 const originalTerms=JSON.stringify(originalTerms218(organization.terms.slice(0,95)));
 // Preserve the original JSON property order, as JSON.stringify does. The
 // original 95 objects were compared against accepted .207 before pinning.
 assert.equal(require('node:crypto').createHash('sha256').update(originalTerms).digest('hex'),'74fb4f44153a550b7b306789763e73932393e96124d781572c6d2db5c9b87d3b');
 assert.equal(organization.councilComposition.currentSeats.filter(seat=>seat.id==='head-trading'&&seat.familyKey==='head_trading'&&seat.officeKeys.length===1&&seat.officeKeys[0]==='office_96').length,1);
 assert.equal(server.OFFICE_APPOINTMENTS.find(o=>o.key==='office_86').label,'Treasurer (Guild Bank)');
});
check('the finite two-institution inverse preserves all96 originals and rejects unscoped or unapproved rewrites',()=>{
 const digest=terms=>require('node:crypto').createHash('sha256').update(JSON.stringify(originalTerms218(terms))).digest('hex');
 assert.equal(digest(organization.terms.slice(0,96)),'edf51ea2b8b757b359fa77b676e56644a641264df3bd06d7393390221e54a5de');
 const copy=()=>JSON.parse(JSON.stringify(organization.terms.slice(0,96)));
 const extra=copy();extra[25].historicalApplicationProfile.note='unreviewed';assert.throws(()=>originalTerms218(extra),/exact six historical fields/);
 const unscoped=copy();unscoped[0].applicationMetadataScope=historicalScope218;assert.throws(()=>originalTerms218(unscoped),/unscoped historical field/);
 const label=copy();label[25].applicationLabel='Head of Justice';assert.throws(()=>originalTerms218(label));
 const other=copy();other[25].note+=' unapproved change';assert.notEqual(digest(other),'edf51ea2b8b757b359fa77b676e56644a641264df3bd06d7393390221e54a5de');
});
check('Master218 has twelve independent Council portfolios plus the existing Leader chair',()=>{
 const seats=organization.councilComposition.currentSeats;
 assert.equal(organization.councilComposition.cabinetSeatCount,12);
 assert.equal(seats.length,13);
 assert.equal(new Set(seats.map(s=>s.id)).size,13);
 assert.equal(new Set(seats.map(s=>s.familyKey)).size,13);
 for(const [id,key] of [['main-raid-lead','office_97'],['main-pvp-lead','office_98'],['internal-security','office_99'],['concordat','office_100'],['head-justice','office_101'],['head-trading','office_96'],['heraldry','office_59']]){
  const seat=seats.find(s=>s.id===id);assert.deepEqual(seat.officeKeys,[key]);
  const office=server.OFFICE_APPOINTMENTS.find(o=>o.key===key);
  assert.equal(office.nativeSlot,1);assert.equal(office.tier,'high_council');
  if(Number(key.slice(7))>=97)assert.equal(office.applicationEligible,false);
  assert.equal(office.cabinetSeatId,id);assert.equal(office.mappingApplies,false);
 }
 assert.equal(organization.councilComposition.previousSeatMap.currentSeats.filter(s=>s.officeKeys.includes('office_94')).length,2);
 assert.equal(seats.filter(s=>s.officeKeys.includes('office_94')).length,0);
});
check('every office and retained assignment has an explicit current ministry and Council portfolio',()=>{
 const seats=new Map(organization.councilComposition.currentSeats.map(s=>[s.id,s]));
 assert.equal(Object.keys(organization.cabinet218.offices).length,101);
 for(const office of server.OFFICE_APPOINTMENTS){
  assert.ok(seats.has(office.cabinetSeatId));assert.equal(office.councilSeat,seats.get(office.cabinetSeatId).label);
  assert.ok(organization.nodes.some(node=>node.title===office.ministry));
 }
 assert.notEqual(organization.cabinet218.offices.office_08.seatId,'treasurer');
 assert.equal(organization.cabinet218.offices.office_08.independentReview,true);
 assert.equal(organization.roleRank199.officeCount,101);assert.equal(organization.roleRank199.assignableKeyCount,137);
 assert.deepEqual(organization.cabinet218.reportingChanges,[{nodeId:'intake',field:'parent',before:'heraldry',after:'council',reason:'Chancery is now a distinct reserved Council portfolio; Heraldry remains a coordinating communications partner.'}]);
 assert.equal(organization.nodes.find(n=>n.id==='intake').parent,'council');
});
console.log(n+'/'+n+' role/rank catalogue checks passed');
