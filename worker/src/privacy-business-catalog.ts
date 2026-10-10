/** Closed production table/column census. Presence in this list does not alone qualify erasure semantics. */
import type { Env } from './env';
import { communityDataNames } from './community-context';
import { admissionCatalogueCurrent,isPrivacyWriteAdmissionDatabase } from './privacy-write-admission';
import { privacyProviderCustodyDatabase } from './privacy-serving-authority';
export const PRIVACY_BUSINESS_CATALOG = Object.freeze([
  {
    "table": "audit",
    "columns": "id,ts,actor,action,subject,details",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "bnet_characters",
    "columns": "discord_id,character_id,name,realm_or_ruleset,level,fetched_at",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "characters",
    "columns": "name_key,name,discord_id,status,bound_at,verified_at,member_since,left_at,source,guid",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "community_alt_claims",
    "columns": "discord_id,name,name_key,status,proof,claimed_at,reviewed_by,reviewed_at,updated_at",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "community_contribution_allocation_events",
    "columns": "id,receipt_id,obligation_id,amount_copper,member_revision,nonce,actor,created_at",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "community_contribution_decisions",
    "columns": "id,guild_scope,discord_id,obligation_id,action,actor,member_revision,nonce,at,retain_until",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "community_contribution_evidence",
    "columns": "guild_scope,period_start,state,attested_at,retain_until,nonce",
    "disposition": "shared_operation_metadata"
  },
  {
    "table": "community_contribution_horizons",
    "columns": "guild_scope,kind,horizon",
    "disposition": "shared_operation_metadata"
  },
  {
    "table": "community_contribution_members",
    "columns": "guild_scope,discord_id,incarnation,revision,nonce,updated_at",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "community_contribution_obligations",
    "columns": "id,guild_scope,discord_id,period_start,due_at,policy_version,amount_copper,eligible,state,acknowledged_at,officer_contact_at,final_notice_at,final_acknowledged_at,final_officer_contact_at,revision,facts_revision,removal_case_id,retain_until,op_nonce,created_at,updated_at",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "community_contribution_policies",
    "columns": "version,amount_copper,anchor_weekday,anchor_hour_utc,grace_hours,final_notice_days,review_days,new_member_exempt_days,created_at",
    "disposition": "shared_operation_metadata"
  },
  {
    "table": "community_contribution_receipts",
    "columns": "id,guild_scope,source,source_id,payload_hash,payer_name,amount_copper,retired_copper,observed_at,observer_discord_id,matched_discord_id,status,voided_at,retain_until,created_at",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "community_craft_offers",
    "columns": "discord_id,profession,recipe_name,recipe_key,updated_at",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "community_departure_reviews",
    "columns": "id,discord_id,character_key,character_name,proof_key,kind,observed_at,status,restriction_case_id,reviewed_by,reviewed_at,created_at,revision,nonce,retain_until",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "community_departure_scan",
    "columns": "id,left_at,name_key,updated_at",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "community_event_attendance",
    "columns": "event_id,discord_id,state,source,reason_code,recorded_by,recorded_at,revision,write_nonce",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "community_event_changes",
    "columns": "id,event_id,action,actor,at,fields",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "community_event_deliveries",
    "columns": "event_id,purpose,event_revision,starts_at,guild_id,channel_id,message_id,frozen_content,payload_hash,op_id,claim_nonce,state,cleanup_requested,actor,session_version,session_expires,created_at,updated_at,retain_until,result_code",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "community_event_signups",
    "columns": "event_id,discord_id,status,character_name,character_key,raid_role,revision,rsvp_starts_at,updated_at,write_nonce",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "community_events",
    "columns": "id,op_id,op_hash,title,details,starts_at,duration_min,ends_at,capacity,role_targets,status,created_by,revision,signup_generation,attendance_generation,nonce,attendance_nonce,publication_closed,created_at,updated_at,retain_until",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "community_privacy_cases",
    "columns": "case_id,code_hash,payload_hash,kind,subject_hint,character_hint,status,retention_days,retain_until,created_at,updated_at,closed_at",
    "disposition": "independent_case_credentials"
  },
  {
    "table": "community_privacy_messages",
    "columns": "case_id,message_id,author,text,text_hash,nonce,created_at",
    "disposition": "independent_case_credentials"
  },
  {
    "table": "community_privacy_operations",
    "columns": "case_id,op_id,payload_hash,nonce,created_at",
    "disposition": "independent_case_credentials"
  },
  {
    "table": "community_professions",
    "columns": "discord_id,profession,skill,updated_at",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "community_profiles",
    "columns": "discord_id,ref,revision,listed,main_name,main_key,main_source,main_updated_at,raid_role,role_updated_at,departed_at,write_nonce,created_at,updated_at",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "community_refs",
    "columns": "discord_id,ref,created_at",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "community_restriction_cases",
    "columns": "id,discord_id,category,set_by,set_at,review_at,expires_at,appeal_status,review_outcome,reviewed_at,reviewed_by,acknowledged_at,acknowledged_by,resolved_at,resolved_by,updated_at,updated_by,retain_until,incarnation,revision,nonce",
    "disposition": "active_safety_exception_and_scrub"
  },
  {
    "table": "community_restriction_characters",
    "columns": "case_id,character_key,character_name,proof_key,guid,added_at,added_by,review_at,expires_at,renewed_at,renewed_by,renewal_reason,revision",
    "disposition": "active_safety_exception_and_scrub"
  },
  {
    "table": "community_restriction_periods",
    "columns": "discord_id,opened_at,retain_until,renewed_at,renewal_reason,nonce",
    "disposition": "active_safety_exception_and_scrub"
  },
  {
    "table": "community_trials",
    "columns": "id,op_id,op_hash,discord_id,sponsor_discord_id,started_at,review_due_at,status,outcome_reason,concluded_at,created_by,updated_by,created_at,updated_at,incarnation,revision,nonce,retain_until",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "intro_locks",
    "columns": "guild_id,holder,until",
    "disposition": "shared_operation_metadata"
  },
  {
    "table": "intro_posts",
    "columns": "guild_id,intro_key,parent_id,channel_id,message_id,hash,posted_at,updated_at",
    "disposition": "shared_operation_metadata"
  },
  {
    "table": "invite_queue",
    "columns": "id,name_key,name,discord_id,note,status,created_at,written_at,invited_at,joined_at,approved_by,claimed_by,claimed_at,attempts,retry_after,last_reason,last_reason_at,priority",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "members",
    "columns": "discord_id,discord_name,battletag,bnet_conn_id,linked_at,banned,ban_reason,bnet_account_id,bnet_linked_at,username,global_name,names_at,activity_at",
    "disposition": "active_safety_exception_and_scrub"
  },
  {
    "table": "pending",
    "columns": "id,discord_id,name_key,name,created_at,expires_at,consumed_at,consumed_source,nonce",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "relays",
    "columns": "officer_id,character,online,seen_at,changed_at,version,addon,unknown_since",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "rename_holds",
    "columns": "id,discord_id,old_name,new_name,char_key,guid,nonce,audit_id,state,decided_by,decided_at,closed_by,closed_at",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "roster_effect_runs",
    "columns": "id,snapshot_id,prev_snapshot_id,removals,created_at,derived_at,items,done_at,superseded_at",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "roster_effects",
    "columns": "run_id,seq,kind,name_key,name,discord_id,guid,done_at,claim,subject_generation",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "roster_first_seen",
    "columns": "name_key,first_seen",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "roster_members",
    "columns": "snapshot_id,name_key,name,rank,rank_index,level,class,public_note,officer_note,guid,last_online",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "roster_snapshots",
    "columns": "id,exported_at,received_at,source,member_count,content_hash,trusted,complete,first_received_at",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "seen_interactions",
    "columns": "id,seen_at,response",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "site_applications",
    "columns": "discord_id,position,class_lead,backup1,backup2,fallback,character,char_key,class,role,region,avail,avail_tz,fit_na,fit_eu,board_at,answers,status,admin_note,reviewed_by,reviewed_at,created_at,updated_at",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "site_board_votes",
    "columns": "voter_id,candidate_id,role_key,vote,created_at,updated_at",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "site_friends",
    "columns": "owner_id,friend_kind,friend_key,friend_label,note,created_at",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "site_news_notices",
    "columns": "id,op_hash,title,body,revision,nonce,created_by,created_at,updated_by,updated_at,retain_until",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "site_news_ops",
    "columns": "id,nonce,created_by,created_at,purge_after",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "site_reserved",
    "columns": "id,owner_id,name,name_key,status,created_at,approved_by,approved_at,queue_id,queued_at,released_by,released_at",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "site_settings",
    "columns": "key,value,updated_at,updated_by",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "site_users",
    "columns": "discord_id,username,global_name,nick,avatar,account_created,server_joined,first_login,last_login,checked_at,in_server,session_version,denied,denied_reason,denied_at,denied_by",
    "disposition": "owned_or_reference_projection"
  },
  {
    "table": "site_votes",
    "columns": "voter_id,ballot,slot,nominee_kind,nominee_key,nominee_label,reason,created_at,updated_at",
    "disposition": "owned_or_reference_projection"
  }
] as const);
const CONTROL_TABLES:Readonly<Record<string,string>>=Object.freeze({
 privacy_write_admission:'singleton,protocol,active,nonce,purpose,entry_changes,logical_changes',
 privacy_subjects:'subject_id,generation,state,revision,created_at,updated_at,erased_at,retain_until',
 privacy_serving_jobs:'operation_id,subject_id,subject_generation,request_digest,original_session_version,original_session_expires,state,hold_reason,role_checked_at,staff_access,created_at,completed_at,last_attempt_at,retain_until',
 privacy_denial_markers:'subject_key,denied_at,retain_until,reason',
 privacy_restore_replay:'operation_id,subject_id,retired_generation,erased_at,retain_until,scope,recovery_custody,custody_receipt_digest',
 privacy_provider_messages:'operation_id,purpose,subjects,channel_id,message_id,state,cleanup_requested,created_at,updated_at,retain_until',
});
const extensions=new Map<string,ReadonlyArray<{table:string;columns:string}>>();
/** Source-module registration only, coupled to its real eraser/exporter registry entry. No HTTP input calls this.
 * Parent-column supplements replace an existing finite tuple; new families add a finite tuple. Missing hooks hold.
 */
