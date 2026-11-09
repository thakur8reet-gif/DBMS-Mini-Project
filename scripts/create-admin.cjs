const crypto = require("node:crypto");
const { Client } = require("pg");
const bcrypt = require("bcryptjs");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const email = process.env.ADMIN_EMAIL || "admin@example.test";
  const password = crypto.randomBytes(24).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 12);
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  await client.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      "SELECT 1 FROM app_user WHERE lower(email) = lower($1) LIMIT 1",
      [email],
    );
    if (existing.rowCount) {
      throw new Error(`An account already exists for ${email}`);
    }

    const result = await client.query(
      `INSERT INTO app_user(tenant_id, department_id, role_id, name, email, password_hash)
       SELECT t.tenant_id, d.department_id, r.role_id, 'ResolveIQ Admin', $1, $2
       FROM tenant t
       JOIN department d ON d.tenant_id = t.tenant_id AND d.name = 'Support'
       JOIN app_role r ON r.tenant_id = t.tenant_id AND r.role_name = 'ADMIN'
       WHERE t.subdomain = 'demo'
       RETURNING email`,
      [email, passwordHash],
    );
    if (result.rowCount !== 1) {
      throw new Error("Demo tenant, Support department, or ADMIN role is missing");
    }
    await client.query("COMMIT");
    process.stdout.write(`${email}\n${password}\n`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  process.stderr.write(`Admin setup failed: ${error.message}\n`);
  process.exitCode = 1;
});
