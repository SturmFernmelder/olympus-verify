// Representative local D1 plans only. This is not a production latency claim.
export async function pendingPlans280(env,raw){
 await env.DB.prepare(`INSERT INTO pending(discord_id,name_key,name,created_at,expires_at)
 SELECT '899999999999999999','unrelated probe '||value,'Unrelated Probe '||value,CAST(strftime('%s','now')AS INTEGER),CAST(strftime('%s','now')AS INTEGER)+3600 FROM json_each(?1)`).bind(JSON.stringify(Array.from({length:1000},(_,i)=>i))).run();
 const sql="SELECT COUNT(*) AS n FROM (SELECT 1 FROM pending WHERE discord_id=?1 AND nonce IS NULL AND consumed_at IS NULL AND expires_at>CAST(strftime('%s','now') AS INTEGER) LIMIT 3)",ticket="SELECT 1 FROM pending WHERE discord_id=?1 AND nonce IS NOT NULL AND consumed_at IS NULL AND expires_at>CAST(strftime('%s','now') AS INTEGER) LIMIT 1",subject='888888888888888887';
 const measured=await raw.prepare(sql).bind(subject).all(),plan=await raw.prepare('EXPLAIN QUERY PLAN '+sql).bind(subject).all(),ticketPlan=await raw.prepare('EXPLAIN QUERY PLAN '+ticket).bind(subject).all(),indexes=await raw.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name IN('pending','audit') ORDER BY name").all();
 return {layout:env.PRIVACY_WRITE_ADMISSION_LAYOUT,unrelatedRows:1000,result:measured.results,meta:measured.meta,plan:plan.results,ticketPlan:ticketPlan.results,indexes:indexes.results,limit:'LIMIT bounds matching rows, not unrelated rows scanned. No new index or performance guarantee.'};
}
