-- Requirement 17: durable asynchronous vector indexing queue.
CREATE TABLE ticket_vector_queue (
 tenant_id BIGINT NOT NULL,
 ticket_id BIGINT NOT NULL,
 queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 attempts INT NOT NULL DEFAULT 0 CHECK(attempts>=0),
 last_error TEXT,
 PRIMARY KEY(tenant_id,ticket_id),
 FOREIGN KEY(tenant_id,ticket_id) REFERENCES ticket(tenant_id,ticket_id) ON DELETE CASCADE
);
CREATE INDEX idx_vector_queue_order ON ticket_vector_queue(queued_at);
CREATE OR REPLACE FUNCTION fn_enqueue_ticket_vector()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO ticket_vector_queue(tenant_id,ticket_id,queued_at,attempts,last_error)
 VALUES(NEW.tenant_id,NEW.ticket_id,now(),0,NULL)
 ON CONFLICT(tenant_id,ticket_id) DO UPDATE
 SET queued_at=EXCLUDED.queued_at,attempts=0,last_error=NULL;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_enqueue_ticket_vector
AFTER INSERT OR UPDATE OF subject,description,category_id,priority_id ON ticket
FOR EACH ROW EXECUTE FUNCTION fn_enqueue_ticket_vector();
