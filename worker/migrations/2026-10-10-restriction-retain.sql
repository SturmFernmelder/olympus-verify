-- Existing older restriction table only. The Worker applies this through its zero-row column probe,
-- accepting a concurrent duplicate-column outcome. A fresh schema.sql already includes this field.
-- Apply this standalone migration once only after inspecting the older table's column set.
ALTER TABLE community_restriction_cases ADD COLUMN retain_until INTEGER;
