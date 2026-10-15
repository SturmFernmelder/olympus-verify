/** Data-only registry. No runtime dependency on handlers, serving authority or entry modules. */
import type {Env} from './env';
// ---------- erasure and export registry ----------

export type Eraser = (env: Env, discordId: string) => D1PreparedStatement[];
/** .74: a feature's section of the account copy: its statements, and the shaper that reads exactly their results, in order. */
export type ExportPlan = { statements: D1PreparedStatement[]; shape: (results: D1Result[]) => Record<string, unknown> };
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
/** The plan run as one plain batch, for the test suites. The member's copy (site-export.ts) runs it behind the reader's admission. */
export async function communityExport(env: Env, discordId: string): Promise<Record<string, unknown>> {
  const plan = communityExportPlan(env, discordId);
  return plan.shape(await env.DB.batch(plan.statements));
}
