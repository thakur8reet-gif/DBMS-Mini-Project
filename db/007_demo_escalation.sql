-- Give the demo tenant an automatic first-level SLA escalation to its admin.
INSERT INTO escalation_level(
  tenant_id, sla_policy_id, level_number, trigger_after_minutes, escalate_to_role_id
)
SELECT policy.tenant_id, policy.sla_policy_id, 1, 35, role.role_id
FROM sla_policy policy
JOIN tenant ON tenant.tenant_id = policy.tenant_id
JOIN app_role role ON role.tenant_id = policy.tenant_id AND role.role_name = 'ADMIN'
WHERE tenant.subdomain = 'demo'
ON CONFLICT (sla_policy_id, level_number)
DO UPDATE SET
  trigger_after_minutes = EXCLUDED.trigger_after_minutes,
  escalate_to_role_id = EXCLUDED.escalate_to_role_id;
