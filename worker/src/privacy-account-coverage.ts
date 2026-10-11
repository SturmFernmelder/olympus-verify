/** Complete store inventory; selected account fields remain a curated partial copy. No identity or write authority. */
import { FormError } from './policy-form-core';
import { escapeText as e } from './policy-render';
import { secondsToIso } from './community-time';

type CoverageKind='selected'|'derived'|'gap'|'shared'|'case'|'anonymous'|'unattributable';
export type AccountCoverageMode='identify'|'ordinary';
interface StoreCoverage {store:string;label:string;coverage:CoverageKind;collections:readonly string[];description:string;handling:string}
const rows:StoreCoverage[]=[
 {
  "store": "audit",
  "label": "Audit",
  "coverage": "selected",
  "collections": [
   "actions"
  ],
  "description": "Account actor/subject action and time only; controlled reference-only or character-attributed rows are omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "bnet_characters",
  "label": "Bnet characters",
  "coverage": "gap",
  "collections": [],
  "description": "No own character projection.",
  "handling": "Not in this download. Ask an Olympus officer for an attributable safe summary or attended account-data review; expired data is not reconstructed."
 },
 {
  "store": "characters",
  "label": "Characters",
  "coverage": "selected",
  "collections": [
   "verification.characters"
  ],
  "description": "Own status/name/source/dates; GUID and normalized keys withheld.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_alt_claims",
  "label": "Alt claims",
  "coverage": "selected",
  "collections": [
   "community.directory.alts"
  ],
  "description": "Own name/status/proof/update; reviewer and review dates omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_contribution_allocation_events",
  "label": "Contribution allocation events",
  "coverage": "derived",
  "collections": [],
  "description": "Amounts contribute to own obligation/receipt sums; no allocation event history.",
  "handling": "Only an own amount summary is included. Individual allocation events and counterpart payment evidence need attended review."
 },
 {
  "store": "community_contribution_decisions",
  "label": "Contribution decisions",
  "coverage": "selected",
  "collections": [
   "contributionDecisions"
  ],
  "description": "Closed action/time + own actor/subject relation, four actor forms.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_contribution_evidence",
  "label": "Contribution evidence",
  "coverage": "shared",
  "collections": [],
  "description": "Guild-period evidence state is not an independently owned account row.",
  "handling": "Shared service state, not a separately attributable account record. Applicable public context or attended review may be available."
 },
 {
  "store": "community_contribution_horizons",
  "label": "Contribution horizons",
  "coverage": "shared",
  "collections": [],
  "description": "Guild retention/admission horizons; no own row.",
  "handling": "Shared service state, not a separately attributable account record. Applicable public context or attended review may be available."
 },
 {
  "store": "community_contribution_members",
  "label": "Contribution members",
  "coverage": "gap",
  "collections": [],
  "description": "Own revision/internal version control row is not included directly.",
  "handling": "Not in this download. Ask an Olympus officer for an attributable safe summary or attended account-data review; expired data is not reconstructed."
 },
 {
  "store": "community_contribution_obligations",
  "label": "Contribution obligations",
  "coverage": "selected",
  "collections": [
   "community.contributions.obligations"
  ],
  "description": "Own live-week amounts/contact dates/state/eligibility and derived paid sums.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_contribution_policies",
  "label": "Contribution policies",
  "coverage": "shared",
  "collections": [],
  "description": "Shared versioned dues rules, not own records.",
  "handling": "Shared service state, not a separately attributable account record. Applicable public context or attended review may be available."
 },
 {
  "store": "community_contribution_receipts",
  "label": "Contribution receipts",
  "coverage": "selected",
  "collections": [
   "community.contributions.receipts"
  ],
  "description": "Own matched retained relationship and safe amount/allocation/credit figures.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_craft_offers",
  "label": "Craft offers",
  "coverage": "selected",
  "collections": [
   "community.directory.crafts"
  ],
  "description": "Own profession/recipe/update; normalized recipe key omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_departure_reviews",
  "label": "Departure reviews",
  "coverage": "selected",
  "collections": [
   "community.departures.departures"
  ],
  "description": "Own character/kind/status/dates; staff and proof/case keys omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_departure_scan",
  "label": "Departure scan",
  "coverage": "shared",
  "collections": [],
  "description": "Global scan continuation names are not own account evidence.",
  "handling": "Shared service state, not a separately attributable account record. Applicable public context or attended review may be available."
 },
 {
  "store": "community_event_attendance",
  "label": "Event attendance",
  "coverage": "selected",
  "collections": [
   "community.events.attendance"
  ],
  "description": "Own event/state/reason-code/time; recorder/source/controls withheld.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_event_changes",
  "label": "Event changes",
  "coverage": "selected",
  "collections": [
   "eventChanges"
  ],
  "description": "Own actor event/action/time/changed-field names only.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_event_deliveries",
  "label": "Event deliveries",
  "coverage": "selected",
  "collections": [
   "community.event_delivery.publications"
  ],
  "description": "Own actor publication state/removal pending/dates/result; payload/pointers omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_event_reminders",
  "label": "Event reminders",
  "coverage": "selected",
  "collections": [
   "community.event_reminders.reminders"
  ],
  "description": "Own actor state/event/start/dates; consent details and cleanup pointers omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_event_signups",
  "label": "Event signups",
  "coverage": "selected",
  "collections": [
   "community.events.signups"
  ],
  "description": "Own event/status/character/raid role/update; control fields omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_events",
  "label": "Events",
  "coverage": "selected",
  "collections": [
   "community.events.created"
  ],
  "description": "Created event ID/title/start/status only; own-authored details/duration/capacity/role targets omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_privacy_cases",
  "label": "Privacy cases",
  "coverage": "case",
  "collections": [],
  "description": "Case credential possession, not subject_hint, identifies an existing conversation. Not in identify download.",
  "handling": "Use the saved case ID and private code at /privacy/case. A subject hint or Discord connection does not grant access to a case."
 },
 {
  "store": "community_privacy_messages",
  "label": "Privacy messages",
  "coverage": "case",
  "collections": [],
  "description": "Existing case messages available via case credentials; not in identify copy.",
  "handling": "Use the saved case ID and private code at /privacy/case. A subject hint or Discord connection does not grant access to a case."
 },
 {
  "store": "community_privacy_operations",
  "label": "Privacy operations",
  "coverage": "case",
  "collections": [],
  "description": "Case idempotency/private write credentials/digests, not own identify credentials.",
  "handling": "Use the saved case ID and private code at /privacy/case. A subject hint or Discord connection does not grant access to a case."
 },
 {
  "store": "community_professions",
  "label": "Professions",
  "coverage": "selected",
  "collections": [
   "community.directory.professions"
  ],
  "description": "Own profession/skill/update while profile exists.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_profiles",
  "label": "Profiles",
  "coverage": "selected",
  "collections": [
   "aggregate singleton"
  ],
  "description": "Own public ref/listed/main/role/revision; creation/departure timestamps omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_refs",
  "label": "Refs",
  "coverage": "selected",
  "collections": [
   "aggregate singleton",
   "aggregate singleton"
  ],
  "description": "Own public pseudonym ref only.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_restriction_cases",
  "label": "Restriction cases",
  "coverage": "selected",
  "collections": [
   "community.restrictions.cases"
  ],
  "description": "Own closed category/dates/appeal/outcome/active; staff identity and operational keys withheld.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_restriction_characters",
  "label": "Restriction characters",
  "coverage": "selected",
  "collections": [
   "community.restrictions.watchList"
  ],
  "description": "Own linked case character/watch dates/renewal reason.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_restriction_periods",
  "label": "Restriction periods",
  "coverage": "selected",
  "collections": [
   "aggregate singleton"
  ],
  "description": "Own watch-list opened/deadline/renewal summary.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_trials",
  "label": "Trials",
  "coverage": "selected",
  "collections": [
   "community.trials.trials"
  ],
  "description": "Own live trial outcome/dates/reason; supporting staff and creator relationships omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "councillor_challenges",
  "label": "Councillor challenges",
  "coverage": "selected",
  "collections": [
   "community.councillor_verification.challenges"
  ],
  "description": "Own signer purpose-like mode/quota/time/use metadata.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "councillor_keys",
  "label": "Councillor keys",
  "coverage": "selected",
  "collections": [
   "community.councillor_verification.councillorKeys"
  ],
  "description": "Own key ID/signerGUID/time/revocation; public key/control fields omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "intro_locks",
  "label": "Intro locks",
  "coverage": "shared",
  "collections": [],
  "description": "Guild lock holder is an operation token, not a proved account owner.",
  "handling": "Shared service state, not a separately attributable account record. Applicable public context or attended review may be available."
 },
 {
  "store": "intro_posts",
  "label": "Intro posts",
  "coverage": "shared",
  "collections": [],
  "description": "Shared bot-owned public intros/pointers/hash, no personal owner column.",
  "handling": "Shared service state, not a separately attributable account record. Applicable public context or attended review may be available."
 },
 {
  "store": "invite_queue",
  "label": "Invite queue",
  "coverage": "selected",
  "collections": [
   "verification.inviteQueue"
  ],
  "description": "Own name/status/attempts/dates/closed reason; notes/officers/claim omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "members",
  "label": "Members",
  "coverage": "selected",
  "collections": [
   "aggregate singleton"
  ],
  "description": "Names, banned Boolean and fresh Battle.net-link flags/dates.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "pending",
  "label": "Pending",
  "coverage": "selected",
  "collections": [
   "verification.codeRequests"
  ],
  "description": "Own name/creation/expiry/consumption/source; private write credential/code material omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "privacy_access_grants",
  "label": "Privacy access grants",
  "coverage": "selected",
  "collections": [
   "community.privacy_access.connections"
  ],
  "description": "Own purpose/creation/expiry/consumption.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "privacy_access_oauth",
  "label": "Privacy access oauth",
  "coverage": "anonymous",
  "collections": [],
  "description": "State/browser hashes have no account link in this schema.",
  "handling": "This short-lived browser flow has no stored account owner. Authentication material is not downloaded."
 },
 {
  "store": "privacy_denial_markers",
  "label": "Privacy denial markers",
  "coverage": "selected",
  "collections": [
   "aggregate singleton"
  ],
  "description": "Own keyed rejection time/deadline/closed reason.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "privacy_provider_messages",
  "label": "Privacy provider messages",
  "coverage": "selected",
  "collections": [
   "privacyLifecycle.providerCleanup"
  ],
  "description": "Own JSON-subject cleanup purpose/state/request/time/deadline summary.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "privacy_restore_replay",
  "label": "Privacy restore replay",
  "coverage": "selected",
  "collections": [
   "privacyLifecycle.recoverySuppression"
  ],
  "description": "Own erased/deadline/scope/recovery-custody metadata.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "privacy_serving_jobs",
  "label": "Privacy serving jobs",
  "coverage": "selected",
  "collections": [
   "privacyLifecycle.erasureRequests"
  ],
  "description": "Own request state/hold/staff-access/dates/deadline.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "privacy_subjects",
  "label": "Privacy subjects",
  "coverage": "selected",
  "collections": [
   "privacyLifecycle.subjectRecord"
  ],
  "description": "Own lifecycle record presence, state and original creation/update/erasure/retention dates. Generation and revision credentials are omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "relays",
  "label": "Relays",
  "coverage": "gap",
  "collections": [],
  "description": "Officer/client online and version metadata not in own copy; officer_id is character name key.",
  "handling": "Not in this download. Ask an Olympus officer for an attributable safe summary or attended account-data review; expired data is not reconstructed."
 },
 {
  "store": "rename_holds",
  "label": "Rename holds",
  "coverage": "selected",
  "collections": [
   "verification.renameRecords"
  ],
  "description": "Own old/new/state/decision/closure dates; operator/action keys withheld.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "role_settlements",
  "label": "Role settlements",
  "coverage": "selected",
  "collections": [
   "community.councillor_verification.roleOutcomes"
  ],
  "description": "Own subject purpose/desired/state/reason/attempt/time outcomes.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "roster_effect_runs",
  "label": "Roster effect runs",
  "coverage": "gap",
  "collections": [],
  "description": "Shared per-snapshot run counters; no direct own download.",
  "handling": "Not in this download. Ask an Olympus officer for an attributable safe summary or attended account-data review; expired data is not reconstructed."
 },
 {
  "store": "roster_effects",
  "label": "Roster effects",
  "coverage": "gap",
  "collections": [],
  "description": "Account-linked notice/promotion/departure intents and original generation, no own download.",
  "handling": "Not in this download. Ask an Olympus officer for an attributable safe summary or attended account-data review; expired data is not reconstructed."
 },
 {
  "store": "roster_first_seen",
  "label": "Roster first seen",
  "coverage": "gap",
  "collections": [],
  "description": "Name-only original first-seen data, no account row.",
  "handling": "Not in this download. Ask an Olympus officer for an attributable safe summary or attended account-data review; expired data is not reconstructed."
 },
 {
  "store": "roster_members",
  "label": "Roster members",
  "coverage": "gap",
  "collections": [],
  "description": "Raw guild snapshot rows/officer notes excluded.",
  "handling": "Not in this download. Ask an Olympus officer for an attributable safe summary or attended account-data review; expired data is not reconstructed."
 },
 {
  "store": "roster_snapshots",
  "label": "Roster snapshots",
  "coverage": "shared",
  "collections": [],
  "description": "Guild source/trust/count/hash snapshots, no own owner.",
  "handling": "Shared service state, not a separately attributable account record. Applicable public context or attended review may be available."
 },
 {
  "store": "ruleset_publications",
  "label": "Ruleset publications",
  "coverage": "selected",
  "collections": [
   "community.ruleset_publication.operations"
  ],
  "description": "Own actor closed selection/state/time summaries; shared guild payload/custody omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "seen_interactions",
  "label": "Seen interactions",
  "coverage": "unattributable",
  "collections": [],
  "description": "Only interaction ID/time/cached response; no persisted account owner.",
  "handling": "No stored account-owner relation. The service does not infer ownership from names or raw response text."
 },
 {
  "store": "site_applications",
  "label": "Website applications",
  "coverage": "selected",
  "collections": [
   "aggregate singleton"
  ],
  "description": "Own application answers/status/dates; reference structural keys and admin note/reviewer omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "site_board_votes",
  "label": "Website board votes",
  "coverage": "selected",
  "collections": [
   "site.boardVotes"
  ],
  "description": "Own role/vote/dates; candidate ID withheld.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "site_friends",
  "label": "Website friends",
  "coverage": "selected",
  "collections": [
   "site.friends"
  ],
  "description": "Own chosen label/note/date; friend key/kind omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "site_news_notices",
  "label": "Website news notices",
  "coverage": "selected",
  "collections": [
   "community.news.notices"
  ],
  "description": "Own creator/updater ID/title/dates; body omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "site_news_ops",
  "label": "Website news ops",
  "coverage": "selected",
  "collections": [
   "community.news.deletedNotices"
  ],
  "description": "Own deleted notice ID/post/deadline; private write credential omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "site_reserved",
  "label": "Website reserved",
  "coverage": "selected",
  "collections": [
   "site.reserved"
  ],
  "description": "Own name/status/dates; staff/queue identifiers omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "site_settings",
  "label": "Website settings",
  "coverage": "gap",
  "collections": [],
  "description": "Public/global settings may contain appointments/person references; updater history not own export.",
  "handling": "Not in this download. Ask an Olympus officer for an attributable safe summary or attended account-data review; expired data is not reconstructed."
 },
 {
  "store": "site_users",
  "label": "Website users",
  "coverage": "selected",
  "collections": [
   "aggregate singleton"
  ],
  "description": "Own account/profile/membership/denial/time summary; session/staff reason/actor omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "site_votes",
  "label": "Website votes",
  "coverage": "selected",
  "collections": [
   "site.votes"
  ],
  "description": "Own ballot/slot/chosen nominee label/reason/dates; nominee key/kind omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "verification_proofs",
  "label": "Verification proofs",
  "coverage": "selected",
  "collections": [
   "community.councillor_verification.attestations"
  ],
  "description": "Own requester/signer relation and proof creation/expiry; native/counterpart IDs withheld.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "verification_requests",
  "label": "Verification requests",
  "coverage": "selected",
  "collections": [
   "community.councillor_verification.requests"
  ],
  "description": "Own request state/create/expiry/use metadata.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 }
];
export const ACCOUNT_DATA_STORES=Object.freeze(rows.map(r=>Object.freeze({...r,collections:Object.freeze(r.collections)})));
const labels:Record<CoverageKind,string>={selected:'Selected own fields',derived:'Own derived summary',gap:'Attended review',shared:'Shared service state',case:'Saved case credentials',anonymous:'Anonymous browser flow',unattributable:'Attribution unavailable'};
const LIFECYCLE_COPY_STORES=new Set(['privacy_subjects','privacy_serving_jobs','privacy_provider_messages','privacy_restore_replay','privacy_denial_markers']);
function accountCopyStores(lifecycleRead:boolean):Array<StoreCoverage&{selectedInThisFile:boolean}>{
 return ACCOUNT_DATA_STORES.map(r=>{
  const unavailable=LIFECYCLE_COPY_STORES.has(r.store)&&!lifecycleRead;
  return {...r,coverage:unavailable?'gap':r.coverage,
   description:unavailable?'Lifecycle records are not included through this connection.':r.description,
   handling:unavailable?'Ask an Olympus officer for attended account-data review. Unavailable projections are not proof that nothing is retained.':r.handling,
   selectedInThisFile:(r.coverage==='selected'||r.coverage==='derived')&&!unavailable};
 });
}
export function accountDataCoverage(mode:AccountCoverageMode,lifecycleRead=true){
 return {schema:'olympus-account-coverage-v1',kind:'curated_partial',mode,totalBusinessStores:66,allStoresInventoried:true,
  allStoredFieldsDelivered:false,allCopiesIncluded:false,completeErasure:false,
  note:'This inventory accounts for the 66 business stores. It describes the selected projections and handling paths, not the existence or count of your records. selectedInThisFile describes a reviewed projection, not returned record presence; feature and retention filters still apply. Complete history flags cover only the selected retained range. Unavailable, filtered and expired records are not reported as zero retained data.',
  stores:accountCopyStores(lifecycleRead),
  separateSharedControl:{store:'privacy_write_admission',included:false,note:'Shared admission machinery is separate from the 66 business stores; no control private write credential or account authority is downloaded.'},
  otherCopies:['Discord posts, connections and role assignments','private recovery exports and Cloudflare recovery history','operator watcher and game files','previous browser downloads'],
  help:{attended:'Ask an Olympus officer for account-data review. Staff notes, safety exceptions and other people\'s data require separate review.',case:'/privacy/case',account:'/privacy/account'}};
}
export function accountDataCoverageHtml(lifecycleRead=true):string{
 return '<section data-account-coverage-schema="olympus-account-coverage-v1"><h2>What this copy covers</h2><p>Your download remains a curated partial copy. The inventory below accounts for all 66 business stores; it does not claim that every stored field or every external, recovery or local copy is included. It lists selected own fields and the handling path for records outside the download. Missing, filtered or expired records are not proof that nothing is retained.</p><p>Ask an Olympus officer for attended account-data review. Existing inbox conversations require their saved case ID and private code at <a href="/privacy/case">Read an existing case</a>. No credential, staff role or guild access is granted by this inventory.</p><details><summary>Review all 66 data stores</summary><table><caption>Selected records and remaining handling paths</caption><thead><tr><th scope="col">Data store</th><th scope="col">Download coverage</th><th scope="col">Limits and handling</th></tr></thead><tbody>'+accountCopyStores(lifecycleRead).map(r=>'<tr data-account-store="'+e(r.store)+'"><th scope="row">'+e(r.label)+' <code>'+e(r.store)+'</code></th><td>'+e(labels[r.coverage])+'<p>'+e(r.description)+'</p></td><td>'+e(r.handling)+'</td></tr>').join('')+'</tbody></table></details></section>';
}
export const PRIVACY_SUBJECT_COPY_SQL=`SELECT state,created_at,updated_at,erased_at,retain_until FROM privacy_subjects WHERE subject_id=?1 AND CASE WHEN
 state IN('active','retiring','retired') AND typeof(created_at)='integer' AND created_at BETWEEN 0 AND 999999999999
 AND typeof(updated_at)='integer' AND updated_at BETWEEN 0 AND 999999999999
 AND (erased_at IS NULL OR (typeof(erased_at)='integer' AND erased_at BETWEEN 0 AND 999999999999))
 AND (retain_until IS NULL OR (typeof(retain_until)='integer' AND retain_until BETWEEN 0 AND 999999999999))
 AND ((state='retired' AND erased_at IS NOT NULL AND retain_until=erased_at+31622400) OR (state<>'retired' AND retain_until IS NULL))
 THEN 1 ELSE json_extract('privacy_copy_unconfirmed','$') END`;
export const PRIVACY_SUBJECT_COPY_FIELDS=['state','created_at','updated_at','erased_at','retain_until'] as const;
export function projectPrivacySubjectRecord(row:unknown){
 if(row===undefined||row===null)return {recordPresent:false};
 if(typeof row!=='object'||Array.isArray(row))throw new FormError('privacy_copy_unconfirmed',503);
 const r=row as Record<string,unknown>,time=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=999999999999;
 if(!['active','retiring','retired'].includes(r.state as string)||!time(r.created_at)||!time(r.updated_at)||
  !(r.erased_at===null||time(r.erased_at))||!(r.retain_until===null||time(r.retain_until))||
  (r.state==='retired'?(r.erased_at===null||r.retain_until!==(r.erased_at as number)+31622400):r.retain_until!==null))throw new FormError('privacy_copy_unconfirmed',503);
 return {recordPresent:true,state:r.state,createdAt:secondsToIso(r.created_at as number),updatedAt:secondsToIso(r.updated_at as number),erasedAt:r.erased_at===null?null:secondsToIso(r.erased_at as number),retainUntil:r.retain_until===null?null:secondsToIso(r.retain_until as number)};
}
