-- Requirement 7: views, stored functions, triggers, indexing, and transactional escalation.
CREATE OR REPLACE VIEW v_ticket_operations AS
SELECT t.tenant_id,t.ticket_id,t.subject,t.created_at,t.updated_at,
       c.name AS customer_name,cat.name AS category_name,p.name AS priority_name,
       p.level_rank,s.name AS status_name,s.is_closed_status,
       u.name AS assignee_name,st.response_due_at,st.resolution_due_at,
       st.first_response_at,st.response_breached,st.resolution_breached
FROM ticket t
JOIN customer c ON (c.tenant_id,c.customer_id)=(t.tenant_id,t.customer_id)
JOIN category cat ON (cat.tenant_id,cat.category_id)=(t.tenant_id,t.category_id)
JOIN priority p ON (p.tenant_id,p.priority_id)=(t.tenant_id,t.priority_id)
JOIN ticket_status s ON (s.tenant_id,s.status_id)=(t.tenant_id,t.status_id)
LEFT JOIN app_user u ON (u.tenant_id,u.user_id)=(t.tenant_id,t.assigned_to)
LEFT JOIN sla_tracking st ON (st.tenant_id,st.ticket_id)=(t.tenant_id,t.ticket_id);

CREATE OR REPLACE FUNCTION fn_touch_ticket()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_ticket_touch BEFORE UPDATE ON ticket
FOR EACH ROW EXECUTE FUNCTION fn_touch_ticket();

CREATE OR REPLACE FUNCTION fn_record_first_response(p_tenant BIGINT,p_ticket BIGINT)
RETURNS TIMESTAMPTZ LANGUAGE plpgsql AS $$
DECLARE v_at TIMESTAMPTZ;
BEGIN
  UPDATE sla_tracking SET first_response_at=COALESCE(first_response_at,now())
  WHERE tenant_id=p_tenant AND ticket_id=p_ticket
  RETURNING first_response_at INTO v_at;
  IF v_at IS NULL THEN RAISE EXCEPTION 'SLA tracking row not found for tenant/ticket'; END IF;
  RETURN v_at;
END $$;

-- Called by a scheduled worker. Each ticket is locked and escalation rows are idempotent.
CREATE OR REPLACE FUNCTION fn_evaluate_sla(p_tenant BIGINT)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_count INTEGER := 0; r RECORD; v_user BIGINT;
BEGIN
  UPDATE sla_tracking st SET
    response_breached = (st.first_response_at IS NULL AND now()>st.response_due_at),
    resolution_breached = (st.resolved_at IS NULL AND now()>st.resolution_due_at)
  WHERE st.tenant_id=p_tenant;

  FOR r IN
    SELECT t.ticket_id,el.escalation_level_id,el.escalate_to_role_id
    FROM ticket t
    JOIN sla_tracking st ON (st.tenant_id,st.ticket_id)=(t.tenant_id,t.ticket_id)
    JOIN escalation_level el ON el.tenant_id=t.tenant_id
    JOIN sla_policy sp ON (sp.tenant_id,sp.sla_policy_id)=(el.tenant_id,el.sla_policy_id)
       AND (sp.tenant_id,sp.category_id,sp.priority_id)=(t.tenant_id,t.category_id,t.priority_id)
    JOIN ticket_status s ON (s.tenant_id,s.status_id)=(t.tenant_id,t.status_id)
    WHERE t.tenant_id=p_tenant AND NOT s.is_closed_status
      AND now() >= t.created_at + make_interval(mins=>el.trigger_after_minutes)
      AND (st.response_breached OR st.resolution_breached)
      AND NOT EXISTS (SELECT 1 FROM escalation_log x
        WHERE x.tenant_id=t.tenant_id AND x.ticket_id=t.ticket_id
          AND x.escalation_level_id=el.escalation_level_id)
    FOR UPDATE OF t SKIP LOCKED
  LOOP
    SELECT user_id INTO v_user FROM app_user
    WHERE tenant_id=p_tenant AND role_id=r.escalate_to_role_id AND is_active
    ORDER BY user_id LIMIT 1;
    INSERT INTO escalation_log(tenant_id,ticket_id,escalation_level_id,escalated_to_user_id)
    VALUES(p_tenant,r.ticket_id,r.escalation_level_id,v_user);
    v_count := v_count+1;
  END LOOP;
  RETURN v_count;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_escalation_once
ON escalation_log(tenant_id,ticket_id,escalation_level_id);

-- Example explicit transaction for a state transition plus SLA update.
-- BEGIN; UPDATE ticket ... WHERE tenant_id=:tenant_id AND ticket_id=:ticket_id;
-- UPDATE sla_tracking SET resolved_at=now() WHERE tenant_id=:tenant_id AND ticket_id=:ticket_id;
-- COMMIT;
