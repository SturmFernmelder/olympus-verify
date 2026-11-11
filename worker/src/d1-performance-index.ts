/** Optional application performance companion (owner decision, 2026-11-10).
 * This read-only index changes query planning, never admission/epoch authority.
 * Existing complete application profiles remain unchanged. Only this exact
 * main.sqlite_master row may be omitted; malformed/case-variant/extra objects
 * remain visible to the ordinary complete-profile refusal. No DDL runs here.
 * Future catalogue generators must use the shared application-object filter;
 * never serialize this companion into a required business/profile index list.
 */
export const D1_PERFORMANCE_INDEX_NAME='audit_reconcile266' as const;
export const D1_PERFORMANCE_INDEX_DDL="CREATE INDEX audit_reconcile266 ON audit(action, actor, subject, ts DESC, id DESC)" as const;
/** Legacy/cold schema convention only. Active admitted fetches never execute it. */
export const D1_PERFORMANCE_INDEX_LEGACY_DDL=D1_PERFORMANCE_INDEX_DDL.replace('CREATE INDEX ','CREATE INDEX IF NOT EXISTS ');
// A hex BLOB comparison preserves exact stored UTF8 DDL without embedding CREATE
// in logical read SQL (the Native constructor correctly refuses DDL vocabulary).
const D1_PERFORMANCE_INDEX_DDL_HEX='43524541544520494e4445582061756469745f7265636f6e63696c65323636204f4e20617564697428616374696f6e2c206163746f722c207375626a6563742c20747320444553432c206964204445534329' as const;
/** sqlite_master row predicate. CASE makes NULL/nonmatching rows stay visible and
 * avoids materializing large unrelated trigger DDL as a BLOB on every proof. */
export const D1_PERFORMANCE_INDEX_APPLICATION_OBJECT_FILTER_SQL=`(CASE
 WHEN type COLLATE BINARY='index' AND name COLLATE BINARY='${D1_PERFORMANCE_INDEX_NAME}' AND tbl_name COLLATE BINARY='audit'
 THEN CASE WHEN CAST(sql AS BLOB)=X'${D1_PERFORMANCE_INDEX_DDL_HEX}' THEN 0 ELSE 1 END
 ELSE 1 END)=1`;
