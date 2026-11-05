# Requirement 8 — Vector database and semantic search

## What is embedded
Each ticket's subject and description are concatenated and encoded. The model is `sentence-transformers/all-MiniLM-L6-v2` (384-dimensional sentence embeddings).

## Storage and similarity
Vectors are stored in Qdrant collection `ticket_embeddings`. Similarity uses cosine distance/similarity. Payload metadata stores tenant_id, ticket_id, category_id, priority_id, status, and a bounded text preview. Integer payload indexes are created for tenant and common filters.

## Retrieval strategy and isolation
The query is embedded with the same model. Qdrant search includes a mandatory tenant_id filter. Returned ticket IDs are then re-fetched from PostgreSQL using the authenticated tenant scope; Qdrant is an auxiliary index, never the source of truth. The indexing operation is asynchronous and should be retried after PostgreSQL commits.

Run `pip install -r services/requirements.txt` before using the worker.
