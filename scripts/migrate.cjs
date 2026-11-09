const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const migrationDirectory = path.join(__dirname, "..", "db");
  const migrations = fs
    .readdirSync(migrationDirectory)
    .filter((file) => /^00\d+.*\.sql$/.test(file))
    .sort();
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  await client.connect();
  try {
    for (const migration of migrations) {
      const sql = fs.readFileSync(path.join(migrationDirectory, migration), "utf8");
      await client.query(sql);
      process.stdout.write(`Applied ${migration}\n`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  process.stderr.write(`Migration failed: ${error.message}\n`);
  process.exitCode = 1;
});
