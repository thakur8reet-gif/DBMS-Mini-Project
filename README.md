# ResolveIQ — Multi-Tenant Helpdesk & SLA Intelligence Platform

ResolveIQ manages tenant-isolated support tickets, enforces response/resolution SLAs, audits escalations, and retrieves semantically similar incidents.

## Stack
Next.js 15 / TypeScript · PostgreSQL 16 · Qdrant · Sentence Transformers all-MiniLM-L6-v2.

## Local setup
1. Install Node.js 20+, Docker Compose, Python 3.10+.
2. Copy `.env.example` to both `.env` (Docker Compose and Python services) and `.env.local` (Next.js). Set a strong `AUTH_SECRET`, a unique `SEMANTIC_INTERNAL_TOKEN`, and matching PostgreSQL credentials in `POSTGRES_PASSWORD` and `DATABASE_URL`.
3. Start PostgreSQL and Qdrant: `docker compose up -d`.
4. Apply migrations in order (Compose does not auto-run SQL, so the example query file is never executed as a migration):
   ```bash
   set -a; source .env; set +a
   for f in db/00*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
   ```
5. Install dependencies and run Next.js: `npm install && npm run dev`.
6. Provision a login: `pip install -r services/requirements.txt && python services/create_user.py --tenant demo --name "Demo Admin" --email admin@example.test --role ADMIN`. Set a password when prompted.
7. Start the private semantic service: `set -a; source .env; set +a; uvicorn services.semantic_api:app --host 127.0.0.1 --port 8000`.
8. Start the SLA/vector worker: `set -a; source .env; set +a; python -m services.worker`. For a one-shot run set `WORKER_ONCE=true`.
9. Open http://localhost:3000/login.

## Database
- ER model and data dictionary: [docs/DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md)
- DDL and constraints: [db/001_schema.sql](db/001_schema.sql), migrations 002–006
- DML examples: [db/queries.sql](db/queries.sql)
- Advanced SQL: [db/004_advanced_features.sql](db/004_advanced_features.sql)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Semantic search: [docs/SEMANTIC_SEARCH.md](docs/SEMANTIC_SEARCH.md)
- Report: [docs/PROJECT_REPORT.md](docs/PROJECT_REPORT.md)

## Security
Never commit real secrets or production data. The semantic API should remain private and must use a separate `SEMANTIC_INTERNAL_TOKEN`. Tenant identity is taken from a signed HttpOnly session, never from request JSON. Qdrant results are revalidated in PostgreSQL.

## Team and evaluation
The course requires two instructor-approved members; complete [docs/TEAM.md](docs/TEAM.md) with real names/SRNs. Capture genuine screenshots and record actual test output in [docs/TESTING.md](docs/TESTING.md). The commit history contains one commit for each of the 17 requirements.
