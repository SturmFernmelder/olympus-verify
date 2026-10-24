/** .197 branch display records only. No admission, network, grants or stored names in proofs. */
export const LEADERSHIP_SCHEMA = 'olympus-leadership-v1';
export const LEADERSHIP_PROOF_PURPOSE = 'branch-leadership-publication-v1';
export const GUILD_NAMES = ['Olympus I','Olympus II','Olympus III','Olympus IV','Olympus V','Olympus VI','Olympus VII','Olympus VIII','Olympus IX','Olympus X'] as const;
export interface GuildLeadership { name:string; gm:string; officers:string[] }
export const LEADERSHIP_POSITIONS = Object.freeze(GUILD_NAMES.flatMap((_,guildIndex) => [
  Object.freeze({key:`guild_${String(guildIndex+1).padStart(2,'0')}_gm`,branch:guildIndex+1,guildIndex,position:'gm' as const,officerIndex:null}),
  ...Array.from({length:12},(_,officerIndex)=>Object.freeze({key:`guild_${String(guildIndex+1).padStart(2,'0')}_officer_${String(officerIndex+1).padStart(2,'0')}`,branch:guildIndex+1,guildIndex,position:'officer' as const,officerIndex})),
]));
export const LEADERSHIP_POSITION_KEYS:readonly string[] = Object.freeze(LEADERSHIP_POSITIONS.map(p=>p.key));
export type LeadershipPublication = {pointer:string;birth:string|null;generation:string|null;mac:string};
export type LeadershipEnvelope = {schema:typeof LEADERSHIP_SCHEMA;guilds:GuildLeadership[];publications:Record<string,LeadershipPublication>};
export const leadershipAccountId=(v:unknown):string|null=>typeof v==='string'?/^<@([0-9]{17,20})>$/.exec(v)?.[1]??null:null;
export const leadershipPointer=(g:readonly GuildLeadership[],key:string):string|undefined=>{
  const p=LEADERSHIP_POSITIONS.find(p=>p.key===key);return p?(p.position==='gm'?g[p.guildIndex]?.gm:g[p.guildIndex]?.officers[p.officerIndex!]):undefined;
};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const hex=(v:unknown)=>v===null||typeof v==='string'&&/^[0-9a-f]{32}$/.test(v);
export function leadershipPublication(v:unknown):v is LeadershipPublication{
  return record(v)&&Object.keys(v).sort().join('|')==='birth|generation|mac|pointer'&&!!leadershipAccountId(v.pointer)
    &&hex(v.birth)&&hex(v.generation)&&typeof v.mac==='string'&&/^[A-Za-z0-9_-]{43}$/.test(v.mac);
}
export function leadershipEnvelope(v:unknown):v is LeadershipEnvelope{
  if(!record(v)||Object.keys(v).sort().join('|')!=='guilds|publications|schema'||v.schema!==LEADERSHIP_SCHEMA||!Array.isArray(v.guilds)||v.guilds.length!==10||!record(v.publications)||Object.keys(v.publications).length>130)return false;
  if(v.guilds.some((g,i)=>!record(g)||Object.keys(g).sort().join('|')!=='gm|name|officers'||g.name!==GUILD_NAMES[i]||typeof g.gm!=='string'||g.gm.length>40||!Array.isArray(g.officers)||g.officers.length>12||g.officers.some(o=>typeof o!=='string'||o.length>40)))return false;
  for(const [key,p] of Object.entries(v.publications))if(!LEADERSHIP_POSITION_KEYS.includes(key)||!leadershipPublication(p)||leadershipPointer(v.guilds,key)!==p.pointer)return false;
  return LEADERSHIP_POSITIONS.every(p=>!leadershipAccountId(leadershipPointer(v.guilds,p.key))||Object.hasOwn(v.publications,p.key));
}
export const leadershipProofPayload=(guild:string,key:string,p:Omit<LeadershipPublication,'mac'>)=>JSON.stringify([LEADERSHIP_SCHEMA,guild,key,p.pointer,p.birth,p.generation]);

