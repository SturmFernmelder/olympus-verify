import { RAID_SCHEMA_DATA316 as delta } from './raid-schema-data316';
import { ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON, ADMISSION_EXPECTED_JSON, ADMISSION_PHYSICAL_EXPECTED_JSON } from './privacy-write-admission-catalogue';

export type RaidAdmissionLayout316 = 'canonical' | 'recorded-live-20261010' | 'recorded-live-pre-seal-20261017';
type Table = {name:string;sql:string;columns:string[]};
type Index = {name:string;sql:string;tbl_name:string};
type Trigger = {name:string;sql:string};
type Catalogue = {tables:Table[];indexes:Index[];triggers:Trigger[];slotSQL:string;slotColumns:string[]};
type PhysicalRow = (string|null)[];

const previous:Record<RaidAdmissionLayout316,string> = {
  canonical: ADMISSION_EXPECTED_JSON,
  'recorded-live-20261010': ADMISSION_PHYSICAL_EXPECTED_JSON,
  'recorded-live-pre-seal-20261017': JSON.stringify(JSON.parse(ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON).recordedLive.profile),
};
const successors = new Map<RaidAdmissionLayout316,string>();
function compare(a:string,b:string) {return a<b?-1:a>b?1:0;}
function append<T extends {name:string}>(base:T[],extra:T[]):T[] {
  const names=new Set(base.map(x=>x.name));
  if(extra.some(x=>names.has(x.name)))throw Error('Raid schema collides with predecessor');
  return [...base,...extra].sort((a,b)=>compare(a.name,b.name));
}
export function raidAdmissionCatalogue316(layout:RaidAdmissionLayout316):string {
  const cached=successors.get(layout);
  if(cached)return cached;
  const base:Catalogue=JSON.parse(previous[layout]);
  const source=JSON.stringify({...base,tables:append(base.tables,delta.tables),indexes:append(base.indexes,delta.indexes),triggers:append(base.triggers,delta.triggers)});
  successors.set(layout,source);
  return source;
}
export const RAID_PHYSICAL_OBJECTS_ADDED316=delta.objects.length;
/** Compose two source-owned row sets without inspecting or normalizing an installed database. */
export function raidPhysicalObjects316(base:readonly PhysicalRow[]):PhysicalRow[] {
  const names=new Set(base.map(row=>row[1]));
  if(delta.objects.some(row=>names.has(row[1])))throw Error('Raid objects collide with predecessor');
  return [...base,...delta.objects].sort((a,b)=>compare(String(a[0]),String(b[0]))||compare(String(a[1]),String(b[1])));
}
/** Parents before children for an installation with native foreign keys on. */
const dependencyOrder=['raid_teams316','raid_raider_profiles316','raid_team_seats316','raid_team_events316','raid_team_invites316'];
const tables=dependencyOrder.map(name=>delta.tables.find(t=>t.name===name)!.sql);
export const RAID_TEAM_DDL316=Object.freeze([...tables,...delta.indexes.map(x=>x.sql)]);
export const RAID_WRITE_GUARDS316=Object.freeze(delta.triggers.map(x=>x.sql));
