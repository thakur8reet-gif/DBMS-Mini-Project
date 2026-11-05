-- Requirement 6: DML and analytical query examples. Bind tenant_id from authenticated session.
-- INSERT: create a ticket and its SLA row atomically (application should use a transaction).
BEGIN;
WITH new_ticket AS (
 INSERT INTO ticket(tenant_id,customer_id,category_id,priority_id,status_id,subject,description)
 SELECT c.tenant_id,c.customer_id,cat.category_id,p.priority_id,s.status_id,
        'VPN connection fails','Unable to connect to the corporate VPN.'
 FROM customer c JOIN category cat USING(tenant_id)
 JOIN priority p USING(tenant_id) JOIN ticket_status s USING(tenant_id)
 WHERE c.tenant_id = :tenant_id AND c.email='customer@example.test'
   AND cat.name='Technical Support' AND p.name='High' AND s.name='Open'
 RETURNING *
)
INSERT INTO sla_tracking(tenant_id,ticket_id,sla_policy_id,response_due_at,resolution_due_at)
SELECT nt.tenant_id,nt.ticket_id,sp.sla_policy_id,
       now()+make_interval(mins=>sp.response_time_minutes),
       now()+make_interval(mins=>sp.resolution_time_minutes)
FROM new_ticket nt JOIN sla_policy sp USING(tenant_id,category_id,priority_id);
COMMIT;

-- SELECT + JOIN + ORDER BY: tenant's active work queue.
SELECT t.ticket_id,t.subject,p.name AS priority,s.name AS status,u.name AS assignee,
       st.response_due_at,st.resolution_due_at
FROM ticket t JOIN priority p USING(tenant_id,priority_id)
JOIN ticket_status s USING(tenant_id,status_id)
LEFT JOIN app_user u ON (u.tenant_id,u.user_id)=(t.tenant_id,t.assigned_to)
LEFT JOIN sla_tracking st ON st.ticket_id=t.ticket_id
WHERE t.tenant_id=:tenant_id AND s.is_closed_status=false
ORDER BY p.level_rank,t.created_at;

-- GROUP BY + HAVING + aggregate: categories with at least five open tickets.
SELECT c.name,COUNT(*) AS open_tickets,AVG(EXTRACT(EPOCH FROM (now()-t.created_at))/3600) AS avg_age_hours
FROM ticket t JOIN category c USING(tenant_id,category_id)
JOIN ticket_status s USING(tenant_id,status_id)
WHERE t.tenant_id=:tenant_id AND s.is_closed_status=false
GROUP BY c.name HAVING COUNT(*)>=5 ORDER BY open_tickets DESC;

-- Subquery: tickets whose resolution deadline is earlier than the tenant's average.
SELECT ticket_id,subject,resolution_due_at FROM sla_tracking st
JOIN ticket t USING(ticket_id)
WHERE st.tenant_id=:tenant_id AND st.resolution_due_at < (
 SELECT AVG(resolution_due_at) FROM sla_tracking WHERE tenant_id=:tenant_id
);

-- UPDATE and DELETE examples; always scope by tenant and authorize in the API.
UPDATE ticket SET assigned_to=:agent_id,updated_at=now()
WHERE tenant_id=:tenant_id AND ticket_id=:ticket_id;
DELETE FROM ticket_comment
WHERE tenant_id=:tenant_id AND comment_id=:comment_id AND is_internal=true;