/** Closed source-authored JSON grammar. No caller-provided key/path or SQL. The
 * same shape guards the one existing copy slot and one Native cleanup statement. */
export function leadershipEnvelopeSql(doc:string):string{
  const guilds=`json_extract(${doc},'$.guilds')`,proofs=`json_extract(${doc},'$.publications')`;
  const value=(key:string)=>`json_extract(p.value,'$.${key}')`;
  const nullableHex=(key:string)=>`(json_type(p.value,'$.${key}')='null' OR(json_type(p.value,'$.${key}')='text' AND length(${value(key)})=32 AND length(CAST(${value(key)} AS BLOB))=32 AND ${value(key)} NOT GLOB '*[^0-9a-f]*'))`;
  const pointer=`${value('pointer')}`;
  const paths=LEADERSHIP_POSITIONS.map(p=>`WHEN '${p.key}' THEN '$.guilds[${p.guildIndex}].${p.position==='gm'?'gm':`officers[${p.officerIndex}]`}'`).join(' ');
  return `CASE WHEN NOT json_valid(${doc}) THEN 0 WHEN length(${doc})>70000 THEN 0 WHEN json_type(${doc})<>'object' THEN 0
   WHEN(SELECT COUNT(*) FROM json_each(${doc}))<>3 OR COALESCE(json_extract(${doc},'$.schema'),'')<>'${LEADERSHIP_SCHEMA}'
   OR COALESCE(json_type(${doc},'$.guilds'),'')<>'array' OR COALESCE(json_type(${doc},'$.publications'),'')<>'object' THEN 0
   ELSE json_array_length(${guilds})=10 AND(SELECT COUNT(*) FROM json_each(${proofs}))<=130
   AND NOT EXISTS(SELECT 1 FROM json_tree(${doc}) d WHERE CASE WHEN d.type='object' THEN(SELECT COUNT(*) FROM json_each(d.value))<>(SELECT COUNT(DISTINCT key) FROM json_each(d.value)) ELSE 0 END)
   AND NOT EXISTS(SELECT 1 FROM json_each(${guilds}) g WHERE CASE WHEN g.type<>'object' THEN 1
    WHEN(SELECT COUNT(*) FROM json_each(g.value))<>3 OR COALESCE(json_type(g.value,'$.name'),'')<>'text' OR COALESCE(json_type(g.value,'$.gm'),'')<>'text' OR COALESCE(json_type(g.value,'$.officers'),'')<>'array' THEN 1
    ELSE length(json_extract(g.value,'$.gm'))>40 OR json_array_length(g.value,'$.officers')>12 OR EXISTS(SELECT 1 FROM json_each(g.value,'$.officers') o WHERE o.type<>'text' OR length(o.value)>40) END)
   AND NOT EXISTS(SELECT 1 FROM json_each(${proofs}) p WHERE CASE WHEN p.type<>'object' THEN 1
    WHEN(SELECT COUNT(*) FROM json_each(p.value))<>4 OR p.key NOT IN(${LEADERSHIP_POSITION_KEYS.map(k=>`'${k}'`).join(',')}) THEN 1
    ELSE NOT(COALESCE(json_type(p.value,'$.pointer'),'')='text' AND length(${pointer}) BETWEEN 20 AND 23 AND substr(${pointer},1,2)='<@' AND substr(${pointer},-1)='>' AND substr(${pointer},3,length(${pointer})-3) NOT GLOB '*[^0-9]*'
      AND ${nullableHex('birth')} AND ${nullableHex('generation')} AND COALESCE(json_type(p.value,'$.mac'),'')='text' AND length(${value('mac')})=43 AND ${value('mac')} NOT GLOB '*[^A-Za-z0-9_-]*'
      AND ${pointer}=json_extract(${doc},CASE p.key ${paths} END)) END) END`;
}
