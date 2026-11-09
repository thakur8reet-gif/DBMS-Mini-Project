# Requirement 8 — Vector database and semantic search

## What is embedded
Each ticket's subject and description are concatenated and encoded. The model is `sentence-transformers/all-MiniLM-L6-v2` (384-dimensional sentence embeddings).

## Storage and similarity
Vectors are stored in Qdrant collection `ticket_embeddings`. Similarity uses cosine distance/similarity. Payload metadata stores tenant_id, ticket_id, category_id, priority_id, status, and a bounded text preview. Integer payload indexes are created for tenant and common filters.

## Retrieval strategy and isolation
The query is embedded with the same model. Qdrant search includes a mandatory tenant_id filter. Returned ticket IDs are then re-fetched from PostgreSQL using the authenticated tenant scope; Qdrant is an auxiliary index, never the source of truth. The indexing operation is asynchronous and should be retried after PostgreSQL commits.

Run `pip install -r services/requirements.txt` before using the worker.

## Vercel deployment

The Next.js API can query Qdrant Cloud directly, so the hosted UI does not need a separate FastAPI process. Create a Qdrant Cloud cluster, enable Cloud Inference, and configure `QDRANT_URL`, `QDRANT_API_KEY`, `QDRANT_COLLECTION=ticket_embeddings`, and `EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2` in the Vercel project. The model returns 384-dimensional embeddings and is available through Qdrant's free inference tier.

Ticket writes enter `ticket_vector_queue`. While an authenticated dashboard is open, it calls the protected worker endpoint every minute to index queued tickets and evaluate that tenant's SLA deadlines. A Vercel Cron invocation runs the same work for all active tenants once daily as a catch-up. On Hobby, independent background execution is therefore daily; a continuously scheduled worker requires a separate worker host or a Vercel plan with a more frequent schedule.

After deploying, backfill pre-existing tickets into the queue with `vercel env run -e production -- npm run db:migrate:queue`. The command is idempotent. Confirm the Qdrant variables are present before expecting the worker to drain the vector queue.
