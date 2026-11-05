-- Local/demo seed. Use non-production credentials; replace the hash with an application-generated hash.
INSERT INTO tenant(name,subdomain,plan) VALUES ('ResolveIQ Demo','demo','PRO') ON CONFLICT (subdomain) DO NOTHING;
WITH t AS (SELECT tenant_id FROM tenant WHERE subdomain='demo')
INSERT INTO app_role(tenant_id,role_name) SELECT tenant_id,'ADMIN' FROM t ON CONFLICT DO NOTHING;
WITH t AS (SELECT tenant_id FROM tenant WHERE subdomain='demo')
INSERT INTO app_role(tenant_id,role_name) SELECT tenant_id,'AGENT' FROM t ON CONFLICT DO NOTHING;
WITH t AS (SELECT tenant_id FROM tenant WHERE subdomain='demo')
INSERT INTO app_role(tenant_id,role_name) SELECT tenant_id,'CUSTOMER' FROM t ON CONFLICT DO NOTHING;
WITH t AS (SELECT tenant_id FROM tenant WHERE subdomain='demo')
INSERT INTO department(tenant_id,name) SELECT tenant_id,'Support' FROM t ON CONFLICT DO NOTHING;
WITH t AS (SELECT tenant_id FROM tenant WHERE subdomain='demo')
INSERT INTO category(tenant_id,name,description) SELECT tenant_id,'Technical Support','Product and technical incidents' FROM t ON CONFLICT DO NOTHING;
WITH t AS (SELECT tenant_id FROM tenant WHERE subdomain='demo')
INSERT INTO priority(tenant_id,name,level_rank) SELECT tenant_id,'High',2 FROM t ON CONFLICT DO NOTHING;
WITH t AS (SELECT tenant_id FROM tenant WHERE subdomain='demo')
INSERT INTO ticket_status(tenant_id,name,is_closed_status) SELECT tenant_id,'Open',false FROM t ON CONFLICT DO NOTHING;
WITH t AS (SELECT tenant_id FROM tenant WHERE subdomain='demo')
INSERT INTO ticket_status(tenant_id,name,is_closed_status) SELECT tenant_id,'Resolved',true FROM t ON CONFLICT DO NOTHING;
WITH t AS (SELECT tenant_id FROM tenant WHERE subdomain='demo')
INSERT INTO customer(tenant_id,name,email,company) SELECT tenant_id,'Demo Customer','customer@example.test','Example Co' FROM t ON CONFLICT DO NOTHING;
WITH t AS (SELECT tenant_id FROM tenant WHERE subdomain='demo')
INSERT INTO app_user(tenant_id,department_id,role_id,name,email,password_hash)
SELECT t.tenant_id,d.department_id,r.role_id,'Demo Agent','agent@example.test',
       '$2b$12$replace.this.with.a.real.bcrypt.hash.before.login'
FROM t JOIN department d USING(tenant_id) JOIN app_role r USING(tenant_id)
WHERE d.name='Support' AND r.role_name='AGENT'
ON CONFLICT DO NOTHING;
WITH t AS (SELECT tenant_id FROM tenant WHERE subdomain='demo')
INSERT INTO sla_policy(tenant_id,category_id,priority_id,response_time_minutes,resolution_time_minutes,business_hours_only)
SELECT t.tenant_id,c.category_id,p.priority_id,30,240,false
FROM t JOIN category c USING(tenant_id) JOIN priority p USING(tenant_id)
WHERE c.name='Technical Support' AND p.name='High'
ON CONFLICT DO NOTHING;
