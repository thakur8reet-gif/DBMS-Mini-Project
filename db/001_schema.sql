-- ResolveIQ PostgreSQL schema. Tenant-aware composite foreign keys prevent cross-tenant references.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tenant (
  tenant_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  subdomain VARCHAR(60) NOT NULL UNIQUE,
  plan VARCHAR(20) NOT NULL DEFAULT 'FREE' CHECK (plan IN ('FREE','PRO','ENTERPRISE')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);
CREATE TABLE department (
  department_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenant ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  UNIQUE (tenant_id, department_id),
  UNIQUE (tenant_id, name)
);
CREATE TABLE app_role (
  role_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenant ON DELETE CASCADE,
  role_name VARCHAR(40) NOT NULL,
  UNIQUE (tenant_id, role_id),
  UNIQUE (tenant_id, role_name)
);
CREATE TABLE app_user (
  user_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenant ON DELETE CASCADE,
  department_id BIGINT,
  role_id BIGINT NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id),
  UNIQUE (tenant_id, email),
  FOREIGN KEY (tenant_id, department_id) REFERENCES department(tenant_id, department_id) ON DELETE SET NULL (department_id),
  FOREIGN KEY (tenant_id, role_id) REFERENCES app_role(tenant_id, role_id) ON DELETE RESTRICT
);
CREATE TABLE customer (
  customer_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenant ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(120) NOT NULL,
  phone VARCHAR(20),
  company VARCHAR(100),
  UNIQUE (tenant_id, customer_id),
  UNIQUE (tenant_id, email)
);
CREATE TABLE category (
  category_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenant ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(255),
  UNIQUE (tenant_id, category_id),
  UNIQUE (tenant_id, name)
);
CREATE TABLE priority (
  priority_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenant ON DELETE CASCADE,
  name VARCHAR(30) NOT NULL,
  level_rank INT NOT NULL CHECK (level_rank BETWEEN 1 AND 10),
  UNIQUE (tenant_id, priority_id),
  UNIQUE (tenant_id, name),
  UNIQUE (tenant_id, level_rank)
);
CREATE TABLE ticket_status (
  status_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenant ON DELETE CASCADE,
  name VARCHAR(30) NOT NULL,
  is_closed_status BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (tenant_id, status_id),
  UNIQUE (tenant_id, name)
);
CREATE TABLE sla_policy (
  sla_policy_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenant ON DELETE CASCADE,
  category_id BIGINT NOT NULL,
  priority_id BIGINT NOT NULL,
  response_time_minutes INT NOT NULL CHECK (response_time_minutes > 0),
  resolution_time_minutes INT NOT NULL CHECK (resolution_time_minutes > 0),
  business_hours_only BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, sla_policy_id),
  UNIQUE (tenant_id, category_id, priority_id),
  FOREIGN KEY (tenant_id, category_id) REFERENCES category(tenant_id, category_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, priority_id) REFERENCES priority(tenant_id, priority_id) ON DELETE CASCADE
);
CREATE TABLE ticket (
  ticket_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenant ON DELETE CASCADE,
  customer_id BIGINT NOT NULL,
  category_id BIGINT NOT NULL,
  priority_id BIGINT NOT NULL,
  status_id BIGINT NOT NULL,
  assigned_to BIGINT,
  created_by BIGINT,
  subject VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  UNIQUE (tenant_id, ticket_id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer(tenant_id, customer_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, category_id) REFERENCES category(tenant_id, category_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, priority_id) REFERENCES priority(tenant_id, priority_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, status_id) REFERENCES ticket_status(tenant_id, status_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, assigned_to) REFERENCES app_user(tenant_id, user_id) ON DELETE SET NULL (assigned_to),
  FOREIGN KEY (tenant_id, created_by) REFERENCES app_user(tenant_id, user_id) ON DELETE SET NULL (created_by),
  CHECK (closed_at IS NULL OR resolved_at IS NOT NULL)
);
CREATE TABLE sla_tracking (
  sla_tracking_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  ticket_id BIGINT NOT NULL UNIQUE,
  sla_policy_id BIGINT NOT NULL,
  response_due_at TIMESTAMPTZ NOT NULL,
  resolution_due_at TIMESTAMPTZ NOT NULL,
  first_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  response_breached BOOLEAN NOT NULL DEFAULT FALSE,
  resolution_breached BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES ticket(tenant_id, ticket_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, sla_policy_id) REFERENCES sla_policy(tenant_id, sla_policy_id) ON DELETE RESTRICT
);
CREATE TABLE escalation_level (
  escalation_level_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  sla_policy_id BIGINT NOT NULL,
  level_number INT NOT NULL CHECK (level_number > 0),
  trigger_after_minutes INT NOT NULL CHECK (trigger_after_minutes > 0),
  escalate_to_role_id BIGINT NOT NULL,
  notify_email VARCHAR(120),
  UNIQUE (tenant_id, escalation_level_id),
  UNIQUE (sla_policy_id, level_number),
  FOREIGN KEY (tenant_id, sla_policy_id) REFERENCES sla_policy(tenant_id, sla_policy_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, escalate_to_role_id) REFERENCES app_role(tenant_id, role_id) ON DELETE RESTRICT
);
CREATE TABLE escalation_log (
  escalation_log_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  ticket_id BIGINT NOT NULL,
  escalation_level_id BIGINT NOT NULL,
  escalated_to_user_id BIGINT,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_flag BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES ticket(tenant_id, ticket_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, escalation_level_id) REFERENCES escalation_level(tenant_id, escalation_level_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, escalated_to_user_id) REFERENCES app_user(tenant_id, user_id) ON DELETE SET NULL (escalated_to_user_id)
);
CREATE TABLE ticket_comment (
  comment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  ticket_id BIGINT NOT NULL,
  user_id BIGINT,
  customer_id BIGINT,
  comment_text TEXT NOT NULL CHECK (length(trim(comment_text)) > 0),
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, comment_id),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES ticket(tenant_id, ticket_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, user_id) REFERENCES app_user(tenant_id, user_id) ON DELETE SET NULL (user_id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer(tenant_id, customer_id) ON DELETE SET NULL (customer_id),
  CHECK (user_id IS NOT NULL OR customer_id IS NOT NULL)
);
CREATE TABLE ticket_attachment (
  attachment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  ticket_id BIGINT NOT NULL,
  comment_id BIGINT,
  uploaded_by BIGINT NOT NULL,
  file_name VARCHAR(200) NOT NULL,
  file_path VARCHAR(400) NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES ticket(tenant_id, ticket_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, comment_id) REFERENCES ticket_comment(tenant_id, comment_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, uploaded_by) REFERENCES app_user(tenant_id, user_id) ON DELETE RESTRICT
);

-- Operational indexes
CREATE INDEX idx_ticket_tenant_status_created ON ticket(tenant_id, status_id, created_at DESC);
CREATE INDEX idx_ticket_tenant_assignee ON ticket(tenant_id, assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_sla_due_active ON sla_tracking(tenant_id, resolution_due_at) WHERE resolution_breached = FALSE AND resolved_at IS NULL;
CREATE INDEX idx_escalation_ticket_time ON escalation_log(tenant_id, ticket_id, triggered_at DESC);
CREATE INDEX idx_comment_ticket_time ON ticket_comment(tenant_id, ticket_id, created_at);
CREATE INDEX idx_ticket_search ON ticket USING GIN (to_tsvector('english', subject || ' ' || description));
