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
Not executed in this environment: no PostgreSQL or Qdrant service credentials/runtime were supplied. Run the commands locally and replace this note with actual output and date. Do not claim a passing result without execution.
