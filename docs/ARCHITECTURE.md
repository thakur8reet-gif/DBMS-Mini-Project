# Database architecture

## Selected paradigms
**PostgreSQL** is the system of record for tenant-scoped relational entities and transactional workflows: users, customers, tickets, categories, priorities, statuses, SLA policies, tracking, comments, attachments, and escalation audit records. Foreign keys, checks, uniqueness, transactions, and relational joins are essential to these relationships.

**Qdrant** stores vectors derived from ticket subject and description, with payload metadata (tenant_id, ticket_id, category_id, priority_id, status). Semantic retrieval is useful because customers describe similar incidents using different vocabulary. PostgreSQL remains authoritative; Qdrant results are filtered by tenant and revalidated against PostgreSQL before display.

## Data flow
1. Next.js Route Handler authenticates the request and derives tenant/user identity from the server-side session.
2. Zod validates untrusted input.
3. PostgreSQL transaction creates or updates authoritative records.
4. After commit, an indexing worker embeds ticket text and upserts a Qdrant point.
5. Search queries Qdrant with a mandatory tenant filter; returned ticket IDs are fetched from PostgreSQL under the same tenant.

## Local services
Run `docker compose up -d`. PostgreSQL listens on 5432 and Qdrant on 6333. Never commit real credentials; copy `.env.example` to `.env.local` and replace secrets.
