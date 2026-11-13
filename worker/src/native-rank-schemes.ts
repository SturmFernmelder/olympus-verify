/** Current rank observation only. A membership source and a historical receipt are different facts. */
export * from './native-rank-constants';
import { DIRECTIVE_NATIVE_PROFILE, DIRECTIVE_RANK_DIGEST, DIRECTIVE_RANK_NAMES } from './native-rank-constants';
export type NativeRankTable = Readonly<{version:1;names:readonly string[]}>;
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;}
/** Read own data only, including dense array elements. No accessor can issue a witness. */
export function nativeRankTable(value:unknown):NativeRankTable|null{
 try{
  if(!record(value)||Object.keys(value).sort().join(',')!=='names,version')return null;
  const version=Object.getOwnPropertyDescriptor(value,'version'),names=Object.getOwnPropertyDescriptor(value,'names');
  if(!version||!Object.hasOwn(version,'value')||version.value!==1||!names||!Object.hasOwn(names,'value')||!Array.isArray(names.value)||Object.getPrototypeOf(names.value)!==Array.prototype||names.value.length!==10||Object.keys(names.value).length!==10)return null;
  const result:string[]=[];
  for(let i=0;i<10;i++){const d=Object.getOwnPropertyDescriptor(names.value,String(i));if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='string'||!d.value||new TextEncoder().encode(d.value).length>96||/[\x00-\x1f\x7f]/.test(d.value))return null;result.push(d.value);}
  if(new Set(result).size!==10)return null;
  return Object.freeze({version:1,names:Object.freeze(result)});
 }catch{return null;}
}
export function directiveRankTable(value:unknown):NativeRankTable|null{
 const table=nativeRankTable(value);return table&&table.names.every((n,i)=>n===DIRECTIVE_RANK_NAMES[i])?table:null;
}
export function directiveMemberRanks(members:readonly {rank?:unknown;rankIndex?:unknown}[],table:unknown):boolean{
 const observed=directiveRankTable(table);return !!observed&&members.every(row=>typeof row.rankIndex==='number'&&Number.isInteger(row.rankIndex)&&row.rankIndex>=0&&row.rankIndex<10&&row.rank===observed.names[row.rankIndex]);
}
export function nativeSnapshotSource(guild:string,realm:string,table:unknown,members:readonly {rank?:unknown;rankIndex?:unknown}[]):`addon-native-v2:${string}`{
 const observed=nativeRankTable(table),qualified=directiveMemberRanks(members,observed);
 return `addon-native-v2:${JSON.stringify({version:2,guild,realm,rankProfile:qualified?DIRECTIVE_NATIVE_PROFILE:null,rankSchemeDigest:qualified?DIRECTIVE_RANK_DIGEST:null,rankNames:observed?.names??null})}`;
}
export function qualifiedNativeSnapshotSource(guild:string,realm:string):string{
 return 'addon-native-v2:'+JSON.stringify({version:2,guild,realm,rankProfile:DIRECTIVE_NATIVE_PROFILE,rankSchemeDigest:DIRECTIVE_RANK_DIGEST,rankNames:DIRECTIVE_RANK_NAMES});
}
export function nativeRankTableFromSource(source:unknown):NativeRankTable|null{
 if(typeof source!=='string'||source.length>2048||!source.startsWith('addon-native-v2:'))return null;
 try{const v=JSON.parse(source.slice(16));if(!record(v)||typeof v.guild!=='string'||typeof v.realm!=='string'||source!==qualifiedNativeSnapshotSource(v.guild,v.realm))return null;return directiveRankTable({version:1,names:v.rankNames});}catch{return null;}
}
export function nativeMembershipSourceMatches(source:unknown,guild:string,realm:string):boolean{
 if(typeof source!=='string'||source.length>2048)return false;
 try{
  if(source.startsWith('addon-native-v1:'))return source==='addon-native-v1:'+JSON.stringify({version:1,guild,realm});
  if(!source.startsWith('addon-native-v2:'))return false;
  const v=JSON.parse(source.slice(16));
  return record(v)&&v.version===2&&v.guild===guild&&v.realm===realm&&Object.keys(v).join(',')==='version,guild,realm,rankProfile,rankSchemeDigest,rankNames'&&'addon-native-v2:'+JSON.stringify(v)===source;
 }catch{return false;}
}
/** Parameter is a v1 configured membership scope; rank qualification is explicitly separate. */
export function nativeMembershipSourceSql(source:string,scope:string):string{
 const body=`substr(${source},17)`;
 return `(${source}=${scope} OR (substr(${source},1,16)='addon-native-v2:' AND json_valid(${body}) AND json_extract(CASE WHEN json_valid(${body}) THEN ${body} ELSE '{}' END,'$.version')=2 AND json_extract(CASE WHEN json_valid(${body}) THEN ${body} ELSE '{}' END,'$.guild')=json_extract(substr(${scope},17),'$.guild') AND json_extract(CASE WHEN json_valid(${body}) THEN ${body} ELSE '{}' END,'$.realm')=json_extract(substr(${scope},17),'$.realm')))`;
}
