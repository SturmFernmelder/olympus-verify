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
check('all three .199 rank projections agree on exact order and zero-based slots',()=>{
 for(const rows of [organization.nativeRanks,browser.ranks,server.NATIVE_RANKS_199]){assert.deepEqual(rows.map(r=>r.name),names);assert.deepEqual(rows.map(r=>r.nativeSlot),[0,1,2,3,4,5,6,7,8,9]);assert.ok(rows.every((r,i)=>r.nativeRankOrdinal===i+1&&r.mappingApplies===false));}
});
check('all 95 stable offices and all 131 assignable keys have explicit individual classifications',()=>{
 assert.equal(organization.terms.length,95);assert.equal(server.OFFICE_APPOINTMENTS.length,131);assert.equal(new Set(server.OFFICE_APPOINTMENT_KEYS).size,131);
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
 for(const [key,alias] of [['office_03','Systems Architect'],['office_14','Intake Minister'],['office_26','Privy Council / Judiciary'],['office_58','Workshop Grand Master'],['office_59','Heraldry Minister'],['office_94','PvE War Council Director']]){const row=server.OFFICE_APPOINTMENTS.find(o=>o.key===key);assert.ok(row.applicationAliases.includes(alias));assert.equal(row.applicationLabel,row.label+' · '+row.applicationAliases[0]);assert.ok(Object.isFrozen(row.applicationAliases));}
 for(const [key,roles] of Object.entries({office_62:['officer'],office_79:['recruitment'],office_21:['community'],office_71:['pvp_leader'],office_51:['loot_council'],office_69:['professions'],office_33:['moderator'],office_73:['raid_assist_na','raid_assist_eu'],office_74:['raid_leader_na','raid_leader_eu']}))assert.deepEqual(server.OFFICE_APPOINTMENTS.find(o=>o.key===key).applicationRoleKeys,roles);
 assert.deepEqual(server.OFFICE_APPOINTMENTS.find(o=>o.key==='office_18').applicationRoleKeys,['warrior','paladin','hunter','rogue','priest','shaman','mage','warlock','druid'].map(c=>'class_lead:'+c));
});
console.log(n+'/'+n+' .199 role/rank catalogue checks passed');
