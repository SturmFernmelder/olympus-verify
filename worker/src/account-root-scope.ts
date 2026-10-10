/** Fixed root deployment scope. No seed/update executor and no runtime activation. */
import { id, sha256 } from './account-generation-contracts';
export const ROOT_SCOPE_DDL=`CREATE TABLE IF NOT EXISTS root_authority_scope (
 singleton INT NOT NULL PRIMARY KEY CHECK(singleton=1),
 guild_id TEXT NOT NULL CHECK(typeof(guild_id)='text' AND length(guild_id) BETWEEN 17 AND 20 AND guild_id NOT GLOB '*[^0-9]*'),
 application_id TEXT NOT NULL CHECK(typeof(application_id)='text' AND length(application_id) BETWEEN 17 AND 20 AND application_id NOT GLOB '*[^0-9]*'),
 revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 0 AND 9007199254740989),
 provenance_digest TEXT NOT NULL CHECK(typeof(provenance_digest)='text' AND length(provenance_digest)=64 AND provenance_digest NOT GLOB '*[^0-9a-f]*')
)`;
export async function rootScopeProvenance(origin:string,guildId:string,applicationId:string):Promise<string>{
 id(guildId);id(applicationId);if(typeof origin!=='string')throw Error('root_scope');const url=new URL(origin);
 if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password||origin.length>256)throw Error('root_scope');
 return sha256('root-authority-scope/v1\0'+origin+'\0'+guildId+'\0'+applicationId);
}
/** Same-guild topology only. Pure identity validation does not enroll or authorize an account. */
export function rootDeploymentIdentity(siteGuildId:unknown,roleGuildId:unknown,applicationId:unknown):void{
 if(typeof siteGuildId!=='string'||typeof roleGuildId!=='string'||typeof applicationId!=='string')throw Error('root_identity');
 id(siteGuildId);id(roleGuildId);id(applicationId);if(siteGuildId!==roleGuildId)throw Error('root_topology');
}
/** Fixed JSON fields are private authored bind data, never identifiers or SQL. */
export const ROOT_LOGIN_SCOPE_SQL=`EXISTS(SELECT 1 FROM root_authority_scope s WHERE s.singleton=1
 AND s.guild_id=json_extract(?1,'$.guildId') AND s.application_id=json_extract(?1,'$.applicationId')
 AND s.provenance_digest=json_extract(?1,'$.scopeProvenanceDigest') AND s.revision=json_extract(?1,'$.scopeRevision'))`;
export const ROOT_LOGIN_CONFIG_SQL=`EXISTS(SELECT 1 FROM root_authority_scope s WHERE s.singleton=1
 AND s.guild_id=json_extract(?1,'$.guildId') AND s.application_id=json_extract(?1,'$.applicationId')
 AND s.provenance_digest=json_extract(?1,'$.scopeProvenanceDigest'))`;
