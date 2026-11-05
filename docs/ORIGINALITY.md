# Originality and design rationale

ResolveIQ is framed as a multi-tenant support operations and SLA intelligence system, not a generic ticket CRUD clone.

## Project-specific design decisions
1. Tenant-aware composite foreign keys are applied across users, customers, ticket classification, policies, tracking, comments, and escalation. This makes tenant isolation a relational integrity property, not only an application convention.
2. SLA policy is selected by the tenant/category/priority tuple. Ticket creation and SLA clock creation occur in one PostgreSQL transaction.
3. Escalation levels are policy-specific, time-triggered, role-routed, and recorded in an idempotent audit log.
4. Qdrant is used for a distinct data need: semantic retrieval across natural-language ticket descriptions. PostgreSQL remains authoritative and every search is tenant-filtered and revalidated.
5. The project includes operational query patterns, deadline indexes, full-text indexing, a ticket operations view, and database-side functions/triggers.

## Attribution and academic integrity
The ER diagram, relational schema, and initial DDL supplied for this project are the user's provided design inputs. The repository documents extensions made to that baseline, including stronger tenant-consistency constraints, validation, SQL operations, application integration, and semantic retrieval. No external project repository is intentionally copied. Any future third-party library or reference material should be acknowledged here.

## Evidence required
During evaluation, team members should explain why each design choice exists and show the actual implementation. The team must provide its own contribution record and be prepared to defend the code; generated scaffolding is not a substitute for understanding or instructor-approved individual work.
