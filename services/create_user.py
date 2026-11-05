"""Create a tenant-scoped application user without storing plaintext passwords."""
import argparse, getpass, os, bcrypt, psycopg

def main():
 p=argparse.ArgumentParser()
 p.add_argument("--tenant",required=True,help="tenant subdomain")
 p.add_argument("--name",required=True)
 p.add_argument("--email",required=True)
 p.add_argument("--role",choices=["ADMIN","AGENT","CUSTOMER","MANAGER"],default="ADMIN")
 p.add_argument("--department",default="Support")
 a=p.parse_args()
 password=getpass.getpass("New password (min 12 chars): ")
 if len(password)<12: raise SystemExit("Password must be at least 12 characters")
 hashed=bcrypt.hashpw(password.encode(),bcrypt.gensalt(rounds=12)).decode()
 with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
  row=conn.execute("""INSERT INTO app_user(tenant_id,department_id,role_id,name,email,password_hash)
   SELECT t.tenant_id,d.department_id,r.role_id,%s,%s,%s
   FROM tenant t JOIN app_role r ON r.tenant_id=t.tenant_id AND r.role_name=%s
   LEFT JOIN department d ON d.tenant_id=t.tenant_id AND d.name=%s
   WHERE t.subdomain=%s AND t.is_active
   RETURNING user_id""",(a.name,a.email,hashed,a.role,a.department,a.tenant)).fetchone()
  if not row: raise SystemExit("Tenant or role not found; apply migrations and seed first")
  print(f"Created user_id={row[0]} for tenant={a.tenant}")
if __name__=="__main__":main()