export function registerServingPrivacyFamilies(registryName:string,entries:ReadonlyArray<{table:string;columns:string}>):void{
 if(extensions.has(registryName))throw Error('privacy_catalog_duplicate_extension');
 if(!entries.length||entries.some(e=>!/^\w+$/.test(e.table)||!/^\w+(,\w+)*$/.test(e.columns)||Object.hasOwn(CONTROL_TABLES,e.table)))throw Error('privacy_catalog_extension_invalid');
 extensions.set(registryName,Object.freeze(entries.map(e=>Object.freeze({...e}))));
}
/** A newly storing family or column closes completion until its real projection is reviewed. */
export async function servingPrivacyCatalogCurrent(env:Env):Promise<boolean>{
 const native=privacyProviderCustodyDatabase(env),protocol=isPrivacyWriteAdmissionDatabase(native);
 if(env.PRIVACY_WRITE_ADMISSION_ENABLED==='true'&&!protocol)return false;
 if(protocol&&!(await admissionCatalogueCurrent(native)))return false;
 const expected=new Map(PRIVACY_BUSINESS_CATALOG.map(e=>[e.table as string,e.columns as string]));
 for(const [registryName,entries] of extensions){if(!communityDataNames().includes(registryName))return false;for(const e of entries)expected.set(e.table,e.columns);}
 // Cloudflare's exact internal _cf_KV is provider-managed and rejects table_info. Materialize the finite
 // name filter BEFORE invoking the table-valued pragma; no other unknown table or prefix is exempted.
 const rows=await env.DB.prepare("WITH business AS MATERIALIZED(SELECT name FROM sqlite_master WHERE type='table' AND substr(lower(name),1,7)<>'sqlite_' AND name<>'_cf_KV') SELECT m.name AS table_name,group_concat(p.name,',') AS columns FROM business m JOIN pragma_table_info(m.name) p GROUP BY m.name ORDER BY m.name").all<{table_name:string;columns:string}>();
 const business=rows.results;
 if(!Array.isArray(business)||business.length!==expected.size+Object.keys(CONTROL_TABLES).length)return false;
 for(const row of business){const columns=CONTROL_TABLES[row.table_name]??expected.get(row.table_name);
  // Old additive migrations append fields in a different physical order. The exact finite column SET
  // is the storage contract; neither extra nor missing fields are accepted.
  if(!columns||columns.split(',').sort().join(',')!==row.columns.split(',').sort().join(','))return false;}
 return true;
}
