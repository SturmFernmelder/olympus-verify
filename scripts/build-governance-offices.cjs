// Deterministic source projection only. No SQL, network or provider action.
'use strict';
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), jsonPath = path.join(root, 'worker/public/static/governance/organization.json');
const organization = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const aliases = JSON.parse(fs.readFileSync(path.join(root, 'docs/governance-office-aliases.json'), 'utf8'));
if (organization.terms.length !== 101 || organization.nativeRanks.length !== 10 || organization.terms.some((t, i) => t.ordinal !== i + 1)) throw Error('governance_inventory');
const officeKeys = JSON.parse(fs.readFileSync(path.join(root, 'docs/governance-office-keys.json'), 'utf8'));
require('./governance-office-keys.cjs').assertOfficeKeys(organization.terms, officeKeys);
const fields = ['nativeRankOrdinal', 'nativeSlot', 'nativeRankName', 'tier', 'tierLabel', 'codexTitles', 'department', 'applicationTrack', 'applicationEligible', 'applicationLabel', 'applicationAliases', 'applicationRoleKeys', 'statusOverlay', 'acquisition', 'discordPortal', 'cabinetSeatId', 'ministry', 'councilSeat'];
const metadata = term => ({...Object.fromEntries(fields.map(key => [key, term[key] ?? ({cabinetSeatId:organization.cabinet218.offices[term.officeKey].seatId,ministry:organization.cabinet218.offices[term.officeKey].ministry,councilSeat:organization.cabinet218.offices[term.officeKey].seatLabel})[key]])),...(term.applicationMetadataScope === undefined ? {} : {applicationMetadataScope:term.applicationMetadataScope})});
const offices = organization.terms.map(t => ({ key: t.officeKey, label: t.label, group: 'office', termOrdinal: t.ordinal, ...metadata(t), cabinetSeatId: organization.cabinet218.offices[t.officeKey].seatId, ministry: organization.cabinet218.offices[t.officeKey].ministry, councilSeat: organization.cabinet218.offices[t.officeKey].seatLabel, recommendedNativeSlots: t.recommendedNativeSlots, nativeMappingNote: t.nativeMappingNote, mappingApplies: false }));
for (const alias of aliases) {
  if (!/^(?:[a-z][a-z_]*|class_lead:[a-z]+)$/.test(alias.key) || typeof alias.label !== 'string' || !['leadership', 'class'].includes(alias.group) || (alias.aliasOf && !offices.some(o => o.key === alias.aliasOf))) throw Error('governance_alias');
  // Bind the two established aliases without canonical keys explicitly; never
  // silently treat an unknown future alias as a member or councillor.
  const canonical = offices.find(o => o.key === (alias.aliasOf || ({leveling:'office_01',liaison:'office_34'})[alias.key]));
  if (!canonical) throw Error('governance_alias_classification');
  offices.push({ ...alias, ...metadata(canonical), applicationLabel:alias.label+(canonical.applicationAliases.length?' · '+canonical.applicationAliases[0]:''), applicationRoleKeys:canonical.applicationEligible?[alias.key]:[], recommendedNativeSlots: canonical.recommendedNativeSlots, nativeMappingNote: canonical.nativeMappingNote, mappingApplies: false });
}
const nativeKeys = ['guild_master', 'high_council', 'officer', 'officer_alt', 'raid_leader', 'veteran', 'raider', 'member', 'alt', 'initiate'];
const nativeOfficeKeys = ['office_43','office_45','office_62','office_63','office_74','office_90','office_75','office_55','office_04','office_48'];
offices.push(...organization.nativeRanks.map((r, i) => {
  const canonical = offices.find(o => o.key === nativeOfficeKeys[i]);
  return { key: 'rank_' + nativeKeys[i], label: r.name, group: 'native', nativeIndex: i, ...metadata(canonical), applicationEligible:false, applicationRoleKeys:[], recommendedNativeSlots:[i], nativeMappingNote:r.meaning, mappingApplies:false };
}));
// Preserve the historical Treasurer key as an appointment. Promoting the existing
// rank_officer_alt alias to the native row keeps exactly the same 131 pre-.208 keys; .208 appends only office_96.
const treasurer = offices.find(o => o.key === 'office_86');
offices.push({key:'rank_treasurer',label:'Treasurer (appointment; historical rank key)',group:'office',aliasOf:'office_86',...metadata(treasurer),recommendedNativeSlots:treasurer.recommendedNativeSlots,nativeMappingNote:'Historical assignable key retained for the Treasurer appointment at High Council slot 1; it is not a native rank.',mappingApplies:false});
const tracks = [
  {id:'member',label:'Sworn Guild Member',rankPath:'Rank 10 Initiate → Rank 8 Member',description:'Olympus I–X PvE / social membership; admission and verified standing remain reviewed.'},
  {id:'raider',label:'Core Raider & PvE Progression Track',rankPath:'Rank 7 Raider',description:'Progression readiness and event eligibility are reviewed separately from membership.'},
  {id:'artisan',label:'Master Artisan & Guild Workshop Crafter',rankPath:'Title V profession specialist',description:'Opt-in professional service and rare-recipe stewardship; no officer permission follows.'},
  {id:'officer',label:'Officer Corps & Branch Leadership Application',rankPath:'Ranks 3, 4 & 5 · Officer, Officer Alt, Raid Leader',description:'Branch officers, class leads, recruitment, auditing, heraldry, events and moderators.'},
  {id:'high_council',label:'High Council Application',rankPath:'Rank 2 High Council',description:'Privy Court, War Council, Intake, Artisanry, Systems Architect and Heraldry portfolios; appointment is separately reviewed.'},
  {id:'patron',label:'Royal Patron & Flagship Olympus I Charter',rankPath:'Treasury gold writ track',description:'Voluntary in-game gold only; officer review and real capacity apply. No rank, permission, moderation outcome or place is purchased automatically.'},
];
if (offices.length !== 137 || new Set(offices.map(o => o.key)).size !== 137) throw Error('governance_key_inventory');
for (const o of offices) {
  if (!Number.isInteger(o.nativeSlot) || o.nativeSlot < 0 || o.nativeSlot > 9 || o.nativeRankOrdinal !== o.nativeSlot + 1 || o.nativeRankName !== organization.nativeRanks[o.nativeSlot].name || !['leader','high_council','officer_corps','member_specialist'].includes(o.tier) || !tracks.some(t=>t.id===o.applicationTrack) || !Array.isArray(o.codexTitles) || !o.codexTitles.length || o.codexTitles.some(t=>!['I','II','III','IV','V'].includes(t)) || typeof o.applicationEligible !== 'boolean' || typeof o.applicationLabel !== 'string' || !Array.isArray(o.applicationAliases) || o.applicationAliases.some(a=>typeof a!=='string'||a.length>100) || !Array.isArray(o.applicationRoleKeys) || o.applicationRoleKeys.length>9 || new Set(o.applicationRoleKeys).size!==o.applicationRoleKeys.length || o.applicationRoleKeys.some(key=>typeof key!=='string'||! /^(?:[a-z][a-z_]*|office_[0-9]{2,3}|class_lead:[a-z]+)$/.test(key)) || !o.applicationEligible&&o.applicationRoleKeys.length || !o.department || !o.acquisition || !o.discordPortal) throw Error('governance_classification');
}
const source = `/** Generated by scripts/build-governance-offices.cjs from the 101-term register (all 96 prior identities and five distinct owner-directed Council portfolios) and declared aliases.
 * Display associations apply no native rank, appointment, ballot, signing key or permission. */
export type ApplicationTrack199 = 'member'|'raider'|'artisan'|'officer'|'high_council'|'patron';
export interface OfficeAppointment { readonly key:string; readonly label:string; readonly group:'office'|'leadership'|'class'|'native'; readonly termOrdinal?:number; readonly nativeIndex?:number; readonly aliasOf?:string; readonly nativeRankOrdinal:number; readonly nativeSlot:number; readonly nativeRankName:string; readonly tier:'leader'|'high_council'|'officer_corps'|'member_specialist'; readonly tierLabel:string; readonly codexTitles:readonly string[]; readonly department:string; readonly cabinetSeatId:string; readonly ministry:string; readonly councilSeat:string; readonly applicationTrack:ApplicationTrack199; readonly applicationEligible:boolean; readonly applicationLabel:string; readonly applicationAliases:readonly string[]; readonly applicationRoleKeys:readonly string[]; readonly statusOverlay:boolean; readonly acquisition:string; readonly discordPortal:string; readonly applicationMetadataScope?:string; readonly recommendedNativeSlots:readonly number[]; readonly nativeMappingNote:string; readonly mappingApplies:false }
export const OFFICE_APPOINTMENTS:readonly Readonly<OfficeAppointment>[] = Object.freeze(${JSON.stringify(offices, null, 2)}.map(entry => Object.freeze({...entry, codexTitles:Object.freeze(entry.codexTitles), applicationAliases:Object.freeze(entry.applicationAliases), applicationRoleKeys:Object.freeze(entry.applicationRoleKeys), recommendedNativeSlots:Object.freeze(entry.recommendedNativeSlots)} as OfficeAppointment)));
export const OFFICE_APPOINTMENT_KEYS:readonly string[] = Object.freeze(OFFICE_APPOINTMENTS.map(entry => entry.key));
export const NATIVE_RANKS_199 = Object.freeze(${JSON.stringify(organization.nativeRanks, null, 2)}.map(entry => Object.freeze(entry)));
export const APPLICATION_TRACKS_199 = Object.freeze(${JSON.stringify(tracks, null, 2)}.map(entry => Object.freeze(entry)));
`;
// Classic catalogue: also safe to load through dynamic import, without a DOM.
const browser = `/* Generated by scripts/build-governance-offices.cjs. Display associations apply no permissions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OlympusRoleRank199=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const ranks=${JSON.stringify(organization.nativeRanks)};
const tracks=${JSON.stringify(tracks)};
const offices=${JSON.stringify(offices)};
for(const row of offices){Object.freeze(row.codexTitles);Object.freeze(row.applicationAliases);Object.freeze(row.applicationRoleKeys);Object.freeze(row.recommendedNativeSlots);Object.freeze(row);}ranks.forEach(Object.freeze);tracks.forEach(Object.freeze);
return Object.freeze({schema:'olympus-role-rank-199/v1',ranks:Object.freeze(ranks),tracks:Object.freeze(tracks),offices:Object.freeze(offices)});
});
`;
const outputOrganization = {...organization, roleRank199:{...organization.roleRank199, officeCount:organization.terms.length, assignableKeyCount:offices.length}, appointments:offices, applicationTracks:tracks};
const outputs = [[path.join(root,'worker/src/governance-offices.ts'),source],[path.join(root,'worker/public/static/role-rank199.js'),browser],[jsonPath,JSON.stringify(outputOrganization,null,2)+'\n']];
if (process.argv[2] === '--check') {
  for (const [target, contents] of outputs) if (fs.readFileSync(target,'utf8') !== contents) throw Error('governance_office_projection_drift');
} else if (process.argv.length === 2) for (const [target,contents] of outputs) fs.writeFileSync(target,contents);
else throw Error('unsupported_argument');

if (process.argv[2] === '--check') {
  const royal = require('./build-royal-writs199.cjs');
  if (fs.readFileSync(path.join(root,'worker/public/static/royal-writs199.js'),'utf8') !== royal.projection()) throw Error('royal_writ_projection_drift');
}
