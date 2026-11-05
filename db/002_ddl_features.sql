-- Requirement 5: DDL examples beyond initial CREATE TABLE schema.
-- Apply after db/001_schema.sql.
BEGIN;
ALTER TABLE ticket ADD COLUMN IF NOT EXISTS external_reference VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_ticket_external_reference
  ON ticket(tenant_id, external_reference) WHERE external_reference IS NOT NULL;
COMMENT ON COLUMN ticket.external_reference IS 'Optional customer-side incident/reference identifier.';
COMMIT;

-- Safe CREATE/DROP demonstration using a session-local scratch table.
CREATE TEMPORARY TABLE ddl_feature_demo (
  demo_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  note TEXT NOT NULL
);
ALTER TABLE ddl_feature_demo ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
DROP TABLE ddl_feature_demo;
