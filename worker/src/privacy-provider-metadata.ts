/** Optional workerd-owned metadata is a separately checked schema companion, never application data.
 * Absence or the exact provider DDL and one ordinary two-column main-table summary are allowed.
 * The exact DDL supplies column types/defaults/primary-key facts. Argument-free table_list supplies
 * the total column count (including hidden/generated columns), rowid and strict-table facts.
 * Named introspection of the reserved table is not used: genuine local D1 rejects it with SQLITE_AUTH.
 * No other object using its name/table name, spelling variant, prefix or provider-value read is allowed.
 * Application catalogue/profile/digest arrays remain exact; migration never creates or changes it.
 * SQL data only: these constants grant no database, ticket, migration or erasure authority. */
export const PROVIDER_METADATA_DDL="CREATE TABLE _cf_METADATA (\n        key INTEGER PRIMARY KEY,\n        value BLOB\n      )" as const;
// Exact UTF8 DDL bytes stay inert data; admission rejects CREATE even inside a logical SQL string.
const PROVIDER_METADATA_DDL_HEX='435245415445205441424c45205f63665f4d4554414441544120280a20202020202020206b657920494e5445474552205052494d415259204b45592c0a202020202020202076616c756520424c4f420a20202020202029' as const;
export const PROVIDER_METADATA_APPLICATION_OBJECT_FILTER_SQL="name COLLATE BINARY<>'_cf_METADATA'" as const;
export const PROVIDER_METADATA_CURRENT_SQL=`(
 NOT EXISTS(SELECT 1 FROM main.sqlite_master WHERE name COLLATE NOCASE='_cf_METADATA' OR tbl_name COLLATE NOCASE='_cf_METADATA')
 OR ((SELECT count(*) FROM main.sqlite_master WHERE name COLLATE NOCASE='_cf_METADATA' OR tbl_name COLLATE NOCASE='_cf_METADATA')=1
 AND EXISTS(SELECT 1 FROM main.sqlite_master WHERE type COLLATE BINARY='table' AND name COLLATE BINARY='_cf_METADATA' AND tbl_name COLLATE BINARY='_cf_METADATA' AND CAST(sql AS BLOB)=X'${PROVIDER_METADATA_DDL_HEX}')
 AND (SELECT count(*) FROM pragma_table_list WHERE schema COLLATE BINARY='main' AND name COLLATE BINARY='_cf_METADATA')=1
 AND EXISTS(SELECT 1 FROM pragma_table_list WHERE schema COLLATE BINARY='main' AND name COLLATE BINARY='_cf_METADATA' AND type COLLATE BINARY='table' AND ncol=2 AND wr=0 AND strict=0)))`;
