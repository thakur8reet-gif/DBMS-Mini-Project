# Demonstration and test plan

## Demonstration sequence
1. Explain the ER model and tenant-aware relational schema.
2. Start PostgreSQL and Qdrant; show environment-based configuration.
3. Authenticate as an ADMIN/AGENT and show the role claim.
4. Create a ticket and inspect the atomic ticket + SLA tracking inserts.
5. Demonstrate JOIN, GROUP BY/HAVING, subquery, UPDATE, DELETE, and full-text index examples from db/queries.sql.
6. Run the SLA evaluator and inspect breach flags and escalation_log.
7. Search semantically similar incidents and show tenant filter enforcement.
8. Demonstrate cross-tenant FK rejection and database validation checks.

## Automated tests
Run `pip install -r tests/requirements.txt` then `pytest -q`. Set TEST_DATABASE_URL to a disposable PostgreSQL database after applying migrations. The suite checks schema objects, cross-tenant reference rejection, nonblank ticket constraints, and installation of the SLA function.

## Test status

**Executed 2026-11-07 (Asia/Kolkata) against the local development stack.**

- Applied migrations 001–006 to PostgreSQL 16; all six completed successfully.
- Ran `pytest -q` against the local database in Python 3.12: **4 passed**.
- `npm run lint` passed with ESLint.
- `npm run build` passed with Next.js 16.4.5 on Node.js 22.
- `npm audit --omit=dev --audit-level=moderate` reported **0 vulnerabilities**.
- Authentication check: demo admin login returned HTTP 200.
- Ticket flow: create returned HTTP 201; ticket appeared in the queue and had one SLA row.
- Worker indexed the ticket into Qdrant; authenticated semantic search returned HTTP 200 and included the new ticket.
- Tested with Qdrant server 1.12.4 and qdrant-client 1.13.3.
- Screenshots have not yet been added. Capture the running app and save the images under `docs/screenshots/` before submission.

## Verification run — 2026-11-09 (Asia/Kolkata)

These results were run against a disposable local PostgreSQL 18.6 database, not the hosted production database.

- Applied migrations 001–008 to the fresh local database: **8 applied**.
- Ran the included Python suite with Python 3.12.10 and pytest 8.4.2: **4 passed in 3.17s**.
- `npm run lint`: **passed**.
- `npm run build -- --webpack`: **passed**, including TypeScript and static page generation.
- Local app flow: sign-in **200**, ticket list **200**, ticket create **201**, worker tick **200** and created **1** SLA escalation.
- Semantic search configuration check: **not configured** in the isolated test process; the app correctly disabled search and returned `503` with “Semantic search is not configured on this deployment.”
- Production migration 008: **applied** using the Vercel production environment runner; it queues pre-existing tickets for vector indexing.
- Screenshots: still needed in `docs/screenshots/` after browser access is enabled.

## Hosted deployment status

Deployment `dpl_7336MdD9r468SJ1VcQhwfLLhQrnw` was ready at `https://resolveiq-gamma.vercel.app` before the latest UI status change. Production variables currently include `DATABASE_URL`, `AUTH_SECRET`, and `CRON_SECRET`; Qdrant credentials are not configured there. The dashboard worker evaluates SLA rules every minute while an authenticated dashboard is open. Vercel Hobby runs the all-tenant catch-up once daily. Semantic search must remain described as unavailable until Qdrant Cloud is configured and the latest UI update is deployed.
