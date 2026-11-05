# ResolveIQ — Multi-Tenant Helpdesk & SLA Intelligence Platform

ResolveIQ helps support teams manage tenant-isolated tickets, enforce response/resolution SLAs, audit escalations, and retrieve semantically similar incidents.

## Stack
- Next.js 15 / TypeScript (web + API)
- PostgreSQL 16 (transactional system of record)
- Qdrant (vector similarity search)
- Sentence Transformers `all-MiniLM-L6-v2` (384-d embeddings)

## Local setup
1. Install Node.js 20+, Docker Compose, and Python 3.10+.
2. Copy environment settings: `cp .env.example .env.local`; set a strong `AUTH_SECRET` and database password.
3. Start infrastructure: `docker compose up -d`.
4. Apply SQL in order:
   ```bash
   psql "$DATABASE_URL" -f db/001_schema.sql
   psql "$DATABASE_URL" -f db/002_ddl_features.sql
   psql "$DATABASE_URL" -f db/003_seed.sql
   psql "$DATABASE_URL" -f db/004_advanced_features.sql
   psql "$DATABASE_URL" -f db/005_integrity_validation.sql
   ```
5. Install web dependencies and run:
   ```bash
   npm install
   npm run dev
   ```
6. Open http://localhost:3000/login. Provision a user in PostgreSQL with a bcrypt password hash and an ADMIN or AGENT role. The demo seed intentionally has a placeholder hash; it is not a usable login.
7. Install vector worker dependencies: `pip install -r services/requirements.txt`. Configure `QDRANT_URL`, then use `services/vector_index.py` from a trusted worker after ticket commits.

## Required environment variables
See [.env.example](.env.example). Never commit `.env.local`, credentials, JWT secrets, or production data.

## Database and workflows
- Schema and ER model: [docs/DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md)
- Advanced SQL: [db/004_advanced_features.sql](db/004_advanced_features.sql)
- SQL examples: [db/queries.sql](db/queries.sql)
- Vector strategy: [docs/SEMANTIC_SEARCH.md](docs/SEMANTIC_SEARCH.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Full project report: [docs/PROJECT_REPORT.md](docs/PROJECT_REPORT.md)
- Team plan: [docs/TEAM.md](docs/TEAM.md)

## SLA worker
Schedule a trusted worker to call `SELECT fn_evaluate_sla(<tenant_id>);` for each active tenant at the desired cadence. The function marks breaches and writes idempotent escalation events. Production deployments should use a scheduler/queue and monitor failures.

## Git contribution practice
The history is organized as one commit per project requirement (1–17). Team members must make their own attributable commits and document their actual contributions; do not rewrite authorship.

## Submission checklist
- [ ] Fill in the approved two-member team names/SRNs in docs/TEAM.md.
- [ ] Configure a real admin/agent account and demonstrate login.
- [ ] Run SQL migrations against PostgreSQL 16.
- [ ] Execute tests and record actual results in docs/TESTING.md.
- [ ] Capture genuine application screenshots and add them to docs/screenshots/.
- [ ] Demonstrate Qdrant indexing and tenant-filtered search.
- [ ] Deploy/configure the Next.js application with environment variables.
