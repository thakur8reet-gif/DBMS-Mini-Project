import os
import pytest
import psycopg

@pytest.fixture
def db():
    url=os.getenv("TEST_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not url:
        pytest.skip("Set TEST_DATABASE_URL to a disposable PostgreSQL database")
    conn=psycopg.connect(url)
    try:
        yield conn
    finally:
        conn.rollback()
        conn.close()

def test_required_schema_objects_exist(db):
    rows=db.execute("""SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name IN
      ('tenant','app_user','customer','ticket','sla_policy','sla_tracking',
       'escalation_level','escalation_log','ticket_comment','ticket_attachment')""").fetchall()
    assert len(rows)==10
    assert db.execute("SELECT to_regclass('public.v_ticket_operations')").fetchone()[0]

def test_cross_tenant_customer_reference_is_rejected(db):
    a=db.execute("INSERT INTO tenant(name,subdomain) VALUES('Test A','test-a') RETURNING tenant_id").fetchone()[0]
    b=db.execute("INSERT INTO tenant(name,subdomain) VALUES('Test B','test-b') RETURNING tenant_id").fetchone()[0]
    customer=db.execute("INSERT INTO customer(tenant_id,name,email) VALUES(%s,'Foreign','foreign@test.invalid') RETURNING customer_id",(b,)).fetchone()[0]
    cat=db.execute("INSERT INTO category(tenant_id,name) VALUES(%s,'General') RETURNING category_id",(a,)).fetchone()[0]
    priority=db.execute("INSERT INTO priority(tenant_id,name,level_rank) VALUES(%s,'Normal',5) RETURNING priority_id",(a,)).fetchone()[0]
    status=db.execute("INSERT INTO ticket_status(tenant_id,name) VALUES(%s,'Open') RETURNING status_id",(a,)).fetchone()[0]
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        with db.transaction():
            db.execute("""INSERT INTO ticket(tenant_id,customer_id,category_id,priority_id,status_id,subject,description)
              VALUES(%s,%s,%s,%s,%s,'Foreign customer ticket','This must fail because the customer belongs to another tenant.')""",
              (a,customer,cat,priority,status))

def test_blank_ticket_subject_is_rejected(db):
    tenant=db.execute("INSERT INTO tenant(name,subdomain) VALUES('Check','check-constraints') RETURNING tenant_id").fetchone()[0]
    customer=db.execute("INSERT INTO customer(tenant_id,name,email) VALUES(%s,'A','a@check.invalid') RETURNING customer_id",(tenant,)).fetchone()[0]
    category=db.execute("INSERT INTO category(tenant_id,name) VALUES(%s,'General') RETURNING category_id",(tenant,)).fetchone()[0]
    priority=db.execute("INSERT INTO priority(tenant_id,name,level_rank) VALUES(%s,'Normal',1) RETURNING priority_id",(tenant,)).fetchone()[0]
    status=db.execute("INSERT INTO ticket_status(tenant_id,name) VALUES(%s,'Open') RETURNING status_id",(tenant,)).fetchone()[0]
    with pytest.raises(psycopg.errors.CheckViolation):
        with db.transaction():
            db.execute("""INSERT INTO ticket(tenant_id,customer_id,category_id,priority_id,status_id,subject,description)
              VALUES(%s,%s,%s,%s,%s,'  ','This description is long enough for the database constraint.')""",
              (tenant,customer,category,priority,status))

def test_sla_function_is_installed(db):
    assert db.execute("SELECT to_regprocedure('fn_evaluate_sla(bigint)')").fetchone()[0]
