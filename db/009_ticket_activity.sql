-- Ticket status, assignment, and comment history for the operations dashboard.
BEGIN;
CREATE TABLE IF NOT EXISTS ticket_activity (
  activity_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  ticket_id BIGINT NOT NULL,
  actor_user_id BIGINT,
  event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('STATUS_CHANGED','ASSIGNED','COMMENT_ADDED')),
  previous_value TEXT,
  new_value TEXT,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,ticket_id) REFERENCES ticket(tenant_id,ticket_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,actor_user_id) REFERENCES app_user(tenant_id,user_id) ON DELETE SET NULL (actor_user_id)
);
CREATE INDEX IF NOT EXISTS idx_ticket_activity_timeline
  ON ticket_activity(tenant_id,ticket_id,created_at DESC);

INSERT INTO ticket_status(tenant_id,name,is_closed_status)
SELECT tenant_id,'In Progress',false FROM tenant
ON CONFLICT (tenant_id,name) DO NOTHING;
INSERT INTO ticket_status(tenant_id,name,is_closed_status)
SELECT tenant_id,'Closed',true FROM tenant
ON CONFLICT (tenant_id,name) DO NOTHING;
COMMIT;
