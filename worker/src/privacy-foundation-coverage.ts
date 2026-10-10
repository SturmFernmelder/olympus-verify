/** Dormant foundation diagnostics. Physical shape is not reference/purpose coverage. */
import { snapshotDataArray, snapshotDataFields, type Database } from './account-generation-contracts';
import { readAccountSchemaProfile } from './account-schema-profile';
import { FOUNDATION_TABLES, STORE_CATALOG } from './privacy-store-catalog';

// Owner-selected F3 v12 dispositions (2026-10-09). These are not terminal purge
// permissions. Subject-bearing rows remain protected while request/effect custody
// is unresolved; only the two non-subject global control tables survive by kind.
export const FOUNDATION_DISPOSITIONS = Object.freeze([
  Object.freeze({ table: 'generation_control', kind: 'non_subject_global_control', finalDisposition: 'preserve_control', qualified: false }),
  Object.freeze({ table: 'root_authority_scope', kind: 'non_subject_global_control', finalDisposition: 'preserve_control', qualified: false }),
  Object.freeze({ table: 'account_generations', kind: 'ordinary_account_generation', finalDisposition: 'purge_after_qualified_closure', qualified: false }),
  Object.freeze({ table: 'account_purpose_generations', kind: 'ordinary_account_purpose', finalDisposition: 'purge_after_qualified_closure', qualified: false }),
  Object.freeze({ table: 'privacy_erasure_jobs', kind: 'protected_request_custody', finalDisposition: 'purge_after_qualified_closure', qualified: false }),
  Object.freeze({ table: 'privacy_erasure_progress', kind: 'protected_progress_custody', finalDisposition: 'purge_after_qualified_closure', qualified: false }),
  Object.freeze({ table: 'privacy_external_outbox', kind: 'unresolved_external_custody', finalDisposition: 'purge_after_qualified_closure', qualified: false }),
] as const);

// Delivery130 is separately owned and is not silently appended to the immutable
// 54-store catalog or its digest. A schema containing this extension holds until
// complete source/profile/reference/purpose qualification supplies a successor.
export const FUTURE_DELIVERY_STORE = Object.freeze({
  table: 'community_event_deliveries', purpose: 'publication', coverage: 'unqualified',
  ownIdentityFields: Object.freeze(['actor', 'session_version', 'session_expires']),
  indirectSubjectReference: 'event_id -> community_events.created_by',
  custodyFields: Object.freeze(['guild_id', 'channel_id', 'message_id', 'claim_nonce', 'op_id', 'frozen_content', 'payload_hash']),
  retention: 'copies_parent_deadline_and_can_only_shorten',
  erasure: 'scrub_actor_session_and_content_then_hold_unresolved_external_custody_to_parent_deadline',
});

const fixedNames = Object.freeze([...STORE_CATALOG.map(s => s.table), ...FOUNDATION_TABLES]);
// No table identifier or metadata expectation comes from a caller. This query
// reads names only, not account data, and admits at most one overflow row.
const fixedNamesSql = fixedNames.map(name => `('${name}')`).join(',');
const nameCensusSql = `WITH expected(name) AS (VALUES ${fixedNamesSql})
 SELECT name FROM main.sqlite_master WHERE type='table' AND name<>'sqlite_sequence' ORDER BY name LIMIT ${fixedNames.length + 2}`;

export async function inspectFoundationCoverage(db: Database) {
  const profile = await readAccountSchemaProfile(db);
  const base = {
    state: 'held' as const, completeErasureQualified: false as const,
    accountAuthorityAdopted: false as const, physicalProfile: profile.state,
    logicalCatalogStores: STORE_CATALOG.length,
    ownLocalSubsetPlans: STORE_CATALOG.filter(s => s.plan !== null).length,
    heldLocalPlans: STORE_CATALOG.filter(s => s.plan === null).length,
    referenceCoverageUnqualified: Object.freeze(STORE_CATALOG.map(s => s.table)),
    foundationDispositionUnqualified: Object.freeze(FOUNDATION_DISPOSITIONS.map(s => s.table)),
    futureExtensionsUnqualified: Object.freeze([FUTURE_DELIVERY_STORE.table]),
  };
  try {
    const reply = snapshotDataFields(await db.prepare(nameCensusSql).all(), ['success', 'meta', 'results'], 'coverage_reply');
    if (reply.success !== true) throw Error('coverage_reply');
    const rows = snapshotDataArray(reply.results, fixedNames.length + 2, 'coverage_rows');
    const names = rows.map(row => {
      const fields = snapshotDataFields(row, ['name'], 'coverage_row');
      if (typeof fields.name !== 'string' || !/^[a-z_][a-z0-9_]{0,79}$/.test(fields.name)) throw Error('coverage_row');
      return fields.name;
    });
    if (new Set(names).size !== names.length) throw Error('coverage_duplicate');
    const missingStores = fixedNames.filter(name => !names.includes(name));
    const unexpectedTables = names.filter(name => !fixedNames.includes(name));
    return Object.freeze({ ...base, census: 'readable' as const, censusMayBeTruncated: names.length === fixedNames.length + 2,
      missingStores: Object.freeze(missingStores), unexpectedTables: Object.freeze(unexpectedTables),
      reason: profile.state === 'qualified' ? 'physical_shape_only_all_reference_and_completion_gates_held' : 'unqualified_physical_schema',
    });
  } catch {
    return Object.freeze({ ...base, census: 'unreadable' as const, censusMayBeTruncated: true,
      missingStores: Object.freeze([] as string[]), unexpectedTables: Object.freeze([] as string[]), reason: 'coverage_unavailable',
    });
  }
}
