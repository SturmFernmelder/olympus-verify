/** Fixed reviewed local-subset catalog. A done plan means own rows only, never complete table/reference erasure. */
import { sha256, type Database } from './account-generation-contracts';
import { accountSchemaFenceSql, readAccountSchemaProfile } from './account-schema-profile';
export const CATALOG_VERSION='lifecycle-local-subset-root-purpose-P-v1';
export type StoreEntry=Readonly<{table:string;plan:Readonly<{owner:string}>|null;hold:string;referenceCoverage:'unqualified'}>;
export const STORE_CATALOG:readonly StoreEntry[]=Object.freeze([
 Object.freeze({table:'pending',plan:Object.freeze({owner:'discord_id'}),hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'invite_queue',plan:Object.freeze({owner:'discord_id'}),hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'bnet_characters',plan:Object.freeze({owner:'discord_id'}),hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'rename_holds',plan:Object.freeze({owner:'discord_id'}),hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'characters',plan:Object.freeze({owner:'discord_id'}),hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'site_applications',plan:Object.freeze({owner:'discord_id'}),hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'site_votes',plan:Object.freeze({owner:'voter_id'}),hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'site_board_votes',plan:Object.freeze({owner:'voter_id'}),hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'site_friends',plan:Object.freeze({owner:'owner_id'}),hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'site_reserved',plan:Object.freeze({owner:'owner_id'}),hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'community_refs',plan:Object.freeze({owner:'discord_id'}),hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'community_profiles',plan:Object.freeze({owner:'discord_id'}),hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'community_professions',plan:Object.freeze({owner:'discord_id'}),hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'community_alt_claims',plan:Object.freeze({owner:'discord_id'}),hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'community_craft_offers',plan:Object.freeze({owner:'discord_id'}),hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'community_event_signups',plan:Object.freeze({owner:'discord_id'}),hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'community_event_attendance',plan:Object.freeze({owner:'discord_id'}),hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'community_trials',plan:Object.freeze({owner:'discord_id'}),hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'members',plan:null,hold:'retention_and_reentry_policy_unadopted',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'roster_snapshots',plan:null,hold:'raw_game_notes_and_identity_provenance_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'roster_members',plan:null,hold:'raw_game_notes_and_identity_provenance_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'roster_first_seen',plan:null,hold:'raw_game_notes_and_identity_provenance_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'roster_effect_runs',plan:null,hold:'raw_game_notes_and_identity_provenance_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'roster_effects',plan:null,hold:'raw_game_notes_and_identity_provenance_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'relays',plan:null,hold:'raw_game_notes_and_identity_provenance_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'audit',plan:null,hold:'legacy_free_text_and_cached_references_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'intro_posts',plan:null,hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'intro_locks',plan:null,hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'site_users',plan:null,hold:'retention_and_reentry_policy_unadopted',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'site_settings',plan:null,hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'seen_interactions',plan:null,hold:'legacy_free_text_and_cached_references_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'community_events',plan:null,hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'community_event_changes',plan:null,hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'community_restriction_cases',plan:null,hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'community_restriction_characters',plan:null,hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'community_restriction_periods',plan:null,hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'community_departure_reviews',plan:null,hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'community_contribution_policies',plan:null,hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'community_contribution_members',plan:null,hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'community_contribution_obligations',plan:null,hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'community_contribution_receipts',plan:null,hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'community_contribution_allocation_events',plan:null,hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'community_contribution_horizons',plan:null,hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'community_contribution_evidence',plan:null,hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'community_contribution_decisions',plan:null,hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'community_departure_scan',plan:null,hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'community_privacy_cases',plan:null,hold:'case_possession_not_subject_identity',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'community_privacy_messages',plan:null,hold:'case_possession_not_subject_identity',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'community_privacy_operations',plan:null,hold:'case_possession_not_subject_identity',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'site_news_notices',plan:null,hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'site_news_ops',plan:null,hold:'shared_or_cross_subject_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'site_login_flows',plan:Object.freeze({owner:'subject'}),hold:'anonymous_expiry_and_shared_provenance_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'role_grants',plan:null,hold:'role_reference_and_debt_projection_unqualified',referenceCoverage:'unqualified' as const}),
 Object.freeze({table:'role_attempts',plan:null,hold:'role_reference_and_debt_projection_unqualified',referenceCoverage:'unqualified' as const}),
]);
export const FOUNDATION_TABLES=Object.freeze(['generation_control','account_generations','account_purpose_generations','privacy_erasure_jobs','privacy_erasure_progress','privacy_external_outbox','root_authority_scope']);
/** Exact metadata admission in the consuming transaction, not only a pre-await schema lookup. Fixed authored names. */
export const SCHEMA_CURRENT_SQL=accountSchemaFenceSql();
export async function catalogDigest():Promise<string>{return sha256('privacy-store-catalog\0'+CATALOG_VERSION+'\0'+JSON.stringify(STORE_CATALOG));}
/** No SQL identifier is accepted from a request. An unknown schema closes execution, not just a completion label. */
export async function catalogMatchesSchema(db:Database):Promise<boolean>{return (await readAccountSchemaProfile(db)).state==='qualified';}
