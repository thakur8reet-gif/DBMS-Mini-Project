import { Pool } from "pg";
const globalForPg = globalThis as unknown as { pgPool?: Pool };
export const pool = globalForPg.pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10, ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: true } : undefined });
if (process.env.NODE_ENV !== "production") globalForPg.pgPool = pool;
