const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const migrationDirectory = path.join(__dirname, "..", "db");
  const requested = process.argv[2];
  const migrations = requested
    ? [path.basename(requested)]
    : fs
    .readdirSync(migrationDirectory)
    .filter((file) => /^00\d+.*\.sql$/.test(file))
    .sort();
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  await client.connect();
  try {
    for (const migration of migrations) {
      if (!/^00\d+.*\.sql$/.test(migration)) {
        throw new Error(`Invalid migration file: ${migration}`);
      }
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
