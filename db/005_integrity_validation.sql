-- Requirement 12: database-level validation and integrity rules.
ALTER TABLE ticket ADD CONSTRAINT chk_ticket_subject_nonblank CHECK (length(trim(subject)) BETWEEN 4 AND 200);
ALTER TABLE ticket ADD CONSTRAINT chk_ticket_description_nonblank CHECK (length(trim(description)) BETWEEN 10 AND 10000);
ALTER TABLE customer ADD CONSTRAINT chk_customer_email_shape CHECK (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$');
ALTER TABLE app_role ADD CONSTRAINT chk_role_name CHECK (role_name IN ('ADMIN','AGENT','CUSTOMER','MANAGER'));
ALTER TABLE ticket_attachment ADD CONSTRAINT chk_attachment_filename CHECK (length(trim(file_name)) BETWEEN 1 AND 200);
ALTER TABLE ticket_attachment ADD CONSTRAINT chk_attachment_path CHECK (length(trim(file_path)) BETWEEN 1 AND 400);
ALTER TABLE sla_tracking ADD CONSTRAINT chk_sla_deadline_order CHECK (resolution_due_at >= response_due_at);
ALTER TABLE escalation_level ADD CONSTRAINT chk_escalation_level_positive CHECK (level_number > 0 AND trigger_after_minutes > 0);

-- Prevent a customer-authored comment from being marked internal.
ALTER TABLE ticket_comment ADD CONSTRAINT chk_internal_comment_author
CHECK (NOT (is_internal = TRUE AND customer_id IS NOT NULL));

-- Defensive trigger: resolution timestamps cannot precede ticket creation.
CREATE OR REPLACE FUNCTION fn_validate_ticket_timestamps()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.resolved_at IS NOT NULL AND NEW.resolved_at < NEW.created_at THEN
    RAISE EXCEPTION 'resolved_at cannot precede created_at';
  END IF;
  IF NEW.closed_at IS NOT NULL AND (NEW.resolved_at IS NULL OR NEW.closed_at < NEW.resolved_at) THEN
    RAISE EXCEPTION 'closed_at must be on or after resolved_at';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_ticket_timestamps
BEFORE INSERT OR UPDATE OF resolved_at,closed_at ON ticket
FOR EACH ROW EXECUTE FUNCTION fn_validate_ticket_timestamps();
