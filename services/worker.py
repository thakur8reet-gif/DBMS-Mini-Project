"""Run once or continuously to evaluate SLA deadlines and index queued ticket text."""
import os,time
import psycopg
from services.vector_index import index_ticket
DB=os.environ["DATABASE_URL"]

def evaluate_sla(conn):
 with conn.transaction():
  tenants=conn.execute("SELECT tenant_id FROM tenant WHERE is_active=true").fetchall()
  return sum(conn.execute("SELECT fn_evaluate_sla(%s)",(r[0],)).fetchone()[0] for r in tenants)

def index_batch(conn,limit=20):
 with conn.transaction():
  rows=conn.execute("""SELECT q.tenant_id,q.ticket_id,t.subject,t.description,t.category_id,t.priority_id,s.name
   FROM ticket_vector_queue q JOIN ticket t USING(tenant_id,ticket_id)
   JOIN ticket_status s ON (s.tenant_id,s.status_id)=(t.tenant_id,t.status_id)
   ORDER BY q.queued_at LIMIT %s FOR UPDATE OF q SKIP LOCKED""",(limit,)).fetchall()
 processed=0
 for tenant,ticket,subject,description,category,priority,status in rows:
  try:
   index_ticket(tenant_id=tenant,ticket_id=ticket,subject=subject,description=description,category_id=category,priority_id=priority,status=status)
   with conn.transaction(): conn.execute("DELETE FROM ticket_vector_queue WHERE tenant_id=%s AND ticket_id=%s",(tenant,ticket))
   processed+=1
  except Exception as exc:
   with conn.transaction():
    conn.execute("""UPDATE ticket_vector_queue SET attempts=attempts+1,last_error=%s,
      queued_at=now()+make_interval(secs=>LEAST(3600,POWER(2,LEAST(attempts,10))::int))
      WHERE tenant_id=%s AND ticket_id=%s""",(str(exc)[:1000],tenant,ticket))
 return processed

def main():
 interval=int(os.getenv("WORKER_INTERVAL_SECONDS","30"))
 with psycopg.connect(DB) as conn:
  while True:
   print({"sla_escalations_created":evaluate_sla(conn),"vectors_indexed":index_batch(conn)})
   if os.getenv("WORKER_ONCE","false").lower()=="true":break
   time.sleep(interval)
if __name__=="__main__":main()
