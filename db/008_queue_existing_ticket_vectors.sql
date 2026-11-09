-- Index tickets that existed before the asynchronous vector queue was added.
INSERT INTO ticket_vector_queue (tenant_id, ticket_id)
SELECT tenant_id, ticket_id
FROM ticket
ON CONFLICT (tenant_id, ticket_id) DO NOTHING;
