# ResolveIQ — Project documentation

## 1. Objectives
ResolveIQ provides tenant-isolated customer support, SLA policy enforcement, deadline monitoring, role-based escalation, operational reporting, and semantic retrieval of similar incidents. It is designed to demonstrate database concepts in an end-to-end web application rather than a CRUD-only interface.

## 2. Functional requirements
- Tenant administrators configure users, departments, roles, categories, priorities, statuses, and SLA policies.
- Agents create, assign, comment on, resolve, and close tickets.
- Customers submit and follow their tickets (customer-facing portal is an extension point).
- Each ticket receives response and resolution deadlines from its tenant's category/priority SLA policy.
- A worker evaluates deadlines, records breach flags, and creates idempotent escalation log entries.
- Authorized staff view the tenant ticket queue and operational metrics.
- Users search similar incidents semantically, with tenant-filtered retrieval.

## 3. ER diagram
See [DATABASE_DESIGN.md](DATABASE_DESIGN.md). The supplied ER and relational-schema images informed the entities and relationships. Tenant-aware composite foreign keys were added to prevent cross-tenant references.

## 4. Relational schema and data dictionary
See [db/001_schema.sql](../db/001_schema.sql) and [DATABASE_DESIGN.md](DATABASE_DESIGN.md).
| Entity | Purpose | Key integrity rules |
|---|---|---|
| tenant | Organization boundary | unique subdomain |
| app_user / app_role / department | Staff identity and authorization | tenant-scoped keys and references |
| customer | Customer identity | unique email per tenant |
| category / priority / ticket_status | Ticket classification | unique tenant-scoped names |
| ticket | Support case | tenant-scoped FKs to all related entities |
| sla_policy | Response/resolution targets | unique category-priority pair per tenant; positive minutes |
| sla_tracking | SLA clock and breach state | one row per ticket |
| escalation_level / escalation_log | Escalation configuration and audit | ordered levels; idempotent log key |
| ticket_comment / ticket_attachment | Collaboration and evidence | tenant-scoped references; author and content checks |

## 5. Database choice and justification
PostgreSQL is the transactional system of record because tickets, customer ownership, assignment, comments, SLA tracking, and escalation logs require relational integrity and atomic updates. Qdrant is used only for semantic similarity over text-heavy ticket descriptions. This separation matches the data: normalized transactional records in SQL, approximate-nearest-neighbor vectors and metadata in Qdrant.

## 6. SQL implementation
- DDL: [001_schema.sql](../db/001_schema.sql), [002_ddl_features.sql](../db/002_ddl_features.sql)
- DML and analytical examples: [queries.sql](../db/queries.sql)
- Advanced SQL: [004_advanced_features.sql](../db/004_advanced_features.sql)
- Validation: [005_integrity_validation.sql](../db/005_integrity_validation.sql)

## 7. Vector implementation
See [SEMANTIC_SEARCH.md](SEMANTIC_SEARCH.md) and [services/vector_index.py](../services/vector_index.py). Ticket subject and description are encoded with all-MiniLM-L6-v2; vectors use cosine similarity in Qdrant. Tenant ID is a mandatory payload filter, and results are revalidated in PostgreSQL.

## 8. System architecture
Browser → Next.js App Router → authenticated API route → PostgreSQL transaction. After commit, a background indexing process updates Qdrant. SLA worker calls `fn_evaluate_sla(tenant_id)` on a schedule. See [ARCHITECTURE.md](ARCHITECTURE.md).

## 9. Application screenshots
Add screenshots of: (1) login, (2) ticket queue/dashboard, (3) ticket creation, (4) SLA policy and breach/escalation view, and (5) semantic search. Screenshots must be captured from a running deployment with representative demo data; none are fabricated in this repository.

## 10. Testing results
Automated tests and deployment evidence must be recorded after running the application against a configured PostgreSQL/Qdrant environment. See [TESTING.md](TESTING.md). Do not report tests as passed until executed.

## 11. Conclusion
ResolveIQ connects database design to a working application through tenant-aware relational constraints, transactional ticket/SLA creation, advanced SQL functions and triggers, role-based access, and vector-based incident retrieval. Remaining submission evidence is tracked in the checklist in README and TESTING.md.
