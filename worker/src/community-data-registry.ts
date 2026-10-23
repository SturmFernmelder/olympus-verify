/** Data-only registry. No runtime dependency on handlers, serving authority or entry modules. */
import type {Env} from './env';
// ---------- erasure and export registry ----------

export type Eraser = (env: Env, discordId: string) => D1PreparedStatement[];
/** .74: a feature's section of the account copy: its statements, and the shaper that reads exactly their results, in order. */
export type ExportPlan = { statements: D1PreparedStatement[]; shape: (results: D1Result[]) => Record<string, unknown>;
  /** Optional fixed own-only SELECT returning bounded entry/value rows, bound to account ?1.
   * This is a data projection, never an admission, ACK or execution capability. */
  packed?: { selectSql: string; maxRows: number; shape: (rows: readonly {entry: string; value: unknown}[]) => Record<string, unknown> };
};
export type Exporter = (env: Env, discordId: string) => ExportPlan;
const registry: Array<{ name: string; erase: Eraser; export: Exporter }> = [];

/** Every feature registers once at module load; nothing may store member data without an eraser and an exporter. */
export function registerCommunityData(name: string, erase: Eraser, exporter: Exporter): void {
  if (registry.some((r) => r.name === name)) return;
  registry.push({ name, erase, export: exporter });
}
export const communityDataNames = () => registry.map((r) => r.name);

/** Statements for site-admin.ts deleteSiteData: run in the same batch as the keeper's own deletions. */
export function communityEraseStatements(env: Env, discordId: string): D1PreparedStatement[] {
  return registry.flatMap((r) => r.erase(env, discordId));
}

/** Select existing source-owned families only; this returns plans, never an
 * admission or execution authority. Callers must retain their original proof
 * guard. Missing/duplicate selections cannot silently weaken coverage. */
export function communityScopedEraseStatements(env: Env, discordId: string, names: readonly string[]): D1PreparedStatement[] {
  if (!Array.isArray(names) || names.length < 1 || new Set(names).size !== names.length) throw Error('community_scoped_erasure_invalid');
  const selected = names.map(name => {
    const item = registry.find(row => row.name === name);
    if (!item) throw Error('community_scoped_erasure_missing');
    return item;
  });
  return selected.flatMap(item => item.erase(env, discordId));
}

/**
 * .74 (Codex's review of .71, 1 Oct 04:24 UTC: a registry read made after the reader lost standing returned a case): the
 * community part of an account copy as ONE plan, every registered section's statements in order and a shaper keyed by
 * feature name, so site-export.ts runs them in the SAME admitted batch as the keeper's own statements: one transaction,
 * one instant, the whole copy or a refusal.
 */
export function communityExportPlan(env: Env, discordId: string): ExportPlan {
  const parts = registry.map((r) => ({ name: r.name, plan: r.export(env, discordId) }));
  return {
    statements: parts.flatMap((p) => p.plan.statements),
    shape: (results) => {
      const out: Record<string, unknown> = {};
      let i = 0;
      for (const p of parts) {
        out[p.name] = p.plan.shape(results.slice(i, i + p.plan.statements.length));
        i += p.plan.statements.length;
      }
      return out;
    },
  };
}
/** Closed selected own-copy families for an existing independently admitted
 * export. This adds no identity, consent or execution authority. Preserve the
 * caller's original single-transaction proof and final read fence. */
export function communityScopedExportPlan(env: Env, discordId: string, names: readonly string[]): ExportPlan {
  if (!Array.isArray(names) || names.length < 1 || new Set(names).size !== names.length) throw Error('community_scoped_export_invalid');
  const parts = names.map(name => {
    const item = registry.find(row => row.name === name);
    if (!item) throw Error('community_scoped_export_missing');
    return { name, plan: item.export(env, discordId) };
  });
  const statements = parts.flatMap(p => p.plan.statements);
  return { statements, shape: results => {
    if (results.length !== statements.length || results.some(r => !r || r.success !== true || !Array.isArray(r.results))) throw Error('privacy_copy_unconfirmed');
    const out: Record<string, unknown> = {}; let i = 0;
    for (const p of parts) {
      out[p.name] = p.plan.shape(results.slice(i, i + p.plan.statements.length));
      i += p.plan.statements.length;
    }
    return out;
  } };
}
/** A closed selected projection in one SQL statement. Only registered source exporters
 * provide fragments; callers do not supply SQL or an account override. Each JSON
 * value stays one bounded record, rather than aggregating a history into one cell.
 * The consumer retains its original grant and the same admitted transaction/fence. */
export function communityPackedExportPlan(env: Env, discordId: string, names: readonly string[]): ExportPlan {
  if (!Array.isArray(names) || names.length < 1 || new Set(names).size !== names.length) throw Error('community_packed_export_invalid');
  const parts = names.map(name => {
    const item = registry.find(row => row.name === name);
    if (!item) throw Error('community_packed_export_missing');
    const packed = item.export(env, discordId).packed;
    if (!packed || typeof packed.selectSql !== 'string' || typeof packed.shape !== 'function' || !Number.isSafeInteger(packed.maxRows) || packed.maxRows < 1 || packed.maxRows > 1002) throw Error('community_packed_export_unqualified');
    return { name, packed };
  });
  const sql = parts.map((p, i) => 'SELECT ' + i + ' AS family,p.entry,p.value FROM (' + p.packed.selectSql + ') p').join(' UNION ALL ') + ' ORDER BY family,entry';
  return { statements: [env.DB.prepare(sql).bind(discordId)], shape: results => {
    if (results.length !== 1 || results[0]?.success !== true || !Array.isArray(results[0].results) || results[0].results.length > parts.reduce((n, p) => n + p.packed.maxRows, 0)) throw Error('privacy_copy_unconfirmed');
    const grouped: {entry: string; value: unknown}[][] = parts.map(() => []);
    for (const raw of results[0].results) {
      const row = raw as Record<string, unknown>;
      if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).sort().join(',') !== 'entry,family,value' || !Number.isSafeInteger(row.family) || (row.family as number) < 0 || (row.family as number) >= parts.length || typeof row.entry !== 'string' || typeof row.value !== 'string' || row.value.length > 20000) throw Error('privacy_copy_unconfirmed');
      const family = row.family as number, group = grouped[family]!;
      if (group.length >= parts[family]!.packed.maxRows || group.length && group[group.length - 1]!.entry >= row.entry) throw Error('privacy_copy_unconfirmed');
      let value: unknown; try { value = JSON.parse(row.value); } catch { throw Error('privacy_copy_unconfirmed'); }
      group.push({entry: row.entry, value});
    }
    const out: Record<string, unknown> = {};
    for (let i = 0; i < parts.length; i++) out[parts[i]!.name] = parts[i]!.packed.shape(grouped[i]!);
    return out;
  } };
}
/** The plan run as one plain batch, for the test suites. The member's copy (site-export.ts) runs it behind the reader's admission. */
export async function communityExport(env: Env, discordId: string): Promise<Record<string, unknown>> {
  const plan = communityExportPlan(env, discordId);
  return plan.shape(await env.DB.batch(plan.statements));
}
