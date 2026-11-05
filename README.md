# ResolveIQ — Multi-Tenant Helpdesk & SLA Intelligence Platform

ResolveIQ is a multi-tenant support operations platform that helps organizations manage customer issues, enforce service-level agreements (SLAs), identify at-risk tickets, and escalate unresolved work to the correct roles.

## Problem statement
Basic ticket CRUD systems do not help support teams predict SLA breaches, prioritize work across tenants, preserve tenant isolation, or find related historical incidents. ResolveIQ combines tenant-scoped ticket management, policy-driven SLA clocks, auditable escalation, operational analytics, and semantic retrieval of similar tickets.

## Project objectives
- Isolate organizations (tenants) and their users, customers, tickets, policies, and support configuration.
- Enforce response and resolution targets from category/priority-specific SLA policies.
- Record first response, SLA breaches, and escalation events as auditable data.
- Provide role-aware workflows for tenant administrators, support agents, and customers.
- Search historical ticket descriptions semantically using a vector index.
- Demonstrate advanced database design, integrity, transactions, indexing, views, functions, and triggers through a functional Next.js application.

## Core workflows
1. A customer submits a ticket with a category and priority.
2. The API validates tenant ownership and creates the ticket and its SLA tracking row in one PostgreSQL transaction.
3. An agent responds or updates the ticket; first-response time is recorded once.
4. SLA evaluation identifies approaching deadlines and breaches.
5. Escalation policy routes overdue work to a configured role and records an escalation log.
6. Support staff search similar resolved incidents using Qdrant semantic retrieval.

## Technology direction
- Web: Next.js App Router, TypeScript
- Relational database: PostgreSQL
- Vector database: Qdrant (ticket text embeddings and metadata)
- Authentication: signed session/JWT integration with password hashing and server-side role checks
- Validation: Zod at the API boundary plus PostgreSQL constraints
- Version control: Git and GitHub

See `docs/` for the requirement-by-requirement design and implementation.